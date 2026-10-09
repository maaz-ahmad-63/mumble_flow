import Groq, { toFile } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BaseTranscriptionProvider } from './BaseTranscriptionProvider.js';
import { ChunkedStreamingSession } from '../../streaming/ChunkedStreamingSession.js';
import { detectAudioContainer } from '../../utils/audioUtils.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class GroqWhisperProvider extends BaseTranscriptionProvider {
  constructor() {
    super('groq');
  }

  getApiKey(options = {}) {
    return options.apiKey || config.groqApiKey || storage.getSettings().apiKeyGroq;
  }

  isConfigured(options = {}) {
    return Boolean(this.getApiKey(options));
  }

  supportsStreaming() {
    return true;
  }

  createStreamingSession(options = {}) {
    return new ChunkedStreamingSession(this, options);
  }

  getClient(options = {}) {
    const key = this.getApiKey(options);
    if (!key) {
      throw new Error('Groq API Key is not configured. Please add it in Settings or .env');
    }
    return new Groq({ apiKey: key });
  }

  async transcribe(filePath, options = {}) {
    const startTime = Date.now();
    const groq = this.getClient(options);
    const model = options.model || storage.getSettings().groqModelSTT || config.models.groqSTT;

    const dictWords = storage.getDictionary().map(d => d.word).join(', ');
    const initialPrompt = options.prompt || (dictWords ? `Vocabulary: ${dictWords}` : undefined);

    // Detect genuine container from file magic bytes or fallback
    const detected = detectAudioContainer(filePath);
    let ext = detected?.ext || path.extname(filePath).toLowerCase();
    if (!ext && options.originalFilename) {
      ext = path.extname(options.originalFilename).toLowerCase();
    }
    const supportedExts = ['.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.opus', '.wav', '.webm'];
    if (!supportedExts.includes(ext)) {
      if (options.mimetype === 'audio/wav' || options.mimetype === 'audio/x-wav') ext = '.wav';
      else if (options.mimetype === 'audio/mp4' || options.mimetype === 'audio/m4a') ext = '.m4a';
      else if (options.mimetype === 'audio/ogg') ext = '.ogg';
      else if (options.mimetype === 'audio/mp3' || options.mimetype === 'audio/mpeg') ext = '.mp3';
      else ext = '.webm';
    }

    const filename = `recording${ext}`;
    const fileStream = fs.createReadStream(filePath);
    const uploadable = await toFile(fileStream, filename);

    let fileSize = 0;
    let fileFirst16Hex = '';
    let fileSha256 = '';
    try {
      const fileBuf = fs.readFileSync(filePath);
      fileSize = fileBuf.length;
      fileFirst16Hex = fileBuf.subarray(0, 16).toString('hex');
      fileSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
    } catch (e) {}
    logger.info(`[STAGE 4: PRE_GROQ] size=${fileSize}, mime=${uploadable.type || options.mimetype || 'audio/webm'}, filename=${filename}, first16=${fileFirst16Hex}, sha256=${fileSha256}`);

    logger.info(`[Groq ASR] Transcribing audio with model: ${model} (format: ${filename})`);

    const transcription = await groq.audio.transcriptions.create({
      file: uploadable,
      model: model,
      language: options.language && options.language !== 'auto' ? options.language : undefined,
      prompt: initialPrompt,
      response_format: 'verbose_json',
      temperature: 0.0
    });

    const elapsed = Date.now() - startTime;
    logger.success(`[Groq ASR] Transcribed in ${elapsed}ms: "${transcription.text?.trim()}"`);

    return {
      text: (transcription.text || '').trim(),
      language: transcription.language || options.language || 'en',
      duration: transcription.duration,
      latencyMs: elapsed,
      provider: this.name,
      model
    };
  }
}

export const groqWhisperProvider = new GroqWhisperProvider();
