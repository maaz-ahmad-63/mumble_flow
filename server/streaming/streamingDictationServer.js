import { WebSocketServer } from 'ws';
import { transcriptionService } from '../services/transcriptionService.js';
import { storage } from '../services/storageService.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';
import { authService } from '../services/authService.js';
import { apiKeyService } from '../services/apiKeyService.js';
import { usageService } from '../services/usageService.js';
import { quotaService } from '../services/quotaService.js';

/**
 * Event-Driven Low-Latency Streaming Dictation Server.
 * Supports:
 * - Real-time streaming chunks as the user speaks
 * - Immediate interim transcription events (transcript_interim)
 * - Finalized ordered transcript segments (transcript_final)
 * - Provider abstraction with automatic fallback
 * - Authenticated user context, BYOK resolution, and usage telemetry
 * - Event contract:
 *     recording_started -> transcript_interim* -> recording_stopped ->
 *     processing_started -> transcript_final -> processing_completed
 */
export class StreamingDictationServer {
  constructor(httpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: config.streaming.path || '/ws/dictate'
    });

    this.init();
  }

  init() {
    logger.info(`[WebSocket] Streaming dictation endpoint initialized at ${config.streaming.path || '/ws/dictate'}`);

    this.wss.on('connection', (ws, req) => {
      let token = null;
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        token = urlObj.searchParams.get('token');
      } catch (e) {}

      if (!token && req.headers['authorization']) {
        const parts = req.headers['authorization'].split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          token = parts[1];
        }
      }

      if (!token && req.headers['sec-websocket-protocol']) {
        const protocols = req.headers['sec-websocket-protocol'].split(',').map(s => s.trim());
        const authProt = protocols.find(p => p.startsWith('bearer.'));
        if (authProt) {
          token = authProt.replace('bearer.', '');
        }
      }

      const user = token ? authService.validateToken(token) : null;
      const initialUserId = user ? user.id : 'default_user';

      logger.info(`[WebSocket] Client connected: ${req.socket.remoteAddress} (user: ${initialUserId})`);

      const clientContext = {
        userId: initialUserId,
        config: {
          sttProvider: storage.getSettings(initialUserId).sttProvider || config.defaultSttProvider || 'groq',
          llmProvider: storage.getSettings(initialUserId).llmProvider || config.defaultLlmProvider || 'groq',
          tone: storage.getSettings(initialUserId).defaultTone || config.defaultTone || 'casual',
          language: 'auto'
        },
        streamingSession: null,
        currentSessionId: null
      };

      const sendEvent = (eventObj) => {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.send(JSON.stringify(eventObj));
          } catch (e) {
            logger.warn(`[WebSocket Send Error] ${e.message}`);
          }
        }
      };

      ws.on('message', async (data, isBinary) => {
        try {
          // 1. Direct Binary Audio Chunk Frame
          if (isBinary) {
            if (clientContext.streamingSession) {
              clientContext.streamingSession.addChunk(Buffer.from(data));
            }
            return;
          }

          // 2. JSON Control Messages
          const msg = JSON.parse(data.toString('utf8'));

          switch (msg.type) {
            case 'ping':
              sendEvent({ type: 'pong', timestamp: Date.now() });
              break;

            case 'auth': {
              if (msg.token) {
                const authedUser = authService.validateToken(msg.token);
                if (authedUser) {
                  clientContext.userId = authedUser.id;
                  sendEvent({ type: 'auth_success', user: { id: authedUser.id, email: authedUser.email } });
                } else {
                  sendEvent({ type: 'auth_error', error: 'Invalid or expired token' });
                }
              }
              break;
            }

            case 'config': {
              const currentSettings = await storage.getSettings(clientContext.userId);
              clientContext.config = {
                ...clientContext.config,
                ...msg,
                apiKeyGroq: msg.apiKeyGroq || currentSettings?.apiKeyGroq,
                apiKeyGemini: msg.apiKeyGemini || currentSettings?.apiKeyGemini
              };
              sendEvent({ type: 'config_ack', config: clientContext.config });
              break;
            }

            // Client starts recording
            case 'recording_started':
            case 'start_speech': {
              const userId = clientContext.userId || 'default_user';
              const currentSettings = await storage.getSettings(userId);
              const sessionId = msg.sessionId || `stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              clientContext.currentSessionId = sessionId;

              const effectiveProvider = msg.sttProvider || clientContext.config.sttProvider || currentSettings?.sttProvider || 'groq';
              const language = msg.language || clientContext.config.language || 'auto';
              const mimeType = msg.mimeType || 'audio/webm';
              const tone = msg.tone || clientContext.config.tone || currentSettings?.defaultTone || 'casual';
              const mode = msg.mode || tone;
              const appName = msg.appName || msg.app || null;
              const processName = msg.processName || null;
              const application = msg.application || null;
              const llmProvider = msg.llmProvider || clientContext.config.llmProvider || currentSettings?.llmProvider || 'groq';
              const llmModel = msg.llmModel || clientContext.config.llmModel || currentSettings?.llmModel;

              // Resolve BYOK / platform keys (properly awaited for PostgreSQL async compatibility)
              const resolvedStt = msg.apiKeyGroq ? { key: msg.apiKeyGroq, source: 'user' } : await apiKeyService.getDecryptedKey(userId, effectiveProvider);
              const resolvedLlm = msg.apiKeyGroq ? { key: msg.apiKeyGroq, source: 'user' } : await apiKeyService.getDecryptedKey(userId, llmProvider);
              const isByokStt = resolvedStt?.source === 'user';
              const isByokLlm = resolvedLlm?.source === 'user';

              // Enforce quota server-side (properly awaited for PostgreSQL async compatibility)
              const quotaCheck = await quotaService.checkAudioQuota(userId, 5, { isByok: isByokStt });
              if (!quotaCheck?.allowed) {
                sendEvent({
                  type: 'error',
                  sessionId,
                  code: 'QUOTA_EXCEEDED',
                  error: quotaCheck?.reason || 'Audio quota exceeded',
                  recoverable: false
                });
                return;
              }

              // If a previous session was open, clean it up
              if (clientContext.streamingSession) {
                clientContext.streamingSession.cancel();
              }

              const streamCreation = transcriptionService.createStreamingSession({
                sessionId,
                sttProvider: effectiveProvider,
                language,
                mimeType,
                apiKey: resolvedStt?.key,
                tone,
                mode,
                appName,
                processName,
                application,
                llmProvider,
                llmModel,
                onInterim: (interimData) => {
                  sendEvent({
                    type: 'transcript_interim',
                    sessionId: interimData.sessionId,
                    segmentId: interimData.segmentId,
                    text: interimData.text,
                    latencyMs: interimData.latencyMs,
                    timestamp: interimData.timestamp
                  });
                },
                onFinal: (finalData) => {
                  sendEvent({
                    type: 'transcript_final',
                    sessionId: finalData.sessionId,
                    segmentId: finalData.segmentId,
                    text: finalData.text,
                    rawText: finalData.rawText,
                    isFinal: true,
                    latencyMs: finalData.latencyMs,
                    timestamp: finalData.timestamp
                  });
                },
                onProcessingStarted: (procData) => {
                  sendEvent({
                    type: 'processing_started',
                    sessionId: procData.sessionId,
                    timestamp: procData.timestamp
                  });
                },
                onProcessingCompleted: (completedData) => {
                  try {
                    const audioSec = (completedData.durationMs || 0) / 1000;
                    if (audioSec > 0 && !completedData.empty) {
                      usageService.recordTranscriptionUsage({
                        userId,
                        sessionId: completedData.sessionId,
                        provider: effectiveProvider,
                        model: completedData.model || 'whisper-large-v3-turbo',
                        audioSeconds: audioSec,
                        latencyMs: completedData.latency?.asrMs || 0,
                        status: 'success',
                        isByok: isByokStt,
                        keySource: resolvedStt?.source || 'system',
                        costIsEstimated: true
                      });

                      if (completedData.enhancedByAI) {
                        const inTokens = Math.ceil((completedData.rawTranscript || '').length / 4);
                        const outTokens = Math.ceil((completedData.processedText || '').length / 4);
                        usageService.recordLlmUsage({
                          userId,
                          sessionId: completedData.sessionId,
                          provider: llmProvider,
                          model: llmModel || 'llm',
                          inputTokens: inTokens,
                          outputTokens: outTokens,
                          latencyMs: completedData.latency?.llmMs || 0,
                          type: 'text_processing',
                          status: 'success',
                          isByok: isByokLlm,
                          keySource: resolvedLlm?.source || 'system',
                          costIsEstimated: true
                        });
                      }
                    }
                  } catch (usageErr) {
                    logger.warn(`[Streaming Usage Tracking] Non-blocking warning: ${usageErr.message}`);
                  }

                  sendEvent({
                    type: 'processing_completed',
                    sessionId: completedData.sessionId,
                    rawTranscript: completedData.rawTranscript,
                    processedText: completedData.processedText || completedData.rawTranscript,
                    enhancedByAI: completedData.enhancedByAI || false,
                    mode: completedData.mode || mode,
                    isSnippet: completedData.isSnippet || false,
                    segments: completedData.segments,
                    durationMs: completedData.durationMs,
                    language: completedData.language,
                    latency: completedData.latency,
                    provider: completedData.provider,
                    model: completedData.model,
                    empty: completedData.empty || false,
                    message: completedData.message
                  });
                },
                onError: (errData) => {
                  try {
                    usageService.recordFailure({
                      userId,
                      sessionId: errData.sessionId || sessionId,
                      type: 'transcription',
                      provider: effectiveProvider,
                      model: 'streaming',
                      errorMessage: errData.error,
                      isByok: isByokStt,
                      keySource: resolvedStt?.source || 'system'
                    });
                  } catch (e) {}

                  sendEvent({
                    type: 'error',
                    sessionId: errData.sessionId,
                    code: errData.code || 'STREAMING_ERROR',
                    error: errData.error,
                    recoverable: errData.recoverable || false
                  });
                }
              });

              clientContext.streamingSession = streamCreation.session;

              // Acknowledge recording started
              sendEvent({
                type: 'recording_started',
                sessionId,
                provider: streamCreation.provider,
                streamingSupported: streamCreation.streamingSupported,
                timestamp: Date.now()
              });
              break;
            }

            // Streaming Chunk via JSON (e.g. with sequence number)
            case 'audio_chunk': {
              if (clientContext.streamingSession && msg.data) {
                const chunkBuf = Buffer.from(msg.data, 'base64');
                clientContext.streamingSession.addChunk(chunkBuf, msg.sequence ?? msg.seq);
              }
              break;
            }

            // Client finishes recording
            case 'recording_stopped':
            case 'end_of_speech': {
              if (!clientContext.streamingSession) {
                sendEvent({
                  type: 'error',
                  code: 'NO_ACTIVE_SESSION',
                  error: 'No active recording session to stop.',
                  recoverable: false
                });
                return;
              }

              sendEvent({
                type: 'recording_stopped',
                sessionId: clientContext.currentSessionId,
                timestamp: Date.now()
              });

              const activeSession = clientContext.streamingSession;
              clientContext.streamingSession = null;

              // Wrap activeSession.stop() with a safety timeout so it never hangs
              try {
                await Promise.race([
                  activeSession.stop(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Transcription timed out on server (25s limit)')), 25000))
                ]);
              } catch (stopErr) {
                logger.error(`[Streaming Stop Error] ${stopErr.message}`);
                sendEvent({
                  type: 'error',
                  sessionId: clientContext.currentSessionId,
                  code: 'TRANSCRIPTION_TIMEOUT',
                  error: stopErr.message,
                  recoverable: false
                });
              }
              break;
            }

            // User cancels recording
            case 'cancel': {
              if (clientContext.streamingSession) {
                clientContext.streamingSession.cancel();
                clientContext.streamingSession = null;
              }
              sendEvent({
                type: 'cancelled',
                sessionId: clientContext.currentSessionId
              });
              break;
            }

            default:
              logger.warn(`[WebSocket] Unrecognized event type: ${msg.type}`);
              break;
          }
        } catch (err) {
          logger.error(`[WebSocket Handler Error] ${err.message}`);
          sendEvent({
            type: 'error',
            code: 'INTERNAL_ERROR',
            error: err.message,
            recoverable: true
          });
        }
      });

      ws.on('close', () => {
        logger.info('[WebSocket] Client disconnected');
        if (clientContext.streamingSession) {
          clientContext.streamingSession.cancel();
          clientContext.streamingSession = null;
        }
      });

      ws.on('error', (err) => {
        logger.error(`[WebSocket Error] ${err.message}`);
      });
    });
  }
}
