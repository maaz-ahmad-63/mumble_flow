import { BaseLlmProvider } from './BaseLlmProvider.js';
import { config } from '../../config.js';
import { storage } from '../../services/storageService.js';
import { logger } from '../../services/logger.js';

export class OpenAiLlmProvider extends BaseLlmProvider {
  constructor() {
    super('openai');
    this.defaultModel = 'gpt-4o-mini';
  }

  getApiKey(options = {}) {
    const userSettings = storage.getRawSettings(options.userId);
    return options.apiKey || userSettings.apiKeyOpenai || config.openaiApiKey || process.env.OPENAI_API_KEY || '';
  }

  isConfigured(options = {}) {
    return Boolean(this.getApiKey(options));
  }

  async formatText(systemPrompt, promptText, options = {}) {
    const apiKey = this.getApiKey(options);
    if (!apiKey) {
      throw new Error('OpenAI API Key is not configured. Please add it in Settings or .env');
    }

    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    logger.info(`[OpenAI LLM] Formatting with model: ${model}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText }
        ],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[OpenAI LLM Error] ${response.status} ${errText}`);
      throw new Error(`OpenAI LLM error: ${errText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content?.trim() || promptText;

    logger.info(`[OpenAI LLM] Formatting completed in ${latencyMs}ms`);

    return {
      text: content,
      latencyMs,
      provider: this.name,
      model,
      usage: data.usage || {
        prompt_tokens: Math.ceil(promptText.length / 4),
        completion_tokens: Math.ceil(content.length / 4),
        total_tokens: Math.ceil((promptText.length + content.length) / 4)
      }
    };
  }
}

export const openAiLlmProvider = new OpenAiLlmProvider();
