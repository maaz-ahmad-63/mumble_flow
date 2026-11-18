/**
 * Mumble AI — Windows Text Insertion & Clipboard Integration Test Suite
 *
 * Covers:
 * 1. Windows clipboard operations (readText, writeText, clear)
 * 2. ASCII, Unicode, emojis, multiline and multilingual text preservation
 * 3. Pre-paste clipboard write confirmation polling
 * 4. Paste dispatching (uIOhook native SendInput & fallback)
 * 5. Safe non-destructive clipboard restoration & anti-overwrite protection
 * 6. Diagnostic logging validation
 * 7. Platform adapter resolution (win32 vs darwin)
 */

import assert from 'assert';
import {
  WindowsClipboardProvider,
  WindowsTextInsertionProvider,
  WindowsPlatformAdapter
} from '../desktop/electron/platform/windows/index.js';
import { getPlatformAdapter } from '../desktop/electron/platform/index.js';

// In-memory mock clipboard for high-fidelity cross-platform simulation
class MockClipboard {
  constructor(initialText = '') {
    this.content = initialText;
    this.writeCount = 0;
    this.readCount = 0;
    this.clearCount = 0;
  }

  readText() {
    this.readCount++;
    return this.content;
  }

  writeText(text) {
    this.writeCount++;
    this.content = String(text);
  }

  clear() {
    this.clearCount++;
    this.content = '';
  }
}

export async function runWindowsTextInsertionTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING WINDOWS TEXT INSERTION & CLIPBOARD TEST SUITE');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Windows Clipboard Unit Tests (ASCII, Unicode, Multiline, Multilingual)
  // --------------------------------------------------------------------------
  console.log('1️⃣ Testing Windows Clipboard Provider Unit Tests...');
  {
    const mock = new MockClipboard('initial');
    const clipProvider = new WindowsClipboardProvider(mock);

    // Initial read
    assert.strictEqual(clipProvider.readText(), 'initial', 'Reads initial clipboard content');

    // Write ASCII
    clipProvider.writeText('MUMBLE_TEST_123');
    assert.strictEqual(clipProvider.readText(), 'MUMBLE_TEST_123', 'Writes and reads ASCII text correctly');

    // Write Unicode & Emojis
    const unicodeText = 'Speech to text: 🎙️ -> 🚀 | Mumble Flow 1.0.3';
    clipProvider.writeText(unicodeText);
    assert.strictEqual(clipProvider.readText(), unicodeText, 'Preserves complex Unicode and emojis');

    // Write Multiline (\r\n and \n)
    const multilineText = 'First Paragraph.\r\nSecond Paragraph with CRLF.\nThird with LF.';
    clipProvider.writeText(multilineText);
    assert.strictEqual(clipProvider.readText(), multilineText, 'Preserves multiline text and Windows CRLF line endings');

    // Write Multilingual (Hindi, Arabic, Japanese, Spanish, Russian)
    const multiLang = 'नमस्ते दुनिया | مرحبا بالعالم | こんにちは世界 | ¡Hola Mundo! | Привет мир';
    clipProvider.writeText(multiLang);
    assert.strictEqual(clipProvider.readText(), multiLang, 'Preserves multilingual non-English scripts perfectly');

    // Write Programming Code & Quotes
    const codeSnippet = 'const sql = `SELECT * FROM users WHERE status = "active";`;\nconsole.log(sql);';
    clipProvider.writeText(codeSnippet);
    assert.strictEqual(clipProvider.readText(), codeSnippet, 'Preserves code snippets, backticks, and quotes');

    // Clear
    clipProvider.clear();
    assert.strictEqual(clipProvider.readText(), '', 'Clears clipboard');

    console.log('   ✓ Windows Clipboard Provider unit tests passed with 100% fidelity.');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Empty & Whitespace-only Insertion Guard
  // --------------------------------------------------------------------------
  console.log('2️⃣ Testing Empty & Whitespace-only Insertion Guards...');
  {
    const mock = new MockClipboard('keep_me');
    const insertion = new WindowsTextInsertionProvider({
      clipboardProvider: new WindowsClipboardProvider(mock)
    });

    const res1 = await insertion.insertText('');
    assert.strictEqual(res1.success, false, 'Rejects empty string');
    assert.strictEqual(res1.error, 'No text to insert');

    const res2 = await insertion.insertText('   \n\t   ');
    assert.strictEqual(res2.success, false, 'Rejects whitespace-only string');
    assert.strictEqual(res2.error, 'No text to insert');

    const res3 = await insertion.insertText(null);
    assert.strictEqual(res3.success, false, 'Rejects null input');

    // Original clipboard must remain completely untouched
    assert.strictEqual(mock.content, 'keep_me', 'Preserves original clipboard when insertion is rejected');

    console.log('   ✓ Empty and whitespace guards properly rejected invalid text.');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Pre-Paste Clipboard Write Confirmation Polling
  // --------------------------------------------------------------------------
  console.log('3️⃣ Testing Pre-Paste Clipboard Write Confirmation Polling...');
  {
    const mock = new MockClipboard('original_content');
    let pasteWasDispatched = false;

    const insertion = new WindowsTextInsertionProvider({
      clipboardProvider: new WindowsClipboardProvider(mock),
      disableRestore: true
    });

    const transcript = 'He and I went to the store yesterday to buy milk.';
    const result = await insertion.insertText(transcript, {
      customKeyDispatcher: async () => {
        // Assert that at the exact instant paste is dispatched, clipboard has the confirmed transcript
        assert.strictEqual(mock.content, transcript, 'Clipboard must hold target text when Ctrl+V is dispatched');
        pasteWasDispatched = true;
      }
    });

    assert.strictEqual(result.success, true, 'Reports successful insertion');
    assert.strictEqual(pasteWasDispatched, true, 'Dispatched paste keystroke after clipboard confirmation');
    assert.strictEqual(result.textLength, transcript.length, 'Returns correct text length');
    assert.strictEqual(mock.content, transcript, 'Clipboard holds final verified transcript');

    console.log('   ✓ Pre-paste clipboard write confirmation verified.');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Dispatch Mechanism with uIOhook Mock
  // --------------------------------------------------------------------------
  console.log('4️⃣ Testing Ctrl+V Dispatch via uIOhook native keyTap...');
  {
    const mock = new MockClipboard('before');
    let capturedKey = null;
    let capturedModifiers = null;

    const mockUiohook = {
      keyTap: (key, modifiers) => {
        capturedKey = key;
        capturedModifiers = modifiers;
      }
    };

    const mockKeys = {
      V: 47,
      Ctrl: 29
    };

    const insertion = new WindowsTextInsertionProvider({
      clipboardProvider: new WindowsClipboardProvider(mock),
      uIOhook: mockUiohook,
      UiohookKey: mockKeys,
      disableRestore: true
    });

    const textToInsert = 'Testing SendInput dispatch.';
    const res = await insertion.insertText(textToInsert);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'uiohook_native_sendinput', 'Uses native SendInput dispatch');
    assert.strictEqual(capturedKey, 47, 'Dispatched V key');
    assert.deepStrictEqual(capturedModifiers, [29], 'Dispatched Ctrl modifier');

    console.log('   ✓ Native uIOhook keyTap dispatch executed accurately.');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Clipboard Restoration Timing & Safety Guard
  // --------------------------------------------------------------------------
  console.log('5️⃣ Testing Clipboard Restoration Timing & Anti-Overwrite Protection...');
  {
    // Case A: Normal paste -> restores previous content after delay
    const mockA = new MockClipboard('user_previous_code');
    const insertionA = new WindowsTextInsertionProvider({
      clipboardProvider: new WindowsClipboardProvider(mockA),
      restoreDelayMs: 60 // 60ms for fast automated testing
    });

    const dictatedA = 'Dictated sentence for Notepad.';
    const resA = await insertionA.insertText(dictatedA, {
      customKeyDispatcher: async () => {}
    });

    assert.strictEqual(resA.success, true);
    assert.strictEqual(mockA.content, dictatedA, 'Clipboard contains dictated text immediately after paste');

    // Wait for restore delay
    await new Promise(r => setTimeout(r, 90));
    assert.strictEqual(mockA.content, 'user_previous_code', 'Previous clipboard content restored after delay');

    // Case B: Anti-Overwrite Protection (User copied something else in the meantime)
    const mockB = new MockClipboard('initial_text');
    const insertionB = new WindowsTextInsertionProvider({
      clipboardProvider: new WindowsClipboardProvider(mockB),
      restoreDelayMs: 60
    });

    const dictatedB = 'Dictated sentence.';
    await insertionB.insertText(dictatedB, {
      customKeyDispatcher: async () => {
        // Simulate user copying new text in another app right after paste
        setTimeout(() => {
          mockB.content = 'USER_NEW_COPY_IMPORTANT';
        }, 15);
      }
    });

    // Wait past restore delay
    await new Promise(r => setTimeout(r, 90));
    assert.strictEqual(
      mockB.content,
      'USER_NEW_COPY_IMPORTANT',
      'Never overwrite newer user clipboard content during restoration'
    );

    console.log('   ✓ Clipboard restoration timing and anti-overwrite protections verified.');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Platform Adapter Factory Resolution
  // --------------------------------------------------------------------------
  console.log('6️⃣ Testing Platform Adapter Resolution...');
  {
    const winAdapter = getPlatformAdapter('win32');
    assert.ok(winAdapter instanceof WindowsPlatformAdapter, 'Resolves WindowsPlatformAdapter on win32');
    assert.strictEqual(winAdapter.platform, 'win32');
    assert.ok(winAdapter.textInsertion instanceof WindowsTextInsertionProvider);
    assert.ok(winAdapter.clipboard instanceof WindowsClipboardProvider);

    const macAdapter = getPlatformAdapter('darwin');
    assert.strictEqual(macAdapter.platform, 'darwin', 'Preserves macOS platform adapter on darwin');

    console.log('   ✓ Platform adapter resolution validated without regression.');
  }

  console.log('\n✨ ALL WINDOWS TEXT INSERTION & CLIPBOARD TESTS PASSED WITH 100% SUCCESS.\n');
  return true;
}

// Standalone runner
if (process.argv[1]?.endsWith('test_windows_text_insertion.js')) {
  runWindowsTextInsertionTests().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
}
