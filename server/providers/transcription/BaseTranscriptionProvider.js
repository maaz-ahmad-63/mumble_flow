/**
 * Abstract Base Class for Speech-to-Text (ASR) Providers.
 */
export class BaseTranscriptionProvider {
  constructor(name) {
    if (!name) {
      throw new Error('BaseTranscriptionProvider requires a unique provider name.');
    }
    this.name = name;
  }

  /**
   * Returns whether the provider has the credentials or connection necessary to transcribe.
   * @param {Object} options - Runtime options (e.g. override keys)
   * @returns {boolean}
   */
  isConfigured(options = {}) {
    return false;
  }

  /**
   * Whether the provider supports real-time streaming transcription.
   * Can be overridden by subclasses (e.g., Groq chunked streaming, local streaming).
   * @returns {boolean}
   */
  supportsStreaming() {
    return false;
  }

  /**
   * Create a streaming transcription session for this provider.
   * Providers that support streaming or chunked streaming return an active session.
   * Providers that do not return null, triggering a clean fallback session.
   * @param {Object} options - Session options (sessionId, language, callbacks)
   * @returns {Object|null}
   */
  createStreamingSession(options = {}) {
    return null;
  }

  /**
   * Transcribe an audio file into raw text.
   * @param {string} filePath - Absolute path to local audio file
   * @param {Object} options - Language, prompt, model, apiKey, mimetype
   * @returns {Promise<{
   *   text: string,
   *   language?: string,
   *   duration?: number,
   *   latencyMs: number,
   *   provider: string,
   *   model: string
   * }>}
   */
  async transcribe(filePath, options = {}) {
    throw new Error(`transcribe() not implemented on provider: ${this.name}`);
  }
}
