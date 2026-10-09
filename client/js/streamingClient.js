/**
 * Low-Latency Streaming Transcription Client
 * Connects via WebSocket to /ws/dictate
 * Manages streaming chunks, interim transcripts, final segments, and auto-reconnects.
 */

export class StreamingTranscriptionClient {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || this.getDefaultWsUrl();
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.activeSessionId = null;

    // Callbacks
    this.onRecordingStarted = options.onRecordingStarted || (() => {});
    this.onTranscriptInterim = options.onTranscriptInterim || (() => {});
    this.onTranscriptFinal = options.onTranscriptFinal || (() => {});
    this.onProcessingStarted = options.onProcessingStarted || (() => {});
    this.onProcessingCompleted = options.onProcessingCompleted || (() => {});
    this.onError = options.onError || (() => {});
    this.onConnectionChange = options.onConnectionChange || (() => {});

    // State tracking
    this.segments = new Map(); // segmentId -> string
    this.interimText = '';
    this.pendingChunks = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;
    this.pingInterval = null;
  }

  getDefaultWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3050';
    return `${protocol}//${host}/ws/dictate`;
  }

  async connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.isConnected) {
            clearInterval(check);
            resolve(true);
          } else if (!this.isConnecting) {
            clearInterval(check);
            resolve(false);
          }
        }, 50);
      });
    }

    this.isConnecting = true;
    this.onConnectionChange('connecting');

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.onConnectionChange('connected');
          this.startHeartbeat();

          // Flush any pending chunks buffered during brief reconnect
          this.flushPendingChunks();
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (err) => {
          console.warn('[StreamingWS] Error:', err);
          this.isConnecting = false;
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.isConnecting = false;
          this.stopHeartbeat();
          this.onConnectionChange('disconnected');
          this.scheduleReconnect();
          resolve(false);
        };
      } catch (err) {
        console.error('[StreamingWS] Failed to create WebSocket:', err);
        this.isConnecting = false;
        this.onConnectionChange('disconnected');
        resolve(false);
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[StreamingWS] Max reconnect attempts reached.');
      return;
    }

    const backoff = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, backoff);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  handleMessage(raw) {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'pong':
          break;

        case 'recording_started':
          this.activeSessionId = msg.sessionId;
          this.segments.clear();
          this.interimText = '';
          this.onRecordingStarted(msg);
          break;

        case 'transcript_interim':
          this.interimText = msg.text || '';
          this.onTranscriptInterim({
            segmentId: msg.segmentId || 1,
            text: msg.text,
            latencyMs: msg.latencyMs,
            timestamp: msg.timestamp
          });
          break;

        case 'transcript_final':
          if (msg.segmentId !== undefined && msg.text) {
            this.segments.set(msg.segmentId, msg.text);
          }
          this.interimText = '';
          this.onTranscriptFinal({
            segmentId: msg.segmentId,
            text: msg.text,
            isFinal: true,
            latencyMs: msg.latencyMs,
            timestamp: msg.timestamp
          });
          break;

        case 'processing_started':
          this.onProcessingStarted(msg);
          break;

        case 'processing_completed':
          this.onProcessingCompleted({
            sessionId: msg.sessionId,
            rawTranscript: msg.rawTranscript,
            segments: msg.segments || Array.from(this.segments.values()),
            durationMs: msg.durationMs,
            language: msg.language,
            latency: msg.latency,
            provider: msg.provider,
            model: msg.model,
            empty: msg.empty || false
          });
          this.activeSessionId = null;
          break;

        case 'error':
          console.error('[StreamingWS Error]', msg.error);
          this.onError(msg);
          break;

        case 'cancelled':
          this.activeSessionId = null;
          this.segments.clear();
          this.interimText = '';
          break;

        default:
          break;
      }
    } catch (e) {
      console.warn('[StreamingWS] Error parsing message:', e);
    }
  }

  /**
   * Start a live streaming recording session
   */
  async startRecording(options = {}) {
    await this.connect();

    this.activeSessionId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.segments.clear();
    this.interimText = '';
    this.pendingChunks = [];

    const startPayload = {
      type: 'recording_started',
      sessionId: this.activeSessionId,
      sttProvider: options.sttProvider || 'groq',
      mimeType: options.mimeType || 'audio/webm',
      language: options.language || 'auto',
      apiKeyGroq: options.apiKeyGroq,
      apiKeyGemini: options.apiKeyGemini,
      timestamp: Date.now()
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(startPayload));
    } else {
      console.warn('[StreamingWS] Socket not open during startRecording, buffering.');
      this.pendingChunks.push({ type: 'control', payload: startPayload });
    }

    return this.activeSessionId;
  }

  /**
   * Send binary audio chunk to server
   */
  async sendChunk(chunkBlob, sequence = 0) {
    if (!chunkBlob || chunkBlob.size === 0) return;

    try {
      const buffer = await chunkBlob.arrayBuffer();

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Direct binary frame for lowest latency
        this.ws.send(buffer);
      } else {
        // Buffer chunk during momentary reconnect
        this.pendingChunks.push({ type: 'audio', buffer, sequence });
      }
    } catch (err) {
      console.error('[StreamingWS] Failed to send chunk:', err);
    }
  }

  flushPendingChunks() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.pendingChunks.length > 0) {
      const item = this.pendingChunks.shift();
      if (item.type === 'control') {
        this.ws.send(JSON.stringify(item.payload));
      } else if (item.type === 'audio') {
        this.ws.send(item.buffer);
      }
    }
  }

  /**
   * Stop recording session and request final results
   */
  stopRecording() {
    if (!this.activeSessionId) return;

    const stopPayload = {
      type: 'recording_stopped',
      sessionId: this.activeSessionId,
      timestamp: Date.now()
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(stopPayload));
    }
  }

  /**
   * Cancel active session
   */
  cancel() {
    if (!this.activeSessionId) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'cancel',
        sessionId: this.activeSessionId
      }));
    }

    this.activeSessionId = null;
    this.segments.clear();
    this.interimText = '';
    this.pendingChunks = [];
  }

  /**
   * Assemble full current transcript with final text + interim text
   */
  getCurrentTranscript() {
    const finalParts = Array.from(this.segments.values());
    const finalStr = finalParts.join(' ').trim();
    if (this.interimText) {
      return finalStr ? `${finalStr} ${this.interimText}` : this.interimText;
    }
    return finalStr;
  }
}

export const streamingClient = new StreamingTranscriptionClient();
