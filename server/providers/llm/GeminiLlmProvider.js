import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLlmProvider } from './BaseLlmProvider.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class GeminiLlmProvider extends BaseLlmProvider {
  constructor() {
    super('gemini');
  }

  getApiKey(options = {}) {
    return options.apiKey || config.geminiApiKey || storage.getSettings().apiKeyGemini;
  }

  isConfigured(options = {}) {
    return Boolean(this.getApiKey(options));
  }

  getClient(options = {}) {
    const key = this.getApiKey(options);
    if (!key) {
      throw new Error('Gemini API Key is not configured. Please add it in Settings or .env');
    }
    return new GoogleGenerativeAI(key);
  }

  async formatText(systemPrompt, userText, options = {}) {
    const startTime = Date.now();
    const ai = this.getClient(options);
    let settings = options.preloadedSettings || storage.getSettings(options.userId);
    if (settings instanceof Promise) settings = await settings.catch(() => ({}));
    const modelName = options.model || (settings && settings.geminiModel) || config.models.geminiLLM;

    logger.info(`[Gemini LLM] Running AI formatting on ${userText.length} chars with model: ${modelName}`);

    const model = ai.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const result = await model.generateContent(userText);
    const response = await result.response;
    const output = (response.text() || '').trim() || userText;
    const elapsed = Date.now() - startTime;

    logger.success(`[Gemini LLM] Formatting completed in ${elapsed}ms`);

    return {
      text: output,
      latencyMs: elapsed,
      provider: this.name,
      model: modelName
    };
  }
}

export const geminiLlmProvider = new GeminiLlmProvider();
