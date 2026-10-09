import Groq from 'groq-sdk';
import { BaseLlmProvider } from './BaseLlmProvider.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class GroqLlmProvider extends BaseLlmProvider {
  constructor() {
    super('groq');
  }

  getApiKey(options = {}) {
    return options.apiKey || config.groqApiKey || storage.getSettings().apiKeyGroq;
  }

  isConfigured(options = {}) {
    return Boolean(this.getApiKey(options));
  }

  getClient(options = {}) {
    const key = this.getApiKey(options);
    if (!key) {
      throw new Error('Groq API Key is not configured. Please add it in Settings or .env');
    }
    return new Groq({ apiKey: key });
  }

  async formatText(systemPrompt, userText, options = {}) {
    const startTime = Date.now();
    const groq = this.getClient(options);
    const model = options.model || storage.getSettings().groqModelLLM || config.models.groqLLM;

    logger.info(`[Groq LLM] Running AI formatting on ${userText.length} chars with model: ${model}`);

    const completion = await groq.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      temperature: 0.1,
      max_completion_tokens: 2048,
      reasoning_effort: 'low'
    });

    const elapsed = Date.now() - startTime;
    const output = (completion.choices[0]?.message?.content || '').trim() || userText;
    logger.success(`[Groq LLM] Formatting completed in ${elapsed}ms`);

    return {
      text: output,
      latencyMs: elapsed,
      provider: this.name,
      model,
      usage: completion.usage
    };
  }
}

export const groqLlmProvider = new GroqLlmProvider();
