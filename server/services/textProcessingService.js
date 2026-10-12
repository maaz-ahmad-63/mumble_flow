/**
 * Mumble AI — Intelligent Dictation & Text Processing Service
 *
 * Phase 10 Cost-Optimized Architecture:
 * RAW TRANSCRIPT
 *   → Stage 1: Deterministic Processing (Fillers, Stutters, Self-Corrections, Spoken Lists, Punctuation, Dictionary, Dev Mode)
 *   → Stage 2: Mode Formatting (Local Heuristic)
 *   → Stage 3: AI Escalation Decision Layer (Deterministic Signals First — Never an LLM to decide on LLM)
 *   → Stage 4: Optional AI Enhancement (Only if escalated, subject to quota budget, with guaranteed quality fallback)
 *   → Stage 5: Final Text Delivery with granular latencies (deterministicMs, aiMs)
 */

import { providerRegistry } from '../providers/ProviderRegistry.js';
import { storage } from './storageService.js';
import { config } from '../config.js';
import { logger } from './logger.js';
import { quotaService } from './quotaService.js';
import { escalationEngine } from './dictation/escalationEngine.js';

import { technicalTermPreserver } from './dictation/technicalTermPreserver.js';
import { fillerCleaner } from './dictation/fillerCleaner.js';
import { selfCorrectionEngine } from './dictation/selfCorrectionEngine.js';
import { listDetector } from './dictation/listDetector.js';
import { punctuationEngine } from './dictation/punctuationEngine.js';
import { modeFormatter } from './dictation/modeFormatter.js';
import { longDictationHandler } from './dictation/longDictationHandler.js';

import { developerProcessingService } from './dictation/developerProcessingService.js';
import { developerDictionary } from './dictation/developerDictionary.js';
import { personalizationEngine } from './dictation/personalizationEngine.js';

export class TextProcessingService {
  /**
   * Check if spoken text matches any stored snippet trigger conservatively.
   */
  checkSnippets(text, options = {}) {
    return personalizationEngine.matchSnippet(text, options);
  }

  /**
   * Stage 1 & 2: Deterministic cleanup and self-correction engine.
   * Runs locally with zero latency, zero cloud cost, and protects technical terms.
   *
   * @param {string} rawText 
   * @param {object} options 
   * @returns {string}
   */
  cleanText(rawText, options = {}) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.trim();

    // 1. Retrieve personal dictionary terms + developer vocabulary
    let userDictRaw = options.preloadedDictionary || storage.getDictionary(options.userId);
    if (userDictRaw instanceof Promise) {
      userDictRaw = [];
    }
    const userDict = Array.isArray(userDictRaw)
      ? userDictRaw.map(d => d.word || d.preferredOutput)
      : [];
    const devDict = developerDictionary.getAllTerms();
    const allTerms = Array.from(new Set([...userDict, ...devDict]));

    // 2. Protect and mask technical terms, URLs, code identifiers, and dictionary terms
    const { maskedText, tokenMap } = technicalTermPreserver.mask(text, allTerms);

    // 3. Stage 1: Remove filler words and stutters
    let cleaned = fillerCleaner.clean(maskedText);

    // 4. Stage 2: Resolve self-corrections and false-starts surgically
    cleaned = selfCorrectionEngine.resolveCorrections(cleaned);

    // 5. Detect and format spoken lists (e.g. "first install Node second install Postgres...")
    const listCheck = listDetector.detectAndFormat(cleaned, options.tone === 'bullets' ? 'bullets' : 'numbered');
    if (listCheck.hasList) {
      cleaned = listCheck.formattedText;
    }

    // 6. Automatic punctuation and sentence capitalization
    cleaned = punctuationEngine.process(cleaned);

    // 7. Unmask technical terms and dictionary words
    cleaned = technicalTermPreserver.unmask(cleaned, tokenMap);

    // 8. Phase 7: Apply Personal Dictionary & Vocabulary Precedence (User > App > Dev)
    cleaned = personalizationEngine.applyDictionary(cleaned, options);

    // 9. Phase 6: Developer Processing (active when Developer / Code / Terminal mode is selected)
    const settings = options.preloadedSettings || storage.getSettings(options.userId);
    const defaultTone = settings instanceof Promise ? 'casual' : (settings?.defaultTone || 'casual');
    const mode = options.tone || options.mode || defaultTone;
    if (developerProcessingService.isDeveloperMode(mode)) {
      cleaned = developerProcessingService.process(cleaned, options);
    }

    return cleaned.trim();
  }

  /**
   * Local heuristic cleanup + mode formatting (zero LLM requirement).
   */
  localHeuristicCleanup(text, options = {}) {
    const cleaned = this.cleanText(text, options);
    const mode = options.tone || options.mode || storage.getSettings(options.userId).defaultTone || 'casual';
    return modeFormatter.format(cleaned, mode, options);
  }

  /**
   * Build specialized LLM prompt for advanced AI formatting modes.
   */
  buildSystemPrompt(options = {}) {
    const tone = options.tone || options.mode || storage.getSettings(options.userId).defaultTone || config.defaultTone || 'casual';
    const appName = options.appName || 'General';
    const dictionary = storage.getDictionary(options.userId).map(d => d.word);

    let toneInstruction = '';
    switch (tone) {
      case 'natural':
        toneInstruction = `Tone: Natural & Fluent. Transcribe into clean, natural human prose without unnecessary conversational fluff.`;
        break;
      case 'casual':
        toneInstruction = `Tone: Casual, natural, concise for messaging apps (Slack, Discord, WhatsApp). Keep informal phrasing where appropriate, but strip verbal clutter.`;
        break;
      case 'formal':
      case 'professional':
        toneInstruction = `Tone: Professional, well-structured, polished for business communication and documents. Use complete sentences, proper capitalization, and clear paragraphing.`;
        break;
      case 'executive':
        toneInstruction = `Tone: Executive Leadership. Ultra-crisp, high-impact, decisive tone. Start directly with the core message or decision, eliminate pleasantries, and highlight bottom-line impact.`;
        break;
      case 'email':
        toneInstruction = `Tone: Email. Format as a clean, ready-to-send email with greeting, structured paragraphs, action items, and polite sign-off.`;
        break;
      case 'code':
      case 'developer':
      case 'terminal':
      case 'dev':
        toneInstruction = `Tone: Developer & Coding Assistant (Cursor, VS Code, ChatGPT, Claude, GitHub, Terminal).
- Accurately determine and format programming constructs:
  * Functions/methods in camelCase
  * Variables/parameters in camelCase or snake_case
  * Constants & environment variables in SCREAMING_SNAKE_CASE
  * Classes, types, interfaces in PascalCase
- Preserve spoken programming symbols: equals (=), double equals (==), strict equals (===), not equals (!=), fat arrow (=>).
- Accurately format CLI and terminal commands.
- Correctly format file paths and extensions.
- Preserve developer vocabulary.`;
        break;
      case 'bullet':
      case 'bullets':
        toneInstruction = `Tone: Structured Bullet Points. Break key points into clean, readable Markdown bullet lists with clear bold headings if multi-topic.`;
        break;
      case 'standup':
        toneInstruction = `Tone: Daily Engineering Standup. Format speech into clear sections:
**Yesterday:** What was accomplished
**Today:** What is in progress
**Blockers:** Any impediments (or None)`;
        break;
      case 'social':
        toneInstruction = `Tone: High-Engagement LinkedIn / Social Post.
- Hook in the first line that grabs attention.
- Clean 1-2 sentence paragraphs with whitespace.
- Bullet points for key takeaways.
- Conclude with an engaging question and 3 relevant hashtags.`;
        break;
      case 'support':
        toneInstruction = `Tone: Customer Support & Client Success. Warm, deeply empathetic, highly courteous, with numbered step-by-step guidance and reassurance.`;
        break;
      case 'prompt':
        toneInstruction = `Tone: Meta Prompt Engineering Optimizer. Transform spoken instructions into a high-performance LLM prompt.`;
        break;
      case 'translate_es':
        toneInstruction = `Tone: Accurate, natural Spanish translation.`;
        break;
      case 'translate_fr':
        toneInstruction = `Tone: Elegant, fluent French translation.`;
        break;
      case 'translate_de':
        toneInstruction = `Tone: Clear, precise German translation.`;
        break;
      case 'translate_hi':
        toneInstruction = `Tone: Fluent Hindi translation.`;
        break;
      case 'translate_ja':
        toneInstruction = `Tone: Polite, natural Japanese translation (Teineigo).`;
        break;
      case 'raw':
        toneInstruction = `Tone: Verbatim. Do minimal changes, only fixing basic punctuation and capitalization.`;
        break;
      default:
        toneInstruction = `Tone: Balanced, clear, and natural.`;
    }

    return `You are Mumble AI Intelligent Dictation Engine, an AI that transforms spoken voice transcripts into polished, ready-to-send writing.
 
CONTEXT:
- Target Application: ${appName}
- Mode / Style: ${toneInstruction}
${dictionary.length > 0 ? `- Personal Dictionary: ${dictionary.join(', ')}` : ''}

CRITICAL RULES:
1. PRESERVE INTENT & FULL CONTEXT: Keep the speaker's original ideas, facts, numbers, code, and surrounding sentence structure intact.
2. REMOVE FILLER WORDS: Erase verbal clutter.
3. RESOLVE SELF-CORRECTIONS SURGICALLY: Replace ONLY the corrected element and PRESERVE surrounding clauses.
4. STRUCTURE SPOKEN LISTS cleanly.
5. PRESERVE TECHNICAL TERMS & SYNTAX.

OUTPUT RESTRICTION:
Output ONLY the transformed, polished text. Do NOT add conversational replies, explanations, or quotes.`;
  }

  /**
   * Format text using LLM provider.
   */
  async formatWithLlm(text, options = {}) {
    const systemPrompt = this.buildSystemPrompt(options);
    const userSettings = storage.getSettings(options.userId);
    const providerName = options.llmProvider || userSettings.llmProvider || config.defaultLlmProvider || 'groq';
    const modelName = options.llmModel || options.model || userSettings.llmModel;

    const provider = providerRegistry.getLlmProvider(providerName);
    return await provider.formatText(systemPrompt, text, { ...options, model: modelName });
  }

  /**
   * Main cost-optimized processing pipeline:
   * 1. Check Snippets First (Zero STT/LLM cost)
   * 2. Deterministic Cleaning (Fillers, corrections, lists, punctuation, dictionary)
   * 3. Deterministic Mode Formatting
   * 4. AI Escalation Evaluation (Deterministic signals only)
   * 5. Optional AI Enhancement (with Quality Fallback on failure or quota limit)
   */
  async process(rawTranscript, options = {}) {
    const startTime = Date.now();

    if (!rawTranscript || !rawTranscript.trim()) {
      return {
        rawTranscript: '',
        processedText: '',
        latencyMs: 0,
        deterministicMs: 0,
        aiMs: 0,
        enhancedByAI: false,
        escalationReason: 'empty_input',
        provider: 'none'
      };
    }

    const text = rawTranscript.trim();

    const userId = options.userId || 'default_user';
    const [preloadedDict, preloadedSnippets, preloadedSettings] = await Promise.all([
      Promise.resolve(options.preloadedDictionary || storage.getDictionary(userId)).catch(() => []),
      Promise.resolve(options.preloadedSnippets || storage.getSnippets(userId)).catch(() => []),
      Promise.resolve(options.preloadedSettings || storage.getSettings(userId)).catch(() => ({}))
    ]);
    const enrichedOptions = {
      ...options,
      userId,
      preloadedDictionary: Array.isArray(preloadedDict) ? preloadedDict : [],
      preloadedSnippets: Array.isArray(preloadedSnippets) ? preloadedSnippets : [],
      preloadedSettings: preloadedSettings || {}
    };

    // 1. Check Snippets First
    const snippetCheck = this.checkSnippets(text, enrichedOptions);
    if (snippetCheck.matched) {
      return {
        rawTranscript: text,
        processedText: snippetCheck.snippet.content,
        isSnippet: true,
        snippetTrigger: snippetCheck.snippet.trigger,
        latencyMs: Date.now() - startTime,
        deterministicMs: Date.now() - startTime,
        aiMs: 0,
        enhancedByAI: false,
        escalationReason: 'snippet_match',
        provider: 'snippet-engine'
      };
    }

    // 2. If 'raw' tone requested, return lightly trimmed text immediately
    if (options.tone === 'raw' || options.mode === 'raw') {
      return {
        rawTranscript: text,
        processedText: text,
        latencyMs: Date.now() - startTime,
        deterministicMs: Date.now() - startTime,
        aiMs: 0,
        enhancedByAI: false,
        escalationReason: 'raw_mode_selected',
        provider: 'raw'
      };
    }

    // 3. Stage 1 & 2: Local Deterministic Cleanup, Self-Correction & Mode Formatting
    const detStart = Date.now();
    const preCleaned = this.cleanText(text, enrichedOptions);
    const mode = enrichedOptions.tone || enrichedOptions.mode || enrichedOptions.preloadedSettings.defaultTone || config.defaultTone || 'casual';
    let deterministicFormatted = modeFormatter.format(preCleaned, mode, enrichedOptions);

    // 4. AI Escalation Engine Decision
    const escalation = escalationEngine.evaluate(text, deterministicFormatted, enrichedOptions);
    const effectiveMode = escalation.detectedMode || mode;
    if (escalation.detectedMode && escalation.detectedMode !== mode) {
      deterministicFormatted = modeFormatter.format(preCleaned, effectiveMode, enrichedOptions);
    }
    const deterministicMs = Date.now() - detStart;

    // If AI is not required (e.g. normal dictation, developer mode, bullets, etc.), return immediately!
    if (!escalation.requiresAI) {
      logger.info(`[Cost Optimization] AI enhancement skipped: "${escalation.reason}". Returning deterministic output (0 tokens, $0.00).`);
      return {
        rawTranscript: text,
        processedText: deterministicFormatted,
        latencyMs: Date.now() - startTime,
        deterministicMs,
        aiMs: 0,
        enhancedByAI: false,
        escalationReason: escalation.reason,
        provider: 'deterministic-engine'
      };
    }

    // 5. AI Escalated — Check User LLM Quota Budget
    const quotaCheck = quotaService.checkLlmQuota(options.userId);
    if (!quotaCheck.allowed) {
      logger.warn(`[Quota Notice] User ${options.userId} exceeded LLM quota. Quality fallback applied.`);
      return {
        rawTranscript: text,
        processedText: deterministicFormatted,
        latencyMs: Date.now() - startTime,
        deterministicMs,
        aiMs: 0,
        enhancedByAI: false,
        escalationReason: 'quota_exceeded_fallback',
        provider: 'deterministic-engine',
        warning: quotaCheck.reason
      };
    }

    // 6. Invoke LLM with Quality Fallback to preserve transcript on any failure
    const aiStart = Date.now();
    const providerName = options.llmProvider || storage.getSettings(options.userId).llmProvider || config.defaultLlmProvider || 'groq';
    const effectiveOptions = { ...options, tone: effectiveMode, mode: effectiveMode };

    try {
      if (longDictationHandler.isLong(preCleaned)) {
        const segments = longDictationHandler.splitSegments(preCleaned);
        const processedSegments = [];
        for (const segment of segments) {
          const res = await this.formatWithLlm(segment, effectiveOptions);
          processedSegments.push(res.text);
        }
        const fullOutput = longDictationHandler.joinSegments(processedSegments);
        const aiMs = Date.now() - aiStart;
        return {
          rawTranscript: text,
          processedText: fullOutput,
          latencyMs: Date.now() - startTime,
          deterministicMs,
          aiMs,
          enhancedByAI: true,
          escalationReason: escalation.reason,
          provider: providerName
        };
      }

      const result = await this.formatWithLlm(preCleaned, effectiveOptions);
      const postFormatted = modeFormatter.format(result.text, effectiveMode, options);
      const aiMs = Date.now() - aiStart;

      return {
        rawTranscript: text,
        processedText: postFormatted,
        latencyMs: Date.now() - startTime,
        deterministicMs,
        aiMs,
        enhancedByAI: true,
        escalationReason: escalation.reason,
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
    } catch (apiError) {
      // Quality fallback: NEVER lose user transcript!
      const aiMs = Date.now() - aiStart;
      logger.warn(`[Quality Fallback] LLM Provider (${providerName}) failed: ${apiError.message}. Safely returning deterministic cleaned transcript.`);
      return {
        rawTranscript: text,
        processedText: deterministicFormatted,
        latencyMs: Date.now() - startTime,
        deterministicMs,
        aiMs,
        enhancedByAI: false,
        escalationReason: `llm_failed_fallback: ${apiError.message}`,
        provider: 'deterministic-fallback',
        warning: `AI provider error: ${apiError.message}. Cleaned using Wispr Flow intelligent local engine.`
      };
    }
  }
}

export const textProcessingService = new TextProcessingService();
