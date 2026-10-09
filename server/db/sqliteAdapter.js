import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { IDatabaseAdapter } from './interfaces.js';
import { runMigrations, importLegacyJsonStore } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export class SqliteAdapter extends IDatabaseAdapter {
  constructor(dbPath) {
    super();
    this.dbPath = dbPath || path.join(DATA_DIR, 'mumble_flow.sqlite');
    this.db = null;
  }

  async initialize() {
    if (this.db) return this.db;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);

    // Enable WAL (Write-Ahead Logging) mode and foreign keys for high concurrency and performance
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Run migrations
    runMigrations(this.db);

    // Import existing legacy JSON store if needed
    const legacyPath = path.join(DATA_DIR, 'whisperflow_store.json');
    importLegacyJsonStore(this.db, legacyPath);

    return this.db;
  }

  getNativeDb() {
    if (!this.db) {
      this.initialize();
    }
    return this.db;
  }

  query(sql, params = []) {
    const db = this.getNativeDb();
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  get(sql, params = []) {
    const db = this.getNativeDb();
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  }

  run(sql, params = []) {
    const db = this.getNativeDb();
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  }

  transaction(callback) {
    const db = this.getNativeDb();
    db.exec('BEGIN TRANSACTION');
    try {
      const result = callback(this);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const sqliteAdapter = new SqliteAdapter();
