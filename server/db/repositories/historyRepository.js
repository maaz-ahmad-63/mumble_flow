import { db } from '../index.js';

export class HistoryRepository {
  constructor(adapter = db) {
    this.db = adapter;
  }

  findByUser(userId = 'default_user', limit = 50) {
    const rows = this.db.query(
      `SELECT id, user_id as userId, raw_transcript as rawTranscript, processed_text as processedText,
              duration_ms as durationMs, app_name as appName, tone, language,
              latency_asr_ms as latencyAsrMs, latency_llm_ms as latencyLlmMs,
              total_latency_ms as totalLatencyMs, is_snippet as isSnippet,
              stt_provider as sttProvider, llm_provider as llmProvider,
              created_at as timestamp
       FROM history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
    const mapRows = (list) => (list || []).map(r => ({ ...r, isSnippet: Boolean(r.isSnippet) }));
    if (rows instanceof Promise) {
      return rows.then(mapRows);
    }
    return mapRows(rows);
  }

  insert({
    id,
    userId = 'default_user',
    rawTranscript,
    processedText,
    durationMs = 0,
    appName = '',
    tone = 'casual',
    language = 'en',
    latencyAsrMs = 0,
    latencyLlmMs = 0,
    totalLatencyMs = 0,
    isSnippet = false,
    sttProvider = 'groq',
    llmProvider = 'groq'
  }) {
    const entryId = id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const runRes = this.db.run(
      `INSERT INTO history (
        id, user_id, raw_transcript, processed_text, duration_ms, app_name, tone, language,
        latency_asr_ms, latency_llm_ms, total_latency_ms, is_snippet, stt_provider, llm_provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        userId,
        rawTranscript,
        processedText,
        durationMs,
        appName,
        tone,
        language,
        latencyAsrMs,
        latencyLlmMs,
        totalLatencyMs,
        Boolean(isSnippet),
        sttProvider,
        llmProvider,
        now
      ]
    );

    if (runRes instanceof Promise) {
      runRes.catch(() => {});
    }

    return {
      id: entryId,
      userId,
      rawTranscript,
      processedText,
      durationMs,
      appName,
      tone,
      language,
      latencyAsrMs,
      latencyLlmMs,
      totalLatencyMs,
      isSnippet: Boolean(isSnippet),
      sttProvider,
      llmProvider,
      timestamp: now
    };
  }

  clearUserHistory(userId = 'default_user') {
    this.db.run('DELETE FROM history WHERE user_id = ?', [userId]);
  }
}

export const historyRepository = new HistoryRepository();
