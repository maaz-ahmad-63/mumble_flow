/**
 * Mumble AI — Pricing and Cost Estimation Service
 * Sourced directly from centralized Model Catalog Service.
 */

import { modelCatalogService } from './modelCatalogService.js';
import { STT_MODEL_CATALOG, LLM_MODEL_CATALOG } from '../config/modelCatalog.js';

// Exported for backward-compatibility with tests & legacy modules
export const PROVIDER_PRICING = {
  groq: {
    stt: {
      'whisper-large-v3-turbo': 0.00003083,
      'whisper-large-v3': 0.00003083
    },
    llm: {
      'openai/gpt-oss-20b': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
      'openai/gpt-oss-120b': { inputPer1k: 0.00045, outputPer1k: 0.0018 },
      'llama-3.3-70b-versatile': { inputPer1k: 0.00059, outputPer1k: 0.00079 },
      'llama3-8b-8192': { inputPer1k: 0.00005, outputPer1k: 0.00008 }
    }
  },
  gemini: {
    stt: {
      'gemini-3.6-flash': 0.000025,
      'gemini-1.5-flash': 0.000025
    },
    llm: {
      'gemini-3.6-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
      'gemini-1.5-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
      'gemini-1.5-pro': { inputPer1k: 0.00125, outputPer1k: 0.005 }
    }
  },
  openai: {
    stt: {
      'whisper-1': 0.006
    },
    llm: {
      'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
      'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.010 }
    }
  },
  local: {
    stt: {
      'whisper-1': 0.0,
      'local-whisper': 0.0
    },
    llm: {
      'llama3.2': { inputPer1k: 0.0, outputPer1k: 0.0 },
      'local-llama': { inputPer1k: 0.0, outputPer1k: 0.0 }
    }
  }
};

export class PricingService {
  calculateSttCost(provider, model, audioSeconds = 0) {
    const res = modelCatalogService.calculateSttCost(provider, model, audioSeconds);
    return typeof res === 'object' && res !== null ? res.costUsd : Number(res || 0);
  }

  calculateLlmCost(provider, model, inputTokens = 0, outputTokens = 0) {
    const res = modelCatalogService.calculateLlmCost(provider, model, inputTokens, outputTokens);
    return typeof res === 'object' && res !== null ? res.costUsd : Number(res || 0);
  }

  calculateTotalCost(sttCost = 0, llmCost = 0) {
    return Math.round((Number(sttCost || 0) + Number(llmCost || 0)) * 1000000) / 1000000;
  }

  estimateScenario(params) {
    return modelCatalogService.estimateCost(params);
  }
}

export const pricingService = new PricingService();
