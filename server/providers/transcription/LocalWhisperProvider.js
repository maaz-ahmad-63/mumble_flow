import fs from 'fs';
import path from 'path';
import { BaseTranscriptionProvider } from './BaseTranscriptionProvider.js';
import { ChunkedStreamingSession } from '../../streaming/ChunkedStreamingSession.js';
import { config } from '../../config.js';
import { logger } from '../../services/logger.js';

export class LocalWhisperProvider extends BaseTranscriptionProvider {
  constructor(options = {}) {
    super('local-whisper');
    this.endpoint = options.endpoint || config.localWhisperUrl || 'http://localhost:8000/v1/audio/transcriptions';
    this.model = options.model || config.localWhisperModel || 'whisper-1';
    this.device = options.device || 'cpu'; // 'cpu', 'cuda', 'mps'
    this.computeType = options.computeType || 'int8'; // 'int8', 'float16', 'float32'
    this.vad = options.vad !== false;
    this.modelPath = options.modelPath || null;
    this.language = options.language || 'auto';

    this.lastAvailabilityCheck = 0;
    this.isAvailableCached = false;
    this.availabilityCacheTtlMs = 15000; // 15 seconds cache
  }

  /**
   * Check if local Whisper endpoint or runtime is genuinely available and healthy.
   * Does NOT pretend local transcription is available if the server is offline.
   */
  async checkAvailability(force = false) {
    const now = Date.now();
    if (!force && now - this.lastAvailabilityCheck < this.availabilityCacheTtlMs) {
      return {
        available: this.isAvailableCached,
        endpoint: this.endpoint,
        model: this.model,
        device: this.device
      };
    }

    this.lastAvailabilityCheck = now;

    try {
      // Probe health endpoint or root of local Whisper server (faster-whisper, whisper.cpp, or vLLM/OpenAI-compatible)
      const healthUrl = this.endpoint.replace(/\/transcriptions\/?$/, '/models').replace(/\/audio\/?$/, '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal
      }).catch(async () => {
        // Fallback probe to root
        const rootUrl = new URL(this.endpoint).origin;
        return await fetch(rootUrl, { method: 'GET', signal: controller.signal });
      });

      clearTimeout(timeoutId);
      this.isAvailableCached = Boolean(res && res.ok);
    } catch (err) {
      this.isAvailableCached = false;
    }

    return {
      available: this.isAvailableCached,
      endpoint: this.endpoint,
      model: this.model,
      device: this.device
    };
  }

  isConfigured(options = {}) {
    return Boolean(options.endpoint || this.endpoint);
  }

  supportsStreaming() {
    return true;
  }

  createStreamingSession(options = {}) {
    return new ChunkedStreamingSession(this, options);
  }

  configure(newConfig = {}) {
    if (newConfig.endpoint) this.endpoint = newConfig.endpoint;
    if (newConfig.model) this.model = newConfig.model;
    if (newConfig.device) this.device = newConfig.device;
    if (newConfig.computeType) this.computeType = newConfig.computeType;
    if (newConfig.vad !== undefined) this.vad = newConfig.vad;
    if (newConfig.modelPath) this.modelPath = newConfig.modelPath;
    if (newConfig.language) this.language = newConfig.language;
    this.lastAvailabilityCheck = 0; // Invalidate cache
  }

  async transcribe(filePath, options = {}) {
    const startTime = Date.now();
    const endpoint = options.endpoint || this.endpoint;
    const model = options.model || this.model;

    logger.info(`[Local Whisper ASR] Transcribing via ${endpoint} (model: ${model}, compute: ${this.computeType})`);

    const ext = path.extname(filePath) || '.webm';
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], { type: options.mimetype || 'audio/webm' });

    const formData = new FormData();
    formData.append('file', blob, `audio${ext}`);
    formData.append('model', model);

    const lang = options.language || this.language;
    if (lang && lang !== 'auto') {
      formData.append('language', lang);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}
      });
    } catch (fetchErr) {
      this.isAvailableCached = false;
      throw new Error(`Local Whisper is offline or unreachable at ${endpoint}: ${fetchErr.message}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Local Whisper returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - startTime;
    const text = (data.text || '').trim();

    logger.success(`[Local Whisper ASR] Transcribed in ${elapsed}ms: "${text}"`);

    return {
      text,
      language: data.language || lang || 'auto',
      duration: data.duration,
      latencyMs: elapsed,
      provider: this.name,
      model,
      isLocal: true
    };
  }
}

export const localWhisperProvider = new LocalWhisperProvider();
