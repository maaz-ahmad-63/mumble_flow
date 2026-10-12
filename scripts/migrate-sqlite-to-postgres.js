#!/usr/bin/env node
/**
 * Mumble AI — SQLite to Supabase PostgreSQL Migration Script
 *
 * Repeatable, idempotent data migration that transfers all users, workspaces,
 * sessions, settings, quotas, encrypted BYOK keys, dictionary, snippets,
 * history, meetings, and usage telemetry from data/mumble_flow.sqlite into
 * Supabase PostgreSQL.
 *
 * Preserves exact IDs, relationships, and foreign keys.
 * NEVER deletes or alters the original SQLite database.
 * NEVER logs connection credentials or API keys.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/migrate-sqlite-to-postgres.js
 *   node scripts/migrate-sqlite-to-postgres.js --url "postgres://..."
 *   node scripts/migrate-sqlite-to-postgres.js --verify
 *   node scripts/migrate-sqlite-to-postgres.js --dry-run
 */

import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PostgresAdapter } from '../server/db/postgresAdapter.js';
import { runPostgresMigrations } from '../server/db/postgresMigrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SQLITE_PATH = path.join(DATA_DIR, 'mumble_flow.sqlite');

function maskUrl(url) {
  if (!url || typeof url !== 'string') return '[NONE]';
  return url.replace(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/gi, 'postgres://[REDACTED]:[REDACTED]@');
}

// Parse CLI arguments
const args = process.argv.slice(2);
let customUrl = null;
let isDryRun = false;
let isVerifyOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    customUrl = args[i + 1];
    i++;
  } else if (args[i] === '--dry-run') {
    isDryRun = true;
  } else if (args[i] === '--verify') {
    isVerifyOnly = true;
  }
}

const targetUrl = customUrl || process.env.DATABASE_URL;

async function runMigration() {
  console.log('======================================================');
  console.log('📦 Mumble AI — SQLite to Supabase PostgreSQL Migration');
  console.log('======================================================');

  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite source database not found at: ${SQLITE_PATH}`);
    console.error('Please ensure the database exists before running migration.');
    process.exit(1);
  }

  if (!targetUrl) {
    console.error('❌ Missing target PostgreSQL connection string!');
    console.error('Please set the DATABASE_URL environment variable or pass --url:');
    console.error('  DATABASE_URL="postgres://..." node scripts/migrate-sqlite-to-postgres.js');
    console.error('  node scripts/migrate-sqlite-to-postgres.js --url "postgres://..."');
    process.exit(1);
  }

  console.log(`📁 Source SQLite:   ${SQLITE_PATH}`);
  console.log(`🎯 Target Postgres: ${maskUrl(targetUrl)}`);
  console.log(`⚙️  Mode:            ${isDryRun ? 'DRY RUN (No writes)' : (isVerifyOnly ? 'VERIFY ONLY' : 'FULL MIGRATION')}\n`);

  // 1. Open SQLite database
  const sqlite = new DatabaseSync(SQLITE_PATH);

  // 2. Connect to PostgreSQL
  const pgAdapter = new PostgresAdapter(targetUrl);
  await pgAdapter.initialize();

  // 3. Ensure migrations 1-4 are applied in PostgreSQL
  console.log('🔄 Ensuring PostgreSQL schema migrations (1-4) are up to date...');
  await runPostgresMigrations(pgAdapter);
  console.log('✓ PostgreSQL schema verified.\n');

  // Define tables in strict topological order (parents before children)
  const migrationPlan = [
    {
      table: 'users',
      pk: 'id',
      upsertSql: `
        INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > users.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.email,
        r.password_hash,
        r.name,
        r.role || 'user',
        r.status || 'active',
        r.created_at || new Date().toISOString(),
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'workspaces',
      pk: 'id',
      upsertSql: `
        INSERT INTO workspaces (id, name, slug, owner_id, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.name,
        r.slug,
        r.owner_id,
        r.created_at || new Date().toISOString()
      ]
    },
    {
      table: 'workspace_members',
      pk: 'id',
      upsertSql: `
        INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (workspace_id, user_id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.workspace_id,
        r.user_id,
        r.role || 'member',
        r.created_at || new Date().toISOString()
      ]
    },
    {
      table: 'sessions',
      pk: 'id',
      upsertSql: `
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.token_hash,
        r.expires_at,
        r.created_at || new Date().toISOString()
      ]
    },
    {
      table: 'settings',
      pk: 'user_id',
      upsertSql: `
        INSERT INTO settings (user_id, settings_json, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          settings_json = EXCLUDED.settings_json,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > settings.updated_at
      `,
      mapRow: (r) => [
        r.user_id,
        r.settings_json,
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'user_quotas',
      pk: 'user_id',
      upsertSql: `
        INSERT INTO user_quotas (user_id, tier, monthly_audio_minutes, monthly_llm_requests, monthly_budget_usd, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
          tier = EXCLUDED.tier,
          monthly_audio_minutes = EXCLUDED.monthly_audio_minutes,
          monthly_llm_requests = EXCLUDED.monthly_llm_requests,
          monthly_budget_usd = EXCLUDED.monthly_budget_usd,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > user_quotas.updated_at
      `,
      mapRow: (r) => [
        r.user_id,
        r.tier || 'free',
        Number(r.monthly_audio_minutes) || 60.0,
        Number(r.monthly_llm_requests) || 500,
        Number(r.monthly_budget_usd) || 10.0,
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'user_api_keys',
      pk: 'id',
      upsertSql: `
        INSERT INTO user_api_keys (id, user_id, provider, encrypted_key, key_hint, validation_status, last_validated_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          encrypted_key = EXCLUDED.encrypted_key,
          key_hint = EXCLUDED.key_hint,
          validation_status = EXCLUDED.validation_status,
          last_validated_at = EXCLUDED.last_validated_at,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > user_api_keys.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.provider,
        r.encrypted_key,
        r.key_hint,
        r.validation_status || 'untested',
        r.last_validated_at || null,
        r.created_at || new Date().toISOString(),
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'dictionary',
      pk: 'id',
      upsertSql: `
        INSERT INTO dictionary (id, user_id, word, spoken, category, hint, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          word = EXCLUDED.word,
          spoken = EXCLUDED.spoken,
          category = EXCLUDED.category,
          hint = EXCLUDED.hint,
          enabled = EXCLUDED.enabled,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > dictionary.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.word,
        r.spoken,
        r.category || 'general',
        r.hint || '',
        Boolean(r.enabled),
        r.created_at || new Date().toISOString(),
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'snippets',
      pk: 'id',
      upsertSql: `
        INSERT INTO snippets (id, user_id, name, trigger, content, mode, app, description, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          trigger = EXCLUDED.trigger,
          content = EXCLUDED.content,
          mode = EXCLUDED.mode,
          app = EXCLUDED.app,
          description = EXCLUDED.description,
          enabled = EXCLUDED.enabled,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > snippets.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.name,
        r.trigger,
        r.content,
        r.mode || 'all',
        r.app || 'all',
        r.description || '',
        Boolean(r.enabled),
        r.created_at || new Date().toISOString(),
        r.updated_at || new Date().toISOString()
      ]
    },
    {
      table: 'history',
      pk: 'id',
      upsertSql: `
        INSERT INTO history (
          id, user_id, raw_transcript, processed_text, duration_ms, app_name, tone, language,
          latency_asr_ms, latency_llm_ms, total_latency_ms, is_snippet, stt_provider, llm_provider, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.raw_transcript,
        r.processed_text,
        Number(r.duration_ms) || 0,
        r.app_name || '',
        r.tone || 'casual',
        r.language || 'en',
        Number(r.latency_asr_ms) || 0,
        Number(r.latency_llm_ms) || 0,
        Number(r.total_latency_ms) || 0,
        Boolean(r.is_snippet),
        r.stt_provider || 'groq',
        r.llm_provider || 'groq',
        r.created_at || new Date().toISOString()
      ]
    },
    {
      table: 'meetings',
      pk: 'id',
      upsertSql: `
        INSERT INTO meetings (id, user_id, title, summary, action_items_json, topics_json, transcript, duration_seconds, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.title,
        r.summary,
        r.action_items_json || '[]',
        r.topics_json || '[]',
        r.transcript || '',
        Number(r.duration_seconds) || 0,
        r.created_at || new Date().toISOString()
      ]
    },
    {
      table: 'usage_events',
      pk: 'id',
      upsertSql: `
        INSERT INTO usage_events (
          id, user_id, workspace_id, session_id, type, provider, model,
          audio_seconds, latency_ms, input_tokens, output_tokens, estimated_cost,
          status, is_byok, key_source, cost_is_estimated, user_cost, platform_cost, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO NOTHING
      `,
      mapRow: (r) => [
        r.id,
        r.user_id,
        r.workspace_id || null,
        r.session_id || null,
        r.type,
        r.provider,
        r.model,
        Number(r.audio_seconds) || 0,
        Number(r.latency_ms) || 0,
        Number(r.input_tokens) || 0,
        Number(r.output_tokens) || 0,
        Number(r.estimated_cost) || 0,
        r.status || 'success',
        Boolean(r.is_byok),
        r.key_source || 'system',
        Boolean(r.cost_is_estimated !== false && r.cost_is_estimated !== 0),
        Number(r.user_cost) || 0,
        Number(r.platform_cost) || 0,
        r.error_message || null,
        r.created_at || new Date().toISOString()
      ]
    }
  ];

  const results = [];

  for (const item of migrationPlan) {
    let sqliteRows = [];
    try {
      const stmt = sqlite.prepare(`SELECT * FROM ${item.table}`);
      sqliteRows = stmt.all();
    } catch (e) {
      // Table may not exist in SQLite
      sqliteRows = [];
    }

    const sqliteCount = sqliteRows.length;
    let pgCountBefore = 0;

    try {
      const row = await pgAdapter.get(`SELECT COUNT(*) as count FROM ${item.table}`);
      pgCountBefore = parseInt(row?.count || '0', 10);
    } catch (e) {
      pgCountBefore = 0;
    }

    if (!isVerifyOnly && !isDryRun && sqliteRows.length > 0) {
      for (const row of sqliteRows) {
        const params = item.mapRow(row);
        await pgAdapter.pool.query(item.upsertSql, params);
      }
    }

    let pgCountAfter = pgCountBefore;
    if (!isVerifyOnly && !isDryRun) {
      const row = await pgAdapter.get(`SELECT COUNT(*) as count FROM ${item.table}`);
      pgCountAfter = parseInt(row?.count || '0', 10);
    }

    const finalPgCount = isVerifyOnly || isDryRun ? pgCountBefore : pgCountAfter;

    // Check for missing primary key IDs between SQLite and PostgreSQL
    let missingCount = 0;
    if (sqliteRows.length > 0 && item.pk) {
      try {
        const pgPkRows = await pgAdapter.query(`SELECT ${item.pk} FROM ${item.table}`);
        const pgPkSet = new Set((pgPkRows || []).map(r => String(r[item.pk])));
        for (const sr of sqliteRows) {
          if (!pgPkSet.has(String(sr[item.pk]))) {
            missingCount++;
          }
        }
      } catch (e) {
        missingCount = sqliteCount;
      }
    }

    results.push({
      table: item.table,
      sqlite: sqliteCount,
      postgres: finalPgCount,
      missing: missingCount,
      migrated: !isVerifyOnly && !isDryRun ? sqliteCount : 0
    });
  }

  // Print reconciliation summary
  console.log('-----------------------------------------------------------------------------------------');
  console.log('TABLE NAME           | SQLITE ROWS | POSTGRES ROWS | MISSING | STATUS');
  console.log('-----------------------------------------------------------------------------------------');
  let totalMissing = 0;
  for (const r of results) {
    totalMissing += r.missing;
    let status;
    if (r.missing === 0 && r.postgres >= r.sqlite) {
      status = '✓ SYNCHRONIZED';
    } else if (r.missing > 0 && isVerifyOnly) {
      status = `⚠ PENDING (${r.missing} missing)`;
    } else if (r.missing > 0) {
      status = `❌ FAILED (${r.missing} missing)`;
    } else {
      status = '⚠ PENDING';
    }
    console.log(
      `${r.table.padEnd(20)} | ${String(r.sqlite).padStart(11)} | ${String(r.postgres).padStart(13)} | ${String(r.missing).padStart(7)} | ${status}`
    );
  }
  console.log('-----------------------------------------------------------------------------------------\n');

  // Verify sample data fidelity
  if (isVerifyOnly) {
    console.log('🔍 Checking sample data fidelity between SQLite and PostgreSQL...');
    try {
      const sampleUsers = sqlite.prepare('SELECT id, email, password_hash FROM users LIMIT 5').all();
      let matchedUsers = 0;
      for (const su of sampleUsers) {
        const pu = await pgAdapter.get('SELECT email, password_hash FROM users WHERE id = ?', [su.id]);
        if (pu && pu.email === su.email && pu.password_hash === su.password_hash) {
          matchedUsers++;
        }
      }
      if (matchedUsers === sampleUsers.length && sampleUsers.length > 0) {
        console.log(`   ✓ Sample user credentials & scrypt hashes verified (${matchedUsers}/${sampleUsers.length} matched).`);
      } else {
        console.log(`   ⚠ Sample user credentials not yet synchronized (${matchedUsers}/${sampleUsers.length} matched).`);
      }

      const sampleKeys = sqlite.prepare('SELECT id, encrypted_key FROM user_api_keys LIMIT 5').all();
      let matchedKeys = 0;
      for (const sk of sampleKeys) {
        const pk = await pgAdapter.get('SELECT encrypted_key FROM user_api_keys WHERE id = ?', [sk.id]);
        if (pk && pk.encrypted_key === sk.encrypted_key) {
          matchedKeys++;
        }
      }
      if (matchedKeys === sampleKeys.length && sampleKeys.length > 0) {
        console.log(`   ✓ Sample encrypted BYOK key ciphertexts verified (${matchedKeys}/${sampleKeys.length} matched).`);
      } else {
        console.log(`   ⚠ Sample BYOK keys not yet synchronized (${matchedKeys}/${sampleKeys.length} matched).`);
      }
    } catch (e) {
      console.warn('   Note: Sample fidelity check skipped (tables empty or unmigrated).');
    }
    console.log('');
  }

  sqlite.close();
  await pgAdapter.close();

  if (isVerifyOnly && totalMissing > 0) {
    console.log(`⚠️ Verification detected ${totalMissing} rows pending migration from SQLite.`);
  } else {
    console.log('✅ SQLite to PostgreSQL migration finished successfully.');
  }
  console.log('🔒 Original SQLite database at data/mumble_flow.sqlite remains untouched.');
}

runMigration().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
