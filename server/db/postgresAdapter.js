/**
 * Mumble AI — PostgreSQL Database Adapter (Supabase & Cloud Compatible)
 *
 * Safe connection pool, SSL support, parameter translation (? -> $n),
 * versioned migrations runner, transaction support, and credential masking.
 */

import pg from 'pg';
import fs from 'fs';
import { IDatabaseAdapter } from './interfaces.js';
import { runPostgresMigrations } from './postgresMigrations.js';

const { Pool } = pg;

/**
 * Strips sensitive passwords/credentials from error messages before logging
 */
export function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') return message;
  return message
    .replace(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/gi, 'postgres://[REDACTED]:[REDACTED]@')
    .replace(/password=['"][^'"]+['"]/gi, 'password=[REDACTED]');
}

/**
 * Wraps row in a Proxy that allows case-insensitive access to column properties.
 * This ensures queries aliased in camelCase (e.g. as totalAudioSeconds, as userId)
 * work transparently even though PostgreSQL defaults to lowercase unquoted identifiers.
 */
export function wrapRow(row) {
  if (!row || typeof row !== 'object') return row;
  return new Proxy(row, {
    get(target, prop) {
      if (typeof prop === 'string') {
        if (prop in target) return target[prop];
        const lower = prop.toLowerCase();
        if (lower in target) return target[lower];
      }
      return target[prop];
    }
  });
}

export class PostgresAdapter extends IDatabaseAdapter {
  constructor(connectionString, options = {}) {
    super();
    this.connectionString = connectionString || process.env.DATABASE_URL;
    this.options = options;
    this.pool = null;
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Translate positional '?' placeholders into PostgreSQL '$1', '$2', ... placeholders
   */
  translateSql(sql) {
    if (!sql || typeof sql !== 'string') return sql;

    let paramIndex = 0;
    // Replace '?' outside of string literals
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let result = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const prevChar = i > 0 ? sql[i - 1] : null;

      if (char === "'" && prevChar !== '\\') {
        inSingleQuote = !inSingleQuote;
        result += char;
      } else if (char === '"' && prevChar !== '\\') {
        inDoubleQuote = !inDoubleQuote;
        result += char;
      } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
        paramIndex++;
        result += `$${paramIndex}`;
      } else {
        result += char;
      }
    }

    return result;
  }

  /**
   * Safe parameter normalization for PostgreSQL
   */
  normalizeParams(params) {
    if (!Array.isArray(params)) return [];
    return params.map(val => {
      if (val === undefined) return null;
      return val;
    });
  }

  /**
   * Initialize safe connection pool with SSL and run migrations
   */
  async initialize() {
    if (this.initialized && this.pool) {
      return this;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const connStr = this.connectionString || process.env.DATABASE_URL;
      if (!connStr) {
        throw new Error('PostgresAdapter requires a valid DATABASE_URL');
      }
      this.connectionString = connStr;

      const isLocal = connStr.includes('localhost') ||
                      connStr.includes('127.0.0.1') ||
                      connStr.includes('sslmode=disable');

      let ssl = false;
      if (!isLocal) {
        const rejectUnauthorizedEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
        const rejectUnauthorized = rejectUnauthorizedEnv !== undefined
          ? rejectUnauthorizedEnv === 'true'
          : false;

        ssl = { rejectUnauthorized };

        const caEnv = process.env.DATABASE_SSL_CA;
        if (caEnv) {
          try {
            const caCert = fs.existsSync(caEnv) ? fs.readFileSync(caEnv, 'utf8') : caEnv;
            ssl.ca = caCert;
            if (rejectUnauthorizedEnv === undefined) {
              ssl.rejectUnauthorized = true;
            }
          } catch (e) {
            console.warn('[PostgreSQL SSL] Failed to read DATABASE_SSL_CA:', sanitizeErrorMessage(e.message));
          }
        }
      }

      const poolConfig = {
        connectionString: connStr,
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl,
        ...this.options
      };

      try {
        this.pool = new Pool(poolConfig);

        // Handle unexpected pool errors gracefully
        this.pool.on('error', (err) => {
          console.error('[PostgreSQL Pool Error]', sanitizeErrorMessage(err?.message));
        });

        // Test pool connectivity
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }

        this.initialized = true;

        // Run pending migrations
        await runPostgresMigrations(this);

        return this;
      } catch (err) {
        let msg = sanitizeErrorMessage(err.message);
        if (err.code === 'ENETUNREACH' || (msg && msg.includes('ENETUNREACH'))) {
          msg += ' (Hint: If connecting to Supabase from an IPv4-only environment like Render, use the Supabase Session Pooler or Transaction Pooler URI at *.pooler.supabase.com:5432 or :6543 instead of the direct db.*.supabase.co host)';
        }
        const safeErr = new Error(`PostgreSQL initialization failed: ${msg}`);
        safeErr.code = err.code;
        throw safeErr;
      }
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  getNativeDb() {
    return this.pool;
  }

  async query(sql, params = []) {
    if (!this.pool) await this.initialize();
    const translatedSql = this.translateSql(sql);
    const safeParams = this.normalizeParams(params);

    try {
      const res = await this.pool.query(translatedSql, safeParams);
      return (res.rows || []).map(wrapRow);
    } catch (err) {
      throw new Error(`[PostgreSQL Query Error]: ${sanitizeErrorMessage(err.message)}`);
    }
  }

  async get(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async run(sql, params = []) {
    if (!this.pool) await this.initialize();
    const translatedSql = this.translateSql(sql);
    const safeParams = this.normalizeParams(params);

    try {
      const res = await this.pool.query(translatedSql, safeParams);
      return {
        rowCount: res.rowCount,
        rows: (res.rows || []).map(wrapRow)
      };
    } catch (err) {
      throw new Error(`[PostgreSQL Run Error]: ${sanitizeErrorMessage(err.message)}`);
    }
  }

  async exec(sql) {
    if (!this.pool) await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query(sql);
    } catch (err) {
      throw new Error(`[PostgreSQL Exec Error]: ${sanitizeErrorMessage(err.message)}`);
    } finally {
      client.release();
    }
  }

  async transaction(callback) {
    if (!this.pool) await this.initialize();
    const client = await this.pool.connect();

    const txAdapter = {
      query: async (sql, params = []) => {
        const translatedSql = this.translateSql(sql);
        const res = await client.query(translatedSql, this.normalizeParams(params));
        return (res.rows || []).map(wrapRow);
      },
      get: async (sql, params = []) => {
        const translatedSql = this.translateSql(sql);
        const res = await client.query(translatedSql, this.normalizeParams(params));
        return res.rows && res.rows.length > 0 ? res.rows[0] : null;
      },
      run: async (sql, params = []) => {
        const translatedSql = this.translateSql(sql);
        const res = await client.query(translatedSql, this.normalizeParams(params));
        return { rowCount: res.rowCount, rows: res.rows };
      },
      exec: async (sql) => {
        await client.query(sql);
      }
    };

    try {
      await client.query('BEGIN');
      const result = await callback(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {}
      throw new Error(`[PostgreSQL Transaction Error]: ${sanitizeErrorMessage(err.message)}`);
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
    }
  }
}

export const postgresAdapter = new PostgresAdapter();
