/**
 * Murmur Flow — AI Escalation Engine
 *
 * Cost Optimization Principle:
 * Normal dictation uses deterministic local processing (zero LLM calls).
 * Only semantic transformations, complex rewriting, or explicit user requests
 * are escalated to cloud LLMs.
 *
 * Deterministic signals are used first. An LLM is NEVER called to decide if an LLM is needed.
 */

import { storage } from '../storageService.js';

// Explicit rewrite keywords, voice directives, and mode intents
const EXPLICIT_REWRITE_PATTERNS = [
  /\b(turn (this|it|what I just said|what I said|the above) into)\b/i,
  /\b(make (this|it) (sound|more|look|feel))\b/i,
  /\b(make this|turn this into|rewrite this|rephrase this|sound more)\b/i,
  /\b(translate (this |it )?to (spanish|french|german|hindi|japanese|chinese))\b/i,
  /\b(summarize (this|what I said|the above|the discussion))\b/i,
  /\b(fix grammar and rewrite|expand into a full email)\b/i
];

// Spoken intent patterns that automatically escalate to specialized modes
const EMAIL_REQUEST_PATTERNS = [
  /\b(?:write|draft|send|compose)\s+(?:an?\s+)?email\b/i,
  /\bemail\s+(?:to\s+)?[a-zA-Z]+\s+(?:saying|asking|telling|about|regarding)\b/i,
  /\bemail\s+request\b/i
];

const PROMPT_REQUEST_PATTERNS = [
  /\b(?:create|write|generate|give\s+me|make)\s+(?:a\s+)?prompt\b/i,
  /\bprompt\s+for\s+(?:chatgpt|claude|midjourney|dall-e|llm|ai|gpt)\b/i,
  /\bmeta\s+prompt\b/i,
  /\bprompt\s+request\b/i
];

const DEVELOPER_REQUEST_PATTERNS = [
  /\b(?:write|create|implement|code|generate)\s+(?:a\s+)?(?:python|javascript|typescript|react|rust|golang|function|script|class|component|api|endpoint|sql|query|regex)\b/i,
  /\b(?:how\s+to\s+code|code\s+for|write\s+code\s+to)\b/i,
  /\bdeveloper\s+request\b/i
];

// Modes that fundamentally require generative language model capabilities
const GENERATIVE_REWRITE_MODES = new Set([
  'email',
  'social',
  'executive',
  'prompt',
  'support',
  'translate_es',
  'translate_fr',
  'translate_de',
  'translate_hi',
  'translate_ja',
  'academic'
]);

// Modes that can be completely formatted deterministically with zero LLM unless an explicit request is present
const DETERMINISTIC_MODES = new Set([
  'natural',
  'casual',
  'formal',
  'professional',
  'terminal',
  'bullets',
  'bullet',
  'standup',
  'raw'
]);

export class EscalationEngine {
  /**
   * Determine whether a transcript requires AI enhancement.
   *
   * @param {string} rawTranscript - The raw speech-to-text transcript
   * @param {string} deterministicText - The text after rule-based cleaning
   * @param {object} options - Options including mode, tone, aiEnhancement, userId
   * @returns {{ requiresAI: boolean, reason: string, detectedMode?: string }}
   */
  evaluate(rawTranscript, deterministicText, options = {}) {
    if (!rawTranscript || !rawTranscript.trim()) {
      return { requiresAI: false, reason: 'empty_input' };
    }

    // 1. Check user/global AI Enhancement setting ('auto' | 'always' | 'never')
    const userSettings = storage.getSettings(options.userId);
    const aiEnhancementSetting = (options.aiEnhancement || userSettings.aiEnhancement || 'auto').toLowerCase();

    if (aiEnhancementSetting === 'never' || options.forceLocal) {
      return { requiresAI: false, reason: 'user_setting_ai_disabled' };
    }

    if (aiEnhancementSetting === 'always') {
      return { requiresAI: true, reason: 'user_setting_ai_always' };
    }

    // 2. Check for explicit spoken intent requests (Email, Prompt, Developer)
    for (const pattern of EMAIL_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_email_request', detectedMode: 'email' };
      }
    }

    for (const pattern of PROMPT_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_prompt_request', detectedMode: 'prompt' };
      }
    }

    for (const pattern of DEVELOPER_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_developer_request', detectedMode: 'developer' };
      }
    }

    // 3. Check for general explicit rewrite instructions
    for (const pattern of EXPLICIT_REWRITE_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_instruction_detected' };
      }
    }

    // 4. Check requested mode / tone
    const mode = (options.tone || options.mode || userSettings.defaultTone || 'casual').toLowerCase();

    if (GENERATIVE_REWRITE_MODES.has(mode)) {
      return { requiresAI: true, reason: `semantic_rewrite_mode_${mode}`, detectedMode: mode };
    }

    if (mode === 'developer' || mode === 'code') {
      // If developer mode is explicitly selected and has programming keywords
      if (/\b(function|const|let|var|class|interface|import|export|def|return|component|endpoint|api|query|props|async|await)\b/i.test(rawTranscript)) {
        return { requiresAI: true, reason: 'developer_code_transformation', detectedMode: 'developer' };
      }
    }

    if (DETERMINISTIC_MODES.has(mode)) {
      // Normal dictation: deterministic processing is 100% sufficient!
      return { requiresAI: false, reason: 'deterministic_processing_sufficient' };
    }

    // Default safe fallback for unknown modes
    return { requiresAI: false, reason: 'deterministic_processing_sufficient' };
  }
}

export const escalationEngine = new EscalationEngine();
