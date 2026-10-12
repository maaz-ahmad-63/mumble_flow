/**
 * Mumble AI — PostgreSQL Migrations (Supabase & Cloud Compatible)
 * Preserves exact schema, indexes, constraints, and relationships from SQLite migrations 1–4.
 */

export const POSTGRES_MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      // 1. Schema migrations tracker
      await db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 2. Users table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(128) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'user',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 3. Sessions table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash VARCHAR(128) UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 4. Workspaces table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id VARCHAR(128) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          owner_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 5. Workspace members
      await db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_members (
          id VARCHAR(128) PRIMARY KEY,
          workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(32) NOT NULL DEFAULT 'member',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id)
        );
      `);

      // 6. Settings table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          settings_json TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 7. Dictionary table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS dictionary (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          word TEXT NOT NULL,
          spoken TEXT NOT NULL,
          category VARCHAR(64) DEFAULT 'general',
          hint TEXT DEFAULT '',
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_dict_user ON dictionary(user_id);
      `);

      // 8. Snippets table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS snippets (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          trigger VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          mode VARCHAR(64) DEFAULT 'all',
          app VARCHAR(64) DEFAULT 'all',
          description TEXT DEFAULT '',
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
      `);

      // 9. History table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          raw_transcript TEXT NOT NULL,
          processed_text TEXT NOT NULL,
          duration_ms INTEGER DEFAULT 0,
          app_name VARCHAR(128),
          tone VARCHAR(64),
          language VARCHAR(32),
          latency_asr_ms INTEGER,
          latency_llm_ms INTEGER,
          total_latency_ms INTEGER,
          is_snippet BOOLEAN DEFAULT FALSE,
          stt_provider VARCHAR(64),
          llm_provider VARCHAR(64),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
      `);

      // 10. Meetings table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS meetings (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          summary TEXT NOT NULL,
          action_items_json TEXT,
          topics_json TEXT,
          transcript TEXT NOT NULL,
          duration_seconds INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
      `);

      // 11. Usage events table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          workspace_id VARCHAR(128),
          session_id VARCHAR(128),
          type VARCHAR(64) NOT NULL,
          provider VARCHAR(64) NOT NULL,
          model VARCHAR(128) NOT NULL,
          audio_seconds DOUBLE PRECISION DEFAULT 0.0,
          latency_ms INTEGER DEFAULT 0,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          estimated_cost DOUBLE PRECISION DEFAULT 0.0,
          status VARCHAR(32) NOT NULL DEFAULT 'success',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id);
      `);

      // 12. User quotas table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_quotas (
          user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          tier VARCHAR(32) NOT NULL DEFAULT 'free',
          monthly_audio_minutes DOUBLE PRECISION NOT NULL DEFAULT 60.0,
          monthly_llm_requests INTEGER NOT NULL DEFAULT 500,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }
  },
  {
    version: 2,
    name: 'add_user_status_and_admin_support',
    up: async (db) => {
      await db.exec(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
        UPDATE users SET status = 'active' WHERE status IS NULL;
        UPDATE users SET role = 'admin' WHERE id = 'default_user';
      `);
    }
  },
  {
    version: 3,
    name: 'add_user_api_keys_table',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider VARCHAR(64) NOT NULL,
          encrypted_key TEXT NOT NULL,
          key_hint VARCHAR(64) NOT NULL,
          validation_status VARCHAR(32) DEFAULT 'untested',
          last_validated_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON user_api_keys(user_id, provider);
      `);
    }
  },
  {
    version: 4,
    name: 'add_usage_byok_and_failure_tracking',
    up: async (db) => {
      await db.exec(`
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS is_byok BOOLEAN DEFAULT FALSE;
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS key_source VARCHAR(64) DEFAULT 'system';
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS cost_is_estimated BOOLEAN DEFAULT TRUE;
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS user_cost DOUBLE PRECISION DEFAULT 0.0;
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS platform_cost DOUBLE PRECISION DEFAULT 0.0;
        ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS error_message TEXT;

        ALTER TABLE user_quotas ADD COLUMN IF NOT EXISTS monthly_budget_usd DOUBLE PRECISION DEFAULT 10.0;

        UPDATE usage_events
        SET user_cost = COALESCE(estimated_cost, 0.0),
            platform_cost = CASE WHEN is_byok = TRUE THEN 0.0 ELSE COALESCE(estimated_cost, 0.0) END
        WHERE user_cost IS NULL OR user_cost = 0.0;

        CREATE INDEX IF NOT EXISTS idx_usage_user_status ON usage_events(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_usage_byok ON usage_events(is_byok);
      `);
    }
  }
];

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

/**
 * Seeds initial default records in PostgreSQL if absent
 */
export async function seedPostgresDefaultData(db) {
  const defaultUserId = 'default_user';

  // Ensure default user exists
  await db.run(`
    INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [defaultUserId, 'local@mumbleflow.internal', 'LOCAL_DEV_USER', 'Local User', 'admin', 'active']);

  // Ensure default workspace exists
  await db.run(`
    INSERT INTO workspaces (id, name, slug, owner_id, created_at)
    VALUES (?, ?, ?, ?, NOW())
    ON CONFLICT (id) DO NOTHING
  `, ['ws_default', 'Personal Workspace', 'personal', defaultUserId]);

  // Ensure default workspace member exists
  await db.run(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, NOW())
    ON CONFLICT (workspace_id, user_id) DO NOTHING
  `, ['wm_default', 'ws_default', defaultUserId, 'owner']);

  // Ensure default quotas exist
  await db.run(`
    INSERT INTO user_quotas (user_id, tier, monthly_audio_minutes, monthly_llm_requests, monthly_budget_usd, updated_at)
    VALUES (?, 'free', 60.0, 500, 10.0, NOW())
    ON CONFLICT (user_id) DO NOTHING
  `, [defaultUserId]);

  // Seed default dictionary entries
  for (const item of DEFAULT_DICTIONARY) {
    await db.run(`
      INSERT INTO dictionary (id, user_id, word, spoken, category, hint, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [item.id, defaultUserId, item.word, item.spoken, item.category, item.hint, true]);
  }

  // Seed default snippets
  for (const s of DEFAULT_SNIPPETS) {
    await db.run(`
      INSERT INTO snippets (id, user_id, name, trigger, content, mode, app, description, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [s.id, defaultUserId, s.name, s.trigger, s.content, s.mode, s.app, s.description, true]);
  }
}

/**
 * Runs all pending PostgreSQL migrations
 */
export async function runPostgresMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await db.query('SELECT version FROM schema_migrations ORDER BY version ASC');
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  for (const migration of POSTGRES_MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[PostgreSQL] Applying migration ${migration.version}: ${migration.name}`);
      await migration.up(db);
      await db.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, NOW())',
        [migration.version, migration.name]
      );
    }
  }

  await seedPostgresDefaultData(db);
}
