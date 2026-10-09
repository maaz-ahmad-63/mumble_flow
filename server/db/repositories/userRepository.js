import { sqliteAdapter } from '../sqliteAdapter.js';

export class UserRepository {
  constructor(adapter = sqliteAdapter) {
    this.db = adapter;
  }

  findById(id) {
    return this.db.get('SELECT id, email, name, role, COALESCE(status, \'active\') as status, created_at, updated_at FROM users WHERE id = ?', [id]);
  }

  findByEmail(email) {
    if (!email) return null;
    return this.db.get('SELECT id, email, password_hash, name, role, COALESCE(status, \'active\') as status, created_at, updated_at FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  }

  create({ id, email, passwordHash, name, role = 'user', status = 'active' }) {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email.toLowerCase().trim(), passwordHash, name.trim(), role, status, now, now]
    );
    return this.findById(id);
  }

  findAll({ limit = 50, offset = 0, search = '' } = {}) {
    let query = `SELECT id, email, name, role, COALESCE(status, 'active') as status, created_at, updated_at FROM users`;
    const params = [];
    if (search && search.trim()) {
      query += ` WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?`;
      params.push(`%${search.trim().toLowerCase()}%`, `%${search.trim().toLowerCase()}%`);
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return this.db.query(query, params);
  }

  count({ search = '' } = {}) {
    let query = `SELECT COUNT(*) as count FROM users`;
    const params = [];
    if (search && search.trim()) {
      query += ` WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?`;
      params.push(`%${search.trim().toLowerCase()}%`, `%${search.trim().toLowerCase()}%`);
    }
    const row = this.db.get(query, params);
    return row ? row.count : 0;
  }

  getUserStatsSummary(userId) {
    const historyRow = this.db.get('SELECT COUNT(*) as count FROM history WHERE user_id = ?', [userId]);
    const usageRow = this.db.get(`
      SELECT 
        COALESCE(SUM(audio_seconds), 0) as audioSeconds,
        COALESCE(SUM(estimated_cost), 0) as totalCost
      FROM usage_events 
      WHERE user_id = ? AND status = 'success'
    `, [userId]);
    return {
      dictationsCount: historyRow ? historyRow.count : 0,
      audioMinutes: usageRow ? Math.round(((usageRow.audioSeconds || 0) / 60) * 10) / 10 : 0,
      estimatedCost: usageRow ? Math.round((usageRow.totalCost || 0) * 10000) / 10000 : 0
    };
  }

  update(id, updates) {
    const fields = [];
    const values = [];
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email.toLowerCase().trim());
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      values.push(updates.passwordHash);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  createSession({ id, userId, tokenHash, expiresAt }) {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, tokenHash, expiresAt, now]
    );
  }

  findSession(tokenHash) {
    return this.db.get(
      `SELECT s.*, u.email, u.name, u.role, COALESCE(u.status, 'active') as status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [tokenHash, new Date().toISOString()]
    );
  }

  deleteSession(tokenHash) {
    this.db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  }

  deleteAllUserSessions(userId) {
    this.db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  }
}

export const userRepository = new UserRepository();
