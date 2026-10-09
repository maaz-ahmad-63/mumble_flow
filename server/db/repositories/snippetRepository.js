import { sqliteAdapter } from '../sqliteAdapter.js';

export class SnippetRepository {
  constructor(adapter = sqliteAdapter) {
    this.db = adapter;
  }

  findByUser(userId) {
    const rows = this.db.query(
      `SELECT id, user_id as userId, name, trigger, content, mode, app, description, enabled, created_at as createdAt, updated_at as updatedAt
       FROM snippets
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => ({ ...r, enabled: Boolean(r.enabled) }));
  }

  findById(id, userId) {
    const row = this.db.get(
      `SELECT id, user_id as userId, name, trigger, content, mode, app, description, enabled, created_at as createdAt, updated_at as updatedAt
       FROM snippets
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) };
  }

  insert({ id, userId, name, trigger, content, mode = 'all', app = 'all', description = '', enabled = true }) {
    const entryId = id || `snip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO snippets (id, user_id, name, trigger, content, mode, app, description, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entryId, userId, name || trigger, trigger.toLowerCase().trim(), content, mode, app, description, enabled ? 1 : 0, now, now]
    );
    return this.findById(entryId, userId);
  }

  update(id, userId, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.trigger !== undefined) {
      fields.push('trigger = ?');
      values.push(updates.trigger.toLowerCase().trim());
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.mode !== undefined) {
      fields.push('mode = ?');
      values.push(updates.mode);
    }
    if (updates.app !== undefined) {
      fields.push('app = ?');
      values.push(updates.app);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    if (fields.length === 0) return this.findById(id, userId);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    values.push(userId);

    this.db.run(`UPDATE snippets SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    return this.findById(id, userId);
  }

  delete(id, userId) {
    this.db.run('DELETE FROM snippets WHERE id = ? AND user_id = ?', [id, userId]);
  }
}

export const snippetRepository = new SnippetRepository();
