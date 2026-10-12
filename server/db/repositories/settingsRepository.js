import { db } from '../index.js';
import { apiKeyRepository } from './apiKeyRepository.js';
import { cryptoService } from '../../services/cryptoService.js';

const DEFAULT_SETTINGS = {
  sttProvider: process.env.DEFAULT_STT_PROVIDER || 'groq',
  sttModel: process.env.DEFAULT_STT_MODEL || 'whisper-large-v3-turbo',
  llmProvider: process.env.DEFAULT_LLM_PROVIDER || 'groq',
  llmModel: process.env.DEFAULT_LLM_MODEL || 'openai/gpt-oss-20b',
  groqModelSTT: 'whisper-large-v3-turbo',
  groqModelLLM: 'openai/gpt-oss-20b',
  geminiModel: 'gemini-3.6-flash',
  defaultTone: 'casual',
  autoAppMode: true,
  autoCopy: true,
  pushToTalkKey: 'Space',
  cancelKey: 'Escape',
  soundEffects: true,
  vadEnabled: true,
  webhookUrl: '',
  apiKeyGroq: '',
  apiKeyGemini: '',
  apiKeyOpenai: '',
  transcriptionMode: 'auto', // 'auto' | 'local' | 'cloud'
  aiEnhancement: 'auto',     // 'auto' | 'always' | 'never'
  localWhisperEndpoint: 'http://localhost:8000/v1/audio/transcriptions',
  localWhisperModel: 'whisper-1',
  appProfiles: []
};

export class SettingsRepository {
  constructor(adapter = db) {
    this.db = adapter;
  }

  getRawSettings(userId = 'default_user') {
    const rowRes = this.db.get('SELECT settings_json FROM settings WHERE user_id = ?', [userId]);

    const parseRow = (row) => {
      if (!row || !row.settings_json) {
        return { ...DEFAULT_SETTINGS };
      }
      try {
        const parsed = JSON.parse(row.settings_json);
        // Migration: support legacy single 'provider' key
        if (parsed.provider && !parsed.sttProvider) {
          parsed.sttProvider = parsed.provider;
          parsed.sttModel = 'whisper-large-v3-turbo';
          parsed.llmProvider = parsed.provider;
          parsed.llmModel = 'openai/gpt-oss-20b';
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch (e) {
        return { ...DEFAULT_SETTINGS };
      }
    };

    if (rowRes instanceof Promise) {
      return rowRes.then(parseRow);
    }
    return parseRow(rowRes);
  }

  getSafeSettings(userId = 'default_user') {
    const rawRes = this.getRawSettings(userId);
    const keysRes = this.db.query('SELECT provider FROM user_api_keys WHERE user_id = ?', [userId]);

    const buildSafe = (raw, userKeys) => {
      let userKeySet = new Set();
      if (Array.isArray(userKeys)) {
        userKeySet = new Set(userKeys.map(k => k.provider));
      }

      const hasGroqKey = Boolean(process.env.GROQ_API_KEY || raw.apiKeyGroq || userKeySet.has('groq'));
      const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || raw.apiKeyGemini || userKeySet.has('gemini'));
      const hasOpenaiKey = Boolean(process.env.OPENAI_API_KEY || raw.apiKeyOpenai || userKeySet.has('openai'));

      // Deep copy and strip API keys
      const safe = { ...raw };
      delete safe.apiKeyGroq;
      delete safe.apiKeyGemini;
      delete safe.apiKeyOpenai;
      delete safe.jwtSecret;

      return {
        ...safe,
        hasGroqKey,
        hasGeminiKey,
        hasOpenaiKey,
        groqKeyConfigured: hasGroqKey,
        geminiKeyConfigured: hasGeminiKey,
        openaiKeyConfigured: hasOpenaiKey
      };
    };

    if (rawRes instanceof Promise || keysRes instanceof Promise) {
      return Promise.all([
        Promise.resolve(rawRes),
        Promise.resolve(keysRes).catch(() => [])
      ]).then(([raw, keys]) => buildSafe(raw, keys));
    }
    return buildSafe(rawRes, keysRes);
  }

  updateSettings(userId = 'default_user', updates = {}) {
    const cleanUpdates = { ...updates };

    // Intercept and encrypt any API keys passed in updates
    const keyFields = [
      { field: 'apiKeyGroq', provider: 'groq' },
      { field: 'apiKeyGemini', provider: 'gemini' },
      { field: 'apiKeyOpenai', provider: 'openai' }
    ];

    for (const { field, provider } of keyFields) {
      if (cleanUpdates[field] !== undefined) {
        const val = typeof cleanUpdates[field] === 'string' ? cleanUpdates[field].trim() : '';
        if (val) {
          try {
            const encryptedKey = cryptoService.encrypt(val);
            const keyHint = cryptoService.maskKey(val);
            apiKeyRepository.saveKey({
              id: `key_${userId}_${provider}_${Date.now()}`,
              userId,
              provider,
              encryptedKey,
              keyHint,
              validationStatus: 'untested'
            });
          } catch (e) {}
        } else if (cleanUpdates[field] === '' || cleanUpdates[field] === null) {
          try {
            apiKeyRepository.deleteKey(userId, provider);
          } catch (e) {}
        }
        delete cleanUpdates[field];
      }
    }

    const currentRes = this.getRawSettings(userId);
    const saveAndReturn = (current) => {
      delete current.apiKeyGroq;
      delete current.apiKeyGemini;
      delete current.apiKeyOpenai;

      const updated = { ...current, ...cleanUpdates };
      const now = new Date().toISOString();

      const runRes = this.db.run(
        `INSERT INTO settings (user_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           settings_json = EXCLUDED.settings_json,
           updated_at = EXCLUDED.updated_at`,
        [userId, JSON.stringify(updated), now]
      );

      if (runRes instanceof Promise) {
        return runRes.then(() => this.getSafeSettings(userId));
      }
      return this.getSafeSettings(userId);
    };

    if (currentRes instanceof Promise) {
      return currentRes.then(saveAndReturn);
    }
    return saveAndReturn(currentRes);
  }

  updateUserSettings(userId, updates) {
    return this.updateSettings(userId, updates);
  }

  getUserSettings(userId) {
    return this.getRawSettings(userId);
  }

  migrateLegacySettings(settings = {}) {
    const copy = { ...settings };
    if (copy.provider && !copy.sttProvider) {
      copy.sttProvider = copy.provider;
      copy.sttModel = 'whisper-large-v3-turbo';
      copy.llmProvider = copy.provider;
      copy.llmModel = 'openai/gpt-oss-20b';
    }
    return copy;
  }
}

export const settingsRepository = new SettingsRepository();
