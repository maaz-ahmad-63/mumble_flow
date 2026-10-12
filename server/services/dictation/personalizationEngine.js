/**
 * Mumble AI — Personalization & Dictionary Priority Engine
 *
 * Architecture:
 * 1. User Dictionary (Highest Priority)
 * 2. Application-Specific Vocabulary
 * 3. Developer Vocabulary
 * 4. General Language Processing
 *
 * Provides conservative snippet trigger matching and collision-free dictionary replacements.
 */

import { storage } from '../storageService.js';
import { developerDictionary } from './developerDictionary.js';
import { technicalTermPreserver } from './technicalTermPreserver.js';

export class PersonalizationEngine {
  /**
   * Check if spoken text conservatively matches any enabled snippet.
   *
   * @param {string} text 
   * @param {object} options { appName, tone, mode, userId }
   * @returns {{ matched: boolean, snippet: object | null }}
   */
  matchSnippet(text, options = {}) {
    if (!text || typeof text !== 'string') return { matched: false, snippet: null };

    const userId = options.userId || 'default_user';
    let snippets = options.preloadedSnippets || storage.getSnippets(userId);
    if (snippets instanceof Promise) {
      snippets = [];
    }
    if (!Array.isArray(snippets)) snippets = [];
    const appName = (options.appName || '').toLowerCase();
    const currentMode = (options.tone || options.mode || '').toLowerCase();

    // Clean transcript for comparison (strip surrounding punctuation and trim)
    const normalizedInput = text.trim().toLowerCase().replace(/^[.,!?;:"'—\s]+|[.,!?;:"'—\s]+$/g, '');

    for (const snippet of snippets) {
      if (snippet.enabled === false) continue;

      // 1. Application-Specific Filtering
      if (snippet.app && snippet.app.toLowerCase() !== 'all' && snippet.app.trim() !== '') {
        const targetApp = snippet.app.toLowerCase().trim();
        const appContext = options.application || {};
        const matchesApp = 
          appName.includes(targetApp) ||
          (appContext.appId && appContext.appId.toLowerCase().includes(targetApp)) ||
          (appContext.appName && appContext.appName.toLowerCase().includes(targetApp)) ||
          (appContext.bundleId && appContext.bundleId.toLowerCase().includes(targetApp));

        if (!matchesApp) {
          continue; // Does not match target application
        }
      }

      // 2. Mode / Tone Filtering
      if (snippet.mode && snippet.mode.toLowerCase() !== 'all' && snippet.mode.trim() !== '') {
        const targetMode = snippet.mode.toLowerCase().trim();
        if (currentMode !== targetMode && !currentMode.includes(targetMode)) {
          continue; // Does not match target mode
        }
      }

      const trigger = snippet.trigger.trim().toLowerCase().replace(/^[.,!?;:"'—\s]+|[.,!?;:"'—\s]+$/g, '');
      if (!trigger) continue;

      // 3. Conservative trigger matching:
      // Exact match OR explicit command prefix ("insert <trigger>", "snippet <trigger>", "expand <trigger>", "paste <trigger>")
      const isExactMatch = normalizedInput === trigger;
      const isExplicitPrefix = 
        normalizedInput === `insert ${trigger}` ||
        normalizedInput === `snippet ${trigger}` ||
        normalizedInput === `expand ${trigger}` ||
        normalizedInput === `paste ${trigger}`;

      if (isExactMatch || isExplicitPrefix) {
        return {
          matched: true,
          snippet
        };
      }
    }

    return { matched: false, snippet: null };
  }

  /**
   * Apply user dictionary, application vocabulary, and developer vocabulary in strict precedence.
   *
   * Precedence Order:
   * 1. User Dictionary (Highest)
   * 2. Application-Specific Vocabulary
   * 3. Developer Vocabulary
   *
   * @param {string} text 
   * @param {object} options { appName, tone, mode, userId }
   * @returns {string}
   */
  applyDictionary(text, options = {}) {
    if (!text || typeof text !== 'string') return '';

    const userId = options.userId || 'default_user';
    let userDict = options.preloadedDictionary || storage.getDictionary(userId);
    if (userDict instanceof Promise) {
      userDict = [];
    }
    if (!Array.isArray(userDict)) userDict = [];
    userDict = userDict.filter(item => item && item.enabled !== false);

    // 1. Mask URLs, email addresses, file paths, and code identifiers first
    // This prevents dictionary replacement from corrupting technical tokens or URLs
    const { maskedText, tokenMap } = technicalTermPreserver.mask(text, []);

    let result = maskedText;

    // 2. Apply User Dictionary (Precedence 1 - Highest)
    // Sort entries by spoken phrase length descending to match multi-word phrases first
    const sortedUserDict = [...userDict].sort((a, b) => {
      const lenA = (a.spoken || a.word || '').length;
      const lenB = (b.spoken || b.word || '').length;
      return lenB - lenA;
    });

    for (const item of sortedUserDict) {
      const targetOutput = item.word || item.preferredOutput;
      const spokenPattern = (item.spoken || item.word || '').trim();
      if (!targetOutput || !spokenPattern) continue;

      const escapedSpoken = spokenPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Case-insensitive whole word boundary match
      const regex = new RegExp(`\\b${escapedSpoken}\\b`, 'gi');
      result = result.replace(regex, targetOutput);

      // If item has a pronunciation hint distinct from spoken, also support matching hint
      if (item.hint && item.hint.trim() && item.hint.toLowerCase() !== spokenPattern.toLowerCase()) {
        const escapedHint = item.hint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hintRegex = new RegExp(`\\b${escapedHint}\\b`, 'gi');
        result = result.replace(hintRegex, targetOutput);
      }
    }

    // 3. Apply Developer Vocabulary (Precedence 3)
    const devTerms = developerDictionary.getAllTerms();
    for (const term of devTerms) {
      // Only replace if not already properly formatted
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(regex, term);
    }

    // 4. Unmask protected tokens (URLs, paths, code identifiers)
    return technicalTermPreserver.unmask(result, tokenMap);
  }
}

export const personalizationEngine = new PersonalizationEngine();
