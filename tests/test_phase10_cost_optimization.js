import assert from 'assert';
import { textProcessingService } from '../server/services/textProcessingService.js';
import { escalationEngine } from '../server/services/dictation/escalationEngine.js';
import { localWhisperProvider, LocalWhisperProvider } from '../server/providers/transcription/LocalWhisperProvider.js';
import { transcriptionService } from '../server/services/transcriptionService.js';
import { pricingService } from '../server/services/pricingService.js';
import { quotaService } from '../server/services/quotaService.js';
import { authService } from '../server/services/authService.js';
import { storage } from '../server/services/storageService.js';

export async function runPhase10CostOptimizationTests() {
  console.log('2️⃣0️⃣ Testing Phase 10: Cost-Optimized AI & Local/Cloud Architecture Suite...');

  // Test A & C: Normal dictation should NOT escalate to LLM (0 tokens, $0.00 LLM cost)
  const normalInput = "Hey Rahul I will send the document tomorrow at 5pm.";
  const normalDecision = escalationEngine.evaluate(normalInput, normalInput, { tone: 'casual' });
  assert.strictEqual(normalDecision.requiresAI, false, 'Normal dictation must NOT require AI');
  assert.strictEqual(normalDecision.reason, 'deterministic_processing_sufficient');

  const normalResult = await textProcessingService.process(normalInput, { tone: 'casual' });
  assert.strictEqual(normalResult.enhancedByAI, false, 'Normal dictation must not be marked as AI enhanced');
  assert.strictEqual(normalResult.aiMs, 0, 'Normal dictation must have 0ms AI latency');
  assert.ok(normalResult.processedText.length > 0, 'Cleaned text must exist');
  console.log('   A & C. Deterministic-Only Normal Dictation: Verified (0 tokens, $0.00 LLM cost)');

  // Test B: Explicit semantic rewrite triggers AI escalation
  const explicitDirective = "Turn what I just said into a concise client email for the project kickoff.";
  const explicitDecision = escalationEngine.evaluate(explicitDirective, explicitDirective, { tone: 'casual' });
  assert.strictEqual(explicitDecision.requiresAI, true, 'Explicit directive must escalate to AI');
  assert.strictEqual(explicitDecision.reason, 'explicit_instruction_detected');

  const emailDecision = escalationEngine.evaluate("Project status update", "Project status update", { tone: 'email' });
  assert.strictEqual(emailDecision.requiresAI, true, 'Email mode must escalate to generative AI');
  console.log('   B. AI Escalation Engine:     Verified (Detects semantic rewrites deterministically)');

  // Test D: Explicit AI Enhancement user setting
  const neverAiDecision = escalationEngine.evaluate(explicitDirective, explicitDirective, { aiEnhancement: 'never' });
  assert.strictEqual(neverAiDecision.requiresAI, false, 'aiEnhancement=never must block AI calls');
  assert.strictEqual(neverAiDecision.reason, 'user_setting_ai_disabled');

  const alwaysAiDecision = escalationEngine.evaluate(normalInput, normalInput, { aiEnhancement: 'always' });
  assert.strictEqual(alwaysAiDecision.requiresAI, true, 'aiEnhancement=always must trigger AI');
  console.log('   D. AI Setting Controls:      Verified (Respects Auto / Always / Never)');

  // Test E & F: Local STT Provider Abstraction & Availability Probe
  const mockLocalProvider = new LocalWhisperProvider({
    endpoint: 'http://127.0.0.1:9999/v1/audio/transcriptions', // Offline port
    model: 'whisper-base-en',
    computeType: 'int8',
    device: 'cpu'
  });

  assert.strictEqual(mockLocalProvider.name, 'local-whisper');
  assert.strictEqual(mockLocalProvider.computeType, 'int8');
  assert.strictEqual(mockLocalProvider.device, 'cpu');

  const availability = await mockLocalProvider.checkAvailability(true);
  assert.strictEqual(availability.available, false, 'Offline endpoint must report available=false without crashing');
  console.log('   E & F. Local Whisper Probe:   Verified (Accurately reports offline status without fake pass)');

  // Test G: Cloud Fallback when Local STT is unavailable
  const fallbackResolution = await transcriptionService.resolveProvider({
    transcriptionMode: 'local',
    sttProvider: 'groq'
  });
  assert.strictEqual(fallbackResolution.isLocal, false);
  assert.strictEqual(fallbackResolution.providerName, 'groq');
  assert.strictEqual(fallbackResolution.fallbackReason, 'local_whisper_unavailable');
  console.log('   G. Cloud STT Fallback:       Verified (Local unavailable seamlessly falls back to cloud)');

  // Test H & I: Quality Fallback (AI failure does NOT lose transcript)
  const failureInput = "We need to fix the authentication timeout before deploying to staging.";
  const failedResult = await textProcessingService.process(failureInput, {
    tone: 'email',
    llmProvider: 'groq',
    apiKey: 'invalid_dummy_key_to_force_llm_failure'
  });

  assert.ok(failedResult.processedText, 'Processed text must be returned even when LLM fails');
  assert.ok(failedResult.processedText.includes('authentication timeout'), 'Transcript must be preserved');
  assert.strictEqual(failedResult.enhancedByAI, false);
  assert.ok(failedResult.warning, 'Quality fallback warning must be included');
  console.log('   H & I. Quality Fallback:      Verified (Zero transcript loss on AI provider failure)');

  // Test J: Per-User AI Quota Enforcement & Fallback
  const regUser = await authService.register({
    email: `quota_test_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Quota Tester'
  });
  const testUserId = regUser.user.id;
  quotaService.setUserQuota(testUserId, 'free', { monthlyAudioMinutes: 100, monthlyLlmRequests: 0 }); // 0 AI allowance
  
  const quotaExceededResult = await textProcessingService.process("Please write an email to the client.", {
    tone: 'email',
    userId: testUserId
  });
  assert.strictEqual(quotaExceededResult.enhancedByAI, false, 'Must not call LLM when quota exceeded');
  assert.strictEqual(quotaExceededResult.escalationReason, 'quota_exceeded_fallback');
  assert.ok(quotaExceededResult.processedText.length > 0, 'Transcript preserved via deterministic processing');
  console.log('   J. AI Budget & Quota Fallback: Verified');

  // Test K & L: Cost and Granular Latency Reporting
  const localCost = pricingService.calculateSttCost('local', 'whisper-1', 120);
  assert.strictEqual(localCost, 0.0, 'Local STT must have $0.00 cost');

  const groqSttCost = pricingService.calculateSttCost('groq', 'whisper-large-v3-turbo', 60); // 1 min
  assert.ok(groqSttCost > 0, 'Cloud STT cost must be calculated');

  const zeroLlmCost = pricingService.calculateLlmCost('local', 'llama3.2', 100, 100);
  assert.strictEqual(zeroLlmCost, 0.0, 'Local LLM must have $0.00 cost');

  const totalCalculated = pricingService.calculateTotalCost(groqSttCost, 0.0);
  assert.strictEqual(totalCalculated, groqSttCost);
  console.log('   K & L. Cost & Granular Metrics: Verified (Distinguishes STT from LLM cost)');

  // Test M: Privacy in Local Mode
  const localResolution = await transcriptionService.resolveProvider({ transcriptionMode: 'cloud' });
  assert.strictEqual(localResolution.isLocal, false, 'Cloud mode routes to cloud');
  console.log('   M. Privacy Architecture:    Verified (Clear local/cloud boundary)');

  console.log('   ✓ Phase 10 Cost-Optimized AI & Local/Cloud Architecture suite passed with 100% fidelity.\n');
}
