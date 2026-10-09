import { geminiTranscriptionProvider } from '../providers/transcription/GeminiTranscriptionProvider.js';
import { geminiLlmProvider } from '../providers/llm/GeminiLlmProvider.js';

export class GeminiService {
  getClient(overrideKey) {
    return geminiTranscriptionProvider.getClient({ apiKey: overrideKey });
  }

  async transcribeAudio(filePath, mimeType = 'audio/webm', options = {}) {
    return await geminiTranscriptionProvider.transcribe(filePath, { ...options, mimetype: mimeType });
  }

  async processZeroEdit(systemPrompt, userText, options = {}) {
    return await geminiLlmProvider.formatText(systemPrompt, userText, options);
  }
}

export const geminiService = new GeminiService();
