/**
 * Mumble AI Desktop — Windows Platform Adapter Implementation
 *
 * Implements the standard Platform Provider interfaces for Windows (win32).
 * Provides robust clipboard-based text insertion, confirmation polling,
 * Win32 SendInput via uIOhook with PowerShell WScript.Shell fallback,
 * and safe non-destructive clipboard restoration.
 */

import { execFile } from 'child_process';
import {
  IPlatformAdapter,
  IGlobalHotkeyProvider,
  IActiveApplicationProvider,
  ITextInsertionProvider,
  IClipboardProvider,
  IPermissionProvider,
  IStartupProvider,
  ITrayProvider
} from '../interfaces.js';

// Safe runtime resolution for Electron APIs (allows running under both Electron & Node test suites)
let electron = {};
try {
  // @ts-ignore
  electron = await import('electron');
} catch (e) {}

const clipboard = electron.clipboard || {
  readText: () => '',
  writeText: () => {},
  clear: () => {}
};

const globalShortcut = electron.globalShortcut || {
  register: () => true,
  unregisterAll: () => {},
  isRegistered: () => false
};

// Safe runtime resolution for uIOhook (Win32 native SendInput)
let uIOhookNative = null;
let UiohookKeyNative = null;
try {
  const uiohookModule = await import('uiohook-napi');
  uIOhookNative = uiohookModule.uIOhook;
  UiohookKeyNative = uiohookModule.UiohookKey;
} catch (e) {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Windows Global Hotkey Provider
 */
export class WindowsGlobalHotkeyProvider extends IGlobalHotkeyProvider {
  register(accelerator, callback) {
    try {
      console.log(`[WindowsGlobalHotkeyProvider] Registering hotkey: ${accelerator}`);
      return globalShortcut.register(accelerator, callback);
    } catch (err) {
      console.error(`[WindowsGlobalHotkeyProvider] Failed to register ${accelerator}:`, err.message);
      return false;
    }
  }

  unregisterAll() {
    try {
      globalShortcut.unregisterAll();
    } catch (e) {}
  }

  isRegistered(accelerator) {
    try {
      return globalShortcut.isRegistered(accelerator);
    } catch (e) {
      return false;
    }
  }
}

/**
 * Windows Active Application Provider
 */
export class WindowsActiveApplicationProvider extends IActiveApplicationProvider {
  async getFocusedApp() {
    return {
      appId: 'unknown',
      appName: 'Active App (Windows)',
      bundleId: '',
      processId: null,
      processName: '',
      windowTitle: '',
      category: 'other',
      platform: 'win32'
    };
  }
}

/**
 * Windows Clipboard Provider
 */
export class WindowsClipboardProvider extends IClipboardProvider {
  constructor(customClipboard = null) {
    super();
    this._clipboard = customClipboard || clipboard;
  }

  readText() {
    try {
      return this._clipboard.readText() || '';
    } catch (err) {
      console.warn('[WindowsClipboardProvider] readText failed:', err.message);
      return '';
    }
  }

  writeText(text) {
    try {
      this._clipboard.writeText(text || '');
      return true;
    } catch (err) {
      console.error('[WindowsClipboardProvider] writeText failed:', err.message);
      return false;
    }
  }

  clear() {
    try {
      this._clipboard.clear();
      return true;
    } catch (err) {
      console.warn('[WindowsClipboardProvider] clear failed:', err.message);
      return false;
    }
  }
}

/**
 * Windows Text Insertion Provider
 *
 * Implements reliable text insertion on Windows by:
 * 1. Validating input text (rejecting empty/whitespace payloads).
 * 2. Saving the user's current clipboard content.
 * 3. Writing the target text to clipboard via CF_UNICODETEXT.
 * 4. Verifying clipboard write completion with polling confirmation before dispatch.
 * 5. Dispatching Ctrl+V via native Win32 SendInput (uIOhook keyTap) with PowerShell WScript.Shell SendKeys fallback.
 * 6. Waiting for target application paste processing to complete before restoring.
 * 7. Safely restoring previous clipboard content only if it has not been overwritten by newer user actions.
 */
export class WindowsTextInsertionProvider extends ITextInsertionProvider {
  constructor(options = {}) {
    super();
    this.restoreDelayMs = options.restoreDelayMs || 600;
    this.clipboardProvider = options.clipboardProvider || new WindowsClipboardProvider();
    this.uIOhook = options.uIOhook || uIOhookNative;
    this.UiohookKey = options.UiohookKey || UiohookKeyNative;
    this.disableRestore = Boolean(options.disableRestore);
    this.maxWriteVerificationRetries = options.maxWriteVerificationRetries || 10;
    this.verificationPollIntervalMs = options.verificationPollIntervalMs || 20;
  }

  /**
   * Insert text at cursor in active Windows application.
   *
   * @param {string} text - Text to insert
   * @param {Object} [options] - Runtime options
   * @returns {Promise<{success: boolean, textLength?: number, method?: string, error?: string}>}
   */
  async insertText(text, options = {}) {
    const textLength = text ? text.length : 0;
    const isEmpty = !text || text.trim().length === 0;

    // Diagnostic logging: input validation
    console.log(`[WindowsTextInsertionProvider:DIAGNOSTIC] Starting insertion: textLength=${textLength}, isEmpty=${isEmpty}`);

    if (isEmpty) {
      console.warn('[WindowsTextInsertionProvider] Insertion aborted: Provided text is empty or whitespace-only.');
      return { success: false, error: 'No text to insert' };
    }

    const clip = options.clipboardProvider || this.clipboardProvider;

    // 1. Read and preserve previous clipboard content
    let previousClipboard = '';
    try {
      previousClipboard = clip.readText() || '';
    } catch (readErr) {
      console.warn('[WindowsTextInsertionProvider] Could not read previous clipboard (proceeding):', readErr.message);
    }

    // 2. Write formatted text to Windows clipboard
    let clipboardWriteSuccess = false;
    try {
      clip.writeText(text);
      clipboardWriteSuccess = true;
    } catch (writeErr) {
      console.error('[WindowsTextInsertionProvider] Failed writing text to clipboard:', writeErr.message);
      return { success: false, error: `Clipboard write failed: ${writeErr.message}` };
    }

    // 3. Confirm clipboard write completion before dispatching Ctrl+V
    let readBackLength = 0;
    let writeConfirmed = false;
    for (let attempt = 1; attempt <= this.maxWriteVerificationRetries; attempt++) {
      try {
        const readBack = clip.readText();
        readBackLength = readBack ? readBack.length : 0;
        if (readBack === text) {
          writeConfirmed = true;
          break;
        }
      } catch (pollErr) {
        // Retry next cycle
      }
      await sleep(this.verificationPollIntervalMs);
    }

    console.log(`[WindowsTextInsertionProvider:DIAGNOSTIC] Clipboard write verification: writeSuccess=${clipboardWriteSuccess}, confirmed=${writeConfirmed}, readBackLength=${readBackLength}, expectedLength=${textLength}`);

    if (!writeConfirmed) {
      console.error(`[WindowsTextInsertionProvider] Clipboard confirmation failed. Expected length: ${textLength}, readBack length: ${readBackLength}`);
      return {
        success: false,
        error: `Clipboard write confirmation failed (expected length ${textLength}, read ${readBackLength})`
      };
    }

    // 4. Dispatch Ctrl+V keystroke to active application
    let pasteDispatched = false;
    let dispatchMethod = 'none';

    // Mechanism 0: If a custom key dispatcher is provided (e.g. in test suite or specialized app hook), prioritize it
    if (typeof options.customKeyDispatcher === 'function') {
      try {
        await options.customKeyDispatcher();
        pasteDispatched = true;
        dispatchMethod = 'custom_key_dispatcher';
      } catch (customErr) {
        console.error('[WindowsTextInsertionProvider] Custom key dispatcher failed:', customErr.message);
      }
    }

    // Mechanism A: Native uIOhook keyTap (Win32 SendInput in C++)
    const hook = options.uIOhook || this.uIOhook;
    const keys = options.UiohookKey || this.UiohookKey;

    if (!pasteDispatched && hook && keys && typeof hook.keyTap === 'function') {
      try {
        // Dispatch Ctrl+V (UiohookKey.V with modifier UiohookKey.Ctrl)
        hook.keyTap(keys.V, [keys.Ctrl]);
        pasteDispatched = true;
        dispatchMethod = 'uiohook_native_sendinput';
        console.log('[WindowsTextInsertionProvider] Dispatched Ctrl+V via native Win32 SendInput.');
      } catch (hookErr) {
        console.warn('[WindowsTextInsertionProvider] uIOhook native keyTap failed, falling back:', hookErr.message);
      }
    }

    // Mechanism B: Secondary fallback via PowerShell WScript.Shell SendKeys
    if (!pasteDispatched) {
      try {
        await this.dispatchCtrlVViaPowerShell();
        pasteDispatched = true;
        dispatchMethod = 'powershell_wscript_sendkeys';
        console.log('[WindowsTextInsertionProvider] Dispatched Ctrl+V via PowerShell WScript.Shell SendKeys.');
      } catch (psErr) {
        console.error('[WindowsTextInsertionProvider] PowerShell SendKeys fallback failed:', psErr.message);
      }
    }

    console.log(`[WindowsTextInsertionProvider:DIAGNOSTIC] Paste dispatch status: pasteDispatched=${pasteDispatched}, method=${dispatchMethod}`);

    if (!pasteDispatched) {
      console.error('[WindowsTextInsertionProvider] Text insertion failed: All Ctrl+V dispatch mechanisms failed.');
      return {
        success: false,
        error: 'Failed to dispatch Ctrl+V keystroke to target application'
      };
    }

    // 5. Safe non-destructive clipboard restoration
    // Wait for the target application (Notepad, Word, Browser, etc.) to fully consume the WM_PASTE message
    const delay = options.restoreDelayMs || this.restoreDelayMs;
    if (!this.disableRestore && !options.disableRestore) {
      setTimeout(() => {
        let restorationSuccess = false;
        try {
          const currentClipboard = clip.readText();
          // Critical Safety Rule: Only restore previous content if clipboard STILL contains the transcript we wrote.
          // If the user or another application copied newer content in the interim, NEVER overwrite it.
          if (currentClipboard === text) {
            clip.writeText(previousClipboard);
            restorationSuccess = true;
            console.log(`[WindowsTextInsertionProvider:DIAGNOSTIC] Clipboard restoration succeeded. Restored previous content (length=${previousClipboard.length}).`);
          } else {
            console.log('[WindowsTextInsertionProvider:DIAGNOSTIC] Clipboard was modified externally after paste. Skipped restoration to preserve user data.');
          }
        } catch (restoreErr) {
          console.warn('[WindowsTextInsertionProvider] Error during clipboard restoration:', restoreErr.message);
        }
      }, delay);
    }

    return {
      success: true,
      textLength,
      method: dispatchMethod
    };
  }

  /**
   * Fallback Ctrl+V dispatcher using PowerShell and WScript.Shell COM object.
   * @returns {Promise<void>}
   */
  dispatchCtrlVViaPowerShell() {
    return new Promise((resolve, reject) => {
      // Small sleep ensures OS message queue has focused window ready
      const psCommand = '$ws = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 25; $ws.SendKeys("^v")';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { timeout: 3000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

/**
 * Windows Permission Provider
 */
export class WindowsPermissionProvider extends IPermissionProvider {
  checkAccessibility(prompt = false) {
    return true;
  }

  async checkMicrophone() {
    return true;
  }

  openSettings(type) {
    if (type === 'microphone') {
      console.log('[WindowsPermissionProvider] Opening ms-settings:privacy-microphone');
    }
  }

  async verifyAll() {
    return { accessibility: true, microphone: true };
  }
}

/**
 * Windows Startup Provider
 */
export class WindowsStartupProvider extends IStartupProvider {
  enableStartup() {}
  disableStartup() {}
  isStartupEnabled() {
    return false;
  }
}

/**
 * Windows Tray Provider
 */
export class WindowsTrayProvider extends ITrayProvider {
  create(options) {}
  setRecordingState(isRecording) {}
  destroy() {}
}

/**
 * Composite Windows Platform Adapter
 */
export class WindowsPlatformAdapter extends IPlatformAdapter {
  constructor(options = {}) {
    super();
    this.platform = 'win32';
    this.hotkeys = new WindowsGlobalHotkeyProvider();
    this.activeApp = new WindowsActiveApplicationProvider();
    this.clipboard = new WindowsClipboardProvider(options.clipboard);
    this.textInsertion = new WindowsTextInsertionProvider({
      clipboardProvider: this.clipboard,
      restoreDelayMs: options.restoreDelayMs,
      disableRestore: options.disableRestore
    });
    this.permissions = new WindowsPermissionProvider();
    this.startup = new WindowsStartupProvider();
    this.tray = new WindowsTrayProvider();
  }
}
