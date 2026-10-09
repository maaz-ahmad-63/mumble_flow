import assert from 'assert';
import { storage } from '../server/services/storageService.js';
import { zeroEditEngine } from '../server/services/zeroEditEngine.js';
import { notetakerService } from '../server/services/notetakerService.js';
import { resolveTone } from '../server/services/appToneService.js';
import { appContextService } from '../server/services/appContextService.js';
import { runPlatformAdapterTests } from './test_platform_adapters.js';
import { runPhase9SecurityTests } from './test_phase9_security.js';
import { runPhase10CostOptimizationTests } from './test_phase10_cost_optimization.js';
import { runPhase11ModelHubTests } from './test_phase11_model_hub.js';

async function runTests() {
  console.log('🧪 Starting WhisperFlow Service Tests...\n');

  // Test 1: Storage Service
  console.log('1️⃣ Testing Storage Service...');
  const settings = storage.getSettings();
  assert.ok(settings, 'Settings should be defined');
  assert.ok(settings.defaultTone, 'Default tone should exist');

  const dict = storage.getDictionary();
  assert.ok(Array.isArray(dict), 'Dictionary should be an array');
  assert.ok(dict.length > 0, 'Dictionary should have default terms');
  console.log('   ✓ Storage service loaded successfully.');

  // Test 2: Snippet matching
  console.log('2️⃣ Testing Snippets Engine...');
  const snippetMatch = zeroEditEngine.checkSnippets('insert calendly');
  assert.strictEqual(snippetMatch.matched, true, 'Snippet should match "insert calendly"');
  assert.ok(snippetMatch.snippet.content.includes('calendly.com'), 'Snippet expansion should contain calendly link');
  console.log('   ✓ Snippet matched and expanded correctly.');

  // Test 3: Zero-Edit Local Heuristic Cleanup
  console.log('3️⃣ Testing Zero-Edit Local Heuristic Cleanup...');
  const rawSpeech = 'Umm hey so can you wait can you tell the team that the the launch is slipping to like not Friday the following Monday because we are waiting on uh legal';
  const cleaned = zeroEditEngine.localHeuristicCleanup(rawSpeech);

  assert.ok(!cleaned.toLowerCase().includes('umm'), 'Should remove "umm"');
  assert.ok(!cleaned.toLowerCase().includes('the the'), 'Should remove duplicate words "the the"');
  console.log(`   Raw Input: "${rawSpeech}"`);
  console.log(`   Cleaned Output: "${cleaned}"`);
  console.log('   ✓ Local heuristic clean-up stripped filler words and stutters.');

  // Test 4: Zero-Edit Engine Full Process & Tone Varieties
  console.log('4️⃣ Testing Zero-Edit Engine full pipeline & Tone Varieties...');
  const resCasual = await zeroEditEngine.process('Hey um let us meet at 5 actually 6pm', { tone: 'casual' });
  assert.ok(resCasual.processedText, 'Processed text should exist for casual');
  console.log(`   Casual: "${resCasual.processedText}"`);

  const resBullet = await zeroEditEngine.process('First step is design. Second step is build. Third step is test.', { tone: 'bullet' });
  assert.ok(resBullet.processedText.includes('-'), 'Bullet mode should format with dashes');
  console.log(`   Bullet:\n${resBullet.processedText}`);

  const resStandup = await zeroEditEngine.process('Finished the zero-edit engine and tested APIs', { tone: 'standup' });
  assert.ok(resStandup.processedText.includes('Yesterday:') || resStandup.processedText.includes('Today:'), 'Standup should have standup headers');
  console.log(`   Standup:\n${resStandup.processedText}`);

  const resSocial = await zeroEditEngine.process('Just open-sourced WhisperFlow, the fastest voice dictation tool.', { tone: 'social' });
  assert.ok(resSocial.processedText.includes('#'), 'Social mode should have hashtags');
  console.log(`   Social:\n${resSocial.processedText}`);
  console.log('   ✓ Zero-edit pipeline & tone varieties completed successfully.');

  // Test 5: Notetaker Service
  console.log('5️⃣ Testing Notetaker Service...');
  const meetingTranscript = 'Stephen: Tuesday is better. Mikel: I will add it to the calendar. Nathalie: Make sure the Tableau dashboard is ready.';
  const summaryRes = await notetakerService.summarizeMeeting(meetingTranscript, {
    title: 'Test Meeting'
  });
  assert.ok(summaryRes.summary, 'Summary should be generated');
  assert.ok(summaryRes.meeting, 'Meeting record should be saved');
  console.log('   ✓ Notetaker summary produced successfully.');

  // Test 6: Automatic tone from the active app
  console.log('6️⃣ Testing automatic tone from the active window...');
  const auto = (processName, windowTitle) => resolveTone({ tone: 'auto', processName, windowTitle }, { fallbackTone: 'casual' });

  assert.strictEqual(auto('slack.exe', 'general | Acme - Slack').tone, 'casual', 'Slack desktop should be casual');
  assert.strictEqual(auto('Code.exe', 'index.js - murmur - Visual Studio Code').tone, 'code', 'VS Code should be code');
  assert.strictEqual(auto('Cursor', 'app.js').tone, 'code', 'Cursor on macOS should be code');
  assert.strictEqual(auto('chrome.exe', 'Inbox (3) - me@example.com - Gmail - Google Chrome').tone, 'formal', 'Gmail in Chrome should be formal');
  assert.strictEqual(auto('msedge.exe', 'Acme - Slack - Microsoft Edge').tone, 'casual', 'Slack in a browser should be casual');
  assert.strictEqual(auto('notepad.exe', 'Untitled - Notepad').source, 'default', 'Unknown apps should fall back');
  assert.strictEqual(auto('', '').tone, 'casual', 'No window info should fall back to the default tone');

  const manual = resolveTone({ tone: 'executive', processName: 'slack.exe' });
  assert.strictEqual(manual.tone, 'executive', 'A tone the user picked must not be overridden');

  const custom = resolveTone(
    { tone: 'auto', processName: 'slack.exe' },
    { rules: [{ label: 'Slack', tone: 'formal', process: ['slack'] }] }
  );
  assert.strictEqual(custom.tone, 'formal', 'Saved rules should replace the built-in ones');
  console.log('   ✓ Slack, VS Code, Cursor, Gmail, and fallback tones resolved correctly.');

  // Test 7: ProviderRegistry & Modular Providers
  console.log('7️⃣ Testing ProviderRegistry & Modular Providers...');
  const { providerRegistry } = await import('../server/providers/ProviderRegistry.js');
  const sttList = providerRegistry.listTranscriptionProviders();
  assert.ok(sttList.includes('groq'), 'STT list must contain groq');
  assert.ok(sttList.includes('gemini'), 'STT list must contain gemini');
  assert.ok(sttList.includes('local-whisper'), 'STT list must contain local-whisper');

  const llmList = providerRegistry.listLlmProviders();
  assert.ok(llmList.includes('groq'), 'LLM list must contain groq');
  assert.ok(llmList.includes('gemini'), 'LLM list must contain gemini');
  assert.ok(llmList.includes('local-llm'), 'LLM list must contain local-llm');

  const groqStt = providerRegistry.getTranscriptionProvider('groq');
  assert.strictEqual(groqStt.name, 'groq');
  const geminiLlm = providerRegistry.getLlmProvider('gemini');
  assert.strictEqual(geminiLlm.name, 'gemini');
  console.log('   ✓ Provider registry successfully manages modular STT and LLM providers.');

  // Test 8: TextProcessingService & Cleanup Separation
  console.log('8️⃣ Testing Text Processing & Cleanup Separation...');
  const { textProcessingService } = await import('../server/services/textProcessingService.js');
  const rawSpoken = 'So basically um we need to launch on Tuesday no sorry Wednesday';
  const cleanedText = textProcessingService.cleanText(rawSpoken);
  assert.ok(!cleanedText.toLowerCase().includes('basically'), 'Should strip basically');
  assert.ok(!cleanedText.toLowerCase().includes('um'), 'Should strip um');
  assert.ok(cleanedText.includes('Wednesday'), 'Should preserve self-correction');
  console.log(`   Cleaned Text: "${cleanedText}"`);
  console.log('   ✓ Deterministic text cleanup separated from AI formatting.');

  // Test 9: Audio Container Detection & Normalizer
  console.log('9️⃣ Testing Audio Container Detection & Normalizer...');
  const { detectAudioContainer, normalizeAudioFile } = await import('../server/utils/audioUtils.js');
  const os = await import('os');
  const pathMod = await import('path');
  const fsMod = await import('fs');

  const tmpWav = pathMod.join(os.tmpdir(), `test_magic_${Date.now()}.bin`);
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36, 4);
  wavHeader.write('WAVE', 8);
  fsMod.writeFileSync(tmpWav, wavHeader);

  const detectedWav = detectAudioContainer(tmpWav);
  assert.ok(detectedWav, 'Should detect WAV format');
  assert.strictEqual(detectedWav.ext, '.wav');

  // Test normalizeAudioFile renaming .bin to .wav
  const normalized = normalizeAudioFile(tmpWav, 'audio/webm');
  assert.strictEqual(normalized.ext, '.wav');
  assert.strictEqual(normalized.mimetype, 'audio/wav');
  assert.strictEqual(normalized.isTooShort, true); // <200 bytes
  if (fsMod.existsSync(normalized.path)) fsMod.unlinkSync(normalized.path);
  // Test 10: Streaming Provider Abstraction & ChunkedStreamingSession
  console.log('🔟 Testing Streaming Provider Abstraction & Session Lifecycle...');
  const { BaseTranscriptionProvider } = await import('../server/providers/transcription/BaseTranscriptionProvider.js');
  const { groqWhisperProvider } = await import('../server/providers/transcription/GroqWhisperProvider.js');
  const { ChunkedStreamingSession } = await import('../server/streaming/ChunkedStreamingSession.js');
  const { transcriptionService } = await import('../server/services/transcriptionService.js');

  const baseP = new BaseTranscriptionProvider('mock-base');
  assert.strictEqual(baseP.supportsStreaming(), false, 'Base provider default streaming should be false');
  assert.strictEqual(baseP.createStreamingSession(), null, 'Base provider default session should be null');

  assert.strictEqual(groqWhisperProvider.supportsStreaming(), true, 'Groq provider should support streaming');

  // Test ChunkedStreamingSession with a mock provider
  let interimReceived = false;
  let finalReceived = false;
  let completedReceived = false;

  const mockProvider = {
    name: 'mock-streamer',
    async transcribe(filePath, opts) {
      if (opts.isInterim) {
        return { text: 'Hello stream interim', latencyMs: 15 };
      }
      return { text: 'Hello stream final segment', latencyMs: 25, duration: 2.5, model: 'mock-model' };
    }
  };

  const session = new ChunkedStreamingSession(mockProvider, {
    sessionId: 'test-session-101',
    mimeType: 'audio/wav',
    onInterim: (data) => {
      interimReceived = true;
      assert.strictEqual(data.text, 'Hello stream interim');
    },
    onFinal: (data) => {
      finalReceived = true;
      assert.strictEqual(data.text, 'Hello stream final segment');
      assert.strictEqual(data.isFinal, true);
    },
    onProcessingCompleted: (data) => {
      completedReceived = true;
      assert.strictEqual(data.rawTranscript, 'Hello stream final segment');
      assert.ok(data.latency.asrMs >= 0);
    }
  });

  // Push chunks (including duplicate sequence to test deduplication)
  const dummyChunk = Buffer.alloc(1000, 1);
  session.addChunk(dummyChunk, 0);
  session.addChunk(dummyChunk, 0); // Duplicate chunk sequence
  assert.strictEqual(session.chunks.length, 1, 'Duplicate chunk sequence must be ignored');

  session.addChunk(dummyChunk, 1);
  assert.strictEqual(session.chunks.length, 2);

  // Stop session and verify finalization
  await session.stop();
  assert.strictEqual(finalReceived, true, 'Final transcript segment must be emitted');
  assert.strictEqual(completedReceived, true, 'Processing completed must be emitted');
  // Test 11: Wispr Flow Self-Correction & False Start Engine
  console.log('1️⃣1️⃣ Testing Self-Correction & False-Start Handling...');
  // Case 1: Simple day replacement
  const text1 = textProcessingService.cleanText("I'll send it Friday, actually Monday");
  assert.ok(text1.includes('Monday'), 'Case 1 should contain Monday');
  assert.ok(!text1.includes('Friday'), 'Case 1 should not contain Friday');
  assert.ok(text1.includes("I'll send it"), 'Case 1 should preserve prefix "I\'ll send it"');

  // Case 2: Time replacement with "actually make that"
  const text2 = textProcessingService.cleanText("Let's meet at 5, actually make that 6 PM.");
  assert.ok(text2.includes('6 PM') || text2.includes('6 pm'), 'Case 2 should contain 6 PM');
  assert.ok(text2.includes("Let's meet at"), 'Case 2 should preserve prefix "Let\'s meet at"');

  // Case 3: Embedded clause self-correction with suffix clause
  const text3 = textProcessingService.cleanText("I wanted to deploy Friday actually no Monday because testing isn't finished.");
  assert.ok(text3.includes('Monday'), 'Case 3 should contain Monday');
  assert.ok(!text3.includes('Friday'), 'Case 3 should not contain Friday');
  assert.ok(text3.includes('I wanted to deploy'), 'Case 3 should preserve prefix "I wanted to deploy"');
  assert.ok(text3.includes("testing isn't finished"), 'Case 3 should preserve suffix clause');

  // Case 4: Status change with name and details preserved
  const text4 = textProcessingService.cleanText("Hey I need to tell Rahul that the payment is done, actually not done, it's still being processed.");
  assert.ok(text4.includes('Rahul'), 'Case 4 should preserve name Rahul');
  assert.ok(text4.includes('payment is not done'), 'Case 4 should resolve state to "not done"');
  assert.ok(text4.includes('still being processed'), 'Case 4 should preserve suffix explanation');

  // Case 5: False-start resolution
  const textFalseStart = textProcessingService.cleanText("Can we start with— wait, let's look at the database first");
  assert.ok(textFalseStart.includes("Let's look at the database first"), 'False start should resolve cleanly');

  // Case 6: Normal sentence without correction (must remain intact!)
  const textNormal = textProcessingService.cleanText("Please review the pull request for the auth service and let me know your thoughts.");
  assert.strictEqual(textNormal, "Please review the pull request for the auth service and let me know your thoughts.", 'Normal sentence must remain untouched');

  console.log(`   Case 1 (Day): "${text1}"`);
  console.log(`   Case 2 (Time): "${text2}"`);
  console.log(`   Case 3 (Suffix Preserved): "${text3}"`);
  console.log(`   Case 4 (State Preserved): "${text4}"`);
  console.log(`   Case 5 (False-Start): "${textFalseStart}"`);
  console.log(`   Case 6 (Normal): "${textNormal}"`);
  console.log('   ✓ Surgical self-correction, prefix/suffix preservation, and normal dictation verified.');

  // Test 12: Spoken List Detection & Structuring
  console.log('1️⃣2️⃣ Testing Spoken List Detection & Structuring...');
  const listRaw = 'first install Node second install Postgres third run the server';
  const listFormatted = textProcessingService.cleanText(listRaw);
  assert.ok(listFormatted.includes('1. Install Node'), 'List item 1 should be structured');
  assert.ok(listFormatted.includes('2. Install Postgres'), 'List item 2 should be structured');
  assert.ok(listFormatted.includes('3. Run the server'), 'List item 3 should be structured');
  console.log(`   Spoken List Output:\n${listFormatted}`);
  console.log('   ✓ Spoken lists accurately parsed into structured numbered items.');

  // Test 13: Technical Term & Code Syntax Preservation
  console.log('1️⃣3️⃣ Testing Technical Term & Code Syntax Preservation...');
  const techRaw = 'run npm install and check https://localhost:3050/api for getUserById in server/index.js';
  const techCleaned = textProcessingService.cleanText(techRaw);
  assert.ok(techCleaned.includes('npm install'), 'Should preserve CLI command');
  assert.ok(techCleaned.includes('https://localhost:3050/api'), 'Should preserve URL');
  assert.ok(techCleaned.includes('getUserById'), 'Should preserve camelCase identifier');
  assert.ok(techCleaned.includes('server/index.js'), 'Should preserve file path');
  console.log(`   Technical Preserved Output: "${techCleaned}"`);
  console.log('   ✓ URLs, CLI commands, camelCase identifiers, and filepaths preserved.');

  // Test 14: All Modes (Natural, Casual, Professional, Executive, Email, Social, Support, Code, Developer, Terminal, Bullets, Standup)
  console.log('1️⃣4️⃣ Testing Modes (Natural, Casual, Professional, Executive, Email, Social, Support, Code, Developer, Terminal, Bullets, Standup)...');
  const sample = 'Deploy the new API endpoints by end of day';
  const modes = ['natural', 'casual', 'professional', 'executive', 'email', 'social', 'support', 'code', 'developer', 'terminal', 'bullets', 'standup'];
  for (const m of modes) {
    const res = textProcessingService.localHeuristicCleanup(sample, { tone: m });
    assert.ok(res && res.length > 0, `Mode ${m} should produce output`);
  }
  console.log('   ✓ All dictation modes formatted successfully.');

  // Test 15: Phase 6 — Developer & Code Mode Suite
  console.log('1️⃣5️⃣ Testing Phase 6: Developer & Code Mode Suite...');
  
  // A. Normal prose isolation check (normal mode must never convert plain speech to code)
  const normalProse = "I'm going to meet Rahul at five tomorrow.";
  const normalOut = textProcessingService.cleanText(normalProse, { tone: 'casual' });
  assert.strictEqual(normalOut, "I'm going to meet Rahul at five tomorrow.", 'Normal mode must not convert plain prose');

  // B. Technical prose & Developer Vocabulary Layer
  const techProse = "We are integrating SIZHVarta and VART-AI with Next.js, PostgreSQL, Prisma, and WhatsApp Cloud API.";
  const techOut = textProcessingService.cleanText(techProse, { tone: 'developer' });
  assert.ok(techOut.includes('SIZHVarta'), 'Preserves SIZHVarta');
  assert.ok(techOut.includes('VART-AI'), 'Preserves VART-AI');
  assert.ok(techOut.includes('Next.js'), 'Preserves Next.js');
  assert.ok(techOut.includes('PostgreSQL'), 'Preserves PostgreSQL');
  assert.ok(techOut.includes('Prisma'), 'Preserves Prisma');
  assert.ok(techOut.includes('WhatsApp Cloud API'), 'Preserves WhatsApp Cloud API');

  // C. Spoken variable names & constants
  const varInput = "create constant JWT secret and variable workspace ID";
  const varOut = textProcessingService.cleanText(varInput, { tone: 'developer' });
  assert.ok(varOut.includes('JWT_SECRET'), 'Converts constant to SCREAMING_SNAKE_CASE');
  assert.ok(varOut.includes('workspaceId'), 'Converts variable to camelCase');

  // D. Spoken function names and signatures
  const fnInput = "create a function called get workspace users that takes workspace ID and returns a promise of user array";
  const fnOut = textProcessingService.cleanText(fnInput, { tone: 'developer' });
  assert.ok(fnOut.includes('getWorkspaceUsers'), 'Converts function to camelCase');
  assert.ok(fnOut.includes('workspaceId'), 'Converts parameter to camelCase');
  assert.ok(fnOut.includes('Promise<User[]>'), 'Formats generic return type Promise<User[]>');

  // E. CLI & Terminal commands
  const cliInput = "git checkout dash b feature slash developer mode";
  const cliOut = textProcessingService.cleanText(cliInput, { tone: 'terminal' });
  assert.ok(cliOut.includes('git checkout -b feature/developer-mode'), 'Formats git checkout -b feature/developer-mode');

  const npmInput = "npm install dash dash save dev typescript";
  const npmOut = textProcessingService.cleanText(npmInput, { tone: 'terminal' });
  assert.ok(npmOut.toLowerCase().includes('npm install --save-dev typescript'), 'Formats npm install --save-dev typescript');

  // F. File paths
  const pathInput = "check src slash components slash VoiceRecorder dot tsx and dot env dot local";
  const pathOut = textProcessingService.cleanText(pathInput, { tone: 'developer' });
  assert.ok(pathOut.includes('src/components/VoiceRecorder.tsx'), 'Formats multi-level path and tsx extension');
  assert.ok(pathOut.includes('.env.local'), 'Formats .env.local');

  // G. URLs
  const urlInput = "send a GET request to https://api.github.com/v1/repos";
  const urlOut = textProcessingService.cleanText(urlInput, { tone: 'developer' });
  assert.ok(urlOut.includes('https://api.github.com/v1/repos'), 'Preserves full URL');

  // H. Programming symbols
  const symInput = "if x strict equals 5 and y not equals 10 arrow function";
  const symOut = textProcessingService.cleanText(symInput, { tone: 'developer' });
  assert.ok(symOut.includes('==='), 'Formats strict equals as ===');
  assert.ok(symOut.includes('!='), 'Formats not equals as !=');
  assert.ok(symOut.includes('=>'), 'Formats arrow as =>');

  // I. Coding Assistant Prompts
  const promptInput = "I'm working on the authentication middleware. Check why the JWT expires immediately and update the refresh token logic without changing the existing API.";
  const promptOut = textProcessingService.cleanText(promptInput, { tone: 'developer' });
  assert.ok(promptOut.includes('authentication middleware'), 'Preserves prompt context');
  assert.ok(promptOut.includes('JWT'), 'Preserves JWT');
  assert.ok(promptOut.includes('refresh token logic'), 'Preserves instructions without shortening');

  // J. Mixed English + technical terminology
  const mixedInput = "We need to deploy the Next.js frontend to Vercel and connect to Supabase database.";
  const mixedOut = textProcessingService.cleanText(mixedInput, { tone: 'developer' });
  assert.ok(mixedOut.includes('Next.js') && mixedOut.includes('Vercel') && mixedOut.includes('Supabase'), 'Preserves mixed technical stack');

  // K. Self-corrections inside code-related speech
  const codeSelfCorr = "Let's use PostgreSQL actually Supabase for our primary database.";
  const codeSelfCorrOut = textProcessingService.cleanText(codeSelfCorr, { tone: 'developer' });
  assert.ok(codeSelfCorrOut.includes('Supabase'), 'Self-correction chooses Supabase');
  assert.ok(!codeSelfCorrOut.includes('PostgreSQL'), 'Self-correction drops PostgreSQL');

  console.log('   A. Normal Prose: ', normalOut);
  console.log('   B. Tech Prose: ', techOut);
  console.log('   C. Variables & Constants: ', varOut);
  console.log('   D. Functions: ', fnOut);
  console.log('   E. CLI Commands: ', cliOut, ' | ', npmOut);
  console.log('   F. File Paths: ', pathOut);
  console.log('   G. URLs: ', urlOut);
  console.log('   H. Programming Symbols: ', symOut);
  console.log('   I. Coding Prompt: ', promptOut);
  console.log('   J. Mixed Technical: ', mixedOut);
  console.log('   K. Code Self-Correction: ', codeSelfCorrOut);
  console.log('   ✓ Phase 6 Developer & Code Mode test suite passed with 100% fidelity.');

  // Test 16: Phase 7 — Personalization (Dictionary, Snippets, Priority, Safety)
  console.log('1️⃣6️⃣ Testing Phase 7: Personalization Suite...');

  // A. Personal Dictionary Replacement (Spoken -> Preferred Output)
  const dictIn1 = "I really like mumble AI and Varta AI and post grass for our database.";
  const dictOut1 = textProcessingService.cleanText(dictIn1);
  assert.ok(dictOut1.includes('Mumble AI'), 'Replaces "mumble AI" with "Mumble AI"');
  assert.ok(dictOut1.includes('VART-AI'), 'Replaces "Varta AI" with "VART-AI"');
  assert.ok(dictOut1.includes('PostgreSQL'), 'Replaces "post grass" with "PostgreSQL"');

  // B. Dictionary Priority: User Dictionary overrides developer vocabulary
  storage.addDictionaryItem({
    id: 'custom_override_1',
    word: 'CUSTOM_PRISMA_V2',
    spoken: 'prisma',
    category: 'code',
    enabled: true,
    userId: 'default_user'
  });
  const priorityIn = "We are migrating to prisma this week.";
  const priorityOut = textProcessingService.cleanText(priorityIn);
  assert.ok(priorityOut.includes('CUSTOM_PRISMA_V2'), 'User dictionary must take precedence over developer vocabulary');
  // Clean up test override
  storage.deleteDictionaryItem('custom_override_1');

  // C. Disabled Dictionary Entries must be skipped
  storage.addDictionaryItem({
    id: 'disabled_item_1',
    word: 'NEVER_REPLACE',
    spoken: 'orange fruit',
    category: 'general',
    enabled: false,
    userId: 'default_user'
  });
  const disabledDictIn = "I bought an orange fruit from the market.";
  const disabledDictOut = textProcessingService.cleanText(disabledDictIn);
  assert.ok(!disabledDictOut.includes('NEVER_REPLACE'), 'Disabled dictionary item must not be applied');
  assert.ok(disabledDictOut.includes('orange fruit'), 'Original words must be preserved');
  storage.deleteDictionaryItem('disabled_item_1');

  // D. URL & Code Identifier Non-Corruption
  const safeUrlIn = "Download the latest release from https://api.mumble.ai/v1/download and call getUserById()";
  const safeUrlOut = textProcessingService.cleanText(safeUrlIn);
  assert.ok(safeUrlOut.includes('https://api.mumble.ai/v1/download'), 'URLs must not be corrupted by dictionary terms');
  assert.ok(safeUrlOut.includes('getUserById'), 'Identifiers must not be corrupted');

  // E. Multilingual Terms
  storage.addDictionaryItem({
    id: 'multi_1',
    word: '¡Muchas Gracias!',
    spoken: 'muchas gracias',
    category: 'general',
    enabled: true,
    userId: 'default_user'
  });
  const multiIn = "I want to say muchas gracias to the team.";
  const multiOut = textProcessingService.cleanText(multiIn);
  assert.ok(multiOut.includes('¡Muchas Gracias!'), 'Multilingual dictionary terms replaced accurately');
  storage.deleteDictionaryItem('multi_1');

  // F. Voice Snippet Exact Activation
  const snipRes1 = await textProcessingService.process("client introduction");
  assert.strictEqual(snipRes1.isSnippet, true, 'Exact trigger matches snippet');
  assert.ok(snipRes1.processedText.includes('thanks for reaching out'), 'Expands client introduction snippet');

  // G. Snippet with explicit keyword prefix
  const snipRes2 = await textProcessingService.process("insert my github");
  assert.strictEqual(snipRes2.isSnippet, true, 'Explicit "insert" prefix matches snippet');
  assert.ok(snipRes2.processedText.includes('github.com'), 'Expands github link snippet');

  // H. False-Positive Snippet Prevention (Prose mentioning trigger MUST NOT expand)
  const falsePositiveText = "I wrote a client introduction email today to the new stakeholder.";
  const falsePositiveRes = await textProcessingService.process(falsePositiveText);
  assert.strictEqual(falsePositiveRes.isSnippet || false, false, 'Conversational sentence mentioning trigger must NOT expand snippet');
  assert.ok(falsePositiveRes.processedText.includes('client introduction email'), 'Preserves sentence as normal prose');

  // I. Application-Specific Snippets
  storage.addSnippet({
    id: 'app_snip_cursor',
    name: 'PR Description Template',
    trigger: 'pr description',
    content: '## Summary\n- Implemented feature\n- Added automated tests',
    app: 'Cursor',
    mode: 'all',
    enabled: true,
    userId: 'default_user'
  });

  // When spoken in Cursor:
  const appMatchRes = await textProcessingService.process("pr description", { appName: 'Cursor' });
  assert.strictEqual(appMatchRes.isSnippet, true, 'App-specific snippet matches when appName is Cursor');
  assert.ok(appMatchRes.processedText.includes('## Summary'), 'Inserts PR template in Cursor');

  // When spoken in Slack (should NOT match Cursor snippet):
  const appMismatchRes = await textProcessingService.process("pr description", { appName: 'Slack' });
  assert.strictEqual(appMismatchRes.isSnippet || false, false, 'App-specific snippet does not match when app is Slack');
  storage.deleteSnippet('app_snip_cursor');

  // J. Disabled Snippets
  storage.addSnippet({
    id: 'disabled_snip_1',
    name: 'Secret Key',
    trigger: 'secret key',
    content: 'SECRET_XYZ_123',
    app: 'all',
    mode: 'all',
    enabled: false,
    userId: 'default_user'
  });
  const disabledSnipRes = await textProcessingService.process("secret key");
  assert.strictEqual(disabledSnipRes.isSnippet || false, false, 'Disabled snippet must not trigger');
  storage.deleteSnippet('disabled_snip_1');

  console.log('   A. Dictionary Replacements: ', dictOut1);
  console.log('   B. Priority & Overrides:    Verified User > Dev');
  console.log('   C. Disabled Dictionary:     Verified Inactive');
  console.log('   D. URL/Code Safety:         ', safeUrlOut);
  console.log('   E. Multilingual:            ', multiOut);
  console.log('   F. Snippet Exact Match:     ', snipRes1.processedText.substring(0, 45) + '...');
  console.log('   G. Snippet Prefix Match:    ', snipRes2.processedText);
  console.log('   H. False-Positive Safety:   ', falsePositiveRes.processedText);
  console.log('   I. App-Specific Targeting:  Verified Cursor vs Slack');
  console.log('   J. Disabled Snippet Check:  Verified Inactive');
  console.log('   ✓ Phase 7 Personalization test suite passed with 100% fidelity.');

  // Test 17: Phase 8 — Application Awareness Suite
  console.log('1️⃣7️⃣ Testing Phase 8: Application Awareness Suite...');

  // A. Chrome -> Expected Default Mode (natural)
  const chromeRes = appContextService.resolveMode({
    processName: 'google chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'Search — Google'
  });
  assert.strictEqual(chromeRes.mode, 'natural', 'Chrome should resolve to natural mode');
  assert.strictEqual(chromeRes.context.category, 'browser', 'Chrome category should be browser');

  // B. WhatsApp -> Casual
  const waRes = appContextService.resolveMode({
    processName: 'whatsapp',
    bundleId: 'net.whatsapp.WhatsApp',
    windowTitle: 'WhatsApp'
  });
  assert.strictEqual(waRes.mode, 'casual', 'WhatsApp should resolve to casual mode');
  assert.strictEqual(waRes.context.category, 'messaging', 'WhatsApp category should be messaging');

  // C. Gmail -> Professional
  const gmailRes = appContextService.resolveMode({
    processName: 'google chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'Inbox (3) - alex@company.com - Gmail'
  });
  assert.strictEqual(gmailRes.mode, 'professional', 'Gmail in browser should resolve to professional mode');
  assert.strictEqual(gmailRes.context.category, 'email', 'Gmail category should be email');

  // D. Cursor -> Developer
  const cursorRes = appContextService.resolveMode({
    processName: 'cursor',
    bundleId: 'com.todesktop.230313mzl4w4u92',
    windowTitle: 'server.js — murmur-flow'
  });
  assert.strictEqual(cursorRes.mode, 'developer', 'Cursor should resolve to developer mode');
  assert.strictEqual(cursorRes.context.category, 'developer', 'Cursor category should be developer');

  // E. VS Code -> Developer
  const vscodeRes = appContextService.resolveMode({
    processName: 'code',
    bundleId: 'com.microsoft.VSCode',
    windowTitle: 'index.ts — app'
  });
  assert.strictEqual(vscodeRes.mode, 'developer', 'VS Code should resolve to developer mode');

  // F. Terminal -> Terminal
  const termRes = appContextService.resolveMode({
    processName: 'terminal',
    bundleId: 'com.apple.Terminal',
    windowTitle: 'zsh — 80x24'
  });
  assert.strictEqual(termRes.mode, 'terminal', 'Terminal should resolve to terminal mode');

  // G. ChatGPT -> Prompt
  const chatgptRes = appContextService.resolveMode({
    processName: 'google chrome',
    bundleId: 'com.google.Chrome',
    windowTitle: 'ChatGPT — New chat'
  });
  assert.strictEqual(chatgptRes.mode, 'prompt', 'ChatGPT should resolve to prompt mode');

  // H. Explicit user mode OVERRIDES application mode
  // Even in Cursor, if user explicitly picked Casual, Casual must win!
  const overrideRes = appContextService.resolveMode({
    mode: 'casual',
    toneSource: 'manual',
    processName: 'cursor',
    bundleId: 'com.todesktop.230313mzl4w4u92'
  });
  assert.strictEqual(overrideRes.mode, 'casual', 'Manual user selection must ALWAYS win over app context');
  assert.strictEqual(overrideRes.source, 'user-explicit', 'Source should be marked user-explicit');

  // I. Application-Specific Snippet Targeting with Normalized Context
  storage.addSnippet({
    id: 'snip_app_vscode',
    name: 'VS Code Header',
    trigger: 'code header',
    content: '// Copyright (c) 2026 Mumble Flow Team',
    app: 'Cursor',
    mode: 'all',
    enabled: true,
    userId: 'default_user'
  });

  const cursorSnippetRes = await textProcessingService.process("code header", {
    application: { appId: 'cursor', appName: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92' }
  });
  assert.strictEqual(cursorSnippetRes.isSnippet, true, 'Snippet targets Cursor matching context');

  const slackSnippetRes = await textProcessingService.process("code header", {
    application: { appId: 'slack', appName: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' }
  });
  assert.strictEqual(slackSnippetRes.isSnippet || false, false, 'Snippet does not match Slack context');
  storage.deleteSnippet('snip_app_vscode');

  // J. Unknown Application Fallback
  const unknownRes = appContextService.resolveMode({
    processName: 'my_custom_tool',
    bundleId: 'com.random.unknown',
    windowTitle: 'Tool Window'
  });
  assert.strictEqual(unknownRes.context.category, 'other', 'Unknown app should be category other');
  assert.strictEqual(unknownRes.mode, storage.getSettings().defaultTone || 'casual', 'Unknown app should fallback to default tone');

  // K. Accessibility Detection Failure Handling (graceful fallback)
  const failRes = appContextService.resolveMode(null);
  assert.ok(failRes, 'Null context should not crash');
  assert.strictEqual(failRes.context.appId, 'unknown', 'App ID should be unknown');
  assert.strictEqual(failRes.mode, storage.getSettings().defaultTone || 'casual', 'Mode should fallback safely');

  console.log('   A. Chrome:       ', chromeRes.appLabel, '→', chromeRes.mode);
  console.log('   B. WhatsApp:     ', waRes.appLabel, '→', waRes.mode);
  console.log('   C. Gmail:        ', gmailRes.appLabel, '→', gmailRes.mode);
  console.log('   D. Cursor:       ', cursorRes.appLabel, '→', cursorRes.mode);
  console.log('   E. VS Code:      ', vscodeRes.appLabel, '→', vscodeRes.mode);
  console.log('   F. Terminal:     ', termRes.appLabel, '→', termRes.mode);
  console.log('   G. ChatGPT:      ', chatgptRes.appLabel, '→', chatgptRes.mode);
  console.log('   H. User Override:', overrideRes.appLabel, '→', overrideRes.mode, `(${overrideRes.source})`);
  console.log('   I. App Snippets:  Verified Cursor vs Slack');
  console.log('   J. Unknown App:  ', unknownRes.appLabel, '→', unknownRes.mode);
  console.log('   K. Graceful Fallback: Verified');
  console.log('   ✓ Phase 8 Application Awareness test suite passed with 100% fidelity.\n');

  // Test 18: Cross-Platform Adapter Contracts & Agnosticism
  await runPlatformAdapterTests();

  // Test 19: Phase 9 Security, Auth, Isolation & Usage
  await runPhase9SecurityTests();

  // Test 20: Phase 10 Cost-Optimized AI & Local/Cloud Architecture
  await runPhase10CostOptimizationTests();

  // Test 21: Phase 11 Multi-Model AI Hub & Mumble AI Rebranding
  await runPhase11ModelHubTests();

  // Test 22: QA Fixes (Hold Space, Esc Cancel, Very Short Audio Pre-STT Guard)
  const { runQaFixesTests } = await import('./test_qa_fixes.js');
  await runQaFixesTests();

  // Test 23: App Awareness & Global Mode Suite
  const { runAppAwarenessTests } = await import('./test_app_awareness.js');
  runAppAwarenessTests();

  // Test 24: Phase 1 SaaS Foundation (Multi-User Auth, Admin Panel & User Settings)
  const { runPhase1SaasTests } = await import('./test_phase1_saas.js');
  await runPhase1SaasTests();

  // Test 25: Phase 2 Model Hub & BYOK (AES-256-GCM, User Isolation, Model Switching)
  const { runPhase2ModelHubByokTests } = await import('./test_phase2_model_hub_byok.js');
  await runPhase2ModelHubByokTests();

  // Test 26: Phase 3 Usage Tracking & Cost Control (BYOK separation, Quotas, Admin Telemetry)
  const { runPhase3UsageAndCostTests } = await import('./test_phase3_usage_and_costs.js');
  await runPhase3UsageAndCostTests();

  console.log('\n🎉 ALL TESTS PASSED! Mumble AI core services, SaaS Foundation, Model Hub, BYOK, Usage Tracking, Cost Control, QA Fixes & App Awareness are functional.\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
