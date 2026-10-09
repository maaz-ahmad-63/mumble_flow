import { sqliteAdapter } from '../sqliteAdapter.js';

export class WorkspaceRepository {
  constructor(adapter = sqliteAdapter) {
    this.db = adapter;
  }

  createWorkspace({ id, name, slug, ownerId }) {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO workspaces (id, name, slug, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, slug, ownerId, now]
    );

    const memberId = `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.db.run(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [memberId, id, ownerId, 'owner', now]
    );

    return this.findById(id);
  }

  findById(id) {
    return this.db.get('SELECT * FROM workspaces WHERE id = ?', [id]);
  }

  findUserWorkspaces(userId) {
    return this.db.query(
      `SELECT w.*, wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = ?
       ORDER BY w.created_at ASC`,
      [userId]
    );
  }

  addMember({ id, workspaceId, userId, role = 'member' }) {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT OR REPLACE INTO workspace_members (id, workspace_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, workspaceId, userId, role, now]
    );
  }

  removeMember(workspaceId, userId) {
    this.db.run(
      'DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId]
    );
  }

  getMembers(workspaceId) {
    return this.db.query(
      `SELECT u.id, u.name, u.email, wm.role, wm.created_at
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?`,
      [workspaceId]
    );
  }
}

export const workspaceRepository = new WorkspaceRepository();
