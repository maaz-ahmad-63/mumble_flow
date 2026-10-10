/**
 * Mumble AI — Punctuation & Capitalization Engine
 *
 * Provides automatic punctuation, sentence casing, question mark detection,
 * acronym capitalization, and voice-command punctuation parsing.
 */

export class PunctuationEngine {
  constructor() {
    this.acronyms = [
      'AI', 'API', 'REST', 'GraphQL', 'URL', 'URI', 'HTTP', 'HTTPS', 'JSON', 'HTML', 'CSS',
      'SDK', 'CLI', 'IDE', 'OS', 'UI', 'UX', 'SaaS', 'PaaS', 'IaaS', 'SQL', 'NoSQL',
      'CI/CD', 'MVP', 'POC', 'ROI', 'KPI', 'OKR', 'CEO', 'CTO', 'CPO', 'CFO',
      'DNS', 'TCP', 'UDP', 'SSH', 'SSL', 'TLS', 'LLM', 'TTS', 'STT', 'VAD',
      'GPU', 'CPU', 'RAM', 'SSD', 'AWS', 'GCP'
    ];

    this.questionStarters = [
      'who', 'what', 'when', 'where', 'why', 'how', 'which', 'whom', 'whose',
      'is', 'are', 'was', 'were', 'am', 'do', 'does', 'did', 'have', 'has', 'had',
      'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
      'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'don\'t', 'doesn\'t', 'didn\'t',
      'won\'t', 'wouldn\'t', 'can\'t', 'couldn\'t', 'shouldn\'t'
    ];
  }

  /**
   * Handle spoken punctuation commands.
   * @param {string} text 
   * @returns {string}
   */
  parseSpokenPunctuation(text) {
    if (!text) return '';
    let result = text;

    result = result.replace(/\b(?:new|next)\s+paragraph\b/gi, '\n\n');
    result = result.replace(/\b(?:new|next)\s+line\b/gi, '\n');
    result = result.replace(/\bcomma\b/gi, ',');
    result = result.replace(/\b(?:period|full stop)\b/gi, '.');
    result = result.replace(/\b(?:question mark)\b/gi, '?');
    result = result.replace(/\b(?:exclamation mark|exclamation point)\b/gi, '!');
    result = result.replace(/\bcolon\b/gi, ':');
    result = result.replace(/\b(?:semicolon|semi-colon)\b/gi, ';');

    // Clean up spacing around punctuation: "hello , world" -> "hello, world"
    result = result.replace(/\s+([,.:;!?])/g, '$1');
    return result;
  }

  /**
   * Automatically capitalize sentences, "I", acronyms, and proper names.
   * @param {string} text 
   * @returns {string}
   */
  capitalize(text) {
    if (!text) return '';
    let result = text;

    // 1. Capitalize first letter of paragraph/sentence
    result = result.replace(/(^|[.!?\n]\s*)([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());

    // 2. Capitalize standalone "i" and contractions
    result = result.replace(/\b(i)\b/g, 'I');
    result = result.replace(/\b(i)('m|'ll|'ve|'d|'d've)\b/gi, (_, i, suffix) => `I${suffix.toLowerCase()}`);

    // 3. Days of the week and months
    const properCalendar = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'
    ];
    for (const cal of properCalendar) {
      const regex = new RegExp(`\\b${cal}\\b`, 'gi');
      result = result.replace(regex, cal);
    }

    // 4. Known Acronyms
    for (const acronym of this.acronyms) {
      const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
      result = result.replace(regex, acronym);
    }

    return result;
  }

  /**
   * Ensure proper sentence endings and question marks.
   * @param {string} text 
   * @returns {string}
   */
  punctuate(text) {
    if (!text) return '';
    let result = text.trim();

    // Split into sentences / lines
    const lines = result.split('\n');
    const processedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
        return line;
      }

      // Check if line looks like a question
      const words = trimmed.split(/\s+/);
      const firstWord = words[0]?.toLowerCase().replace(/[^a-z']/g, '');

      let punctuated = trimmed;
      if (!/[.!?]$/.test(punctuated)) {
        if (this.questionStarters.includes(firstWord)) {
          punctuated += '?';
        } else {
          punctuated += '.';
        }
      }
      return punctuated;
    });

    return processedLines.join('\n');
  }

  /**
   * Run full punctuation and capitalization pipeline.
   * @param {string} text 
   * @returns {string}
   */
  process(text) {
    let result = this.parseSpokenPunctuation(text);
    result = this.capitalize(result);
    result = this.punctuate(result);
    return result;
  }
}

export const punctuationEngine = new PunctuationEngine();
