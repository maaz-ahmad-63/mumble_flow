import assert from 'assert';
import { userRepository } from '../server/db/repositories/userRepository.js';
import { usageRepository } from '../server/db/repositories/usageRepository.js';
import { usageService } from '../server/services/usageService.js';
import { quotaService, QUOTA_TIERS } from '../server/services/quotaService.js';
import { pricingService } from '../server/services/pricingService.js';
import { authService } from '../server/services/authService.js';
import { apiKeyService } from '../server/services/apiKeyService.js';

export async function runPhase3UsageAndCostTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 26: Phase 3 Usage Tracking & Cost Control');
  console.log('======================================================\n');

  const timestamp = Date.now();
  const userAId = `usr_p3_a_${timestamp}`;
  const userBId = `usr_p3_b_${timestamp}`;

  userRepository.create({
    id: userAId,
    email: `p3_a_${timestamp}@test.com`,
    passwordHash: 'dummy_hash',
    name: 'Phase 3 User A',
    role: 'user',
    status: 'active'
  });

  userRepository.create({
    id: userBId,
    email: `p3_b_${timestamp}@test.com`,
    passwordHash: 'dummy_hash',
    name: 'Phase 3 User B',
    role: 'user',
    status: 'active'
  });

  // -----------------------------------------------------------
  // 1. Usage Accuracy: Metrics, Latency, and Cost Calculations
  // -----------------------------------------------------------
  console.log('1️⃣ Testing Telemetry Accuracy & Cost Calculations...');
  {
    const audioSec = 120; // 2 minutes
    const sttCost = pricingService.calculateSttCost('groq', 'whisper-large-v3-turbo', audioSec);
    assert.ok(sttCost > 0, 'STT cost should be greater than zero for 120s of audio');

    const evtStt = usageService.recordTranscriptionUsage({
      userId: userAId,
      sessionId: 'sess_1',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioSeconds: audioSec,
      latencyMs: 350,
      status: 'success',
      isByok: false,
      keySource: 'system',
      costIsEstimated: true
    });

    assert.strictEqual(evtStt.userId, userAId);
    assert.strictEqual(evtStt.audioSeconds, 120);
    assert.strictEqual(evtStt.latencyMs, 350);
    assert.strictEqual(evtStt.isByok, false);
    assert.strictEqual(evtStt.costIsEstimated, true);
    assert.strictEqual(evtStt.platformCost, sttCost);
    assert.strictEqual(evtStt.userCost, sttCost);

    const inTokens = 400;
    const outTokens = 100;
    const llmCost = pricingService.calculateLlmCost('groq', 'openai/gpt-oss-20b', inTokens, outTokens);
    assert.ok(llmCost > 0, 'LLM cost should be calculated');

    const evtLlm = usageService.recordLlmUsage({
      userId: userAId,
      sessionId: 'sess_2',
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      inputTokens: inTokens,
      outputTokens: outTokens,
      latencyMs: 420,
      status: 'success',
      isByok: false,
      keySource: 'system',
      costIsEstimated: true
    });

    assert.strictEqual(evtLlm.userId, userAId);
    assert.strictEqual(evtLlm.inputTokens, 400);
    assert.strictEqual(evtLlm.outputTokens, 100);
    assert.strictEqual(evtLlm.platformCost, llmCost);
    assert.strictEqual(evtLlm.costIsEstimated, true);

    console.log('   ✓ STT and LLM metrics, token volumes, latencies, and costs recorded with precision.');
  }

  // -----------------------------------------------------------
  // 2. BYOK Separation: Platform Cost vs Direct User Cost
  // -----------------------------------------------------------
  console.log('\n2️⃣ Testing BYOK vs Mumble-Managed Cost Separation...');
  {
    // User A records BYOK usage (supplying own Groq key)
    const byokAudioSec = 300; // 5 minutes
    const byokEstimatedCost = pricingService.calculateSttCost('groq', 'whisper-large-v3-turbo', byokAudioSec);

    const byokEvt = usageService.recordTranscriptionUsage({
      userId: userAId,
      sessionId: 'sess_byok_1',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioSeconds: byokAudioSec,
      latencyMs: 310,
      status: 'success',
      isByok: true,
      keySource: 'user',
      costIsEstimated: true
    });

    assert.strictEqual(byokEvt.isByok, true);
    assert.strictEqual(byokEvt.keySource, 'user');
    assert.strictEqual(byokEvt.platformCost, 0.0, 'Platform cost for BYOK MUST be exactly $0.00');
    assert.strictEqual(byokEvt.userCost, byokEstimatedCost, 'User cost should reflect estimated provider spend');

    const stats = usageService.getUserStats(userAId);
    assert.strictEqual(stats.systemAudioSeconds, 120, 'System audio should only include non-BYOK audio (120s)');
    assert.strictEqual(stats.byokAudioSeconds, 300, 'BYOK audio should be 300s');
    assert.strictEqual(stats.audioSeconds, 420, 'Total audio should be 120s + 300s = 420s');
    assert.strictEqual(stats.platformCost < stats.totalEstimatedCost, true, 'Platform cost must be strictly less than total spend');
    assert.strictEqual(stats.byokCost > 0, true, 'BYOK spend must be accounted for');

    console.log(`   ✓ BYOK platform cost is $0.00; User spend: $${stats.byokCost}, Platform spend: $${stats.platformCost}.`);
  }

  // -----------------------------------------------------------
  // 3. User Isolation: Telemetry & Cost Partitioning
  // -----------------------------------------------------------
  console.log('\n3️⃣ Testing User Isolation & Tenant Boundaries...');
  {
    // User B records usage
    usageService.recordTranscriptionUsage({
      userId: userBId,
      sessionId: 'sess_user_b_1',
      provider: 'openai',
      model: 'whisper-1',
      audioSeconds: 60,
      latencyMs: 500,
      status: 'success',
      isByok: false,
      keySource: 'system'
    });

    const statsA = usageService.getUserStats(userAId);
    const statsB = usageService.getUserStats(userBId);

    assert.strictEqual(statsB.audioSeconds, 60, "User B's audio seconds must be 60s");
    assert.strictEqual(statsA.audioSeconds, 420, "User A's audio seconds must remain 420s");
    assert.notStrictEqual(statsA.totalEstimatedCost, statsB.totalEstimatedCost);

    const eventsA = usageService.getUserEvents(userAId);
    const eventsB = usageService.getUserEvents(userBId);
    assert.ok(eventsA.every(e => e.user_id === userAId), 'All User A events must belong strictly to User A');
    assert.ok(eventsB.every(e => e.user_id === userBId), 'All User B events must belong strictly to User B');

    console.log('   ✓ User A and User B metrics and events are strictly isolated with zero crosstalk.');
  }

  // -----------------------------------------------------------
  // 4. Server-Side Quotas & BYOK Exemption
  // -----------------------------------------------------------
  // -----------------------------------------------------------
  // 4. Server-Side Quotas & BYOK Exemption
  // -----------------------------------------------------------
  console.log('\n4️⃣ Testing Server-Side Monthly Quotas & BYOK Exemption...');
  {
    const quotaUser = `usr_quota_test_${timestamp}`;
    userRepository.create({
      id: quotaUser,
      email: `quota_${timestamp}@test.com`,
      passwordHash: 'dummy_hash',
      name: 'Quota User',
      role: 'user',
      status: 'active'
    });

    // Free tier: 60 minutes audio
    quotaService.setUserQuota(quotaUser, 'free');
    const initialQuota = quotaService.getUserQuota(quotaUser);
    assert.strictEqual(initialQuota.monthlyAudioMinutes, 60.0);
    assert.strictEqual(initialQuota.monthlyLlmRequests, 500);

    // Initial check should pass
    const check1 = quotaService.checkAudioQuota(quotaUser, 60, { isByok: false });
    assert.strictEqual(check1.allowed, true);

    // Record 61 minutes of system audio (exceeding 60.0 min limit)
    usageService.recordTranscriptionUsage({
      userId: quotaUser,
      sessionId: 'sess_quota_fill',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioSeconds: 61 * 60,
      status: 'success',
      isByok: false,
      keySource: 'system'
    });

    // Subsequent system audio check must be blocked
    const checkBlocked = quotaService.checkAudioQuota(quotaUser, 30, { isByok: false });
    assert.strictEqual(checkBlocked.allowed, false, 'System usage must be blocked when quota is exceeded');
    assert.ok(checkBlocked.reason.includes('exceeded'), 'Reason must explain quota exhaustion');

    // CRITICAL: BYOK request MUST BE EXEMPT from quota block!
    const checkByokAllowed = quotaService.checkAudioQuota(quotaUser, 30, { isByok: true });
    assert.strictEqual(checkByokAllowed.allowed, true, 'BYOK usage MUST be allowed even if platform quota is exhausted');
    assert.strictEqual(checkByokAllowed.isByok, true);

    // Admin updates quota to Pro tier (1,000 mins)
    const updatedQuota = quotaService.setUserQuota(quotaUser, 'pro');
    assert.strictEqual(updatedQuota.tier, 'pro');
    assert.strictEqual(updatedQuota.monthlyAudioMinutes, 1000.0);

    // Now system check should pass again under Pro tier
    const checkPro = quotaService.checkAudioQuota(quotaUser, 30, { isByok: false });
    assert.strictEqual(checkPro.allowed, true, 'Pro tier allows usage after limit upgrade');

    // Monthly platform budget test
    quotaService.setUserQuota(quotaUser, 'pro', { monthlyBudgetUsd: 0.0001 }); // very small budget
    const checkBudgetBlocked = quotaService.checkAudioQuota(quotaUser, 10, { isByok: false });
    assert.strictEqual(checkBudgetBlocked.allowed, false, 'Should block platform request when budget reached');
    assert.ok(checkBudgetBlocked.reason.includes('budget'), 'Reason mentions budget limit');

    // BYOK continues to bypass budget limit
    const checkBudgetByok = quotaService.checkAudioQuota(quotaUser, 10, { isByok: true });
    assert.strictEqual(checkBudgetByok.allowed, true, 'BYOK bypasses platform budget limits');

    console.log('   ✓ Quota limits enforced server-side; BYOK requests cleanly bypass platform limits.');
  }

  // -----------------------------------------------------------
  // 5. System Failures & Reliability Telemetry
  // -----------------------------------------------------------
  console.log('\n5️⃣ Testing Failure Tracking & Reliability Telemetry...');
  {
    const failEvt = usageService.recordFailure({
      userId: userAId,
      sessionId: 'sess_fail_1',
      type: 'transcription',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioSeconds: 15,
      latencyMs: 120,
      errorMessage: 'Groq HTTP 400 invalid_media_file: corrupt header',
      isByok: true,
      keySource: 'user'
    });

    assert.strictEqual(failEvt.status, 'failure');
    assert.strictEqual(failEvt.userCost, 0.0, 'Failed operations must incur zero user cost');
    assert.strictEqual(failEvt.platformCost, 0.0, 'Failed operations must incur zero platform cost');
    assert.strictEqual(failEvt.errorMessage, 'Groq HTTP 400 invalid_media_file: corrupt header');
    assert.strictEqual(failEvt.isByok, true);

    const adminStats = usageService.getGlobalAdminStats();
    assert.ok(adminStats.summary.failureCountMonth >= 1, 'Admin stats should record monthly failures');
    assert.ok(adminStats.recentFailures.some(f => f.errorMessage?.includes('invalid_media_file')), 'Recent failures log contains error');

    console.log(`   ✓ Failure tracked: "${failEvt.errorMessage}" with $0.00 billed and failure log updated.`);
  }

  // -----------------------------------------------------------
  // 6. Concurrent Telemetry Recording (WAL Concurrency)
  // -----------------------------------------------------------
  console.log('\n6️⃣ Testing Concurrent Requests Under Load...');
  {
    const concurrentUsers = Array.from({ length: 15 }, (_, i) => `usr_concurrent_${i}_${timestamp}`);
    concurrentUsers.forEach((uid, i) => {
      userRepository.create({
        id: uid,
        email: `conc_${i}_${timestamp}@test.com`,
        passwordHash: 'dummy_hash',
        name: `Concurrent User ${i}`,
        role: 'user',
        status: 'active'
      });
    });

    const promises = concurrentUsers.map((uid, idx) => {
      const isByok = idx % 2 === 0;
      return Promise.all([
        usageService.recordTranscriptionUsage({
          userId: uid,
          sessionId: `sess_conc_${idx}`,
          provider: 'groq',
          model: 'whisper-large-v3-turbo',
          audioSeconds: 10 + idx,
          latencyMs: 200 + idx,
          isByok,
          keySource: isByok ? 'user' : 'system'
        }),
        usageService.recordLlmUsage({
          userId: uid,
          sessionId: `sess_conc_llm_${idx}`,
          provider: 'groq',
          model: 'openai/gpt-oss-20b',
          inputTokens: 100 * idx,
          outputTokens: 50 * idx,
          latencyMs: 150 + idx,
          isByok,
          keySource: isByok ? 'user' : 'system'
        })
      ]);
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 15, 'All 15 concurrent pairs must resolve without error');

    for (let i = 0; i < 15; i++) {
      const stats = usageService.getUserStats(concurrentUsers[i]);
      assert.strictEqual(stats.audioSeconds, 10 + i, `User ${i} audio seconds must match`);
    }

    console.log('   ✓ 15 concurrent request telemetry batches recorded concurrently without locks or contention.');
  }

  // -----------------------------------------------------------
  // 7. Streaming Dictation User Attribution Contract
  // -----------------------------------------------------------
  console.log('\n7️⃣ Testing Streaming Dictation User Attribution...');
  {
    const streamUser = `usr_stream_${timestamp}`;
    userRepository.create({
      id: streamUser,
      email: `stream_${timestamp}@test.com`,
      passwordHash: 'dummy_hash',
      name: 'Stream User',
      role: 'user',
      status: 'active'
    });

    const token = authService.generateSession(streamUser);
    const validated = authService.validateToken(token);
    assert.ok(validated, 'Token must validate to session user');
    assert.strictEqual(validated.id, streamUser);

    // Save BYOK key for user
    await apiKeyService.saveUserKey({ userId: streamUser, provider: 'groq', rawKey: 'gsk_stream_test_key_12345', validate: false });
    const keyInfo = apiKeyService.getDecryptedKey(streamUser, 'groq');
    assert.strictEqual(keyInfo.source, 'user');

    // Simulate streaming completed telemetry recording
    const streamEvt = usageService.recordTranscriptionUsage({
      userId: streamUser,
      sessionId: 'stream-sess-999',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioSeconds: 45,
      latencyMs: 180,
      status: 'success',
      isByok: keyInfo.source === 'user',
      keySource: keyInfo.source
    });

    assert.strictEqual(streamEvt.userId, streamUser);
    assert.strictEqual(streamEvt.isByok, true);
    assert.strictEqual(streamEvt.platformCost, 0.0);
    assert.ok(streamEvt.userCost > 0);

    console.log('   ✓ Streaming dictation authenticated, BYOK resolved, and attributed correctly.');
  }

  console.log('\n✅ ALL PHASE 3 USAGE TRACKING & COST CONTROL TESTS PASSED!\n');
}

if (process.argv[1] && process.argv[1].endsWith('test_phase3_usage_and_costs.js')) {
  runPhase3UsageAndCostTests().catch(err => {
    console.error('❌ Phase 3 Tests Failed:', err);
    process.exit(1);
  });
}
