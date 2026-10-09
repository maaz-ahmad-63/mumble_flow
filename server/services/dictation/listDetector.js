/**
 * Murmur Flow — Spoken List Detector & Formatter
 *
 * Detects spoken sequential items, steps, and points, formatting them into structured lists.
 * Example: "first install Node second install Postgres third run the server"
 * ->
 * 1. Install Node.
 * 2. Install Postgres.
 * 3. Run the server.
 */

export class ListDetector {
  /**
   * Detect and format spoken lists.
   * @param {string} text 
   * @param {'numbered' | 'bullets'} format 
   * @returns {{ hasList: boolean, formattedText: string }}
   */
  detectAndFormat(text, format = 'numbered') {
    if (!text || typeof text !== 'string') return { hasList: false, formattedText: text };

    // 1. Ordinal markers: first, second, third, fourth, fifth, sixth, etc. / firstly, secondly...
    const ordinalRegex = /\b(?:first|firstly)\b\s+(.+?)\s+\b(?:second|secondly)\b\s+(.+?)(?:\s+\b(?:third|thirdly)\b\s+(.+?))?(?:\s+\b(?:fourth|fourthly)\b\s+(.+?))?(?:\s+\b(?:fifth|fifthly)\b\s+(.+?))?$/i;
    
    const ordinalMatch = text.match(ordinalRegex);
    if (ordinalMatch) {
      const items = ordinalMatch.slice(1).filter(Boolean).map(item => this.cleanListItem(item));
      if (items.length >= 2) {
        return {
          hasList: true,
          formattedText: this.formatItems(items, format)
        };
      }
    }

    // 2. "number one ... number two ...", "step one ... step two ...", "point one ... point two ..."
    const numberedRegex = /\b(?:number|step|point|item)\s+(?:1|one)\s*[:.-]?\s+(.+?)\s+\b(?:number|step|point|item)\s+(?:2|two)\s*[:.-]?\s+(.+?)(?:\s+\b(?:number|step|point|item)\s+(?:3|three)\s*[:.-]?\s+(.+?))?(?:\s+\b(?:number|step|point|item)\s+(?:4|four)\s*[:.-]?\s+(.+?))?$/i;

    const numberedMatch = text.match(numberedRegex);
    if (numberedMatch) {
      const items = numberedMatch.slice(1).filter(Boolean).map(item => this.cleanListItem(item));
      if (items.length >= 2) {
        return {
          hasList: true,
          formattedText: this.formatItems(items, format)
        };
      }
    }

    // 3. Spoken list declarations with counts or colons
    // Example: "I need three things: fix login, test payments, deploy API."
    const listIntroRegex = /^(.*?(?:(?:here\s+(?:are|is)\s+(?:the\s+)?(?:following\s+)?|i\s+need\s+|we\s+need\s+|there\s+are\s+)?(?:two|three|four|five|several|a\s+few|\d+)\s+(?:things|items|tasks|steps|points|actions|bugs|features)|things\s+to\s+do|following\s+tasks|following\s+items|action\s+items)[:\s]+)(.+)$/i;
    const introMatch = text.match(listIntroRegex);
    if (introMatch) {
      const intro = introMatch[1].trim();
      const body = introMatch[2].trim();
      const rawItems = body.split(/,\s*(?:and\s+)?|\s+and\s+/i)
        .map(s => s.trim().replace(/^[,:;.-]+|[,:;.-]+$/g, ''))
        .filter(Boolean);
      if (rawItems.length >= 2) {
        const cleanedItems = rawItems.map(item => this.cleanListItem(item));
        const formattedList = this.formatItems(cleanedItems, format);
        return {
          hasList: true,
          formattedText: intro ? `${intro}\n${formattedList}` : formattedList
        };
      }
    }

    return { hasList: false, formattedText: text };
  }

  cleanListItem(item) {
    let cleaned = item.trim().replace(/^[,:;.-]+|[,:;.-]+$/g, '').trim();
    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    // Ensure trailing period if it does not have punctuation
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }
    return cleaned;
  }

  formatItems(items, format = 'numbered') {
    if (format === 'bullets') {
      return items.map(item => `- ${item}`).join('\n');
    }
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  }
}

export const listDetector = new ListDetector();
