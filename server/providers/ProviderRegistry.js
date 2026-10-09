import { groqWhisperProvider } from './transcription/GroqWhisperProvider.js';
import { geminiTranscriptionProvider } from './transcription/GeminiTranscriptionProvider.js';
import { localWhisperProvider } from './transcription/LocalWhisperProvider.js';
import { openAiTranscriptionProvider } from './transcription/OpenAiTranscriptionProvider.js';

import { groqLlmProvider } from './llm/GroqLlmProvider.js';
import { geminiLlmProvider } from './llm/GeminiLlmProvider.js';
import { localLlmProvider } from './llm/LocalLlmProvider.js';
import { openAiLlmProvider } from './llm/OpenAiLlmProvider.js';
import { storage } from '../services/storageService.js';
import { config } from '../config.js';

export class ProviderRegistry {
  constructor() {
    this.transcriptionProviders = new Map();
    this.llmProviders = new Map();

    // Register default built-in providers
    this.registerTranscriptionProvider(groqWhisperProvider);
    this.registerTranscriptionProvider(geminiTranscriptionProvider);
    this.registerTranscriptionProvider(localWhisperProvider);
    this.registerTranscriptionProvider(openAiTranscriptionProvider);

    this.registerLlmProvider(groqLlmProvider);
    this.registerLlmProvider(geminiLlmProvider);
    this.registerLlmProvider(localLlmProvider);
    this.registerLlmProvider(openAiLlmProvider);
  }

  registerTranscriptionProvider(provider) {
    this.transcriptionProviders.set(provider.name.toLowerCase(), provider);
  }

  registerLlmProvider(provider) {
    this.llmProviders.set(provider.name.toLowerCase(), provider);
  }

  getTranscriptionProvider(name) {
    const key = (name || config.defaultSttProvider || 'groq').toLowerCase();
    const provider = this.transcriptionProviders.get(key);
    if (!provider) {
      const available = Array.from(this.transcriptionProviders.keys()).join(', ');
      throw new Error(`Unknown transcription provider "${name}". Available providers: ${available}`);
    }
    return provider;
  }

  getLlmProvider(name) {
    const key = (name || config.defaultLlmProvider || 'groq').toLowerCase();
    const provider = this.llmProviders.get(key);
    if (!provider) {
      const available = Array.from(this.llmProviders.keys()).join(', ');
      throw new Error(`Unknown LLM provider "${name}". Available providers: ${available}`);
    }
    return provider;
  }

  listTranscriptionProviders() {
    return Array.from(this.transcriptionProviders.keys());
  }

  listLlmProviders() {
    return Array.from(this.llmProviders.keys());
  }

  getStatus() {
    const settings = storage.getSettings();
    const groqConfigured = Boolean(config.groqApiKey || settings.apiKeyGroq || settings.hasGroqKey);
    const geminiConfigured = Boolean(config.geminiApiKey || settings.apiKeyGemini || settings.hasGeminiKey);
    const openaiConfigured = Boolean(config.openaiApiKey || settings.apiKeyOpenai || settings.hasOpenaiKey);

    return {
      groq: {
        configured: groqConfigured,
        modelsSTT: [config.models.groqSTT, config.models.groqSTTFallback],
        modelsLLM: [config.models.groqLLM, config.models.groqLLMFallback]
      },
      openai: {
        configured: openaiConfigured,
        modelsSTT: ['whisper-1'],
        modelsLLM: ['gpt-4o-mini', 'gpt-4o']
      },
      gemini: {
        configured: geminiConfigured,
        modelsSTT: [config.models.geminiSTT],
        modelsLLM: [config.models.geminiLLM]
      },
      local: {
        configured: true,
        whisperEndpoint: config.localWhisperUrl,
        llmEndpoint: config.localLlmUrl
      },
      webspeech: {
        configured: true,
        description: 'Native browser speech recognition (zero API key needed)'
      }
    };
  }
}

export const providerRegistry = new ProviderRegistry();
