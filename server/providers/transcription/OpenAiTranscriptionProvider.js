import fs from 'fs';
import path from 'path';
import { BaseTranscriptionProvider } from './BaseTranscriptionProvider.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class OpenAiTranscriptionProvider extends BaseTranscriptionProvider {
  constructor() {
    super('openai');
    this.defaultModel = 'whisper-1';
  }

  getApiKey(options = {}) {
    const userSettings = storage.getRawSettings(options.userId);
    return options.apiKey || userSettings.apiKeyOpenai || config.openaiApiKey || process.env.OPENAI_API_KEY || '';
  }

  isConfigured(options = {}) {
    return Boolean(this.getApiKey(options));
  }

  async transcribe(filePath, options = {}) {
    const apiKey = this.getApiKey(options);
    if (!apiKey) {
      throw new Error('OpenAI API Key is not configured. Please add it in Settings or .env');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found at path: ${filePath}`);
    }

    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath) || 'recording.wav';
    const blob = new Blob([fileBuffer], { type: options.mimetype || 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('model', model);
    if (options.language && options.language !== 'auto') {
      formData.append('language', options.language);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    formData.append('response_format', 'verbose_json');

    logger.info(`[OpenAI ASR] Transcribing audio with model: ${model}`);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[OpenAI ASR Error] ${response.status} ${errText}`);
      throw new Error(`OpenAI transcription error: ${errText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const text = (data.text || '').trim();

    logger.info(`[OpenAI ASR] Transcribed in ${latencyMs}ms: "${text.substring(0, 80)}"`);

    return {
      text,
      language: data.language || options.language || 'en',
      duration: data.duration || null,
      latencyMs,
      provider: this.name,
      model
    };
  }
}

export const openAiTranscriptionProvider = new OpenAiTranscriptionProvider();
