/**
 * Mumble AI — Unified Database Factory
 * Automatically selects PostgreSQL (Supabase) when DATABASE_URL is defined,
 * or falls back to local SQLite (mumble_flow.sqlite) for offline development & tests.
 */

import { sqliteAdapter } from './sqliteAdapter.js';
import { postgresAdapter } from './postgresAdapter.js';

export function isPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

export function isSqlite() {
  return !process.env.DATABASE_URL;
}

export function getDatabaseAdapter() {
  if (isPostgres()) {
    return postgresAdapter;
  }
  return sqliteAdapter;
}

export async function initializeDatabase() {
  const adapter = getDatabaseAdapter();
  await adapter.initialize();
  return adapter;
}

// Default export of active database adapter
export const db = getDatabaseAdapter();

export { sqliteAdapter, postgresAdapter };
