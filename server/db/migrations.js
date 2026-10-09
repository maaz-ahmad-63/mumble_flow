import fs from 'fs';
import path from 'path';

export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // Schema migrations table
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);

      // Users table
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // Sessions / Auth tokens table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Workspaces table
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          owner_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Workspace members
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_members (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TEXT NOT NULL,
          UNIQUE(workspace_id, user_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Settings table (per user)
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          user_id TEXT PRIMARY KEY,
          settings_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Dictionary table (per user)
      db.exec(`
        CREATE TABLE IF NOT EXISTS dictionary (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          word TEXT NOT NULL,
          spoken TEXT NOT NULL,
          category TEXT DEFAULT 'general',
          hint TEXT DEFAULT '',
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_dict_user ON dictionary(user_id);
      `);

      // Snippets table (per user)
      db.exec(`
        CREATE TABLE IF NOT EXISTS snippets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          trigger TEXT NOT NULL,
          content TEXT NOT NULL,
          mode TEXT DEFAULT 'all',
          app TEXT DEFAULT 'all',
          description TEXT DEFAULT '',
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
      `);

      // History table (per user)
      db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          raw_transcript TEXT NOT NULL,
          processed_text TEXT NOT NULL,
          duration_ms INTEGER DEFAULT 0,
          app_name TEXT,
          tone TEXT,
          language TEXT,
          latency_asr_ms INTEGER,
          latency_llm_ms INTEGER,
          total_latency_ms INTEGER,
          is_snippet INTEGER DEFAULT 0,
          stt_provider TEXT,
          llm_provider TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
      `);

      // Meetings table (per user)
      db.exec(`
        CREATE TABLE IF NOT EXISTS meetings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          action_items_json TEXT,
          topics_json TEXT,
          transcript TEXT NOT NULL,
          duration_seconds INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
      `);

      // Usage Events table (per user and workspace)
      db.exec(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          session_id TEXT,
          type TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          audio_seconds REAL DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          estimated_cost REAL DEFAULT 0.0,
          status TEXT NOT NULL DEFAULT 'success',
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id);
      `);

      // User Quotas table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_quotas (
          user_id TEXT PRIMARY KEY,
          tier TEXT NOT NULL DEFAULT 'free',
          monthly_audio_minutes REAL NOT NULL DEFAULT 60.0,
          monthly_llm_requests INTEGER NOT NULL DEFAULT 500,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    }
  },
  {
    version: 2,
    name: 'add_user_status_and_admin_support',
    up: (db) => {
      // Safe addition of status column to users table
      const userColumns = db.prepare('PRAGMA table_info(users)').all();
      const hasStatus = userColumns.some(c => c.name === 'status');
      if (!hasStatus) {
        db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
      }
      db.exec("UPDATE users SET status = 'active' WHERE status IS NULL;");
      db.exec("UPDATE users SET role = 'admin' WHERE id = 'default_user';");
    }
  },
  {
    version: 3,
    name: 'add_user_api_keys_table',
    up: (db) => {
      // Authenticated BYOK storage table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          encrypted_key TEXT NOT NULL,
          key_hint TEXT NOT NULL,
          validation_status TEXT DEFAULT 'untested',
          last_validated_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, provider),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON user_api_keys(user_id, provider);
      `);
    }
  },
  {
    version: 4,
    name: 'add_usage_byok_and_failure_tracking',
    up: (db) => {
      // Safely add new columns to usage_events for BYOK separation and failure tracking
      const columns = db.prepare('PRAGMA table_info(usage_events)').all();
      const colNames = new Set(columns.map(c => c.name));

      if (!colNames.has('is_byok')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN is_byok INTEGER DEFAULT 0;");
      }
      if (!colNames.has('key_source')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN key_source TEXT DEFAULT 'system';");
      }
      if (!colNames.has('cost_is_estimated')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN cost_is_estimated INTEGER DEFAULT 1;");
      }
      if (!colNames.has('user_cost')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN user_cost REAL DEFAULT 0.0;");
      }
      if (!colNames.has('platform_cost')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN platform_cost REAL DEFAULT 0.0;");
      }
      if (!colNames.has('error_message')) {
        db.exec("ALTER TABLE usage_events ADD COLUMN error_message TEXT;");
      }

      // Check user_quotas columns
      const quotaCols = db.prepare('PRAGMA table_info(user_quotas)').all();
      const quotaColNames = new Set(quotaCols.map(c => c.name));
      if (!quotaColNames.has('monthly_budget_usd')) {
        db.exec("ALTER TABLE user_quotas ADD COLUMN monthly_budget_usd REAL DEFAULT 10.0;");
      }

      // Backfill user_cost and platform_cost for existing records
      db.exec(`
        UPDATE usage_events 
        SET user_cost = COALESCE(estimated_cost, 0.0), 
            platform_cost = CASE WHEN is_byok = 1 THEN 0.0 ELSE COALESCE(estimated_cost, 0.0) END
        WHERE user_cost IS NULL OR user_cost = 0.0;
      `);

      db.exec("CREATE INDEX IF NOT EXISTS idx_usage_user_status ON usage_events(user_id, status);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_usage_byok ON usage_events(is_byok);");
    }
  }
];

/**
 * Runs all pending migrations
 */
export function runMigrations(db) {
  // Check if migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all();
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[Database] Applying migration ${migration.version}: ${migration.name}`);
      migration.up(db);
      const stmt = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
      stmt.run(migration.version, migration.name, new Date().toISOString());
    }
  }
}

export const DEFAULT_DICTIONARY = [
  { id: '1', word: 'Mumble AI', spoken: 'mumble AI', category: 'product', hint: 'mumble ai', enabled: true, userId: 'default_user' },
  { id: '2', word: 'VART-AI', spoken: 'Varta AI', category: 'product', hint: 'varta ai', enabled: true, userId: 'default_user' },
  { id: '3', word: 'Wispr Flow', spoken: 'whisper flow', category: 'product', hint: 'whisper flow', enabled: true, userId: 'default_user' },
  { id: '4', word: 'Next.js', spoken: 'next JS', category: 'code', hint: 'next js', enabled: true, userId: 'default_user' },
  { id: '5', word: 'PostgreSQL', spoken: 'post grass', category: 'code', hint: 'postgres', enabled: true, userId: 'default_user' },
  { id: '6', word: 'Supabase', spoken: 'soopa base', category: 'code', hint: 'soopa base', enabled: true, userId: 'default_user' },
  { id: '7', word: 'Vercel', spoken: 'ver sell', category: 'code', hint: 'ver sell', enabled: true, userId: 'default_user' },
  { id: '8', word: 'TypeScript', spoken: 'type script', category: 'code', hint: 'type script', enabled: true, userId: 'default_user' }
];

export const DEFAULT_SNIPPETS = [
  { id: '1', name: 'Client Introduction', trigger: 'client introduction', content: 'Hi, thanks for reaching out. I’ll review this and get back to you shortly.', mode: 'all', app: 'all', enabled: true, description: 'Quick client greeting response', userId: 'default_user' },
  { id: '2', name: 'My GitHub', trigger: 'my github', content: 'https://github.com/whisperflow-dev', mode: 'all', app: 'all', enabled: true, description: 'Stored GitHub profile link', userId: 'default_user' },
  { id: '3', name: 'API Disclaimer', trigger: 'api disclaimer', content: 'Note: All API responses are rate-limited to 60 requests per minute. Authentication tokens must be passed in the Authorization Bearer header.', mode: 'all', app: 'all', enabled: true, description: 'Technical disclaimer', userId: 'default_user' },
  { id: '4', name: 'Calendly Link', trigger: 'insert calendly', content: 'Feel free to grab a convenient time for us to chat on my calendar: https://calendly.com/your-username/30min', mode: 'all', app: 'all', enabled: true, description: 'Quick meeting scheduler link', userId: 'default_user' }
];

export function seedDefaultData(db) {
  const defaultUserId = 'default_user';
  const now = new Date().toISOString();

  // Ensure default user exists
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(defaultUserId, 'local@mumbleflow.internal', 'LOCAL_DEV_USER', 'Local User', 'admin', now, now);

  db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, name, slug, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('ws_default', 'Personal Workspace', 'personal', defaultUserId, now);

  db.prepare(`
    INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('wm_default', 'ws_default', defaultUserId, 'owner', now);

  // Seed default dictionary entries
  const insertDict = db.prepare(`
    INSERT OR IGNORE INTO dictionary (id, user_id, word, spoken, category, hint, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of DEFAULT_DICTIONARY) {
    insertDict.run(item.id, defaultUserId, item.word, item.spoken, item.category, item.hint, 1, now, now);
  }

  // Seed default snippets
  const insertSnip = db.prepare(`
    INSERT OR IGNORE INTO snippets (id, user_id, name, trigger, content, mode, app, description, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of DEFAULT_SNIPPETS) {
    insertSnip.run(s.id, defaultUserId, s.name, s.trigger, s.content, s.mode, s.app, s.description, 1, now, now);
  }
}

/**
 * Imports existing data from data/whisperflow_store.json if present
 */
export function importLegacyJsonStore(db, legacyJsonPath) {
  seedDefaultData(db);

  if (!fs.existsSync(legacyJsonPath)) return;

  try {
    const raw = fs.readFileSync(legacyJsonPath, 'utf8');
    const legacy = JSON.parse(raw);
    const defaultUserId = 'default_user';

    // Ensure default user exists
    const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(defaultUserId);
    if (!userCheck) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(defaultUserId, 'local@mumbleflow.internal', 'LOCAL_DEV_USER', 'Local User', 'admin', now, now);

      // Create default workspace
      db.prepare(`
        INSERT OR IGNORE INTO workspaces (id, name, slug, owner_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ws_default', 'Personal Workspace', 'personal', defaultUserId, now);

      db.prepare(`
        INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('wm_default', 'ws_default', defaultUserId, 'owner', now);
    }

    // Import settings
    if (legacy.settings) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO settings (user_id, settings_json, updated_at)
        VALUES (?, ?, ?)
      `).run(defaultUserId, JSON.stringify(legacy.settings), now);
    }

    // Import dictionary
    if (Array.isArray(legacy.dictionary)) {
      const insertDict = db.prepare(`
        INSERT OR IGNORE INTO dictionary (id, user_id, word, spoken, category, hint, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const item of legacy.dictionary) {
        insertDict.run(
          item.id || String(Date.now() + Math.random()),
          item.userId || defaultUserId,
          item.word || item.preferredOutput || '',
          item.spoken || item.spokenPhrase || item.word || '',
          item.category || 'general',
          item.hint || '',
          item.enabled !== false ? 1 : 0,
          item.createdAt || now,
          item.updatedAt || now
        );
      }
    }

    // Import snippets
    if (Array.isArray(legacy.snippets)) {
      const insertSnippet = db.prepare(`
        INSERT OR IGNORE INTO snippets (id, user_id, name, trigger, content, mode, app, description, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const item of legacy.snippets) {
        insertSnippet.run(
          item.id || String(Date.now() + Math.random()),
          item.userId || defaultUserId,
          item.name || item.trigger || '',
          (item.trigger || '').toLowerCase(),
          item.content || '',
          item.mode || 'all',
          item.app || 'all',
          item.description || '',
          item.enabled !== false ? 1 : 0,
          item.createdAt || now,
          item.updatedAt || now
        );
      }
    }

    // Import meetings
    if (Array.isArray(legacy.meetings)) {
      const insertMeeting = db.prepare(`
        INSERT OR IGNORE INTO meetings (id, user_id, title, summary, action_items_json, topics_json, transcript, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of legacy.meetings) {
        insertMeeting.run(
          m.id || String(Date.now() + Math.random()),
          m.userId || defaultUserId,
          m.title || 'Meeting',
          m.summary || '',
          JSON.stringify(m.actionItems || []),
          JSON.stringify(m.topics || []),
          m.transcript || '',
          m.durationSeconds || 0,
          m.createdAt || new Date().toISOString()
        );
      }
    }

    // Import history
    if (Array.isArray(legacy.history)) {
      const insertHist = db.prepare(`
        INSERT OR IGNORE INTO history (id, user_id, raw_transcript, processed_text, duration_ms, app_name, tone, language, latency_asr_ms, latency_llm_ms, total_latency_ms, is_snippet, stt_provider, llm_provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const h of legacy.history) {
        insertHist.run(
          h.id || String(Date.now() + Math.random()),
          h.userId || defaultUserId,
          h.rawTranscript || '',
          h.processedText || '',
          h.durationMs || 0,
          h.appName || '',
          h.tone || '',
          h.language || 'en',
          h.latencyAsrMs || 0,
          h.latencyLlmMs || 0,
          h.totalLatencyMs || 0,
          h.isSnippet ? 1 : 0,
          h.sttProvider || 'groq',
          h.llmProvider || 'groq',
          h.timestamp || new Date().toISOString()
        );
      }
    }
  } catch (err) {
    console.warn('[Database] Legacy JSON migration warning:', err.message);
  }
}
