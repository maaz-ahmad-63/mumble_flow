import { providerRegistry } from '../providers/ProviderRegistry.js';
import { localWhisperProvider } from '../providers/transcription/LocalWhisperProvider.js';
import { ChunkedStreamingSession } from '../streaming/ChunkedStreamingSession.js';
import { storage } from './storageService.js';
import { config } from '../config.js';
import { logger } from './logger.js';

export class TranscriptionService {
  /**
   * Determine the best STT provider based on user settings and runtime availability.
   *
   * @param {Object} options - Options including transcriptionMode, sttProvider, userId
   * @returns {Promise<{ providerName: string, isLocal: boolean, fallbackReason?: string }>}
   */
  async resolveProvider(options = {}) {
    const userSettings = storage.getSettings(options.userId);
    const mode = (options.transcriptionMode || userSettings.transcriptionMode || 'auto').toLowerCase();
    const configuredCloudProvider = options.sttProvider || userSettings.sttProvider || config.defaultSttProvider || 'groq';

    if (mode === 'cloud') {
      return { providerName: configuredCloudProvider, isLocal: false };
    }

    if (mode === 'local') {
      const status = await localWhisperProvider.checkAvailability();
      if (status.available) {
        return { providerName: 'local-whisper', isLocal: true };
      }
      logger.warn(`[TranscriptionService] Local Whisper requested but unavailable. Falling back to cloud provider "${configuredCloudProvider}".`);
      return {
        providerName: configuredCloudProvider,
        isLocal: false,
        fallbackReason: 'local_whisper_unavailable'
      };
    }

    // mode === 'auto' (preferred default)
    // Prefer local Whisper if healthy and running; otherwise use cloud without failing
    const localStatus = await localWhisperProvider.checkAvailability();
    if (localStatus.available) {
      logger.info(`[TranscriptionService] Local Whisper available. Using zero-cost local transcription.`);
      return { providerName: 'local-whisper', isLocal: true };
    }

    return { providerName: configuredCloudProvider, isLocal: false };
  }

  /**
   * Transcribe an audio file using resolved or fallback STT provider.
   */
  async transcribeAudio(filePath, options = {}) {
    const resolution = await this.resolveProvider(options);
    let targetProviderName = resolution.providerName;

    logger.info(`[TranscriptionService] Routing audio to STT provider: "${targetProviderName}" (Local: ${resolution.isLocal})`);

    try {
      const userSettings = storage.getSettings(options.userId);
      const modelToUse = options.sttModel || options.model || userSettings.sttModel;
      const transcribeOptions = { ...options, model: modelToUse };

      const provider = providerRegistry.getTranscriptionProvider(targetProviderName);
      const result = await provider.transcribe(filePath, transcribeOptions);
      return {
        ...result,
        sttMode: resolution.isLocal ? 'local' : 'cloud',
        fallbackReason: resolution.fallbackReason
      };
    } catch (primaryErr) {
      // If primary local provider failed during transcribe, fall back to cloud provider
      if (resolution.isLocal) {
        const userSettings = storage.getSettings(options.userId);
        const cloudProviderName = options.sttProvider || userSettings.sttProvider || config.defaultSttProvider || 'groq';
        const modelToUse = options.sttModel || options.model || userSettings.sttModel;
        const transcribeOptions = { ...options, model: modelToUse };

        logger.warn(`[TranscriptionService] Primary local provider failed: ${primaryErr.message}. Falling back to cloud "${cloudProviderName}".`);
        const fallbackProvider = providerRegistry.getTranscriptionProvider(cloudProviderName);
        const result = await fallbackProvider.transcribe(filePath, transcribeOptions);
        return {
          ...result,
          sttMode: 'cloud',
          fallbackReason: `local_error_${primaryErr.message}`
        };
      }
      throw primaryErr;
    }
  }

  /**
   * Check status of local transcription for desktop clients and UI
   */
  async getLocalStatus() {
    return await localWhisperProvider.checkAvailability();
  }

  /**
   * Create a streaming transcription session for low-latency live dictation.
   */
  createStreamingSession(options = {}) {
    const providerName = options.sttProvider || storage.getSettings(options.userId).sttProvider || config.defaultSttProvider || 'groq';
    logger.info(`[TranscriptionService] Initializing streaming session for provider: "${providerName}"`);

    const provider = providerRegistry.getTranscriptionProvider(providerName);
    const supportsStreaming = provider && typeof provider.supportsStreaming === 'function' ? provider.supportsStreaming() : false;

    if (provider && typeof provider.createStreamingSession === 'function') {
      const session = provider.createStreamingSession(options);
      if (session) {
        return {
          session,
          provider: providerName,
          streamingSupported: supportsStreaming
        };
      }
    }

    const fallbackSession = new ChunkedStreamingSession(provider, { ...options, enableInterim: false });
    return {
      session: fallbackSession,
      provider: providerName,
      streamingSupported: false
    };
  }
}

export const transcriptionService = new TranscriptionService();
