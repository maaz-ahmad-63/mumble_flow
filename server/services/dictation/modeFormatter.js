/**
 * Mumble AI — Mode Formatter
 *
 * Implements mode-specific structure and styling for:
 * Natural, Casual, Professional, Executive, Email, Social, Support, Code, Bullets, Standup.
 */

import { developerProcessingService } from './developerProcessingService.js';

export class ModeFormatter {
  /**
   * Format text according to the specified mode.
   * @param {string} text 
   * @param {string} mode 
   * @param {object} options 
   * @returns {string}
   */
  format(text, mode = 'natural', options = {}) {
    if (!text || typeof text !== 'string') return '';
    const cleanText = text.trim();
    const normalizedMode = (mode || 'natural').toLowerCase();

    switch (normalizedMode) {
      case 'bullet':
      case 'bullets':
        return this.formatBullets(cleanText);

      case 'standup':
        return this.formatStandup(cleanText);

      case 'social':
      case 'comment':
      case 'reply':
        return this.formatSocial(cleanText);

      case 'executive':
        return this.formatExecutive(cleanText);

      case 'email':
        return this.formatEmail(cleanText);

      case 'support':
        return this.formatSupport(cleanText);

      case 'prompt':
        return this.formatPrompt(cleanText);

      case 'raw':
        return text;

      case 'terminal':
        return this.formatTerminal(cleanText);

      case 'commit':
        return cleanText;

      case 'sql':
        return cleanText;

      case 'meeting':
      case 'minutes':
        return cleanText;

      case 'translator':
      case 'translate':
        return cleanText;

      case 'code':
      case 'developer':
      case 'dev':
        return this.formatCode(cleanText);

      case 'professional':
      case 'formal':
        return this.formatProfessional(cleanText);

      case 'casual':
        return this.formatCasual(cleanText);

      case 'natural':
      default:
        return cleanText;
    }
  }

  formatBullets(text) {
    if (!text) return '';
    // If it already has dash bullets
    if (text.startsWith('- ') || text.includes('\n- ')) {
      return text;
    }
    // If it is a numbered list, convert to bullet dashes
    if (/^\d+\.\s+/m.test(text)) {
      return text.replace(/^\d+\.\s+/gm, '- ');
    }
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) {
      return sentences.map(s => `- ${s}`).join('\n');
    }
    return `- ${text}`;
  }

  formatStandup(text) {
    if (text.includes('**Yesterday:**')) return text;
    return `**Yesterday:** ${text}\n**Today:** In progress\n**Blockers:** None`;
  }

  formatSocial(text) {
    if (!text) return '';
    // If it's a comment/reply request, strip the request phrasing for deterministic fallback
    const commentMatch = text.match(/^(?:(?:please\s+)?(?:add|write|draft|post|leave|drop|give|type|send)\s+(?:a\s+)?(?:comment|reply|response)\s+(?:saying|to\s+(?:say|tell|appreciat|thank)|that)?\s*(.+))$/i);
    if (commentMatch && commentMatch[1]) {
      return commentMatch[1].trim();
    }
    // If it's already tagged or a short direct comment
    if (text.includes('#') || text.length < 120) return text;
    return `🚀 Key Update:\n\n${text}\n\nWhat are your thoughts on this?\n\n#Productivity #VoiceAI #OpenSource`;
  }

  formatExecutive(text) {
    if (text.toUpperCase().includes('EXECUTIVE SUMMARY:')) return text;
    return `EXECUTIVE SUMMARY:\n${text}`;
  }

  formatEmail(text) {
    if (/^(hi|hello|dear|hey)\b/i.test(text)) return text;

    // Check for "email to [Name] saying/asking [Body]"
    const reqMatch = text.match(/^(?:(?:please\s+)?(?:write|draft|send|compose)\s+(?:an?\s+)?email|email)\s+(?:to\s+)?([A-Za-z]+)\s+(?:saying|asking|telling|that|about)?\s*(.+)$/i);
    if (reqMatch) {
      const recipient = reqMatch[1];
      let body = reqMatch[2].trim();
      if (body.startsWith('about ')) {
        body = `I wanted to follow up ${body}`;
      }
      if (body.length > 0) {
        body = body.charAt(0).toUpperCase() + body.slice(1);
      }
      if (!/[.!?]$/.test(body)) body += '.';
      return `Hi ${recipient},\n\n${body}\n\nBest regards,`;
    }

    return `Hi team,\n\n${text}\n\nBest regards,`;
  }

  formatPrompt(text) {
    if (/^(prompt:|meta prompt:)/i.test(text)) return text;
    let body = text.replace(/^(?:(?:create|write|generate|give me|make)\s+(?:a\s+)?prompt\s+(?:for\s+[a-zA-Z0-9_-]+\s+)?(?:to\s+|that\s+|about\s+|:\s*)?|prompt\s+(?:for\s+[a-zA-Z0-9_-]+\s*)?[:\s]*)/i, '').trim();
    if (body.length > 0) {
      body = body.charAt(0).toUpperCase() + body.slice(1);
    } else {
      body = text;
    }
    return `PROMPT:\n${body}`;
  }

  formatSupport(text) {
    if (/^(hi|hello|thank you)\b/i.test(text)) return text;
    return `Hello,\n\nThank you for reaching out! Here are the details regarding your request:\n\n${text}\n\nPlease let us know if you have any questions. We're happy to help!`;
  }

  formatCode(text) {
    // 1. Process programming constructs, symbols, CLI flags, camelCase, filepaths
    let formatted = developerProcessingService.process(text);

    // 2. Wrap common programming keywords, variables, and cli flags in backticks if not already wrapped
    formatted = formatted.replace(/(?:^|\s)(--[a-zA-Z0-9_-]+(?:=[a-zA-Z0-9_\-./]+)?)(?=$|\s|[.,!?])/g, ' `$1`');
    formatted = formatted.replace(/\b([a-zA-Z0-9]+_[a-zA-Z0-9_]+)\b/g, '`$1`');

    return formatted.trim();
  }

  formatTerminal(text) {
    if (!text) return '';
    let formatted = developerProcessingService.process(text, { mode: 'terminal' });
    // Remove leading conversational fillers like "run", "execute", "please run" if followed by command
    formatted = formatted.replace(/^(?:please\s+)?(?:run|execute|type)\s+(?:the\s+command\s+)?/i, '');
    return formatted.trim();
  }

  formatProfessional(text) {
    if (!text) return '';
    let formatted = text;
    // Expand informal spoken contractions to formal equivalents
    const contractions = [
      [/\bcan't\b/gi, 'cannot'],
      [/\bwon't\b/gi, 'will not'],
      [/\bain't\b/gi, 'is not'],
      [/\bdon't\b/gi, 'do not'],
      [/\bdoesn't\b/gi, 'does not'],
      [/\bdidn't\b/gi, 'did not'],
      [/\bisn't\b/gi, 'is not'],
      [/\baren't\b/gi, 'are not'],
      [/\bwasn't\b/gi, 'was not'],
      [/\bweren't\b/gi, 'were not'],
      [/\bhaven't\b/gi, 'have not'],
      [/\bhasn't\b/gi, 'has not'],
      [/\bhadn't\b/gi, 'had not'],
      [/\bwouldn't\b/gi, 'would not'],
      [/\bshouldn't\b/gi, 'should not'],
      [/\bcouldn't\b/gi, 'could not'],
      [/\bgonna\b/gi, 'going to'],
      [/\bwanna\b/gi, 'want to'],
      [/\bgotta\b/gi, 'must'],
      [/\bi'm\b/gi, 'I am'],
      [/\bwe're\b/gi, 'we are'],
      [/\bthey're\b/gi, 'they are'],
      [/\byou're\b/gi, 'you are'],
      [/\bit's\b/gi, 'it is'],
      [/\bthere's\b/gi, 'there is'],
      [/\bthat's\b/gi, 'that is'],
      [/\bwhat's\b/gi, 'what is'],
      [/\blet's\b/gi, 'let us']
    ];
    for (const [regex, replacement] of contractions) {
      formatted = formatted.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
    // Ensure terminal punctuation if lacking
    if (!/[.!?]$/.test(formatted.trim())) {
      formatted = formatted.trim() + '.';
    }
    return formatted;
  }

  formatCasual(text) {
    if (!text) return '';
    let formatted = text;
    // In casual mode, ensure friendly conversational contractions are used where natural
    const formalToCasual = [
      [/\bcannot\b/gi, "can't"],
      [/\bwill not\b/gi, "won't"],
      [/\bdo not\b/gi, "don't"],
      [/\bdoes not\b/gi, "doesn't"],
      [/\bdid not\b/gi, "didn't"],
      [/\bis not\b/gi, "isn't"],
      [/\bare not\b/gi, "aren't"],
      [/\bwould not\b/gi, "wouldn't"],
      [/\bshould not\b/gi, "shouldn't"],
      [/\bcould not\b/gi, "couldn't"],
      [/\bI am\b/g, "I'm"],
      [/\bwe are\b/gi, "we're"],
      [/\bthey are\b/gi, "they're"],
      [/\bit is\b/gi, "it's"]
    ];
    for (const [regex, replacement] of formalToCasual) {
      formatted = formatted.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
    return formatted;
  }
}

export const modeFormatter = new ModeFormatter();
