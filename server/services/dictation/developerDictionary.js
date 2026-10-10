/**
 * Mumble AI — Developer Vocabulary Layer
 *
 * Provides an extensible developer dictionary covering frameworks, APIs, databases,
 * tools, protocols, and custom developer products (e.g., SIZHVarta, VART-AI, Mumble AI, WABA, etc.).
 */

export class DeveloperDictionary {
  constructor() {
    this.customTerms = new Set();

    // Default developer terms with precise canonical casing
    this.defaultTerms = [
      // Specialized & Custom products
      'SIZHVarta', 'VART-AI', 'Mumble AI', 'Murmur Flow', 'WABA', 'WhatsApp Cloud API', 'Meta API',
      
      // Frameworks & Libraries
      'Next.js', 'React', 'Vue', 'Angular', 'Svelte', 'Vite', 'Nuxt', 'Astro', 'Express', 'FastAPI',
      'NestJS', 'Django', 'Flask', 'Spring Boot', 'Ruby on Rails', 'PyTorch', 'TensorFlow',
      'TailwindCSS', 'Tailwind', 'Bootstrap', 'Prisma', 'Drizzle', 'Mongoose', 'TypeORM',
      'Electron', 'Tauri', 'Capacitor', 'React Native', 'Flutter',

      // Languages & Runtimes
      'JavaScript', 'TypeScript', 'Node.js', 'Python', 'Rust', 'Golang', 'Java', 'Kotlin', 'Swift',
      'C++', 'C#', 'PHP', 'Ruby', 'Scala', 'Elixir', 'Haskell', 'Lua', 'Bash', 'Zsh', 'SQL',

      // Databases & Caches
      'PostgreSQL', 'Postgres', 'MongoDB', 'Redis', 'Supabase', 'Firebase', 'Cassandra',
      'DynamoDB', 'SQLite', 'CockroachDB', 'Neo4j', 'ClickHouse', 'Milvus', 'Pinecone', 'Qdrant',

      // Cloud, DevOps & Infrastructure
      'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Vercel', 'Render', 'Fly.io', 'Cloudflare',
      'Netlify', 'DigitalOcean', 'Heroku', 'Terraform', 'Ansible', 'GitHub', 'GitLab', 'Bitbucket',
      'GitHub Actions', 'CircleCI', 'ArgoCD', 'Prometheus', 'Grafana', 'Datadog', 'OpenTelemetry',

      // Protocols, APIs & Auth
      'GraphQL', 'REST', 'RESTful', 'gRPC', 'WebSocket', 'WebSockets', 'WebRTC', 'OpenAPI', 'Swagger',
      'OAuth', 'OAuth2', 'JWT', 'SSO', 'SAML', 'OpenID', 'CORS', 'HTTPS', 'HTTP/2', 'HTTP/3',
      'TLS', 'SSL', 'mTLS',

      // AI & ML
      'Whisper', 'Groq', 'OpenAI', 'ChatGPT', 'Claude', 'Anthropic', 'Gemini', 'Llama', 'DeepSeek',
      'Mistral', 'Ollama', 'Hugging Face', 'LangChain', 'LlamaIndex', 'vLLM', 'TTS', 'STT', 'VAD'
    ];
  }

  /**
   * Add terms dynamically to the developer vocabulary.
   * @param {string[]} terms
   */
  registerTerms(terms) {
    if (!Array.isArray(terms)) return;
    for (const term of terms) {
      if (term && typeof term === 'string') {
        this.customTerms.add(term.trim());
      }
    }
  }

  /**
   * Get all developer terms combining default and user-registered terms.
   * @returns {string[]}
   */
  getAllTerms() {
    return Array.from(new Set([...this.defaultTerms, ...this.customTerms]));
  }
}

export const developerDictionary = new DeveloperDictionary();
