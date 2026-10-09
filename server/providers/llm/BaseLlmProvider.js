/**
 * Abstract Base Class for LLM Text Formatting Providers.
 */
export class BaseLlmProvider {
  constructor(name) {
    if (!name) {
      throw new Error('BaseLlmProvider requires a unique provider name.');
    }
    this.name = name;
  }

  isConfigured(options = {}) {
    return false;
  }

  /**
   * Format or rewrite text using LLM.
   * @param {string} systemPrompt
   * @param {string} promptText
   * @param {Object} options
   * @returns {Promise<{
   *   text: string,
   *   latencyMs: number,
   *   provider: string,
   *   model: string,
   *   usage?: Object
   * }>}
   */
  async formatText(systemPrompt, promptText, options = {}) {
    throw new Error(`formatText() not implemented on provider: ${this.name}`);
  }
}
