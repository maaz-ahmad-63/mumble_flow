import { BaseLlmProvider } from './BaseLlmProvider.js';
import { config } from '../../config.js';
import { logger } from '../../services/logger.js';

export class LocalLlmProvider extends BaseLlmProvider {
  constructor() {
    super('local-llm');
  }

  isConfigured(options = {}) {
    return Boolean(options.endpoint || config.localLlmUrl);
  }

  async formatText(systemPrompt, userText, options = {}) {
    const startTime = Date.now();
    let baseUrl = options.endpoint || config.localLlmUrl;
    if (!baseUrl.endsWith('/chat/completions')) {
      baseUrl = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    }
    const model = options.model || config.localLlmModel || 'llama3.2';

    logger.info(`[Local LLM] Sending text to ${baseUrl} with model: ${model}`);

    let response;
    try {
      response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.1
        })
      });
    } catch (err) {
      throw new Error(`Failed to connect to local LLM server at ${baseUrl}: ${err.message}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Local LLM server returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - startTime;
    const output = (data.choices?.[0]?.message?.content || '').trim() || userText;

    logger.success(`[Local LLM] Formatting completed in ${elapsed}ms`);

    return {
      text: output,
      latencyMs: elapsed,
      provider: this.name,
      model
    };
  }
}

export const localLlmProvider = new LocalLlmProvider();
