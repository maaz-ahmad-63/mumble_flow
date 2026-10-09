/**
 * Mumble AI — Centralized Model Catalog & Pricing Specifications
 *
 * Single source of truth for:
 * - Product identity
 * - STT model specifications & pricing
 * - LLM model specifications & pricing
 * - Capability definitions & provider availability rules
 */

export const PRODUCT_IDENTITY = {
  name: 'Mumble AI',
  tagline: 'Your voice, anywhere.',
  version: '2.0.0',
  description: 'Commercial-grade, privacy-first desktop voice dictation and text intelligence.'
};

/**
 * Standardized STT Models Catalog
 * Pricing units: 'per_minute'
 */
export const STT_MODEL_CATALOG = {
  groq: [
    {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      displayName: 'Whisper Large V3 Turbo',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.00003083, // $0.00185 / hour
      pricePerHour: 0.00185,
      currency: 'USD',
      capabilities: ['multilingual', 'punctuation', 'timestamps', 'ultra_fast'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://groq.com/pricing/',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    },
    {
      provider: 'groq',
      model: 'whisper-large-v3',
      displayName: 'Whisper Large V3',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.00003083,
      pricePerHour: 0.00185,
      currency: 'USD',
      capabilities: ['multilingual', 'punctuation', 'high_accuracy'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://groq.com/pricing/',
      effectiveDate: '2025-01-01'
    }
  ],
  openai: [
    {
      provider: 'openai',
      model: 'whisper-1',
      displayName: 'OpenAI Whisper',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.006, // $0.36 / hour
      pricePerHour: 0.36,
      currency: 'USD',
      capabilities: ['multilingual', 'high_accuracy', 'industry_standard'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://openai.com/api/pricing/',
      effectiveDate: '2024-11-01',
      defaultForProvider: true
    }
  ],
  gemini: [
    {
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      displayName: 'Gemini 2.5 Flash Audio',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.000025, // $0.0015 / hour
      pricePerHour: 0.0015,
      currency: 'USD',
      capabilities: ['multimodal', 'fast', 'speech_analysis'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://ai.google.dev/pricing',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    }
  ],
  deepgram: [
    {
      provider: 'deepgram',
      model: 'nova-2',
      displayName: 'Deepgram Nova-2',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.0043,
      pricePerHour: 0.258,
      currency: 'USD',
      capabilities: ['realtime_streaming', 'low_latency'],
      isLocal: false,
      hasAdapter: false,
      pricingSource: 'https://deepgram.com/pricing',
      effectiveDate: '2024-10-01',
      defaultForProvider: true
    }
  ],
  assemblyai: [
    {
      provider: 'assemblyai',
      model: 'conformer-2',
      displayName: 'AssemblyAI Conformer-2',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.0061,
      pricePerHour: 0.366,
      currency: 'USD',
      capabilities: ['speaker_diarization', 'formatting'],
      isLocal: false,
      hasAdapter: false,
      pricingSource: 'https://www.assemblyai.com/pricing',
      effectiveDate: '2024-10-01',
      defaultForProvider: true
    }
  ],
  local: [
    {
      provider: 'local',
      model: 'local-whisper',
      displayName: 'Local Whisper (Offline)',
      pricingUnit: 'per_minute',
      pricePerMinute: 0.0,
      pricePerHour: 0.0,
      currency: 'USD',
      capabilities: ['offline', 'privacy_safe', 'zero_cost'],
      isLocal: true,
      hasAdapter: true,
      pricingSource: 'self-hosted',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    }
  ]
};

/**
 * Standardized LLM Models Catalog
 * Pricing units: inputPricePer1M, outputPricePer1M (USD)
 */
export const LLM_MODEL_CATALOG = {
  groq: [
    {
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      displayName: 'GPT-OSS-20B',
      inputPricePer1M: 0.15,  // $0.00015 / 1k
      outputPricePer1M: 0.60, // $0.00060 / 1k
      currency: 'USD',
      capabilities: ['fast_cleanup', 'code_syntax', 'reasoning_low'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://groq.com/pricing/',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    },
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      displayName: 'Llama 3.3 70B Versatile',
      inputPricePer1M: 0.59,
      outputPricePer1M: 0.79,
      currency: 'USD',
      capabilities: ['high_reasoning', 'complex_prose', 'technical_formatting'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://groq.com/pricing/',
      effectiveDate: '2025-01-01'
    },
    {
      provider: 'groq',
      model: 'llama3-8b-8192',
      displayName: 'Llama 3 8B',
      inputPricePer1M: 0.05,
      outputPricePer1M: 0.08,
      currency: 'USD',
      capabilities: ['ultra_fast', 'low_cost'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://groq.com/pricing/',
      effectiveDate: '2025-01-01'
    }
  ],
  openai: [
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      inputPricePer1M: 0.15,
      outputPricePer1M: 0.60,
      currency: 'USD',
      capabilities: ['high_fidelity', 'formatting', 'fast'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://openai.com/api/pricing/',
      effectiveDate: '2024-07-18',
      defaultForProvider: true
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      displayName: 'GPT-4o',
      inputPricePer1M: 2.50,
      outputPricePer1M: 10.00,
      currency: 'USD',
      capabilities: ['state_of_the_art', 'complex_reasoning', 'multi_domain'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://openai.com/api/pricing/',
      effectiveDate: '2024-05-13'
    }
  ],
  gemini: [
    {
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      displayName: 'Gemini 2.5 Flash',
      inputPricePer1M: 0.075,
      outputPricePer1M: 0.30,
      currency: 'USD',
      capabilities: ['low_latency', 'cost_efficient', 'multilingual'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://ai.google.dev/pricing',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    },
    {
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      displayName: 'Gemini 1.5 Pro',
      inputPricePer1M: 1.25,
      outputPricePer1M: 5.00,
      currency: 'USD',
      capabilities: ['deep_reasoning', 'long_context'],
      isLocal: false,
      hasAdapter: true,
      pricingSource: 'https://ai.google.dev/pricing',
      effectiveDate: '2024-09-01'
    }
  ],
  anthropic: [
    {
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
      displayName: 'Claude 3.5 Haiku',
      inputPricePer1M: 0.80,
      outputPricePer1M: 4.00,
      currency: 'USD',
      capabilities: ['fast', 'prose_elegance'],
      isLocal: false,
      hasAdapter: false,
      pricingSource: 'https://www.anthropic.com/pricing',
      effectiveDate: '2024-11-01',
      defaultForProvider: true
    },
    {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      displayName: 'Claude 3.5 Sonnet',
      inputPricePer1M: 3.00,
      outputPricePer1M: 15.00,
      currency: 'USD',
      capabilities: ['state_of_art_reasoning', 'nuance'],
      isLocal: false,
      hasAdapter: false,
      pricingSource: 'https://www.anthropic.com/pricing',
      effectiveDate: '2024-10-22'
    }
  ],
  local: [
    {
      provider: 'local',
      model: 'local-llama',
      displayName: 'Local LLM (Ollama / vLLM)',
      inputPricePer1M: 0.0,
      outputPricePer1M: 0.0,
      currency: 'USD',
      capabilities: ['offline', 'zero_cost', 'privacy'],
      isLocal: true,
      hasAdapter: true,
      pricingSource: 'self-hosted',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    }
  ],
  deterministic: [
    {
      provider: 'deterministic',
      model: 'none',
      displayName: 'Deterministic Zero-Edit (Rule-Based)',
      inputPricePer1M: 0.0,
      outputPricePer1M: 0.0,
      currency: 'USD',
      capabilities: ['zero_latency', 'zero_cost', 'offline_safe', 'predictable'],
      isLocal: true,
      hasAdapter: true,
      pricingSource: 'built-in',
      effectiveDate: '2025-01-01',
      defaultForProvider: true
    }
  ]
};

export const DEFAULT_CATALOG_SELECTION = {
  sttProvider: 'groq',
  sttModel: 'whisper-large-v3-turbo',
  llmProvider: 'groq',
  llmModel: 'openai/gpt-oss-20b',
  aiEnhancement: 'auto'
};
