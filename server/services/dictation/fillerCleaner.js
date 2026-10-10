/**
 * Mumble AI — Filler Word & Stutter Cleaner
 *
 * Removes verbal clutter, stutters, filler phrases, and false vocal artifacts
 * while preserving natural language semantics and comparisons.
 */

export class FillerCleaner {
  /**
   * Remove verbal filler words and phrases.
   * @param {string} text 
   * @returns {string}
   */
  removeFillers(text) {
    if (!text || typeof text !== 'string') return '';
    let result = text;

    // 1. Standalone / conversational fillers (case-insensitive)
    const exactFillers = [
      /\b(um+|uh+|erm+|er+|ah+|ahh+)\b,?\s*/gi,
      /\b(you know|you see|so yeah|like literally|basically|sort of|kind of like|as a matter of fact)\b,?\s*/gi,
      /\b(I mean to say|I mean)\b,?\s*(?=[a-z])/gi
    ];

    for (const pattern of exactFillers) {
      result = result.replace(pattern, '');
    }

    // 2. Context-aware "like" filler removal
    // Remove "like" when used as filler before numbers, adverbs, negatives, or clauses:
    // e.g. "like not Friday" -> "not Friday", "like 5pm" -> "5pm", "like really good" -> "really good", "like, can you" -> "can you"
    result = result.replace(/(^|[,.!?]\s+|\s+)\blike\b,?\s+(?=not\b|\d+|really\b|super\b|actually\b|maybe\b|probably\b|can\b|could\b|we\b|you\b|I\b|they\b|it\b|just\b)/gi, '$1');

    // 3. Clean leading "so" or "and" if left hanging at the very start
    result = result.replace(/^\s*(?:so|and|well|yeah),?\s+/i, '');

    return result;
  }

  /**
   * Remove repeated words (stutters) and stutter prefixes.
   * @param {string} text 
   * @returns {string}
   */
  removeStutters(text) {
    if (!text || typeof text !== 'string') return '';
    let result = text;

    // 1. Phonetic stutter (e.g. "th-that" -> "that", "b-but" -> "but", "w-we" -> "we")
    result = result.replace(/\b([a-zA-Z]{1,2})-\1([a-zA-Z]+)\b/gi, '$1$2');

    // 2. Multi-word phrase repetition (e.g. "in the in the" -> "in the", "we can we can" -> "we can")
    result = result.replace(/\b(\w+\s+\w+)\s+\1\b/gi, '$1');

    // 3. Single word duplicate repetition (e.g. "the the", "I I", "that that", "to to")
    // Do not remove intentional developer repetitions like "dash dash" or "dot dot"
    result = result.replace(/\b(?!(?:dash|dot)\b)([a-zA-Z0-9_]+)\s+\1\b/gi, '$1');
    result = result.replace(/\b(?!(?:dash|dot)\b)([a-zA-Z0-9_]+)\s+\1\b/gi, '$1');

    return result;
  }

  /**
   * Run full filler and stutter cleanup.
   * @param {string} text 
   * @returns {string}
   */
  clean(text) {
    let output = this.removeStutters(text);
    output = this.removeFillers(output);
    output = this.removeStutters(output); // second pass after fillers stripped
    return output.replace(/\s{2,}/g, ' ').trim();
  }
}

export const fillerCleaner = new FillerCleaner();
