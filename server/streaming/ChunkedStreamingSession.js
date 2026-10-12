import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../services/logger.js';
import { normalizeAudioFile } from '../utils/audioUtils.js';
import { textProcessingService } from '../services/textProcessingService.js';

/**
 * Low-Latency Chunked Streaming Transcription Session.
 * Bridges streaming WebSocket chunks with high-performance transcription providers (Groq, Local Whisper, etc.)
 * Provides:
 * - Interim transcription events while speaking
 * - Final transcription segments
 * - Chunk deduplication and ordering
 * - Error isolation (temporary provider glitches do not kill the session)
 * - Clean fallback for non-streaming providers
 */
export class ChunkedStreamingSession {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.sessionId = options.sessionId || `stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.options = options;

    this.onInterim = options.onInterim || (() => {});
    this.onFinal = options.onFinal || (() => {});
    this.onProcessingStarted = options.onProcessingStarted || (() => {});
    this.onProcessingCompleted = options.onProcessingCompleted || (() => {});
    this.onError = options.onError || (() => {});

    this.enableInterim = options.enableInterim !== false;
    this.interimIntervalMs = options.interimIntervalMs || 1200;

    this.chunks = [];
    this.receivedSequences = new Set();
    this.totalBytes = 0;
    this.startTime = Date.now();
    this.isActive = true;
    this.isInterimRunning = false;
    this.interimTimer = null;
    this.lastInterimTimestamp = 0;

    this.currentSegmentId = 1;
    this.lastInterimText = '';
    this.pendingChunksSinceInterim = 0;

    // Temporary files created during this session for guaranteed cleanup
    this.tempFiles = new Set();
  }

  /**
   * Add incoming audio chunk from WebSocket.
   * Chunks are deduplicated by sequence number to avoid redundant audio processing.
   */
  addChunk(chunkBuffer, sequence) {
    if (!this.isActive) return;

    if (sequence !== undefined && sequence !== null) {
      if (this.receivedSequences.has(sequence)) {
        logger.debug(`[StreamingSession] Duplicate chunk sequence ${sequence} ignored.`);
        return;
      }
      this.receivedSequences.add(sequence);
    }

    this.chunks.push(chunkBuffer);
    this.totalBytes += chunkBuffer.length;
    this.pendingChunksSinceInterim++;

    if (this.enableInterim && !this.isInterimRunning) {
      this.scheduleInterimPass();
    }
  }

  scheduleInterimPass() {
    if (!this.isActive || this.interimTimer || !this.enableInterim) return;

    const elapsedSinceLast = Date.now() - this.lastInterimTimestamp;
    const delay = Math.max(0, this.interimIntervalMs - elapsedSinceLast);

    this.interimTimer = setTimeout(() => {
      this.interimTimer = null;
      this.runInterimPass();
    }, delay);
  }

  /**
   * Run interim transcription on accumulated audio.
   * Handled safely: if provider throws temporary error, session continues seamlessly.
   */
  async runInterimPass() {
    if (!this.isActive || this.isInterimRunning || !this.enableInterim) return;
    // Need at least ~15KB of audio (~0.8s) and at least 3 new chunks
    if (this.totalBytes < 15000 || this.pendingChunksSinceInterim < 3) return;

    this.isInterimRunning = true;
    this.lastInterimTimestamp = Date.now();
    this.pendingChunksSinceInterim = 0;

    const tempFile = this.createTempAudioFile('interim');
    try {
      const combined = Buffer.concat(this.chunks);
      fs.writeFileSync(tempFile, combined);

      // Verify audio container is valid
      const normalized = normalizeAudioFile(tempFile, this.options.mimeType || 'audio/webm');
      if (normalized.size < 200 || normalized.isTooShort) {
        return;
      }

      const interimResult = await this.provider.transcribe(normalized.path, {
        ...this.options,
        isInterim: true
      });

      const text = (interimResult.text || '').trim();
      if (text && text !== this.lastInterimText && this.isActive) {
        this.lastInterimText = text;
        this.onInterim({
          sessionId: this.sessionId,
          segmentId: this.currentSegmentId,
          text,
          latencyMs: interimResult.latencyMs || 0,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      // Temporary provider blips or rate-limits must not crash or terminate the active recording
      logger.warn(`[StreamingSession] Interim transcription skipped (${err.message}). Audio stream intact.`);
    } finally {
      this.cleanupTempFile(tempFile);
      this.isInterimRunning = false;
    }
  }

  /**
   * Finish recording and perform final transcription pass.
   */
  async stop() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }

    // Notify client that processing has begun
    this.onProcessingStarted({
      sessionId: this.sessionId,
      timestamp: Date.now()
    });

    if (this.chunks.length === 0 || this.totalBytes < 500) {
      logger.info(`[StreamingSession] Session ${this.sessionId} finished with empty or too-short audio (${this.totalBytes} bytes).`);
      this.onProcessingCompleted({
        sessionId: this.sessionId,
        rawTranscript: '',
        processedText: '',
        segments: [],
        durationMs: 0,
        latency: { asrMs: 0, totalMs: Date.now() - this.startTime },
        provider: this.provider.name,
        empty: true,
        message: 'Recording too short or silent (< 0.5s).'
      });
      this.cleanupAll();
      return;
    }

    const tempFile = this.createTempAudioFile('final');
    try {
      const combined = Buffer.concat(this.chunks);
      fs.writeFileSync(tempFile, combined);

      const normalized = normalizeAudioFile(tempFile, this.options.mimeType || 'audio/webm');
      const asrPromise = this.provider.transcribe(normalized.path, this.options);
      const asrResult = await Promise.race([
        asrPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('ASR transcription timed out after 20s')), 20000))
      ]);

      const rawTranscript = (asrResult.text || '').trim();
      const finalDurationMs = asrResult.duration ? Math.round(asrResult.duration * 1000) : (Date.now() - this.startTime);

      const cleanTranscript = rawTranscript.trim().replace(/^[\s.,?!'"]+|[\s.,?!'"]+$/g, '');
      const normalizedNoPunct = cleanTranscript.toLowerCase().replace(/[.\s]/g, '');
      const isHallucination = (
        ['sj', 'sjr', 'you', 'thankyou', 'thanksforwatching'].includes(normalizedNoPunct) ||
        ['s.j.', 's.j', 'sj', 's. j.', 'sjr', 's.j.r', 's.j.r.', 'you', 'thank you', 'thank you.', 'thanks for watching'].includes(cleanTranscript.toLowerCase())
      );

      if (!cleanTranscript || isHallucination) {
        this.onProcessingCompleted({
          sessionId: this.sessionId,
          rawTranscript: '',
          processedText: '',
          segments: [],
          durationMs: 0,
          latency: { asrMs: asrResult.latencyMs || 0, totalMs: Date.now() - this.startTime },
          provider: asrResult.provider || this.provider.name,
          model: asrResult.model,
          empty: true,
          message: 'No speech detected.'
        });
        return;
      }

      // Process text with deterministic cleanup, modes, list formatting, self-correction & AI escalation
      let processedResult = { processedText: rawTranscript, enhancedByAI: false };
      if (rawTranscript) {
        try {
          const procPromise = textProcessingService.process(rawTranscript, {
            tone: this.options.tone,
            mode: this.options.mode,
            appName: this.options.appName,
            processName: this.options.processName,
            application: this.options.application,
            llmProvider: this.options.llmProvider,
            llmModel: this.options.llmModel,
            userId: this.options.userId
          });
          processedResult = await Promise.race([
            procPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Text processing timed out after 15s')), 15000))
          ]);
        } catch (procErr) {
          logger.warn(`[StreamingSession] Text processing fallback: ${procErr.message}`);
          processedResult = { processedText: rawTranscript, enhancedByAI: false };
        }
      }

      const finalText = processedResult.processedText || rawTranscript;

      // Emit final segment
      this.onFinal({
        sessionId: this.sessionId,
        segmentId: this.currentSegmentId,
        text: rawTranscript,
        processedText: finalText,
        isFinal: true,
        latencyMs: asrResult.latencyMs,
        timestamp: Date.now()
      });

      // Emit processing completed event
      this.onProcessingCompleted({
        sessionId: this.sessionId,
        rawTranscript,
        processedText: finalText,
        enhancedByAI: processedResult.enhancedByAI || false,
        mode: processedResult.mode || this.options.mode || this.options.tone,
        isSnippet: processedResult.isSnippet || false,
        segments: [
          { segmentId: this.currentSegmentId, text: finalText, isFinal: true }
        ],
        durationMs: finalDurationMs,
        language: asrResult.language || this.options.language || 'auto',
        latency: {
          asrMs: asrResult.latencyMs,
          totalMs: Date.now() - this.startTime
        },
        provider: asrResult.provider || this.provider.name,
        model: asrResult.model
      });
    } catch (err) {
      logger.error(`[StreamingSession Final Error] ${err.message}`);
      this.onError({
        sessionId: this.sessionId,
        code: 'TRANSCRIPTION_FAILED',
        error: err.message,
        recoverable: false
      });
    } finally {
      this.cleanupTempFile(tempFile);
      this.cleanupAll();
    }
  }

  cancel() {
    this.isActive = false;
    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }
    this.cleanupAll();
  }

  createTempAudioFile(prefix = 'chunk') {
    const ext = this.options.mimeType?.includes('mp4') || this.options.mimeType?.includes('m4a') ? '.m4a'
      : this.options.mimeType?.includes('wav') ? '.wav'
      : '.webm';
    const filename = `${prefix}-${this.sessionId}-${Date.now()}${ext}`;
    const filePath = path.join(config.uploadsDir, filename);
    this.tempFiles.add(filePath);
    return filePath;
  }

  cleanupTempFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    this.tempFiles.delete(filePath);
  }

  cleanupAll() {
    this.chunks = [];
    this.receivedSequences.clear();
    for (const filePath of this.tempFiles) {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
    this.tempFiles.clear();
  }
}
