import { usageRepository } from '../db/repositories/usageRepository.js';
import { db } from '../db/index.js';

export const QUOTA_TIERS = {
  free: {
    monthlyAudioMinutes: 60.0,
    monthlyLlmRequests: 500,
    name: 'Free'
  },
  pro: {
    monthlyAudioMinutes: 1000.0,
    monthlyLlmRequests: 10000,
    name: 'Pro'
  },
  business: {
    monthlyAudioMinutes: 5000.0,
    monthlyLlmRequests: 50000,
    name: 'Business'
  }
};

export class QuotaService {
  constructor(adapter = db, usageRepo = usageRepository) {
    this.db = adapter;
    this.usageRepo = usageRepo;
  }

  getUserQuota(userId) {
    const rowRes = this.db.get('SELECT * FROM user_quotas WHERE user_id = ?', [userId]);

    const formatQuota = (row) => {
      if (!row) {
        return {
          userId,
          tier: 'free',
          monthlyAudioMinutes: QUOTA_TIERS.free.monthlyAudioMinutes,
          monthlyLlmRequests: QUOTA_TIERS.free.monthlyLlmRequests,
          monthlyBudgetUsd: 0.0,
          name: QUOTA_TIERS.free.name
        };
      }
      return {
        userId,
        tier: row.tier,
        monthlyAudioMinutes: row.monthly_audio_minutes !== null && row.monthly_audio_minutes !== undefined ? Number(row.monthly_audio_minutes) : QUOTA_TIERS.free.monthlyAudioMinutes,
        monthlyLlmRequests: row.monthly_llm_requests !== null && row.monthly_llm_requests !== undefined ? Number(row.monthly_llm_requests) : QUOTA_TIERS.free.monthlyLlmRequests,
        monthlyBudgetUsd: row.monthly_budget_usd !== null && row.monthly_budget_usd !== undefined ? Number(row.monthly_budget_usd) : 0.0,
        name: QUOTA_TIERS[row.tier]?.name || row.tier
      };
    };

    if (rowRes instanceof Promise) {
      return rowRes.then(formatQuota);
    }
    return formatQuota(rowRes);
  }

  setUserQuota(userId, tier = 'free', customLimits = {}) {
    const base = QUOTA_TIERS[tier] || QUOTA_TIERS.free;
    const minutes = customLimits.monthlyAudioMinutes !== undefined ? Number(customLimits.monthlyAudioMinutes) : base.monthlyAudioMinutes;
    const requests = customLimits.monthlyLlmRequests !== undefined ? Number(customLimits.monthlyLlmRequests) : base.monthlyLlmRequests;
    const budget = customLimits.monthlyBudgetUsd !== undefined ? Number(customLimits.monthlyBudgetUsd) : 0.0;
    const now = new Date().toISOString();

    const res = this.db.run(
      `INSERT INTO user_quotas (user_id, tier, monthly_audio_minutes, monthly_llm_requests, monthly_budget_usd, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         tier = EXCLUDED.tier,
         monthly_audio_minutes = EXCLUDED.monthly_audio_minutes,
         monthly_llm_requests = EXCLUDED.monthly_llm_requests,
         monthly_budget_usd = EXCLUDED.monthly_budget_usd,
         updated_at = EXCLUDED.updated_at`,
      [userId, tier, minutes, requests, budget, now]
    );

    if (res instanceof Promise) {
      return res.then(() => this.getUserQuota(userId));
    }
    return this.getUserQuota(userId);
  }

  checkAudioQuota(userId, incomingAudioSeconds = 0, { isByok = false } = {}) {
    if (!userId || (userId === 'default_user' && process.env.NODE_ENV === 'development')) {
      return { allowed: true, remainingMinutes: 9999, isByok: Boolean(isByok) };
    }

    // BYOK users supply their own provider credentials — Mumble platform incurring 0 cost
    if (isByok) {
      return {
        allowed: true,
        isByok: true,
        tier: 'byok_unlimited',
        usedMinutes: 0,
        limitMinutes: Infinity,
        remainingMinutes: Infinity,
        reason: null
      };
    }

    const quotaRes = this.getUserQuota(userId);
    const statsRes = this.usageRepo.getUserMonthlyStats(userId);

    const evaluate = (quota, stats) => {
      // Check monthly budget if set
      if (quota.monthlyBudgetUsd > 0 && stats.platformCost >= quota.monthlyBudgetUsd) {
        return {
          allowed: false,
          tier: quota.tier,
          usedMinutes: stats.systemAudioMinutes,
          limitMinutes: quota.monthlyAudioMinutes,
          remainingMinutes: 0,
          platformCost: stats.platformCost,
          budgetUsd: quota.monthlyBudgetUsd,
          reason: `Monthly platform budget limit of $${quota.monthlyBudgetUsd.toFixed(2)} reached. Add your own API key (BYOK) to continue without limits.`
        };
      }

      const projectedMinutes = stats.systemAudioMinutes + (incomingAudioSeconds / 60);
      const allowed = projectedMinutes <= quota.monthlyAudioMinutes;

      return {
        allowed,
        isByok: false,
        tier: quota.tier,
        usedMinutes: stats.systemAudioMinutes,
        totalMinutes: stats.audioMinutes,
        limitMinutes: quota.monthlyAudioMinutes,
        remainingMinutes: Math.max(0, Math.round((quota.monthlyAudioMinutes - stats.systemAudioMinutes) * 100) / 100),
        reason: allowed ? null : `Monthly Mumble-managed audio limit of ${quota.monthlyAudioMinutes} minutes exceeded for ${quota.name} tier. Switch to your own API key (BYOK) to continue.`
      };
    };

    if (quotaRes instanceof Promise || statsRes instanceof Promise) {
      return Promise.all([Promise.resolve(quotaRes), Promise.resolve(statsRes)]).then(([q, s]) => evaluate(q, s));
    }
    return evaluate(quotaRes, statsRes);
  }

  checkLlmQuota(userId, { isByok = false } = {}) {
    if (!userId || (userId === 'default_user' && process.env.NODE_ENV === 'development')) {
      return { allowed: true, remainingRequests: 9999, isByok: Boolean(isByok) };
    }

    // BYOK users supply their own provider credentials
    if (isByok) {
      return {
        allowed: true,
        isByok: true,
        tier: 'byok_unlimited',
        usedRequests: 0,
        limitRequests: Infinity,
        remainingRequests: Infinity,
        reason: null
      };
    }

    const quotaRes = this.getUserQuota(userId);
    const statsRes = this.usageRepo.getUserMonthlyStats(userId);

    const evaluate = (quota, stats) => {
      // Check monthly budget if set
      if (quota.monthlyBudgetUsd > 0 && stats.platformCost >= quota.monthlyBudgetUsd) {
        return {
          allowed: false,
          tier: quota.tier,
          usedRequests: stats.systemLlmRequests,
          limitRequests: quota.monthlyLlmRequests,
          remainingRequests: 0,
          platformCost: stats.platformCost,
          budgetUsd: quota.monthlyBudgetUsd,
          reason: `Monthly platform budget limit of $${quota.monthlyBudgetUsd.toFixed(2)} reached. Add your own API key (BYOK) to continue without limits.`
        };
      }

      const allowed = stats.systemLlmRequests < quota.monthlyLlmRequests;

      return {
        allowed,
        isByok: false,
        tier: quota.tier,
        usedRequests: stats.systemLlmRequests,
        totalRequests: stats.llmRequestCount,
        limitRequests: quota.monthlyLlmRequests,
        remainingRequests: Math.max(0, quota.monthlyLlmRequests - stats.systemLlmRequests),
        reason: allowed ? null : `Monthly Mumble-managed AI processing limit of ${quota.monthlyLlmRequests} requests reached for ${quota.name} tier. Switch to your own API key (BYOK) to continue.`
      };
    };

    if (quotaRes instanceof Promise || statsRes instanceof Promise) {
      return Promise.all([Promise.resolve(quotaRes), Promise.resolve(statsRes)]).then(([q, s]) => evaluate(q, s));
    }
    return evaluate(quotaRes, statsRes);
  }
}

export const quotaService = new QuotaService();
