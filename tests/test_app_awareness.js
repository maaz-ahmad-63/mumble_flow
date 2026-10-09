import assert from 'assert';
import {
  classifyAppContext,
  resolveEffectiveMode,
  isMumbleApp,
  CATEGORIES
} from '../desktop/electron/modules/appContext.js';
import { resolveTone } from '../server/services/appToneService.js';

export function runAppAwarenessTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING APP AWARENESS & GLOBAL MODE TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Chrome + Auto → browser mode
  console.log('1️⃣ Testing Chrome + Auto → browser mode...');
  const chromeApp = classifyAppContext({
    appName: 'Google Chrome',
    processName: 'chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'New Tab'
  });
  assert.strictEqual(chromeApp.category, CATEGORIES.BROWSER, 'Chrome category should be browser');
  assert.strictEqual(chromeApp.recommendedMode, 'browser', 'Chrome recommended mode should be browser');

  const chromeAuto = resolveEffectiveMode('auto', chromeApp);
  assert.strictEqual(chromeAuto.finalMode, 'browser', 'Chrome + Auto must resolve to browser mode');
  assert.strictEqual(chromeAuto.source, 'app-aware', 'Source must be app-aware');
  console.log('   ✓ Chrome + Auto → browser mode (source: app-aware)');

  // Test 2: VS Code + Auto → developer mode
  console.log('2️⃣ Testing VS Code + Auto → developer mode...');
  const vscodeApp = classifyAppContext({
    appName: 'Visual Studio Code',
    processName: 'code',
    bundleId: 'com.microsoft.VSCode',
    windowTitle: 'main.js - mumble-flow'
  });
  assert.strictEqual(vscodeApp.category, CATEGORIES.DEVELOPER_CODE, 'VS Code category should be developer/code');
  assert.strictEqual(vscodeApp.recommendedMode, 'developer', 'VS Code recommended mode should be developer');

  const vscodeAuto = resolveEffectiveMode('auto', vscodeApp);
  assert.strictEqual(vscodeAuto.finalMode, 'developer', 'VS Code + Auto must resolve to developer mode');
  assert.strictEqual(vscodeAuto.source, 'app-aware', 'Source must be app-aware');
  console.log('   ✓ VS Code + Auto → developer mode (source: app-aware)');

  // Test 3: Gmail + Auto → email mode
  console.log('3️⃣ Testing Gmail + Auto → email mode...');
  const gmailApp = classifyAppContext({
    appName: 'Google Chrome',
    processName: 'chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'Inbox (12) - user@example.com - Gmail'
  });
  assert.strictEqual(gmailApp.category, CATEGORIES.EMAIL, 'Gmail window category should be email');
  assert.strictEqual(gmailApp.recommendedMode, 'email', 'Gmail recommended mode should be email');

  const gmailAuto = resolveEffectiveMode('auto', gmailApp);
  assert.strictEqual(gmailAuto.finalMode, 'email', 'Gmail + Auto must resolve to email mode');
  assert.strictEqual(gmailAuto.source, 'app-aware', 'Source must be app-aware');
  console.log('   ✓ Gmail + Auto → email mode (source: app-aware)');

  // Test 4: ChatGPT + Auto → prompt mode
  console.log('4️⃣ Testing ChatGPT + Auto → prompt mode...');
  const chatgptApp = classifyAppContext({
    appName: 'Google Chrome',
    processName: 'chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'ChatGPT — Explain quantum computing'
  });
  assert.strictEqual(chatgptApp.category, CATEGORIES.AI_CHAT, 'ChatGPT category should be AI/chat');
  assert.strictEqual(chatgptApp.recommendedMode, 'prompt', 'ChatGPT recommended mode should be prompt');

  const chatgptAuto = resolveEffectiveMode('auto', chatgptApp);
  assert.strictEqual(chatgptAuto.finalMode, 'prompt', 'ChatGPT + Auto must resolve to prompt mode');
  assert.strictEqual(chatgptAuto.source, 'app-aware', 'Source must be app-aware');
  console.log('   ✓ ChatGPT + Auto → prompt mode (source: app-aware)');

  // Test 5: Unknown app + Auto → fallback
  console.log('5️⃣ Testing Unknown app + Auto → fallback...');
  const unknownApp = classifyAppContext({
    appName: 'my_custom_proprietary_tool',
    processName: 'custom_tool',
    bundleId: 'com.custom.tool',
    windowTitle: 'Data Inspector'
  });
  assert.strictEqual(unknownApp.category, CATEGORIES.UNKNOWN, 'Unknown app category should be unknown');
  assert.strictEqual(unknownApp.recommendedMode, 'casual', 'Unknown app fallback mode should be casual');

  const unknownAuto = resolveEffectiveMode('auto', unknownApp);
  assert.strictEqual(unknownAuto.finalMode, 'casual', 'Unknown app + Auto must resolve to fallback (casual)');
  assert.strictEqual(unknownAuto.source, 'fallback', 'Source must be fallback');
  console.log('   ✓ Unknown app + Auto → fallback (casual) (source: fallback)');

  // Test 6: Chrome + Developer manual → developer mode
  console.log('6️⃣ Testing Chrome + Developer manual → developer mode (Manual override)...');
  const chromeDevManual = resolveEffectiveMode('developer', chromeApp);
  assert.strictEqual(chromeDevManual.finalMode, 'developer', 'Chrome + Developer manual must resolve to developer mode');
  assert.strictEqual(chromeDevManual.source, 'manual', 'Source must be manual');
  console.log('   ✓ Chrome + Developer manual → developer mode (source: manual)');

  // Test 7: Gmail + Prompt manual → prompt mode
  console.log('7️⃣ Testing Gmail + Prompt manual → prompt mode (Manual override)...');
  const gmailPromptManual = resolveEffectiveMode('prompt', gmailApp);
  assert.strictEqual(gmailPromptManual.finalMode, 'prompt', 'Gmail + Prompt manual must resolve to prompt mode');
  assert.strictEqual(gmailPromptManual.source, 'manual', 'Source must be manual');
  console.log('   ✓ Gmail + Prompt manual → prompt mode (source: manual)');

  // Test 8: All Required App Mappings
  console.log('8️⃣ Testing all required application mappings...');
  const mappings = [
    { name: 'VS Code', input: { appName: 'Code', bundleId: 'com.microsoft.VSCode' }, expectedCategory: 'developer/code', expectedMode: 'developer' },
    { name: 'Cursor', input: { appName: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92' }, expectedCategory: 'developer/code', expectedMode: 'developer' },
    { name: 'Xcode', input: { appName: 'Xcode', bundleId: 'com.apple.dt.Xcode' }, expectedCategory: 'developer/code', expectedMode: 'developer' },
    { name: 'Terminal', input: { appName: 'Terminal', bundleId: 'com.apple.Terminal' }, expectedCategory: 'terminal', expectedMode: 'terminal' },
    { name: 'iTerm', input: { appName: 'iTerm2', bundleId: 'com.googlecode.iterm2' }, expectedCategory: 'terminal', expectedMode: 'terminal' },
    { name: 'ChatGPT', input: { appName: 'ChatGPT', bundleId: 'com.openai.chat' }, expectedCategory: 'AI/chat', expectedMode: 'prompt' },
    { name: 'Claude', input: { appName: 'Claude', bundleId: 'com.anthropic.claudefordesktop' }, expectedCategory: 'AI/chat', expectedMode: 'prompt' },
    { name: 'Gmail', input: { appName: 'Chrome', windowTitle: 'Gmail - Inbox' }, expectedCategory: 'email', expectedMode: 'email' },
    { name: 'Outlook', input: { appName: 'Microsoft Outlook', bundleId: 'com.microsoft.Outlook' }, expectedCategory: 'email', expectedMode: 'email' },
    { name: 'Slack', input: { appName: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' }, expectedCategory: 'communication', expectedMode: 'casual' },
    { name: 'Discord', input: { appName: 'Discord', bundleId: 'com.hnc.Discord' }, expectedCategory: 'communication', expectedMode: 'casual' },
    { name: 'Chrome', input: { appName: 'Google Chrome', bundleId: 'com.google.Chrome' }, expectedCategory: 'browser', expectedMode: 'browser' },
    { name: 'Safari', input: { appName: 'Safari', bundleId: 'com.apple.Safari' }, expectedCategory: 'browser', expectedMode: 'browser' },
    { name: 'Firefox', input: { appName: 'Firefox', bundleId: 'org.mozilla.firefox' }, expectedCategory: 'browser', expectedMode: 'browser' }
  ];

  for (const m of mappings) {
    const res = classifyAppContext(m.input);
    assert.strictEqual(res.category, m.expectedCategory, `${m.name} category should be ${m.expectedCategory}`);
    assert.strictEqual(res.recommendedMode, m.expectedMode, `${m.name} recommendedMode should be ${m.expectedMode}`);
    console.log(`   ✓ ${m.name.padEnd(10)} → category: ${res.category.padEnd(15)} mode: ${res.recommendedMode}`);
  }

  // Test 9: Mumble AI Window Targeting Protection
  console.log('9️⃣ Testing Mumble AI Window Targeting Protection...');
  assert.strictEqual(isMumbleApp({ appName: 'Electron', bundleId: 'com.electron.mumble-ai' }), true, 'Electron process should be identified as Mumble');
  assert.strictEqual(isMumbleApp({ appName: 'Mumble AI', windowTitle: 'Mumble AI Settings' }), true, 'Mumble AI window should be identified');
  assert.strictEqual(isMumbleApp({ appName: 'Google Chrome', bundleId: 'com.google.Chrome' }), false, 'Chrome should not be identified as Mumble');
  assert.strictEqual(isMumbleApp({ appName: 'Code', bundleId: 'com.microsoft.VSCode' }), false, 'VS Code should not be identified as Mumble');
  console.log('   ✓ Mumble AI windows properly recognized to prevent becoming permanent target');

  // Test 10: Server resolveTone integration
  console.log('🔟 Testing Server resolveTone with AppContext object payload...');
  const serverResolvedChrome = resolveTone({
    tone: chromeAuto.finalMode,
    mode: chromeAuto.finalMode,
    application: chromeApp
  });
  assert.strictEqual(serverResolvedChrome.mode, 'browser', 'Backend should receive and apply browser mode');

  const serverResolvedDevManual = resolveTone({
    tone: chromeDevManual.finalMode,
    mode: chromeDevManual.finalMode,
    application: chromeApp
  });
  assert.strictEqual(serverResolvedDevManual.mode, 'developer', 'Backend should receive and apply developer mode');

  console.log('   ✓ Server resolveTone strictly honors finalMode sent by desktop client');

  console.log('\n✨ ALL APP AWARENESS & GLOBAL MODE TESTS PASSED WITH 100% SUCCESS.\n');
  return true;
}

if (process.argv[1]?.endsWith('test_app_awareness.js')) {
  runAppAwarenessTests();
}
