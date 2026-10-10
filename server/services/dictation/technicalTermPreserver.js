/**
 * Mumble AI — Technical Term & Syntax Preserver
 *
 * Protects URLs, API paths, code identifiers, CLI commands, package names,
 * filenames, and custom dictionary words from being mangled during regex/text cleanup.
 */

export class TechnicalTermPreserver {
  constructor() {
    // Common developer and technology terms to protect/capitalize properly
    this.knownTechTerms = [
      'JavaScript', 'TypeScript', 'Node.js', 'PostgreSQL', 'Postgres', 'MongoDB', 'Supabase',
      'Docker', 'Kubernetes', 'Redis', 'GraphQL', 'Next.js', 'React', 'Vue', 'Angular', 'Vite',
      'Python', 'PyTorch', 'TensorFlow', 'FastAPI', 'Express', 'Tailwind', 'TailwindCSS',
      'GitHub', 'GitLab', 'AWS', 'GCP', 'Azure', 'Vercel', 'Render', 'Fly.io', 'Cloudflare',
      'Whisper', 'Groq', 'OpenAI', 'Gemini', 'Anthropic', 'Claude', 'JSON', 'REST', 'HTML', 'CSS',
      'API', 'HTTP', 'HTTPS', 'URL', 'CLI', 'SDK', 'IDE', 'OS', 'UI', 'UX', 'SaaS', 'macOS', 'Linux'
    ];
  }

  /**
   * Mask technical entities with safe placeholders.
   * @param {string} text 
   * @param {string[]} dictionaryWords 
   * @returns {{ maskedText: string, tokenMap: Map<string, string> }}
   */
  mask(text, dictionaryWords = []) {
    if (!text) return { maskedText: '', tokenMap: new Map() };

    const tokenMap = new Map();
    let counter = 0;
    let masked = text;

    const createToken = (val) => {
      const token = `__TECH_TOKEN_${counter++}__`;
      tokenMap.set(token, val);
      return token;
    };

    // 1. URLs & Localhost (e.g. https://google.com, http://localhost:3050/api)
    masked = masked.replace(/https?:\/\/[^\s)]+/gi, (match) => createToken(match));
    masked = masked.replace(/\b(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s)]*)?/gi, (match) => createToken(match));

    // 2. Email addresses (e.g. user@example.com)
    masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (match) => createToken(match));

    // 3. File paths and filenames with extensions (e.g. server/index.js, package.json, Dockerfile)
    masked = masked.replace(/(?:^|[\s(])([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)(?:$|[\s).,!?])/g, (full, p1) => {
      const token = createToken(p1);
      return full.replace(p1, token);
    });
    masked = masked.replace(/\b([A-Za-z0-9_-]+\.(?:js|ts|jsx|tsx|json|md|py|html|css|yaml|yml|sh|rs|go|cpp|c|h|java|sql|env|lock))\b/gi, (match) => createToken(match));
    masked = masked.replace(/\b(Dockerfile|Makefile|docker-compose\.yml|package-lock\.json)\b/gi, (match) => createToken(match));

    // 4. CLI commands & flags (e.g. npm install, git commit -m, --port 3000, -rf)
    masked = masked.replace(/\b((?:npm|npx|pip|pip3|git|docker|cargo|kubectl|brew|yarn|pnpm|curl|wget)\s+[a-zA-Z0-9_\-./:"=]+(?:\s+-[a-zA-Z0-9_\-./:"=]+)*)\b/g, (match) => createToken(match));
    masked = masked.replace(/(?:^|\s)(--[a-zA-Z0-9_-]+(?:=[a-zA-Z0-9_\-./]+)?)(?=$|\s|[.,!?])/g, (full, p1) => {
      const token = createToken(p1);
      return full.replace(p1, token);
    });

    // 5. Code identifiers (camelCase, snake_case, PascalCase with digits/calls, e.g. getUserById, audio_buffer, ArrayBuffer)
    masked = masked.replace(/\b([a-z]+[A-Z0-9][a-zA-Z0-9]*)\b/g, (match) => {
      // Don't mask normal words like "iPhone" or "eBay", but mask developer names
      if (/^(iPhone|eBay|iPad|macOS)$/i.test(match)) return match;
      return createToken(match);
    });
    masked = masked.replace(/\b([a-zA-Z0-9]+_[a-zA-Z0-9_]+)\b/g, (match) => createToken(match));

    // 6. User Dictionary Words
    if (Array.isArray(dictionaryWords)) {
      for (const word of dictionaryWords) {
        if (!word || word.trim().length === 0) continue;
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${esc}\\b`, 'gi');
        masked = masked.replace(regex, () => createToken(word));
      }
    }

    // 7. Known Tech Terms (ensure exact casing)
    for (const tech of this.knownTechTerms) {
      const esc = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${esc}\\b`, 'gi');
      masked = masked.replace(regex, () => createToken(tech));
    }

    return { maskedText: masked, tokenMap };
  }

  /**
   * Unmask tokens back to original or normalized technical terms.
   * @param {string} text 
   * @param {Map<string, string>} tokenMap 
   * @returns {string}
   */
  unmask(text, tokenMap) {
    if (!text || !tokenMap || tokenMap.size === 0) return text;
    let restored = text;
    for (const [token, originalVal] of tokenMap.entries()) {
      restored = restored.replaceAll(token, originalVal);
    }
    return restored;
  }
}

export const technicalTermPreserver = new TechnicalTermPreserver();
