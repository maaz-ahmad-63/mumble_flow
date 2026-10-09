import { groqWhisperProvider } from '../providers/transcription/GroqWhisperProvider.js';
import { groqLlmProvider } from '../providers/llm/GroqLlmProvider.js';

export class GroqService {
  getClient(overrideKey) {
    return groqWhisperProvider.getClient({ apiKey: overrideKey });
  }

  async transcribeAudio(filePath, options = {}) {
    return await groqWhisperProvider.transcribe(filePath, options);
  }

  async processZeroEdit(systemPrompt, userText, options = {}) {
    return await groqLlmProvider.formatText(systemPrompt, userText, options);
  }
}

export const groqService = new GroqService();
