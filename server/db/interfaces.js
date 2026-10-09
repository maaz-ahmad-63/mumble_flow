/**
 * Database Adapter Interface
 * Provides unified interface for SQLite (desktop/self-hosted) and PostgreSQL (cloud SaaS).
 */

export class IDatabaseAdapter {
  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  async close() {
    throw new Error('close() must be implemented');
  }

  // Generic query execution
  query(sql, params = []) {
    throw new Error('query() must be implemented');
  }

  get(sql, params = []) {
    throw new Error('get() must be implemented');
  }

  run(sql, params = []) {
    throw new Error('run() must be implemented');
  }

  transaction(callback) {
    throw new Error('transaction() must be implemented');
  }
}
