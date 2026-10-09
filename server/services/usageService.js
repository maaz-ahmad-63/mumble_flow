import { usageRepository } from '../db/repositories/usageRepository.js';
import { pricingService } from './pricingService.js';
import { logger } from './logger.js';

export class UsageService {
  constructor(repo = usageRepository, pricing = pricingService) {
    this.repo = repo;
    this.pricing = pricing;
  }

  recordTranscriptionUsage({
    userId,
    workspaceId,
    sessionId,
    provider,
    model,
    audioSeconds,
    latencyMs,
    status = 'success',
    isByok = false,
    keySource = 'system',
    costIsEstimated = true,
    errorMessage = null
  }) {
    if (!userId) return null;

    const estimatedCost = this.pricing.calculateSttCost(provider, model, audioSeconds);

    const event = this.repo.recordEvent({
      userId,
      workspaceId,
      sessionId,
      type: 'transcription',
      provider: provider || 'unknown',
      model: model || 'default',
      audioSeconds: Number(audioSeconds) || 0,
      latencyMs: Number(latencyMs) || 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost,
      status,
      isByok,
      keySource,
      costIsEstimated,
      errorMessage
    });

    logger.debug(`[Usage] Recorded STT usage for user ${userId} (BYOK: ${isByok}): ${audioSeconds}s, cost: $${estimatedCost}`);
    return event;
  }

  recordLlmUsage({
    userId,
    workspaceId,
    sessionId,
    provider,
    model,
    inputTokens = 0,
    outputTokens = 0,
    latencyMs = 0,
    type = 'text_processing',
    status = 'success',
    isByok = false,
    keySource = 'system',
    costIsEstimated = true,
    errorMessage = null
  }) {
    if (!userId) return null;

    const estimatedCost = this.pricing.calculateLlmCost(provider, model, inputTokens, outputTokens);

    const event = this.repo.recordEvent({
      userId,
      workspaceId,
      sessionId,
      type,
      provider: provider || 'unknown',
      model: model || 'default',
      audioSeconds: 0,
      latencyMs: Number(latencyMs) || 0,
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      estimatedCost,
      status,
      isByok,
      keySource,
      costIsEstimated,
      errorMessage
    });

    logger.debug(`[Usage] Recorded LLM usage for user ${userId} (BYOK: ${isByok}): ${inputTokens} in / ${outputTokens} out, cost: $${estimatedCost}`);
    return event;
  }

  recordFailure({
    userId,
    workspaceId,
    sessionId,
    type = 'transcription',
    provider = 'unknown',
    model = 'default',
    audioSeconds = 0,
    latencyMs = 0,
    errorMessage,
    isByok = false,
    keySource = 'system'
  }) {
    if (!userId) return null;

    const event = this.repo.recordEvent({
      userId,
      workspaceId,
      sessionId,
      type,
      provider,
      model,
      audioSeconds: Number(audioSeconds) || 0,
      latencyMs: Number(latencyMs) || 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0.0,
      status: 'failure',
      isByok,
      keySource,
      costIsEstimated: false,
      errorMessage: String(errorMessage || 'Operation failed')
    });

    logger.warn(`[Usage] Recorded failure event for user ${userId}: ${errorMessage}`);
    return event;
  }

  getUserStats(userId) {
    return this.repo.getUserMonthlyStats(userId);
  }

  getDashboardStats(userId) {
    return this.repo.getDetailedDashboardStats(userId);
  }

  getGlobalAdminStats() {
    return this.repo.getGlobalAdminUsageStats();
  }

  getUserEvents(userId, options = {}) {
    return this.repo.getUserUsage(userId, options);
  }
}

export const usageService = new UsageService();
