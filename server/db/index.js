/**
 * Mumble AI — Unified Database Factory
 * Automatically selects PostgreSQL (Supabase) when DATABASE_URL is defined,
 * or falls back to local SQLite (mumble_flow.sqlite) for offline development & tests.
 */

import { sqliteAdapter } from './sqliteAdapter.js';
import { postgresAdapter } from './postgresAdapter.js';

export function isPostgres() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

export function isSqlite() {
  return !isPostgres();
}

export function getDatabaseAdapter() {
  if (isPostgres()) {
    return postgresAdapter;
  }
  return sqliteAdapter;
}

export async function initializeDatabase() {
  const isPg = isPostgres();
  const dbType = isPg ? 'PostgreSQL' : 'SQLite';

  // Log selected database engine without exposing connection credentials
  console.log(`[Database] Selected database engine: ${dbType}${isPg ? ' (Cloud / Render)' : ' (local development)'}`);

  const adapter = getDatabaseAdapter();
  try {
    await adapter.initialize();
    console.log(`[Database] ${dbType} database engine initialized successfully.`);
    return adapter;
  } catch (err) {
    if (isPg) {
      console.error(`[Database Error] PostgreSQL initialization failed: ${err.message}`);
      // Fail clearly if PostgreSQL initialization fails; do not silently fall back to SQLite in production.
      throw err;
    }
    console.error(`[Database Error] SQLite initialization failed: ${err.message}`);
    throw err;
  }
}

// Default export of active database adapter
export const db = getDatabaseAdapter();

export { sqliteAdapter, postgresAdapter };
