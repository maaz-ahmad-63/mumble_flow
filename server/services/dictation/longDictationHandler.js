/**
 * Murmur Flow — Long Dictation Handler
 *
 * Breaks long voice dictations into cohesive paragraphs/clauses,
 * processes each segment with shared contextual awareness, and recombines smoothly.
 */

export class LongDictationHandler {
  /**
   * Determine if text is long enough to require chunked processing.
   * @param {string} text 
   * @returns {boolean}
   */
  isLong(text) {
    if (!text) return false;
    const wordCount = text.trim().split(/\s+/).length;
    return wordCount > 250 || text.includes('\n\n');
  }

  /**
   * Split long text into paragraphs or semantic segments.
   * @param {string} text 
   * @returns {string[]}
   */
  splitSegments(text) {
    if (!text) return [];

    // If explicit paragraph breaks exist
    if (text.includes('\n\n')) {
      return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    }

    // Otherwise split by sentence groups (~3-5 sentences per segment)
    const sentences = text.match(/[^.!?]+[.!?]+|\S+/g) || [text];
    const segments = [];
    let currentChunk = [];

    for (const sentence of sentences) {
      currentChunk.push(sentence.trim());
      const chunkWordCount = currentChunk.join(' ').split(/\s+/).length;
      if (chunkWordCount >= 60) {
        segments.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      segments.push(currentChunk.join(' '));
    }

    return segments.length > 0 ? segments : [text];
  }

  /**
   * Recombine processed segments into a cohesive document.
   * @param {string[]} processedSegments 
   * @returns {string}
   */
  joinSegments(processedSegments) {
    return processedSegments.filter(Boolean).join('\n\n');
  }
}

export const longDictationHandler = new LongDictationHandler();
