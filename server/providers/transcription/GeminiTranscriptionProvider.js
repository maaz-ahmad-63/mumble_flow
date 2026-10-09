import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { BaseTranscriptionProvider } from './BaseTranscriptionProvider.js';
import { ChunkedStreamingSession } from '../../streaming/ChunkedStreamingSession.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class GeminiTranscriptionProvider extends BaseTranscriptionProvider {
  constructor() {
    super('gemini');
  }

  getApiKey(options = {}) {
    return options.apiKey || config.geminiApiKey || storage.getSettings().apiKeyGemini;
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
      throw new Error('Gemini API Key is not configured. Please add it in Settings or .env');
    }
    return new GoogleGenerativeAI(key);
  }

  async transcribe(filePath, options = {}) {
    const startTime = Date.now();
    const ai = this.getClient(options);
    const modelName = options.model || storage.getSettings().geminiModel || config.models.geminiSTT;
    const model = ai.getGenerativeModel({ model: modelName });

    const mimeType = options.mimetype || 'audio/webm';
    const audioBuffer = fs.readFileSync(filePath);
    const base64Audio = audioBuffer.toString('base64');

    const dictWords = storage.getDictionary().map(d => d.word).join(', ');
    const prompt = `You are an accurate speech-to-text transcriber. 
Transcribe the speech in this audio verbatim into text. 
Do not add timestamps, commentary, or speaker tags unless requested.
${dictWords ? `Special vocabulary to recognize accurately: ${dictWords}` : ''}
Output ONLY the transcription text.`;

    logger.info(`[Gemini ASR] Transcribing audio with model: ${modelName} (${mimeType})`);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Audio
        }
      }
    ]);

    const response = await result.response;
    const text = (response.text() || '').trim();
    const elapsed = Date.now() - startTime;

    logger.success(`[Gemini ASR] Transcribed in ${elapsed}ms: "${text}"`);

    return {
      text,
      language: options.language || 'auto',
      duration: undefined,
      latencyMs: elapsed,
      provider: this.name,
      model: modelName
    };
  }
}

export const geminiTranscriptionProvider = new GeminiTranscriptionProvider();
