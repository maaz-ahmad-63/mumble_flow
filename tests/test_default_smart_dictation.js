import assert from 'assert';
import { textProcessingService } from '../server/services/textProcessingService.js';
import { escalationEngine } from '../server/services/dictation/escalationEngine.js';
import { resolveTone } from '../server/services/appToneService.js';
import {
  classifyAppContext,
  resolveEffectiveMode,
  CATEGORIES
} from '../desktop/electron/modules/appContext.js';
import { providerRegistry } from '../server/providers/ProviderRegistry.js';

export async function runDefaultSmartDictationTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE: Default Smart Dictation & Mode Preservations');
  console.log('======================================================\n');

  // 1️⃣ Test 1: Normal speech without a selected mode defaults to Smart Dictation
  console.log('1️⃣ Testing Normal Speech Without Selected Mode (Default Smart Dictation)...');
  const toneNoParam = resolveTone({});
  assert.strictEqual(toneNoParam.mode, 'smart', 'Unspecified mode must default to smart');
  assert.strictEqual(toneNoParam.source, 'default', 'Source must be default');

  const toneAutoNoApp = resolveTone({ tone: 'auto' });
  assert.strictEqual(toneAutoNoApp.mode, 'smart', 'Auto tone with no application context must resolve to smart');

  const escalationDefault = escalationEngine.evaluate('we should finish this task today', 'We should finish this task today.', {});
  assert.strictEqual(escalationDefault.requiresAI, true, 'Default dictation must escalate to smart AI enhancement');
  assert.strictEqual(escalationDefault.detectedMode, 'smart', 'Detected mode must be smart');
  assert.strictEqual(escalationDefault.reason, 'default_smart_dictation', 'Escalation reason must be default_smart_dictation');
  console.log('   ✓ Normal speech without selected mode correctly defaults to Smart Dictation.');

  // 2️⃣ Test 2: Grammar correction and punctuation improvements
  console.log('2️⃣ Testing Grammar Correction, Punctuation & Sentence Structuring...');
  const promptCheck = await textProcessingService.buildSystemPrompt({ tone: 'smart' });
  assert.ok(promptCheck.includes('Default Smart Dictation'), 'System prompt must include Default Smart Dictation instruction');
  assert.ok(promptCheck.includes('grammatically correct'), 'System prompt must instruct grammatical correction');
  assert.ok(promptCheck.includes('PRESERVE the speaker\'s original meaning'), 'System prompt must instruct preservation of meaning');

  // Test deterministic pre-clean handles stutters and basic punctuation
  const messyInput = 'actually i was thinking we should complete this task today because tomorrow we have to show this to the client';
  const preCleaned = textProcessingService.cleanText(messyInput, { tone: 'smart' });
  assert.ok(preCleaned.length > 0, 'Pre-cleaned text must not be empty');
  assert.strictEqual(preCleaned[0], preCleaned[0].toUpperCase(), 'Must capitalize initial sentence character');
  assert.ok(/[.!?]$/.test(preCleaned), 'Must end with punctuation');
  console.log('   ✓ Grammar correction and punctuation pre-cleaning rules verified.');

  // 3️⃣ Test 3: Preservation of original meaning, numbers, technical terms & URLs
  console.log('3️⃣ Testing Preservation of Technical Terms, Names, Identifiers & Context...');
  const technicalSpeech = 'please check userAuthService in server/index.js at port 3050 and check user usr_98765 on https://localhost:3050';
  const technicalCleaned = textProcessingService.cleanText(technicalSpeech, { tone: 'smart' });
  assert.ok(technicalCleaned.includes('userAuthService'), 'userAuthService identifier must be preserved');
  assert.ok(technicalCleaned.includes('server/index.js'), 'server/index.js file path must be preserved');
  assert.ok(technicalCleaned.includes('3050'), 'port number 3050 must be preserved');
  assert.ok(technicalCleaned.includes('usr_98765'), 'user identifier usr_98765 must be preserved');
  assert.ok(technicalCleaned.includes('https://localhost:3050'), 'URL must be preserved verbatim');
  console.log('   ✓ Technical terms, URLs, identifiers, and numbers strictly preserved.');

  // 4️⃣ Test 4: Raw mode bypass
  console.log('4️⃣ Testing Raw Mode Complete Bypass...');
  const rawSpeech = 'umm uhh actually no wait I mean like whatever   ';
  const rawCleaned = textProcessingService.cleanText(rawSpeech, { tone: 'raw' });
  assert.strictEqual(rawCleaned, rawSpeech, 'cleanText in raw mode must return verbatim text without stripping fillers');

  const rawProcessed = await textProcessingService.process(rawSpeech, { tone: 'raw' });
  assert.strictEqual(rawProcessed.processedText, rawSpeech.trim(), 'Raw mode must return verbatim transcript without AI rewrite');
  assert.strictEqual(rawProcessed.enhancedByAI, false, 'Raw mode must never invoke AI');
  assert.strictEqual(rawProcessed.escalationReason, 'raw_mode_selected', 'Escalation reason must be raw_mode_selected');
  console.log('   ✓ Raw mode completely bypasses filler removal, grammar correction, and LLM rewriting.');

  // 5️⃣ Test 5: Professional mode preservation
  console.log('5️⃣ Testing Explicit Professional / Formal Mode Preservation...');
  const profPrompt = await textProcessingService.buildSystemPrompt({ tone: 'professional' });
  assert.ok(profPrompt.includes('Professional Business & Executive Email'), 'Professional prompt must include executive email/business styling');

  const profEscalation = escalationEngine.evaluate('we need to update the stakeholders about the delay', 'We need to update the stakeholders about the delay.', { tone: 'professional' });
  assert.strictEqual(profEscalation.requiresAI, true);
  assert.strictEqual(profEscalation.detectedMode, 'professional');
  console.log('   ✓ Professional mode preserved and functions as expected.');

  // 6️⃣ Test 6: Developer and Code modes preservation
  console.log('6️⃣ Testing Explicit Developer and Code Modes Preservation...');
  const devEscalation = escalationEngine.evaluate('function add a b return a plus b', 'function add(a, b) { return a + b; }', { tone: 'developer' });
  assert.strictEqual(devEscalation.requiresAI, true);
  assert.strictEqual(devEscalation.detectedMode, 'developer');

  const codePrompt = await textProcessingService.buildSystemPrompt({ tone: 'code' });
  assert.ok(codePrompt.includes('Software Engineer & Code Implementation Generator'), 'Code prompt must include code generator instructions');
  console.log('   ✓ Developer and Code modes preserved.');

  // 7️⃣ Test 7: Email and Prompt generation
  console.log('7️⃣ Testing Spoken Intent Escalation to Email and Prompt Modes...');
  const emailIntent = escalationEngine.evaluate('write an email to Sarah asking for the project timeline', '', { tone: 'smart' });
  assert.strictEqual(emailIntent.requiresAI, true);
  assert.strictEqual(emailIntent.detectedMode, 'email', 'Spoken email request must escalate to email mode even in smart dictation');

  const promptIntent = escalationEngine.evaluate('create a prompt for ChatGPT to summarize meeting transcripts', '', { tone: 'smart' });
  assert.strictEqual(promptIntent.requiresAI, true);
  assert.strictEqual(promptIntent.detectedMode, 'prompt', 'Spoken prompt request must escalate to prompt mode even in smart dictation');
  console.log('   ✓ Email and Prompt generation intents successfully detected and routed.');

  // 8️⃣ Test 8: Application-aware mode selection
  console.log('8️⃣ Testing Application-Aware Mode Selection vs Fallback...');
  const vscodeContext = classifyAppContext({ appName: 'Code', bundleId: 'com.microsoft.VSCode' });
  const vscodeResolution = resolveEffectiveMode('auto', vscodeContext);
  assert.strictEqual(vscodeResolution.finalMode, 'developer');
  assert.strictEqual(vscodeResolution.source, 'app-aware');

  const gmailContext = classifyAppContext({ appName: 'Google Chrome', windowTitle: 'Inbox (5) - me@company.com - Gmail' });
  const gmailResolution = resolveEffectiveMode('auto', gmailContext);
  assert.strictEqual(gmailResolution.finalMode, 'email');
  assert.strictEqual(gmailResolution.source, 'app-aware');

  const slackContext = classifyAppContext({ appName: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' });
  const slackResolution = resolveEffectiveMode('auto', slackContext);
  assert.strictEqual(slackResolution.finalMode, 'casual');
  assert.strictEqual(slackResolution.source, 'app-aware');

  const unknownContext = classifyAppContext({ appName: 'CustomTool', bundleId: 'com.custom.tool' });
  const unknownResolution = resolveEffectiveMode('auto', unknownContext);
  assert.strictEqual(unknownResolution.finalMode, 'smart', 'Unknown app with Auto mode must fall back to Smart Dictation');
  assert.strictEqual(unknownResolution.source, 'fallback', 'Source must be fallback');
  console.log('   ✓ Application-aware contexts preserve specialized modes; unknown apps fall back to Smart Dictation.');

  // 9️⃣ Test 9: AI provider failure and fallback
  console.log('9️⃣ Testing AI Provider Failure Graceful Fallback...');
  // Process with forceLocal or simulated provider failure
  const fallbackResult = await textProcessingService.process('hello this is a test speech', {
    tone: 'smart',
    forceLocal: true
  });
  assert.ok(fallbackResult.processedText.length > 0, 'Fallback processedText must never be empty');
  assert.strictEqual(fallbackResult.enhancedByAI, false, 'Must not claim AI enhancement when fallback occurs');
  assert.strictEqual(fallbackResult.escalationReason, 'user_setting_ai_disabled', 'Should record user_setting_ai_disabled fallback reason');

  // Test with invalid provider to verify quality fallback catch block
  const errorFallbackResult = await textProcessingService.process('this should be preserved even if AI crashes', {
    tone: 'smart',
    llmProvider: 'non_existent_mock_provider'
  });
  assert.ok(errorFallbackResult.processedText.toLowerCase().includes('this should be preserved even if ai crashes'), 'User transcript must be preserved on provider failure');
  assert.strictEqual(errorFallbackResult.enhancedByAI, false);
  assert.ok(errorFallbackResult.warning, 'Warning message must explain fallback occurred');
  console.log('   ✓ AI failure safely falls back to local cleanup without losing transcript.');

  // 🔟 Test 10: Web and desktop processing consistency
  console.log('🔟 Testing Web and Desktop Processing Consistency...');
  // Desktop payload resolution:
  const desktopResolved = resolveTone({
    tone: unknownResolution.finalMode, // 'smart'
    mode: unknownResolution.finalMode,  // 'smart'
    toneSource: unknownResolution.source // 'fallback'
  });
  assert.strictEqual(desktopResolved.mode, 'smart');

  // Web payload resolution (no mode selected / default smart):
  const webResolved = resolveTone({
    tone: 'smart',
    mode: 'smart'
  });
  assert.strictEqual(webResolved.mode, 'smart');

  // Web payload resolution (empty / omitted tone):
  const webOmittedResolved = resolveTone({});
  assert.strictEqual(webOmittedResolved.mode, 'smart');

  assert.strictEqual(desktopResolved.mode, webResolved.mode, 'Desktop fallback and Web default must resolve to identical mode');
  assert.strictEqual(webResolved.mode, webOmittedResolved.mode, 'Web explicit smart and omitted mode must resolve to identical mode');
  console.log('   ✓ Web and Desktop clients resolve to consistent Smart Dictation behavior.');

  console.log('\n✨ ALL DEFAULT SMART DICTATION TESTS PASSED WITH 100% SUCCESS.\n');
  return true;
}

if (process.argv[1]?.endsWith('test_default_smart_dictation.js')) {
  runDefaultSmartDictationTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}
