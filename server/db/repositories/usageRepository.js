import { sqliteAdapter } from '../sqliteAdapter.js';

export class UsageRepository {
  constructor(adapter = sqliteAdapter) {
    this.db = adapter;
  }

  recordEvent({
    id,
    userId,
    workspaceId = null,
    sessionId = null,
    type,
    provider,
    model,
    audioSeconds = 0,
    latencyMs = 0,
    inputTokens = 0,
    outputTokens = 0,
    estimatedCost = 0.0,
    status = 'success',
    isByok = false,
    keySource = 'system',
    costIsEstimated = true,
    errorMessage = null
  }) {
    const eventId = id || `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const isByokInt = (isByok === true || isByok === 1 || keySource === 'user' || keySource === 'byok') ? 1 : 0;
    const keySrc = keySource || (isByokInt ? 'byok' : 'system');
    const estCostNum = Number(estimatedCost) || 0.0;
    const userCost = status === 'failure' ? 0.0 : estCostNum;
    const platformCost = (status === 'failure' || isByokInt === 1) ? 0.0 : estCostNum;
    const costIsEstInt = costIsEstimated !== false ? 1 : 0;

    this.db.run(
      `INSERT INTO usage_events (
        id, user_id, workspace_id, session_id, type, provider, model,
        audio_seconds, latency_ms, input_tokens, output_tokens, estimated_cost,
        status, is_byok, key_source, cost_is_estimated, user_cost, platform_cost, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        userId,
        workspaceId,
        sessionId,
        type,
        provider,
        model,
        Number(audioSeconds) || 0,
        Number(latencyMs) || 0,
        Number(inputTokens) || 0,
        Number(outputTokens) || 0,
        userCost,
        status,
        isByokInt,
        keySrc,
        costIsEstInt,
        userCost,
        platformCost,
        errorMessage,
        now
      ]
    );

    return {
      id: eventId,
      userId,
      workspaceId,
      sessionId,
      type,
      provider,
      model,
      audioSeconds: Number(audioSeconds) || 0,
      latencyMs: Number(latencyMs) || 0,
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      estimatedCost: userCost,
      userCost,
      platformCost,
      isByok: isByokInt === 1,
      keySource: keySrc,
      costIsEstimated: costIsEstInt === 1,
      status,
      errorMessage,
      createdAt: now
    };
  }

  getUserUsage(userId, { limit = 50, offset = 0, sinceDate = null, status = null } = {}) {
    let sql = `SELECT * FROM usage_events WHERE user_id = ?`;
    const params = [userId];

    if (sinceDate) {
      sql += ` AND created_at >= ?`;
      params.push(sinceDate);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return this.db.query(sql, params).map(r => ({
      ...r,
      isByok: Boolean(r.is_byok),
      costIsEstimated: Boolean(r.cost_is_estimated)
    }));
  }

  getUserMonthlyStats(userId) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const row = this.db.get(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as totalAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 0 AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 1 AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as totalTranscriptions,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 0 AND status = 'success' THEN 1 ELSE 0 END), 0) as systemTranscriptions,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 1 AND status = 'success' THEN 1 ELSE 0 END), 0) as byokTranscriptions,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as totalLlmRequests,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND is_byok = 0 AND status = 'success' THEN 1 ELSE 0 END), 0) as systemLlmRequests,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND is_byok = 1 AND status = 'success' THEN 1 ELSE 0 END), 0) as byokLlmRequests,
         COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens ELSE 0 END), 0) as totalInputTokens,
         COALESCE(SUM(CASE WHEN status = 'success' THEN output_tokens ELSE 0 END), 0) as totalOutputTokens,
         COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalUserCost,
         COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as totalPlatformCost,
         COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = 1 THEN user_cost ELSE 0 END), 0) as totalByokCost,
         COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as totalFailures
       FROM usage_events
       WHERE user_id = ? AND created_at >= ?`,
      [userId, startOfMonth]
    ) || {};

    const totalAudioSeconds = row.totalAudioSeconds || 0;
    const systemAudioSeconds = row.systemAudioSeconds || 0;
    const byokAudioSeconds = row.byokAudioSeconds || 0;

    return {
      monthStart: startOfMonth,
      audioMinutes: Math.round((totalAudioSeconds / 60) * 100) / 100,
      audioSeconds: totalAudioSeconds,
      systemAudioMinutes: Math.round((systemAudioSeconds / 60) * 100) / 100,
      systemAudioSeconds,
      byokAudioMinutes: Math.round((byokAudioSeconds / 60) * 100) / 100,
      byokAudioSeconds,
      transcriptionCount: row.totalTranscriptions || 0,
      systemTranscriptionCount: row.systemTranscriptions || 0,
      byokTranscriptionCount: row.byokTranscriptions || 0,
      llmRequestCount: row.totalLlmRequests || 0,
      systemLlmRequests: row.systemLlmRequests || 0,
      byokLlmRequests: row.byokLlmRequests || 0,
      totalRequests: (row.totalTranscriptions || 0) + (row.totalLlmRequests || 0),
      inputTokens: row.totalInputTokens || 0,
      outputTokens: row.totalOutputTokens || 0,
      totalTokens: (row.totalInputTokens || 0) + (row.totalOutputTokens || 0),
      totalEstimatedCost: Math.round((row.totalUserCost || 0) * 100000) / 100000,
      platformCost: Math.round((row.totalPlatformCost || 0) * 100000) / 100000,
      byokCost: Math.round((row.totalByokCost || 0) * 100000) / 100000,
      failures: row.totalFailures || 0
    };
  }

  getDetailedDashboardStats(userId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const fetchPeriodStats = (sinceDate) => {
      const row = this.db.get(
        `SELECT 
           COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
           COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 0 AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
           COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = 1 AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
           COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as sttRequests,
           COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as aiRequests,
           COALESCE(SUM(CASE WHEN is_byok = 1 AND status = 'success' THEN 1 ELSE 0 END), 0) as byokRequests,
           COALESCE(SUM(CASE WHEN is_byok = 0 AND status = 'success' THEN 1 ELSE 0 END), 0) as systemRequests,
           COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens ELSE 0 END), 0) as inputTokens,
           COALESCE(SUM(CASE WHEN status = 'success' THEN output_tokens ELSE 0 END), 0) as outputTokens,
           COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN user_cost ELSE 0 END), 0) as sttCost,
           COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN user_cost ELSE 0 END), 0) as llmCost,
           COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalCost,
           COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
           COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = 1 THEN user_cost ELSE 0 END), 0) as byokCost,
           COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
         FROM usage_events
         WHERE user_id = ? AND created_at >= ?`,
        [userId, sinceDate]
      ) || {};

      return {
        audioMinutes: Math.round(((row.audioSeconds || 0) / 60) * 100) / 100,
        audioSeconds: row.audioSeconds || 0,
        systemAudioMinutes: Math.round(((row.systemAudioSeconds || 0) / 60) * 100) / 100,
        byokAudioMinutes: Math.round(((row.byokAudioSeconds || 0) / 60) * 100) / 100,
        sttRequests: row.sttRequests || 0,
        aiRequests: row.aiRequests || 0,
        byokRequests: row.byokRequests || 0,
        systemRequests: row.systemRequests || 0,
        inputTokens: row.inputTokens || 0,
        outputTokens: row.outputTokens || 0,
        sttCost: Math.round((row.sttCost || 0) * 1000000) / 1000000,
        llmCost: Math.round((row.llmCost || 0) * 1000000) / 1000000,
        totalCost: Math.round((row.totalCost || 0) * 1000000) / 1000000,
        platformCost: Math.round((row.platformCost || 0) * 1000000) / 1000000,
        byokCost: Math.round((row.byokCost || 0) * 1000000) / 1000000,
        failures: row.failures || 0
      };
    };

    const providerBreakdown = this.db.query(
      `SELECT provider,
              COUNT(id) as requestCount,
              COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
              COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
              COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as estimatedCost,
              COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
              COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = 1 THEN user_cost ELSE 0 END), 0) as byokCost,
              COALESCE(SUM(CASE WHEN is_byok = 1 THEN 1 ELSE 0 END), 0) as byokRequests,
              COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
       FROM usage_events
       WHERE user_id = ? AND created_at >= ?
       GROUP BY provider
       ORDER BY estimatedCost DESC`,
      [userId, startOfMonth]
    ).map(r => ({
      provider: r.provider,
      requestCount: r.requestCount,
      audioMinutes: Math.round(((r.audioSeconds || 0) / 60) * 100) / 100,
      totalTokens: r.totalTokens,
      estimatedCost: Math.round((r.estimatedCost || 0) * 1000000) / 1000000,
      platformCost: Math.round((r.platformCost || 0) * 1000000) / 1000000,
      byokCost: Math.round((r.byokCost || 0) * 1000000) / 1000000,
      byokRequests: r.byokRequests,
      failures: r.failures
    }));

    const modelBreakdown = this.db.query(
      `SELECT model, provider, type,
              COUNT(id) as requestCount,
              COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
              COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
              COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as estimatedCost,
              COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
              COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
       FROM usage_events
       WHERE user_id = ? AND created_at >= ?
       GROUP BY model, provider, type
       ORDER BY estimatedCost DESC`,
      [userId, startOfMonth]
    ).map(r => ({
      model: r.model,
      provider: r.provider,
      type: r.type,
      requestCount: r.requestCount,
      audioMinutes: Math.round(((r.audioSeconds || 0) / 60) * 100) / 100,
      totalTokens: r.totalTokens,
      estimatedCost: Math.round((r.estimatedCost || 0) * 1000000) / 1000000,
      platformCost: Math.round((r.platformCost || 0) * 1000000) / 1000000,
      failures: r.failures
    }));

    // Recent 25 events for user activity timeline
    const recentHistory = this.db.query(
      `SELECT id, session_id, type, provider, model, audio_seconds, latency_ms,
              input_tokens, output_tokens, user_cost, platform_cost, status,
              is_byok, key_source, cost_is_estimated, error_message, created_at
       FROM usage_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 25`,
      [userId]
    ).map(e => ({
      id: e.id,
      sessionId: e.session_id,
      type: e.type,
      provider: e.provider,
      model: e.model,
      audioSeconds: Math.round((e.audio_seconds || 0) * 10) / 10,
      totalTokens: (e.input_tokens || 0) + (e.output_tokens || 0),
      latencyMs: e.latency_ms || 0,
      isByok: Boolean(e.is_byok),
      keySource: e.key_source || 'system',
      userCost: Math.round((e.user_cost || 0) * 1000000) / 1000000,
      platformCost: Math.round((e.platform_cost || 0) * 1000000) / 1000000,
      costIsEstimated: Boolean(e.cost_is_estimated),
      status: e.status,
      errorMessage: e.error_message,
      createdAt: e.created_at
    }));

    return {
      today: fetchPeriodStats(startOfToday),
      thisMonth: fetchPeriodStats(startOfMonth),
      breakdownByProvider: providerBreakdown,
      breakdownByModel: modelBreakdown,
      recentHistory
    };
  }

  getGlobalSystemStats() {
    const totalEvents = this.db.get("SELECT COUNT(*) as count FROM usage_events WHERE status = 'success'");
    const totals = this.db.get(`
      SELECT 
        COALESCE(SUM(audio_seconds), 0) as totalAudioSeconds,
        COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
        COALESCE(SUM(user_cost), 0) as totalUserCost,
        COALESCE(SUM(platform_cost), 0) as totalPlatformCost,
        COALESCE(SUM(CASE WHEN is_byok = 1 THEN user_cost ELSE 0 END), 0) as totalByokVolume
      FROM usage_events
      WHERE status = 'success'
    `);
    const historyCount = this.db.get('SELECT COUNT(*) as count FROM history');
    const failures = this.db.get("SELECT COUNT(*) as count FROM usage_events WHERE status = 'failure'");

    return {
      totalDictations: historyCount ? historyCount.count : (totalEvents ? totalEvents.count : 0),
      totalAudioSeconds: totals ? totals.totalAudioSeconds : 0,
      totalAudioMinutes: totals ? Math.round(((totals.totalAudioSeconds || 0) / 60) * 100) / 100 : 0,
      totalTokens: totals ? totals.totalTokens : 0,
      totalEstimatedCost: totals ? Math.round((totals.totalUserCost || 0) * 10000) / 10000 : 0,
      platformCost: totals ? Math.round((totals.totalPlatformCost || 0) * 10000) / 10000 : 0,
      byokVolume: totals ? Math.round((totals.totalByokVolume || 0) * 10000) / 10000 : 0,
      failures: failures ? failures.count : 0
    };
  }

  getGlobalAdminUsageStats() {
    const globalSummary = this.getGlobalSystemStats();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const providerCosts = this.db.query(
      `SELECT provider,
              COUNT(id) as totalRequests,
              COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
              COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
              COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
              COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = 1 THEN user_cost ELSE 0 END), 0) as byokCost,
              COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalCost,
              COALESCE(SUM(CASE WHEN is_byok = 1 THEN 1 ELSE 0 END), 0) as byokRequests,
              COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
       FROM usage_events
       WHERE created_at >= ?
       GROUP BY provider
       ORDER BY platformCost DESC`,
      [startOfMonth]
    ).map(p => ({
      provider: p.provider,
      totalRequests: p.totalRequests,
      audioMinutes: Math.round(((p.audioSeconds || 0) / 60) * 100) / 100,
      totalTokens: p.totalTokens,
      platformCost: Math.round((p.platformCost || 0) * 100000) / 100000,
      byokCost: Math.round((p.byokCost || 0) * 100000) / 100000,
      totalCost: Math.round((p.totalCost || 0) * 100000) / 100000,
      byokRequests: p.byokRequests,
      failures: p.failures
    }));

    const userUsage = this.db.query(
      `SELECT u.id as userId, u.name, u.email, u.role, u.status as userStatus,
              COALESCE(q.tier, 'free') as tier,
              COALESCE(q.monthly_audio_minutes, 60.0) as limitAudioMinutes,
              COALESCE(q.monthly_llm_requests, 500) as limitLlmRequests,
              COUNT(e.id) as totalEvents,
              COALESCE(SUM(CASE WHEN e.type = 'transcription' AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as audioSeconds,
              COALESCE(SUM(CASE WHEN e.is_byok = 0 AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
              COALESCE(SUM(CASE WHEN e.is_byok = 1 AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
              COALESCE(SUM(CASE WHEN e.status = 'success' THEN e.platform_cost ELSE 0 END), 0) as platformCost,
              COALESCE(SUM(CASE WHEN e.status = 'success' AND e.is_byok = 1 THEN e.user_cost ELSE 0 END), 0) as byokCost,
              COALESCE(SUM(CASE WHEN e.status = 'failure' THEN 1 ELSE 0 END), 0) as failures
       FROM users u
       LEFT JOIN user_quotas q ON u.id = q.user_id
       LEFT JOIN usage_events e ON u.id = e.user_id AND e.created_at >= ?
       GROUP BY u.id
       ORDER BY platformCost DESC`,
      [startOfMonth]
    ).map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      userStatus: u.userStatus,
      tier: u.tier,
      limitAudioMinutes: u.limitAudioMinutes,
      limitLlmRequests: u.limitLlmRequests,
      totalEvents: u.totalEvents,
      audioMinutes: Math.round(((u.audioSeconds || 0) / 60) * 100) / 100,
      systemAudioMinutes: Math.round(((u.systemAudioSeconds || 0) / 60) * 100) / 100,
      byokAudioMinutes: Math.round(((u.byokAudioSeconds || 0) / 60) * 100) / 100,
      platformCost: Math.round((u.platformCost || 0) * 100000) / 100000,
      byokCost: Math.round((u.byokCost || 0) * 100000) / 100000,
      failures: u.failures
    }));

    const recentFailures = this.db.query(
      `SELECT e.id, e.user_id as userId, u.email as userEmail, e.type, e.provider, e.model,
              e.latency_ms as latencyMs, e.error_message as errorMessage, e.is_byok as isByok,
              e.created_at as createdAt
       FROM usage_events e
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.status = 'failure'
       ORDER BY e.created_at DESC
       LIMIT 25`
    ).map(f => ({
      ...f,
      isByok: Boolean(f.isByok)
    }));

    const totalRequests = this.db.get(
      "SELECT COUNT(*) as count FROM usage_events WHERE created_at >= ?",
      [startOfMonth]
    )?.count || 0;

    const failureCount = this.db.get(
      "SELECT COUNT(*) as count FROM usage_events WHERE status = 'failure' AND created_at >= ?",
      [startOfMonth]
    )?.count || 0;

    const failureRate = totalRequests > 0 ? ((failureCount / totalRequests) * 100).toFixed(2) + '%' : '0.00%';

    return {
      summary: {
        ...globalSummary,
        totalRequestsMonth: totalRequests,
        failureCountMonth: failureCount,
        failureRateMonth: failureRate
      },
      providerCosts,
      userUsage,
      recentFailures
    };
  }
}

export const usageRepository = new UsageRepository();
