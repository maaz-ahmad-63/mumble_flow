/**
 * Mumble AI — AI Escalation Engine
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
  /\b(?:schedule|book|set\s+up)\s+(?:a\s+)?meeting\b/i,
  /\bemail\s+request\b/i
];

const PROMPT_REQUEST_PATTERNS = [
  /\b(?:create|write|generate|give\s+me|make)\s+(?:a\s+)?prompt\b/i,
  /\bprompt\s+for\s+(?:chatgpt|claude|midjourney|dall-e|llm|ai|gpt)\b/i,
  /\bmeta\s+prompt\b/i,
  /\bprompt\s+request\b/i
];

const DEVELOPER_REQUEST_PATTERNS = [
  /\b(?:write|create|implement|code|generate)\s+(?:a\s+)?(?:python|javascript|typescript|react|rust|golang|function|script|class|component|api|endpoint|sql|query|regex|button|ui|modal|navbar|page|handler|test)\b/i,
  /\b(?:write|create|implement|generate)\s+(?:a\s+)?code\s+(?:to|for)\b/i,
  /\b(?:how\s+to\s+code|code\s+for|write\s+code\s+to|code\s+a)\b/i,
  /\bdeveloper\s+request\b/i
];

const TERMINAL_REQUEST_PATTERNS = [
  /\b(?:write|give\s+me|show|generate)\s+(?:a\s+)?(?:terminal|shell|bash|cli|git|docker|npm|kubectl)\s+command\b/i,
  /\b(?:command|script)\s+to\s+(?:push|pull|clone|commit|install|run|deploy|build|kill|find|create|delete)\b/i,
  /\bterminal\s+request\b/i
];

const TRANSLATION_REQUEST_PATTERNS = [
  /\btranslate\s+(?:this|it|the\s+following)?\s*(?:in|to|into)\s+([a-zA-Z]+)\b/i,
  /\b(?:how\s+to\s+say|say\s+in)\s+([a-zA-Z]+)\b/i,
  /\bin\s+(?:spanish|french|german|hindi|japanese|chinese|italian|portuguese|russian|arabic)\b/i
];

const COMMENT_AND_REPLY_REQUEST_PATTERNS = [
  /\b(?:add|write|draft|post|leave|drop|give|type|send)\s+(?:a\s+)?(?:comment|reply|response|review|rebuttal|warning|restriction)\b/i,
  /\bcomment\s+(?:to\s+)?(?:appreciat|say|tell|ask|thank|praise|compliment|congratulat|warn)\b/i,
  /\b(?:reply|respond)\s+(?:to\s+(?:him|her|them|this|the\s+comment|the\s+video|the\s+post|someone)|saying|that|with)\b/i,
  /\b(?:give|send)\s+(?:him|her|them|someone)\s+(?:a\s+)?(?:thank\s+you|shoutout|compliment|reply|response|warning|restriction|notice)\b/i,
  /\b(?:say\s+thank\s+you\s+to|thank\s+them\s+for|thank\s+him\s+for|thank\s+her\s+for)\b/i,
  /\b(?:if\s+)?(?:someone|somebody|a\s+user|anyone)\s+(?:has\s+)?(?:just\s+)?(?:commented|posted|written|said|asked|left\s+a\s+comment|replied|appreciated)\b/i,
  /\b(?:tell|warn|remind|inform|ask)\s+(?:him|her|them|someone)\s+(?:that|to|about)\b/i,
  /\bcomment\s+request\b/i
];

// Modes that fundamentally require generative language model capabilities
const GENERATIVE_REWRITE_MODES = new Set([
  'smart',
  'default',
  'email',
  'formal',
  'professional',
  'code',
  'developer',
  'dev',
  'terminal',
  'commit',
  'sql',
  'meeting',
  'minutes',
  'social',
  'comment',
  'reply',
  'executive',
  'prompt',
  'support',
  'translator',
  'translate',
  'translate_es',
  'translate_fr',
  'translate_de',
  'translate_hi',
  'translate_ja',
  'bullet',
  'bullets',
  'standup',
  'academic'
]);

// Modes that can be completely formatted deterministically with zero LLM unless an explicit request is present
const DETERMINISTIC_MODES = new Set([
  'natural',
  'casual',
  'browser',
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

    for (const pattern of TERMINAL_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_terminal_request', detectedMode: 'terminal' };
      }
    }

    for (const pattern of TRANSLATION_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_translation_request', detectedMode: 'translator' };
      }
    }

    // Check for comment and reply requests (YouTube, LinkedIn, Twitter, Reddit, etc.)
    for (const pattern of COMMENT_AND_REPLY_REQUEST_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_comment_reply_request', detectedMode: 'social' };
      }
    }

    // 3. Check for general explicit rewrite instructions
    for (const pattern of EXPLICIT_REWRITE_PATTERNS) {
      if (pattern.test(rawTranscript)) {
        return { requiresAI: true, reason: 'explicit_instruction_detected' };
      }
    }

    // 3b. Check for spoken self-correction or mid-thought changes requiring intelligent polish
    if (/\b(?:actually\s+no|actually\s+wait|no[,\s]+no|no[,\s]+wait|wait[,\s]+no|scratch\s+that|or\s+rather|make\s+that)\b/i.test(rawTranscript)) {
      return { requiresAI: true, reason: 'self_correction_detected' };
    }

    // 4. Check requested mode / tone
    let mode = options.tone || options.mode;
    if (!mode || mode === 'auto' || mode === 'default') {
      // When no explicit mode or style is selected, use Default Smart Dictation
      mode = 'smart';
    } else {
      mode = String(mode).toLowerCase();
    }

    if (mode === 'raw') {
      return { requiresAI: false, reason: 'raw_mode_selected', detectedMode: 'raw' };
    }

    if (mode === 'smart') {
      return { requiresAI: true, reason: 'default_smart_dictation', detectedMode: 'smart' };
    }

    if (GENERATIVE_REWRITE_MODES.has(mode)) {
      return { requiresAI: true, reason: `semantic_rewrite_mode_${mode}`, detectedMode: mode };
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
