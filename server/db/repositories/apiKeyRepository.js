/**
 * Mumble AI — API Key Repository
 *
 * Scoped data access for encrypted user-supplied API keys (BYOK).
 * Strictly protects credentials and prevents cross-user exposure.
 */

import { db } from '../index.js';

export class ApiKeyRepository {
  constructor(adapter = db) {
    this.db = adapter;
  }

  saveKey({ id, userId, provider, encryptedKey, keyHint, validationStatus = 'untested' }) {
    const now = new Date().toISOString();
    const p = provider.toLowerCase().trim();

    const res = this.db.run(
      `INSERT INTO user_api_keys (id, user_id, provider, encrypted_key, key_hint, validation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         encrypted_key = excluded.encrypted_key,
         key_hint = excluded.key_hint,
         validation_status = excluded.validation_status,
         updated_at = excluded.updated_at`,
      [id, userId, p, encryptedKey, keyHint, validationStatus, now, now]
    );

    if (res instanceof Promise) {
      return res.then(() => this.findKey(userId, p));
    }
    return this.findKey(userId, p);
  }

  findKey(userId, provider) {
    const p = provider.toLowerCase().trim();
    return this.db.get(
      'SELECT id, user_id, provider, encrypted_key, key_hint, validation_status, last_validated_at, created_at, updated_at FROM user_api_keys WHERE user_id = ? AND provider = ?',
      [userId, p]
    );
  }

  deleteKey(userId, provider) {
    const p = provider.toLowerCase().trim();
    return this.db.run(
      'DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?',
      [userId, p]
    );
  }

  updateValidationStatus(userId, provider, status) {
    const now = new Date().toISOString();
    const p = provider.toLowerCase().trim();
    return this.db.run(
      'UPDATE user_api_keys SET validation_status = ?, last_validated_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?',
      [status, now, now, userId, p]
    );
  }

  /**
   * Return safe key metadata list for a user.
   * Strips encrypted_key so secrets are never returned.
   */
  findByUser(userId) {
    const rows = this.db.query(
      'SELECT id, user_id, provider, key_hint, validation_status, last_validated_at, created_at, updated_at FROM user_api_keys WHERE user_id = ? ORDER BY provider ASC',
      [userId]
    );
    const mapRows = (list) => (list || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      provider: r.provider,
      keyHint: r.key_hint,
      validationStatus: r.validation_status || 'untested',
      lastValidatedAt: r.last_validated_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    if (rows instanceof Promise) {
      return rows.then(mapRows);
    }
    return mapRows(rows);
  }
}

export const apiKeyRepository = new ApiKeyRepository();
