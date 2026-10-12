import { db } from '../index.js';

export class UsageRepository {
  constructor(adapter = db) {
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
    const isByokBool = Boolean(isByok === true || isByok === 1 || keySource === 'user' || keySource === 'byok');
    const keySrc = keySource || (isByokBool ? 'byok' : 'system');
    const estCostNum = Number(estimatedCost) || 0.0;
    const userCost = status === 'failure' ? 0.0 : estCostNum;
    const platformCost = (status === 'failure' || isByokBool) ? 0.0 : estCostNum;
    const costIsEstBool = Boolean(costIsEstimated !== false);

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
        isByokBool,
        keySrc,
        costIsEstBool,
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
      isByok: isByokBool,
      keySource: keySrc,
      costIsEstimated: costIsEstBool,
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

    const rowsRes = this.db.query(sql, params);
    const mapRows = (rows) => (rows || []).map(r => ({
      ...r,
      isByok: Boolean(r.is_byok),
      costIsEstimated: Boolean(r.cost_is_estimated)
    }));

    if (rowsRes instanceof Promise) {
      return rowsRes.then(mapRows);
    }
    return mapRows(rowsRes);
  }

  getUserMonthlyStats(userId) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const rowRes = this.db.get(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as totalAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = FALSE AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = TRUE AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as totalTranscriptions,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = FALSE AND status = 'success' THEN 1 ELSE 0 END), 0) as systemTranscriptions,
         COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = TRUE AND status = 'success' THEN 1 ELSE 0 END), 0) as byokTranscriptions,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as totalLlmRequests,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND is_byok = FALSE AND status = 'success' THEN 1 ELSE 0 END), 0) as systemLlmRequests,
         COALESCE(SUM(CASE WHEN type != 'transcription' AND is_byok = TRUE AND status = 'success' THEN 1 ELSE 0 END), 0) as byokLlmRequests,
         COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens ELSE 0 END), 0) as totalInputTokens,
         COALESCE(SUM(CASE WHEN status = 'success' THEN output_tokens ELSE 0 END), 0) as totalOutputTokens,
         COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalUserCost,
         COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as totalPlatformCost,
         COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = TRUE THEN user_cost ELSE 0 END), 0) as totalByokCost,
         COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as totalFailures
       FROM usage_events
       WHERE user_id = ? AND created_at >= ?`,
      [userId, startOfMonth]
    );

    const formatStats = (row = {}) => {
      const r = row || {};
      const totalAudioSeconds = Number(r.totalAudioSeconds || r.totalaudioseconds || 0);
      const systemAudioSeconds = Number(r.systemAudioSeconds || r.systemaudioseconds || 0);
      const byokAudioSeconds = Number(r.byokAudioSeconds || r.byokaudioseconds || 0);

      return {
        monthStart: startOfMonth,
        audioMinutes: Math.round((totalAudioSeconds / 60) * 100) / 100,
        audioSeconds: totalAudioSeconds,
        systemAudioMinutes: Math.round((systemAudioSeconds / 60) * 100) / 100,
        systemAudioSeconds,
        byokAudioMinutes: Math.round((byokAudioSeconds / 60) * 100) / 100,
        byokAudioSeconds,
        transcriptionCount: Number(r.totalTranscriptions || r.totaltranscriptions || 0),
        systemTranscriptionCount: Number(r.systemTranscriptions || r.systemtranscriptions || 0),
        byokTranscriptionCount: Number(r.byokTranscriptions || r.byoktranscriptions || 0),
        llmRequestCount: Number(r.totalLlmRequests || r.totalllmrequests || 0),
        systemLlmRequests: Number(r.systemLlmRequests || r.systemllmrequests || 0),
        byokLlmRequests: Number(r.byokLlmRequests || r.byokllmrequests || 0),
        totalRequests: Number(r.totalTranscriptions || r.totaltranscriptions || 0) + Number(r.totalLlmRequests || r.totalllmrequests || 0),
        inputTokens: Number(r.totalInputTokens || r.totalinputtokens || 0),
        outputTokens: Number(r.totalOutputTokens || r.totaloutputtokens || 0),
        totalTokens: Number(r.totalInputTokens || r.totalinputtokens || 0) + Number(r.totalOutputTokens || r.totaloutputtokens || 0),
        totalEstimatedCost: Math.round(Number(r.totalUserCost || r.totalusercost || 0) * 100000) / 100000,
        platformCost: Math.round(Number(r.totalPlatformCost || r.totalplatformcost || 0) * 100000) / 100000,
        byokCost: Math.round(Number(r.totalByokCost || r.totalbyokcost || 0) * 100000) / 100000,
        failures: Number(r.totalFailures || r.totalfailures || 0)
      };
    };

    if (rowRes instanceof Promise) {
      return rowRes.then(formatStats);
    }
    return formatStats(rowRes);
  }

  getDetailedDashboardStats(userId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const buildStats = (todayRow, monthRow, provRows, modelRows, histRows) => {
      const parsePeriod = (row = {}) => {
        const r = row || {};
        return {
          audioMinutes: Math.round(((Number(r.audioSeconds || r.audioseconds || 0)) / 60) * 100) / 100,
          audioSeconds: Number(r.audioSeconds || r.audioseconds || 0),
          systemAudioMinutes: Math.round(((Number(r.systemAudioSeconds || r.systemaudioseconds || 0)) / 60) * 100) / 100,
          byokAudioMinutes: Math.round(((Number(r.byokAudioSeconds || r.byokaudioseconds || 0)) / 60) * 100) / 100,
          sttRequests: Number(r.sttRequests || r.sttrequests || 0),
          aiRequests: Number(r.aiRequests || r.airequests || 0),
          byokRequests: Number(r.byokRequests || r.byokrequests || 0),
          systemRequests: Number(r.systemRequests || r.systemrequests || 0),
          inputTokens: Number(r.inputTokens || r.inputtokens || 0),
          outputTokens: Number(r.outputTokens || r.outputtokens || 0),
          sttCost: Math.round(Number(r.sttCost || r.sttcost || 0) * 1000000) / 1000000,
          llmCost: Math.round(Number(r.llmCost || r.llmcost || 0) * 1000000) / 1000000,
          totalCost: Math.round(Number(r.totalCost || r.totalcost || 0) * 1000000) / 1000000,
          platformCost: Math.round(Number(r.platformCost || r.platformcost || 0) * 1000000) / 1000000,
          byokCost: Math.round(Number(r.byokCost || r.byokcost || 0) * 1000000) / 1000000,
          failures: Number(r.failures || 0)
        };
      };

      const providerBreakdown = (provRows || []).map(r => ({
        provider: r.provider,
        requestCount: Number(r.requestCount || r.requestcount || 0),
        audioMinutes: Math.round(((Number(r.audioSeconds || r.audioseconds || 0)) / 60) * 100) / 100,
        totalTokens: Number(r.totalTokens || r.totaltokens || 0),
        estimatedCost: Math.round(Number(r.estimatedCost || r.estimatedcost || 0) * 1000000) / 1000000,
        platformCost: Math.round(Number(r.platformCost || r.platformcost || 0) * 1000000) / 1000000,
        byokCost: Math.round(Number(r.byokCost || r.byokcost || 0) * 1000000) / 1000000,
        byokRequests: Number(r.byokRequests || r.byokrequests || 0),
        failures: Number(r.failures || 0)
      }));

      const modelBreakdown = (modelRows || []).map(r => ({
        model: r.model,
        provider: r.provider,
        type: r.type,
        requestCount: Number(r.requestCount || r.requestcount || 0),
        audioMinutes: Math.round(((Number(r.audioSeconds || r.audioseconds || 0)) / 60) * 100) / 100,
        totalTokens: Number(r.totalTokens || r.totaltokens || 0),
        estimatedCost: Math.round(Number(r.estimatedCost || r.estimatedcost || 0) * 1000000) / 1000000,
        platformCost: Math.round(Number(r.platformCost || r.platformcost || 0) * 1000000) / 1000000,
        failures: Number(r.failures || 0)
      }));

      const recentHistory = (histRows || []).map(e => ({
        id: e.id,
        sessionId: e.session_id,
        type: e.type,
        provider: e.provider,
        model: e.model,
        audioSeconds: Math.round(Number(e.audio_seconds || 0) * 10) / 10,
        totalTokens: Number(e.input_tokens || 0) + Number(e.output_tokens || 0),
        latencyMs: Number(e.latency_ms || 0),
        isByok: Boolean(e.is_byok),
        keySource: e.key_source || 'system',
        userCost: Math.round(Number(e.user_cost || 0) * 1000000) / 1000000,
        platformCost: Math.round(Number(e.platform_cost || 0) * 1000000) / 1000000,
        costIsEstimated: Boolean(e.cost_is_estimated),
        status: e.status,
        errorMessage: e.error_message,
        createdAt: e.created_at
      }));

      return {
        today: parsePeriod(todayRow),
        thisMonth: parsePeriod(monthRow),
        breakdownByProvider: providerBreakdown,
        breakdownByModel: modelBreakdown,
        recentHistory
      };
    };

    const periodSql = `SELECT
       COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
       COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = FALSE AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
       COALESCE(SUM(CASE WHEN type = 'transcription' AND is_byok = TRUE AND status = 'success' THEN audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
       COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as sttRequests,
       COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN 1 ELSE 0 END), 0) as aiRequests,
       COALESCE(SUM(CASE WHEN is_byok = TRUE AND status = 'success' THEN 1 ELSE 0 END), 0) as byokRequests,
       COALESCE(SUM(CASE WHEN is_byok = FALSE AND status = 'success' THEN 1 ELSE 0 END), 0) as systemRequests,
       COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens ELSE 0 END), 0) as inputTokens,
       COALESCE(SUM(CASE WHEN status = 'success' THEN output_tokens ELSE 0 END), 0) as outputTokens,
       COALESCE(SUM(CASE WHEN type = 'transcription' AND status = 'success' THEN user_cost ELSE 0 END), 0) as sttCost,
       COALESCE(SUM(CASE WHEN type != 'transcription' AND status = 'success' THEN user_cost ELSE 0 END), 0) as llmCost,
       COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalCost,
       COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
       COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = TRUE THEN user_cost ELSE 0 END), 0) as byokCost,
       COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
     FROM usage_events
     WHERE user_id = ? AND created_at >= ?`;

    const provSql = `SELECT provider,
          COUNT(id) as requestCount,
          COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
          COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
          COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as estimatedCost,
          COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
          COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = TRUE THEN user_cost ELSE 0 END), 0) as byokCost,
          COALESCE(SUM(CASE WHEN is_byok = TRUE THEN 1 ELSE 0 END), 0) as byokRequests,
          COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
   FROM usage_events
   WHERE user_id = ? AND created_at >= ?
   GROUP BY provider
   ORDER BY estimatedCost DESC`;

    const modelSql = `SELECT model, provider, type,
          COUNT(id) as requestCount,
          COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
          COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
          COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as estimatedCost,
          COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
          COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
   FROM usage_events
   WHERE user_id = ? AND created_at >= ?
   GROUP BY model, provider, type
   ORDER BY estimatedCost DESC`;

    const histSql = `SELECT id, session_id, type, provider, model, audio_seconds, latency_ms,
          input_tokens, output_tokens, user_cost, platform_cost, status,
          is_byok, key_source, cost_is_estimated, error_message, created_at
   FROM usage_events
   WHERE user_id = ?
   ORDER BY created_at DESC
   LIMIT 25`;

    const todayRes = this.db.get(periodSql, [userId, startOfToday]);
    const monthRes = this.db.get(periodSql, [userId, startOfMonth]);
    const provRes = this.db.query(provSql, [userId, startOfMonth]);
    const modelRes = this.db.query(modelSql, [userId, startOfMonth]);
    const histRes = this.db.query(histSql, [userId]);

    if (
      todayRes instanceof Promise ||
      monthRes instanceof Promise ||
      provRes instanceof Promise ||
      modelRes instanceof Promise ||
      histRes instanceof Promise
    ) {
      return Promise.all([
        Promise.resolve(todayRes),
        Promise.resolve(monthRes),
        Promise.resolve(provRes),
        Promise.resolve(modelRes),
        Promise.resolve(histRes)
      ]).then(([t, m, p, mod, h]) => buildStats(t, m, p, mod, h));
    }

    return buildStats(todayRes, monthRes, provRes, modelRes, histRes);
  }

  getGlobalSystemStats() {
    const totalEventsRes = this.db.get("SELECT COUNT(*) as count FROM usage_events WHERE status = 'success'");
    const totalsRes = this.db.get(`
      SELECT
        COALESCE(SUM(audio_seconds), 0) as totalAudioSeconds,
        COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
        COALESCE(SUM(user_cost), 0) as totalUserCost,
        COALESCE(SUM(platform_cost), 0) as totalPlatformCost,
        COALESCE(SUM(CASE WHEN is_byok = TRUE THEN user_cost ELSE 0 END), 0) as totalByokVolume
      FROM usage_events
      WHERE status = 'success'
    `);
    const historyCountRes = this.db.get('SELECT COUNT(*) as count FROM history');
    const failuresRes = this.db.get("SELECT COUNT(*) as count FROM usage_events WHERE status = 'failure'");

    const buildStats = (totalEvents, totals, historyCount, failures) => {
      const totAudio = Number(totals?.totalAudioSeconds || totals?.totalaudioseconds || 0);
      const totTokens = Number(totals?.totalTokens || totals?.totaltokens || 0);
      const totUserCost = Number(totals?.totalUserCost || totals?.totalusercost || 0);
      const totPlatCost = Number(totals?.totalPlatformCost || totals?.totalplatformcost || 0);
      const totByokVol = Number(totals?.totalByokVolume || totals?.totalbyokvolume || 0);

      return {
        totalDictations: historyCount ? Number(historyCount.count) : (totalEvents ? Number(totalEvents.count) : 0),
        totalAudioSeconds: totAudio,
        totalAudioMinutes: Math.round((totAudio / 60) * 100) / 100,
        totalTokens: totTokens,
        totalEstimatedCost: Math.round(totUserCost * 10000) / 10000,
        platformCost: Math.round(totPlatCost * 10000) / 10000,
        byokVolume: Math.round(totByokVol * 10000) / 10000,
        failures: failures ? Number(failures.count) : 0
      };
    };

    if (
      totalEventsRes instanceof Promise ||
      totalsRes instanceof Promise ||
      historyCountRes instanceof Promise ||
      failuresRes instanceof Promise
    ) {
      return Promise.all([
        Promise.resolve(totalEventsRes),
        Promise.resolve(totalsRes),
        Promise.resolve(historyCountRes),
        Promise.resolve(failuresRes)
      ]).then(([e, t, h, f]) => buildStats(e, t, h, f));
    }

    return buildStats(totalEventsRes, totalsRes, historyCountRes, failuresRes);
  }

  getGlobalAdminUsageStats() {
    const globalSummaryRes = this.getGlobalSystemStats();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const provSql = `SELECT provider,
            COUNT(id) as totalRequests,
            COALESCE(SUM(CASE WHEN status = 'success' THEN audio_seconds ELSE 0 END), 0) as audioSeconds,
            COALESCE(SUM(CASE WHEN status = 'success' THEN input_tokens + output_tokens ELSE 0 END), 0) as totalTokens,
            COALESCE(SUM(CASE WHEN status = 'success' THEN platform_cost ELSE 0 END), 0) as platformCost,
            COALESCE(SUM(CASE WHEN status = 'success' AND is_byok = TRUE THEN user_cost ELSE 0 END), 0) as byokCost,
            COALESCE(SUM(CASE WHEN status = 'success' THEN user_cost ELSE 0 END), 0) as totalCost,
            COALESCE(SUM(CASE WHEN is_byok = TRUE THEN 1 ELSE 0 END), 0) as byokRequests,
            COALESCE(SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END), 0) as failures
     FROM usage_events
     WHERE created_at >= ?
     GROUP BY provider
     ORDER BY platformCost DESC`;

    const userSql = `SELECT u.id as userId, u.name, u.email, u.role, u.status as userStatus,
            COALESCE(q.tier, 'free') as tier,
            COALESCE(q.monthly_audio_minutes, 60.0) as limitAudioMinutes,
            COALESCE(q.monthly_llm_requests, 500) as limitLlmRequests,
            COUNT(e.id) as totalEvents,
            COALESCE(SUM(CASE WHEN e.type = 'transcription' AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as audioSeconds,
            COALESCE(SUM(CASE WHEN e.is_byok = FALSE AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as systemAudioSeconds,
            COALESCE(SUM(CASE WHEN e.is_byok = TRUE AND e.status = 'success' THEN e.audio_seconds ELSE 0 END), 0) as byokAudioSeconds,
            COALESCE(SUM(CASE WHEN e.status = 'success' THEN e.platform_cost ELSE 0 END), 0) as platformCost,
            COALESCE(SUM(CASE WHEN e.status = 'success' AND e.is_byok = TRUE THEN e.user_cost ELSE 0 END), 0) as byokCost,
            COALESCE(SUM(CASE WHEN e.status = 'failure' THEN 1 ELSE 0 END), 0) as failures
     FROM users u
     LEFT JOIN user_quotas q ON u.id = q.user_id
     LEFT JOIN usage_events e ON u.id = e.user_id AND e.created_at >= ?
     GROUP BY u.id
     ORDER BY platformCost DESC`;

    const failSql = `SELECT e.id, e.user_id as userId, u.email as userEmail, e.type, e.provider, e.model,
            e.latency_ms as latencyMs, e.error_message as errorMessage, e.is_byok as isByok,
            e.created_at as createdAt
     FROM usage_events e
     LEFT JOIN users u ON e.user_id = u.id
     WHERE e.status = 'failure'
     ORDER BY e.created_at DESC
     LIMIT 25`;

    const countSql = "SELECT COUNT(*) as count FROM usage_events WHERE created_at >= ?";
    const failCountSql = "SELECT COUNT(*) as count FROM usage_events WHERE status = 'failure' AND created_at >= ?";

    const provRes = this.db.query(provSql, [startOfMonth]);
    const userRes = this.db.query(userSql, [startOfMonth]);
    const failRes = this.db.query(failSql);
    const countRes = this.db.get(countSql, [startOfMonth]);
    const failCountRes = this.db.get(failCountSql, [startOfMonth]);

    const assemble = (globalSummary, provCosts, userUsage, recentFailures, totalRequestsRow, failureCountRow) => {
      const providerCosts = (provCosts || []).map(p => ({
        provider: p.provider,
        totalRequests: Number(p.totalRequests || p.totalrequests || 0),
        audioMinutes: Math.round(((Number(p.audioSeconds || p.audioseconds || 0)) / 60) * 100) / 100,
        totalTokens: Number(p.totalTokens || p.totaltokens || 0),
        platformCost: Math.round(Number(p.platformCost || p.platformcost || 0) * 100000) / 100000,
        byokCost: Math.round(Number(p.byokCost || p.byokcost || 0) * 100000) / 100000,
        totalCost: Math.round(Number(p.totalCost || p.totalcost || 0) * 100000) / 100000,
        byokRequests: Number(p.byokRequests || p.byokrequests || 0),
        failures: Number(p.failures || 0)
      }));

      const mappedUsers = (userUsage || []).map(u => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        userStatus: u.userStatus,
        tier: u.tier,
        limitAudioMinutes: Number(u.limitAudioMinutes || u.limitaudiominutes || 60),
        limitLlmRequests: Number(u.limitLlmRequests || u.limitllmrequests || 500),
        totalEvents: Number(u.totalEvents || u.totalevents || 0),
        audioMinutes: Math.round(((Number(u.audioSeconds || u.audioseconds || 0)) / 60) * 100) / 100,
        systemAudioMinutes: Math.round(((Number(u.systemAudioSeconds || u.systemaudioseconds || 0)) / 60) * 100) / 100,
        byokAudioMinutes: Math.round(((Number(u.byokAudioSeconds || u.byokaudioseconds || 0)) / 60) * 100) / 100,
        platformCost: Math.round(Number(u.platformCost || u.platformcost || 0) * 100000) / 100000,
        byokCost: Math.round(Number(u.byokCost || u.byokcost || 0) * 100000) / 100000,
        failures: Number(u.failures || 0)
      }));

      const failuresList = (recentFailures || []).map(f => ({
        ...f,
        isByok: Boolean(f.isByok)
      }));

      const totalRequests = totalRequestsRow?.count ? Number(totalRequestsRow.count) : 0;
      const failureCount = failureCountRow?.count ? Number(failureCountRow.count) : 0;
      const failureRate = totalRequests > 0 ? ((failureCount / totalRequests) * 100).toFixed(2) + '%' : '0.00%';

      return {
        summary: {
          ...globalSummary,
          totalRequestsMonth: totalRequests,
          failureCountMonth: failureCount,
          failureRateMonth: failureRate
        },
        providerCosts,
        userUsage: mappedUsers,
        recentFailures: failuresList
      };
    };

    if (
      globalSummaryRes instanceof Promise ||
      provRes instanceof Promise ||
      userRes instanceof Promise ||
      failRes instanceof Promise ||
      countRes instanceof Promise ||
      failCountRes instanceof Promise
    ) {
      return Promise.all([
        Promise.resolve(globalSummaryRes),
        Promise.resolve(provRes),
        Promise.resolve(userRes),
        Promise.resolve(failRes),
        Promise.resolve(countRes),
        Promise.resolve(failCountRes)
      ]).then(([g, p, u, f, c, fc]) => assemble(g, p, u, f, c, fc));
    }

    return assemble(globalSummaryRes, provRes, userRes, failRes, countRes, failCountRes);
  }
}

export const usageRepository = new UsageRepository();
