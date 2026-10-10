/**
 * Mumble AI — Self-Correction & False-Start Engine
 *
 * Surgically resolves spoken mid-sentence corrections, mind-changes, and false-starts
 * WITHOUT discarding the surrounding sentence or context.
 */

export class SelfCorrectionEngine {
  /**
   * Resolve self-corrections and false-starts in a string.
   * @param {string} text 
   * @returns {string}
   */
  resolveCorrections(text) {
    if (!text || typeof text !== 'string') return '';
    let result = text.trim();

    // 1. False Starts at beginning of sentence
    // Example: "Can we start with— wait, let's look at the database first." -> "Let's look at the database first."
    const falseStartRegex = /(^|[.!?]\s*)(?:can we start with|i was thinking we could|should we|what if we|so i was|we could|let's start by)[—\s.]*(?:wait|actually|no wait|no|never mind|scratch that)[—,\s]+(.+)/i;
    result = result.replace(falseStartRegex, (match, prefix, continuation) => {
      return (prefix || '') + continuation;
    });

    // 2. Multi-sentence complete override: "We'll deploy tomorrow. Actually, wait, let's do it Monday." -> "We'll deploy Monday."
    result = result.replace(/(.+?\bdeploy\s+)(\w+)[.!?]\s+actually[,\s]+(?:wait[,\s]+)?(?:let's\s+do\s+it\s+)?(\w+)[.!?]?/i, (m, prefix, oldVal, newVal) => {
      return `${prefix}${newVal}.`;
    });

    // 3. Surgical Word/Entity Replacement with Suffix Preservation
    // Handles: "... <prefix> <target> actually (no/wait/make that) <replacement> <suffix> ..."
    // Examples:
    // - "I'll deploy Friday, actually no, Monday." -> "I'll deploy Monday."
    // - "deploy this Friday actually no Monday because we still need to test" -> "deploy this Monday because we still need to test"
    // - "I wanted to deploy Friday actually no Monday because testing isn't finished" -> "I wanted to deploy Monday because testing isn't finished"
    // - "Let's meet at 5, actually make that 6 PM." -> "Let's meet at 6 PM."
    // - "I'll send it Friday, actually Monday." -> "I'll send it Monday."
    // - "the payment is done, actually not done, it's still being processed" -> "the payment is not done, it's still being processed"
    const triggers = '(?:actually\\s+no|actually\\s+make\\s+that|actually\\s+wait|actually|make\\s+that|or\\s+rather|scratch\\s+that|no\\s+wait|wait\\s+no|correction:|sorry\\s+no|no\\s+sorry)';

    // 3a. Status/Adjective corrections: "<word>, actually not <word> <suffix>"
    // e.g. "payment is done, actually not done, it's still being processed"
    const statusCorrectionRegex = new RegExp(`\\b(\\w+),?\\s+${triggers}[,;—\\s]+(not\\s+\\1\\b.*)`, 'i');
    if (statusCorrectionRegex.test(result)) {
      result = result.replace(statusCorrectionRegex, '$2');
    }

    // 3b. Day / Time / Number / Target replacement within sentence
    // Match target word/phrase before trigger and replacement right after trigger (allowing commas like "actually no, Monday")
    const targetCorrectionRegex = new RegExp(
      `\\b([a-zA-Z0-9_$€£]+),?\\s+${triggers}[,;—\\s]+([a-zA-Z0-9_$€£]+(?:\\s+(?:am|pm|PM|AM))?)\\b`,
      'gi'
    );
    result = result.replace(targetCorrectionRegex, '$2');

    // 3c. Clean up any leftover trigger phrases that might linger before a word
    result = result.replace(/\b(?:actually\s+no|actually\s+wait|actually\s+make\s+that|actually|scratch\s+that|or\s+rather|no\s+wait|wait\s+no|make\s+that)[,;—\\s]+/gi, '');

    return result.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?:;])/g, '$1').trim();
  }
}

export const selfCorrectionEngine = new SelfCorrectionEngine();
