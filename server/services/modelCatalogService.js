/**
 * Mumble AI — Model Catalog Service
 *
 * Centralized service managing STT and LLM models, provider adapters,
 * live pricing evaluation, cost estimation, and validation.
 */

import {
  PRODUCT_IDENTITY,
  STT_MODEL_CATALOG,
  LLM_MODEL_CATALOG,
  DEFAULT_CATALOG_SELECTION
} from '../config/modelCatalog.js';
import { config } from '../config.js';
import { storage } from './storageService.js';
import { apiKeyService } from './apiKeyService.js';

export class ModelCatalogService {
  constructor() {
    this.productIdentity = PRODUCT_IDENTITY;
    this.sttCatalog = STT_MODEL_CATALOG;
    this.llmCatalog = LLM_MODEL_CATALOG;
    this.defaultSelection = DEFAULT_CATALOG_SELECTION;
  }

  /**
   * Determine the operational status of a provider.
   * Statuses: 'available' | 'requires_api_key' | 'local' | 'unsupported' | 'disabled'
   */
  getProviderStatus(providerName, type = 'stt', userId = 'default_user') {
    const p = providerName?.toLowerCase();
    const settings = storage.getSettings(userId);

    if (p === 'deterministic' || p === 'local') {
      return {
        status: p === 'local' ? 'local' : 'available',
        hasAdapter: true,
        hasApiKey: true,
        isConfigured: true,
        configured: true,
        badge: p === 'local' ? 'Local' : 'Available'
      };
    }

    if (p === 'groq' || p === 'openai' || p === 'gemini') {
      const keyInfo = apiKeyService.getDecryptedKey(userId, p);
      const capKey = p === 'groq' ? 'Groq' : p === 'openai' ? 'Openai' : 'Gemini';
      const hasKey = Boolean(keyInfo.key || settings?.[`has${capKey}Key`] || settings?.[`apiKey${capKey}`]);
      const badge = hasKey
        ? (keyInfo.source === 'user' ? 'BYOK Active' : 'Available')
        : 'Requires API key';

      return {
        status: hasKey ? 'available' : 'requires_api_key',
        hasAdapter: true,
        hasApiKey: hasKey,
        isConfigured: hasKey,
        configured: hasKey,
        source: keyInfo.source,
        keyHint: keyInfo.keyHint,
        badge
      };
    }

    // Catalogued providers without implemented adapters in this repo yet (Deepgram, AssemblyAI, Anthropic)
    if (p === 'deepgram' || p === 'assemblyai' || p === 'anthropic') {
      return {
        status: 'requires_api_key',
        hasAdapter: false,
        hasApiKey: false,
        isConfigured: false,
        configured: false,
        badge: 'Requires Adapter & Key'
      };
    }

    return {
      status: 'unsupported',
      hasAdapter: false,
      hasApiKey: false,
      isConfigured: false,
      configured: false,
      badge: 'Unavailable'
    };
  }

  /**
   * List all STT models with dynamic availability annotations.
   */
  getSttModels(userId = 'default_user') {
    const list = [];
    for (const [provider, models] of Object.entries(this.sttCatalog)) {
      const providerStatus = this.getProviderStatus(provider, 'stt', userId);
      for (const m of models) {
        list.push({
          ...m,
          type: 'stt',
          status: providerStatus.status,
          configured: providerStatus.configured,
          statusBadge: providerStatus.badge,
          hasAdapter: m.hasAdapter && providerStatus.hasAdapter
        });
      }
    }
    return list;
  }

  listSttModels(userId = 'default_user') {
    return this.getSttModels(userId);
  }

  /**
   * List all LLM models with dynamic availability annotations.
   */
  getLlmModels(userId = 'default_user') {
    const list = [];
    for (const [provider, models] of Object.entries(this.llmCatalog)) {
      const providerStatus = this.getProviderStatus(provider, 'llm', userId);
      for (const m of models) {
        list.push({
          ...m,
          type: 'llm',
          status: providerStatus.status,
          configured: providerStatus.configured,
          statusBadge: providerStatus.badge,
          hasAdapter: m.hasAdapter && providerStatus.hasAdapter
        });
      }
    }
    return list;
  }

  listLlmModels(userId = 'default_user') {
    return this.getLlmModels(userId);
  }

  /**
   * Return full catalog with product branding and pricing metadata.
   */
  getFullCatalog(userId = 'default_user') {
    return {
      product: this.productIdentity,
      defaults: this.defaultSelection,
      stt: this.getSttModels(userId),
      llm: this.getLlmModels(userId)
    };
  }

  /**
   * Retrieve specific STT model specification.
   */
  getSttModel(provider, model) {
    const p = provider?.toLowerCase();
    const models = this.sttCatalog[p] || [];
    if (!model) {
      return models.find(m => m.defaultForProvider) || models[0] || null;
    }
    return models.find(m => m.model === model) || models[0] || null;
  }

  /**
   * Retrieve specific LLM model specification.
   */
  getLlmModel(provider, model) {
    const p = provider?.toLowerCase();
    const models = this.llmCatalog[p] || [];
    if (!model) {
      return models.find(m => m.defaultForProvider) || models[0] || null;
    }
    return models.find(m => m.model === model) || models[0] || null;
  }

  /**
   * Validate user model selection.
   * Rejects unsupported/fake provider or model inputs.
   */
  validateSelection({ sttProvider, sttModel, llmProvider, llmModel }) {
    const errors = [];

    if (sttProvider) {
      const p = sttProvider.toLowerCase();
      if (!this.sttCatalog[p]) {
        errors.push(`Invalid STT provider "${sttProvider}". Allowed: ${Object.keys(this.sttCatalog).join(', ')}`);
      } else if (sttModel) {
        const found = this.sttCatalog[p].some(m => m.model === sttModel);
        if (!found) {
          errors.push(`Invalid STT model "${sttModel}" for provider "${sttProvider}".`);
        }
      }
    }

    if (llmProvider) {
      const p = llmProvider.toLowerCase();
      if (!this.llmCatalog[p]) {
        errors.push(`Invalid LLM provider "${llmProvider}". Allowed: ${Object.keys(this.llmCatalog).join(', ')}`);
      } else if (llmModel) {
        const found = this.llmCatalog[p].some(m => m.model === llmModel);
        if (!found) {
          errors.push(`Invalid LLM model "${llmModel}" for provider "${llmProvider}".`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateSttSelection(provider, model) {
    if (!provider) return { valid: false, error: 'STT provider is required' };
    const p = provider.toLowerCase();
    if (!this.sttCatalog[p]) {
      return { valid: false, error: `Invalid STT provider "${provider}"` };
    }
    if (model) {
      const found = this.sttCatalog[p].find(m => m.model === model);
      if (!found) return { valid: false, error: `Invalid STT model "${model}" for provider "${provider}"` };
      return { valid: true, model: found };
    }
    return { valid: true, model: this.sttCatalog[p][0] };
  }

  validateLlmSelection(provider, model) {
    if (!provider) return { valid: false, error: 'LLM provider is required' };
    const p = provider.toLowerCase();
    if (!this.llmCatalog[p]) {
      return { valid: false, error: `Invalid LLM provider "${provider}"` };
    }
    if (model) {
      const found = this.llmCatalog[p].find(m => m.model === model);
      if (!found) return { valid: false, error: `Invalid LLM model "${model}" for provider "${provider}"` };
      return { valid: true, model: found };
    }
    return { valid: true, model: this.llmCatalog[p][0] };
  }

  getPricingTable() {
    const table = {
      currency: 'USD',
      effectiveDate: '2026-03-01',
      stt: {},
      llm: {}
    };

    for (const [provider, models] of Object.entries(this.sttCatalog)) {
      for (const m of models) {
        table.stt[`${provider}/${m.model}`] = {
          provider,
          model: m.model,
          displayName: m.displayName,
          pricePerMinute: m.pricePerMinute,
          pricePerHour: m.pricePerHour,
          pricingUnit: m.pricingUnit,
          currency: m.currency,
          effectiveDate: m.effectiveDate,
          pricingSource: m.pricingSource
        };
      }
    }

    for (const [provider, models] of Object.entries(this.llmCatalog)) {
      for (const m of models) {
        table.llm[`${provider}/${m.model}`] = {
          provider,
          model: m.model,
          displayName: m.displayName,
          inputPricePer1M: m.inputPricePer1M,
          outputPricePer1M: m.outputPricePer1M,
          pricingUnit: m.pricingUnit,
          currency: m.currency,
          effectiveDate: m.effectiveDate,
          pricingSource: m.pricingSource
        };
      }
    }

    return table;
  }

  /**
   * Calculate exact STT cost using centralized catalog pricing.
   */
  calculateSttCost(provider, model, audioSeconds = 0) {
    if (!audioSeconds || audioSeconds <= 0) {
      const zero = {
        costUsd: 0.0,
        minutes: 0,
        pricePerMinute: 0,
        pricePerHour: 0,
        valueOf() { return 0.0; }
      };
      return zero;
    }
    const meta = this.getSttModel(provider, model);
    const pricePerMin = meta?.pricePerMinute ?? 0.00003083;
    const minutes = audioSeconds / 60;
    const costUsd = Math.round(minutes * pricePerMin * 1000000) / 1000000;
    return {
      costUsd,
      minutes,
      pricePerMinute: pricePerMin,
      pricePerHour: meta?.pricePerHour ?? (pricePerMin * 60),
      valueOf() { return costUsd; }
    };
  }

  /**
   * Calculate exact LLM cost using centralized catalog pricing.
   */
  calculateLlmCost(provider, model, inputTokens = 0, outputTokens = 0) {
    if (provider === 'deterministic' || provider === 'local') {
      const zero = {
        costUsd: 0.0,
        inputCostUsd: 0.0,
        outputCostUsd: 0.0,
        valueOf() { return 0.0; }
      };
      return zero;
    }
    const meta = this.getLlmModel(provider, model);
    const inPricePer1M = meta?.inputPricePer1M ?? 0.15;
    const outPricePer1M = meta?.outputPricePer1M ?? 0.60;

    const inCost = (inputTokens / 1000000) * inPricePer1M;
    const outCost = (outputTokens / 1000000) * outPricePer1M;
    const costUsd = Math.round((inCost + outCost) * 1000000) / 1000000;
    return {
      costUsd,
      inputCostUsd: Math.round(inCost * 1000000) / 1000000,
      outputCostUsd: Math.round(outCost * 1000000) / 1000000,
      valueOf() { return costUsd; }
    };
  }

  /**
   * Live Cost Estimator for arbitrary scenario usage.
   * Used by UI Live Cost Estimator panel and API.
   */
  estimateCost({
    sttProvider = 'groq',
    sttModel = 'whisper-large-v3-turbo',
    audioMinutes = 5,
    llmProvider = 'groq',
    llmModel = 'openai/gpt-oss-20b',
    inputTokens = 1000,
    outputTokens = 300
  } = {}) {
    const audioSeconds = Number(audioMinutes || 0) * 60;
    const sttResult = this.calculateSttCost(sttProvider, sttModel, audioSeconds);
    const llmResult = this.calculateLlmCost(llmProvider, llmModel, Number(inputTokens || 0), Number(outputTokens || 0));
    const sttCost = sttResult.costUsd;
    const llmCost = llmResult.costUsd;
    const totalCost = Math.round((sttCost + llmCost) * 1000000) / 1000000;

    const sttMeta = this.getSttModel(sttProvider, sttModel);
    const llmMeta = this.getLlmModel(llmProvider, llmModel);

    return {
      selectedConfiguration: {
        stt: {
          provider: sttProvider,
          model: sttModel,
          displayName: sttMeta?.displayName || sttModel,
          pricePerMinute: sttMeta?.pricePerMinute ?? 0,
          pricePerHour: sttMeta?.pricePerHour ?? 0
        },
        llm: {
          provider: llmProvider,
          model: llmModel,
          displayName: llmMeta?.displayName || llmModel,
          inputPricePer1M: llmMeta?.inputPricePer1M ?? 0,
          outputPricePer1M: llmMeta?.outputPricePer1M ?? 0
        }
      },
      estimatedUsage: {
        audioMinutes: Number(audioMinutes),
        audioSeconds,
        inputTokens: Number(inputTokens),
        outputTokens: Number(outputTokens)
      },
      estimatedCost: {
        sttCost,
        llmCost,
        totalCost,
        currency: 'USD'
      },
      audioMinutes: Number(audioMinutes),
      sttCostUsd: sttCost,
      llmCostUsd: llmCost,
      totalCostUsd: totalCost,
      disclaimer: 'Estimated cost based on published provider rates. Actual charges depend on usage volume and provider billing tiers.'
    };
  }

  estimateScenario(params) {
    return this.estimateCost(params);
  }
}

export const modelCatalogService = new ModelCatalogService();
