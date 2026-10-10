/**
 * Mumble AI — Developer & Code Processing Service (Phase 6)
 *
 * Dedicated processing layer for developer mode:
 * - Spoken programming terms -> camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE
 * - Spoken programming symbols -> ==, ===, !=, =>, (), {}, [], _, -, /
 * - Spoken CLI & Terminal commands -> git checkout -b, npm install --save-dev
 * - Spoken File Paths -> src/components/VoiceRecorder.tsx, .env.local, package.json
 * - Coding Assistant Prompts -> Preserves full context, constraints, and architecture details
 */

import { developerDictionary } from './developerDictionary.js';

export class DeveloperProcessingService {
  /**
   * Check if developer mode is requested.
   * @param {string} mode
   * @returns {boolean}
   */
  isDeveloperMode(mode) {
    if (!mode) return false;
    const m = mode.toLowerCase();
    return m === 'developer' || m === 'code' || m === 'terminal' || m === 'dev';
  }

  /**
   * Process spoken text specifically for developer context.
   * @param {string} text
   * @param {object} options
   * @returns {string}
   */
  process(text, options = {}) {
    if (!text || typeof text !== 'string') return '';
    let result = text.trim();

    // 1. Spoken CLI Commands & Terminal Flags
    result = this.convertSpokenCliCommands(result);

    // 2. Spoken File Paths and Extensions
    result = this.convertSpokenFilePaths(result);

    // 3. Spoken Programming Symbols
    result = this.convertSpokenSymbols(result);

    // 4. Spoken Code Structures (functions, types, variables, classes)
    result = this.convertSpokenCodeStructures(result);

    // 6. Strip trailing period if it is a CLI command
    if (/^(?:git|npm|npx|docker|cargo|pip|pnpm|yarn|kubectl|brew|curl|wget)\b/i.test(result)) {
      result = result.replace(/\.$/, '');
    }

    return result.replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Convert spoken CLI commands and flag syntax.
   * e.g. "git checkout dash b feature slash developer mode" -> "git checkout -b feature/developer-mode"
   * e.g. "npm install dash dash save dev typescript" -> "npm install --save-dev typescript"
   * e.g. "docker compose up dash d" -> "docker compose up -d"
   */
  convertSpokenCliCommands(text) {
    let output = text;

    // Multi-word double dash flags
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+save\s+dev\b/gi, '--save-dev');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+save\s+prod\b/gi, '--save-prod');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+save\s+peer\b/gi, '--save-peer');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+dry\s+run\b/gi, '--dry-run');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+no\s+cache\b/gi, '--no-cache');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+max\s+workers\b/gi, '--max-workers');
    output = output.replace(/\b(?:dash\s+dash|double\s+dash)\s+([a-zA-Z0-9_-]+)\b/gi, '--$1');

    // Single dash flags: "dash b" -> "-b", "dash v" -> "-v", "dash m" -> "-m", "dash d" -> "-d", "dash rf" -> "-rf"
    output = output.replace(/\bdash\s+([a-zA-Z0-9]{1,3})\b/gi, '-$1');

    // Git branch: "git checkout -b feature slash developer mode" -> "git checkout -b feature/developer-mode"
    output = output.replace(/(git\s+(?:checkout|switch|branch|push\s+origin)\s+(?:-[a-zA-Z0-9]+\s+)?)([a-zA-Z0-9_-]+)\s+slash\s+([a-zA-Z0-9_\s-]+)/gi, (match, prefix, b1, b2) => {
      const branch = `${b1}/${b2.trim().replace(/\s+/g, '-').toLowerCase()}`;
      return `${prefix}${branch}`;
    });

    return output;
  }

  /**
   * Convert spoken file paths and extensions.
   * e.g. "src slash components slash VoiceRecorder dot tsx" -> "src/components/VoiceRecorder.tsx"
   * e.g. "dot env dot local" -> ".env.local"
   * e.g. "docker dash compose dot yml" -> "docker-compose.yml"
   */
  convertSpokenFilePaths(text) {
    let output = text;

    // "dot env dot local" -> ".env.local", "dot env" -> ".env"
    output = output.replace(/\bdot\s+env(?:\s+dot\s+([a-zA-Z0-9_-]+))?\b/gi, (m, ext) => {
      return ext ? `.env.${ext}` : '.env';
    });

    // "docker dash compose dot yml" -> "docker-compose.yml"
    output = output.replace(/\bdocker\s+dash\s+compose\s+dot\s+(yml|yaml)\b/gi, 'docker-compose.$1');

    // Spoken file extensions: "VoiceRecorder dot tsx" -> "VoiceRecorder.tsx"
    output = output.replace(/\b([a-zA-Z0-9_.-]+)\s+dot\s+(js|ts|jsx|tsx|json|md|py|html|css|yaml|yml|sh|rs|go|sql|env|txt)\b/gi, '$1.$2');

    // Multi-level file paths: "src slash components slash VoiceRecorder.tsx" -> "src/components/VoiceRecorder.tsx"
    output = output.replace(/\b([a-zA-Z0-9_.-]+)\s+slash\s+([a-zA-Z0-9_.-]+)\b/gi, '$1/$2');
    output = output.replace(/\b([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\s+slash\s+([a-zA-Z0-9_.-]+)\b/gi, '$1/$2');

    return output;
  }

  /**
   * Convert spoken programming symbols into code symbols.
   */
  convertSpokenSymbols(text) {
    let output = text;

    // Comparisons & Operators
    output = output.replace(/\b(triple equals|strict equals|strict equal to)\b/gi, '===');
    output = output.replace(/\b(double equals|double equal)\b/gi, '==');
    output = output.replace(/\b(not equals|not equal to)\b/gi, '!=');
    output = output.replace(/\b(greater than or equal to)\b/gi, '>=');
    output = output.replace(/\b(less than or equal to)\b/gi, '<=');
    output = output.replace(/\b(fat arrow|arrow function|arrow)\b/gi, '=>');
    output = output.replace(/\b(greater than)\b/gi, '>');
    output = output.replace(/\b(less than)\b/gi, '<');

    // Structural Symbols
    output = output.replace(/\b(open parenthesis|open paren)\b/gi, '(');
    output = output.replace(/\b(close parenthesis|close paren)\b/gi, ')');
    output = output.replace(/\b(open bracket)\b/gi, '[');
    output = output.replace(/\b(close bracket)\b/gi, ']');
    output = output.replace(/\b(open brace|open curly brace)\b/gi, '{');
    output = output.replace(/\b(close brace|close curly brace)\b/gi, '}');

    // Punctuation & Delimiters
    output = output.replace(/\bsemicolon\b/gi, ';');
    output = output.replace(/\bcolon\b/gi, ':');
    output = output.replace(/\bunderscore\b/gi, '_');
    output = output.replace(/\bbackslash\b/gi, '\\');

    // Spoken "equals" in variable assignment context: "const x equals 5" -> "const x = 5"
    output = output.replace(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s+equals\s+/gi, (m, varName) => {
      return `${m.split(' ')[0]} ${varName} = `;
    });

    return output;
  }

  /**
   * Convert spoken programming constructs into clean code syntax.
   * e.g. "create a function called get workspace users that takes workspace ID and returns a promise of user array"
   * -> "getWorkspaceUsers(workspaceId): Promise<User[]>"
   */
  convertSpokenCodeStructures(text) {
    let output = text;

    // 1. Spoken Function / Method: "function called <words> that takes <args> and returns <returnType>"
    output = output.replace(/\b(?:create\s+a\s+)?(?:function|method)\s+(?:called|named)\s+([a-zA-Z0-9\s]+?)\s+that\s+takes\s+([a-zA-Z0-9\s]+?)\s+and\s+returns\s+(?:a\s+)?([a-zA-Z0-9\s<>\[\]]+)/gi,
      (match, fnName, params, returnType) => {
        const camelFn = this.toCamelCase(fnName);
        const camelParams = params.split(/\s+(?:and|,)\s+/i).map(p => this.toCamelCase(p)).join(', ');
        const formattedReturn = this.formatType(returnType);
        return `${camelFn}(${camelParams}): ${formattedReturn}`;
      }
    );

    // 2. Simple Function: "function called <words>" or "function <words>"
    output = output.replace(/\b(?:function|method)\s+(?:called|named)?\s*([a-zA-Z0-9\s]+?)(?=[.,;!?]|$|\s+(?:to|which|that|in|for|and)\b)/gi,
      (match, fnName) => {
        return `function ${this.toCamelCase(fnName)}`;
      }
    );

    // 3. Spoken Variable / Parameter: "variable called <words>" or "variable <words>"
    output = output.replace(/\b(?:variable|parameter|param|prop|property)\s+(?:called|named)?\s*([a-zA-Z0-9\s]+?)(?=[.,;!?]|$|\s+(?:to|which|that|in|for|and|equals|=)\b)/gi,
      (match, varName) => {
        return this.toCamelCase(varName);
      }
    );

    // 4. Spoken Constant / Environment Variable: "constant <words>" or "environment variable <words>"
    output = output.replace(/\b(?:constant|environment\s+variable|env\s+var|env\s+variable)\s+(?:called|named)?\s*([a-zA-Z0-9\s]+?)(?=[.,;!?]|$|\s+(?:to|which|that|in|for|and|equals|=)\b)/gi,
      (match, constName) => {
        return this.toScreamingSnakeCase(constName);
      }
    );

    // 5. Spoken Class / Interface / Type: "class called <words>", "interface <words>"
    output = output.replace(/\b(?:class|interface|type|component)\s+(?:called|named)\s+([a-zA-Z0-9\s]+?)(?=[.,;!?]|$|\s+(?:to|which|that|in|for|extends|implements)\b)/gi,
      (match, typeName) => {
        const keyword = match.split(' ')[0];
        return `${keyword} ${this.toPascalCase(typeName)}`;
      }
    );

    // 6. Generic Types: "promise of <type> array" -> "Promise<Type[]>", "array of <type>" -> "Type[]"
    output = output.replace(/\bpromise\s+of\s+([a-zA-Z0-9]+)\s+array\b/gi, (m, t) => `Promise<${this.toPascalCase(t)}[]>`);
    output = output.replace(/\bpromise\s+of\s+([a-zA-Z0-9]+)\b/gi, (m, t) => `Promise<${this.toPascalCase(t)}>`);
    output = output.replace(/\barray\s+of\s+([a-zA-Z0-9]+)\b/gi, (m, t) => `${this.toPascalCase(t)}[]`);

    return output;
  }

  /**
   * Apply exact casing for all known developer vocabulary terms.
   */
  applyDeveloperVocabulary(text) {
    let output = text;
    const terms = developerDictionary.getAllTerms();

    for (const term of terms) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${esc}\\b`, 'gi');
      output = output.replace(regex, term);
    }

    return output;
  }

  // --- Casing Helpers ---

  toCamelCase(str) {
    const clean = str.trim().replace(/[^a-zA-Z0-9\s_-]/g, '');
    const words = clean.split(/[\s_-]+/).filter(Boolean);
    if (words.length === 0) return str;
    return words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }

  toPascalCase(str) {
    const clean = str.trim().replace(/[^a-zA-Z0-9\s_-]/g, '');
    const words = clean.split(/[\s_-]+/).filter(Boolean);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }

  toSnakeCase(str) {
    return str.trim().replace(/[^a-zA-Z0-9\s_-]/g, '').split(/[\s_-]+/).join('_').toLowerCase();
  }

  toScreamingSnakeCase(str) {
    return str.trim().replace(/[^a-zA-Z0-9\s_-]/g, '').split(/[\s_-]+/).join('_').toUpperCase();
  }

  formatType(typeStr) {
    const t = typeStr.trim();
    if (/promise\s+of\s+(\w+)\s+array/i.test(t)) {
      const match = t.match(/promise\s+of\s+(\w+)\s+array/i);
      return `Promise<${this.toPascalCase(match[1])}[]>`;
    }
    if (/user\s+array/i.test(t)) return 'User[]';
    if (/string/i.test(t)) return 'string';
    if (/number|int/i.test(t)) return 'number';
    if (/boolean|bool/i.test(t)) return 'boolean';
    return this.toPascalCase(t);
  }
}

export const developerProcessingService = new DeveloperProcessingService();
