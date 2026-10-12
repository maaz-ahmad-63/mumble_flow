import { db } from '../index.js';

export class DictionaryRepository {
  constructor(adapter = db) {
    this.db = adapter;
  }

  findByUser(userId) {
    const rows = this.db.query(
      `SELECT id, user_id as userId, word, spoken, category, hint, enabled, created_at as createdAt, updated_at as updatedAt
       FROM dictionary
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    const mapRows = (list) => (list || []).map(r => ({ ...r, enabled: Boolean(r.enabled) }));
    if (rows instanceof Promise) {
      return rows.then(mapRows).catch(() => []);
    }
    return mapRows(rows);
  }

  findById(id, userId) {
    const row = this.db.get(
      `SELECT id, user_id as userId, word, spoken, category, hint, enabled, created_at as createdAt, updated_at as updatedAt
       FROM dictionary
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    const mapRow = (r) => (!r ? null : { ...r, enabled: Boolean(r.enabled) });
    if (row instanceof Promise) {
      return row.then(mapRow).catch(() => null);
    }
    return mapRow(row);
  }

  insert({ id, userId, word, spoken, category = 'general', hint = '', enabled = true }) {
    const entryId = id || `dict_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const res = this.db.run(
      `INSERT INTO dictionary (id, user_id, word, spoken, category, hint, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entryId, userId, word, spoken || word, category, hint, Boolean(enabled), now, now]
    );
    if (res instanceof Promise) {
      return res.then(() => this.findById(entryId, userId));
    }
    return this.findById(entryId, userId);
  }

  update(id, userId, updates) {
    const fields = [];
    const values = [];

    if (updates.word !== undefined) {
      fields.push('word = ?');
      values.push(updates.word);
    }
    if (updates.spoken !== undefined) {
      fields.push('spoken = ?');
      values.push(updates.spoken);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.hint !== undefined) {
      fields.push('hint = ?');
      values.push(updates.hint);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(Boolean(updates.enabled));
    }

    if (fields.length === 0) return this.findById(id, userId);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    values.push(userId);

    const res = this.db.run(`UPDATE dictionary SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    if (res instanceof Promise) {
      return res.then(() => this.findById(id, userId));
    }
    return this.findById(id, userId);
  }

  delete(id, userId) {
    return this.db.run('DELETE FROM dictionary WHERE id = ? AND user_id = ?', [id, userId]);
  }
}

export const dictionaryRepository = new DictionaryRepository();
