import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqliteAdapter } from '../db/sqliteAdapter.js';
import { settingsRepository } from '../db/repositories/settingsRepository.js';
import { dictionaryRepository } from '../db/repositories/dictionaryRepository.js';
import { snippetRepository } from '../db/repositories/snippetRepository.js';
import { historyRepository } from '../db/repositories/historyRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class StorageService {
  constructor() {
    // Initialize database adapter on startup
    sqliteAdapter.initialize();
  }

  // --- Settings (Sensitive Keys Stripped by default) ---
  getSettings(userId = 'default_user') {
    return settingsRepository.getSafeSettings(userId);
  }

  getRawSettings(userId = 'default_user') {
    return settingsRepository.getRawSettings(userId);
  }

  updateSettings(newSettings, userId = 'default_user') {
    return settingsRepository.updateSettings(userId, newSettings);
  }

  // --- Dictionary ---
  getDictionary(userId = 'default_user') {
    return dictionaryRepository.findByUser(userId);
  }

  addDictionaryItem(item, userId = 'default_user') {
    const word = (item.word || item.preferredOutput || '').trim();
    if (!word) throw new Error('Preferred output word is required');
    const spoken = (item.spoken || item.spokenPhrase || word).trim();

    return dictionaryRepository.insert({
      id: item.id,
      userId: item.userId || userId,
      word,
      spoken,
      category: item.category || 'general',
      hint: item.hint || '',
      enabled: item.enabled !== false
    });
  }

  updateDictionaryItem(id, updates, userId = 'default_user') {
    dictionaryRepository.update(id, userId, updates);
    return this.getDictionary(userId);
  }

  deleteDictionaryItem(id, userId = 'default_user') {
    dictionaryRepository.delete(id, userId);
    return this.getDictionary(userId);
  }

  // --- Snippets ---
  getSnippets(userId = 'default_user') {
    return snippetRepository.findByUser(userId);
  }

  addSnippet(snippet, userId = 'default_user') {
    const trigger = (snippet.trigger || '').trim().toLowerCase();
    const content = (snippet.content || '').trim();
    if (!trigger || !content) throw new Error('Trigger phrase and Content are required');

    return snippetRepository.insert({
      id: snippet.id,
      userId: snippet.userId || userId,
      name: snippet.name || snippet.description || trigger,
      trigger,
      content,
      mode: snippet.mode || 'all',
      app: snippet.app || 'all',
      description: snippet.description || snippet.name || '',
      enabled: snippet.enabled !== false
    });
  }

  updateSnippet(id, updates, userId = 'default_user') {
    snippetRepository.update(id, userId, updates);
    return this.getSnippets(userId);
  }

  deleteSnippet(id, userId = 'default_user') {
    snippetRepository.delete(id, userId);
    return this.getSnippets(userId);
  }

  // --- History ---
  addHistory(entry, userId = 'default_user') {
    return historyRepository.insert({
      ...entry,
      userId: entry.userId || userId
    });
  }

  getHistory(limit = 20, userId = 'default_user') {
    return historyRepository.findByUser(userId, limit);
  }

  clearHistory(userId = 'default_user') {
    historyRepository.clearUserHistory(userId);
    return [];
  }

  // --- Meetings (Notetaker) ---
  addMeeting(meeting, userId = 'default_user') {
    const entryId = meeting.id || `mtg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    sqliteAdapter.run(
      `INSERT INTO meetings (id, user_id, title, summary, action_items_json, topics_json, transcript, duration_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        userId,
        meeting.title || 'Meeting',
        meeting.summary || '',
        JSON.stringify(meeting.actionItems || []),
        JSON.stringify(meeting.topics || []),
        meeting.transcript || '',
        meeting.durationSeconds || 0,
        now
      ]
    );
    return {
      id: entryId,
      createdAt: now,
      ...meeting
    };
  }

  getMeetings(userId = 'default_user') {
    const rows = sqliteAdapter.query(
      `SELECT id, user_id as userId, title, summary, action_items_json as actionItemsJson,
              topics_json as topicsJson, transcript, duration_seconds as durationSeconds, created_at as createdAt
       FROM meetings
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => ({
      ...r,
      actionItems: JSON.parse(r.actionItemsJson || '[]'),
      topics: JSON.parse(r.topicsJson || '[]')
    }));
  }

  getMeetingById(id, userId = 'default_user') {
    const row = sqliteAdapter.get(
      `SELECT id, user_id as userId, title, summary, action_items_json as actionItemsJson,
              topics_json as topicsJson, transcript, duration_seconds as durationSeconds, created_at as createdAt
       FROM meetings
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (!row) return null;
    return {
      ...row,
      actionItems: JSON.parse(row.actionItemsJson || '[]'),
      topics: JSON.parse(row.topicsJson || '[]')
    };
  }
}

export const storage = new StorageService();
