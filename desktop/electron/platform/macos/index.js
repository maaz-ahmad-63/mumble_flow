/**
 * Mumble AI Desktop — macOS Platform Adapter Implementation
 *
 * Implements the standard Platform Provider interfaces using native macOS
 * AppleScript, NSWorkspace, System Events, and Electron macOS APIs.
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

const globalShortcut = electron.globalShortcut || { register: () => true, unregisterAll: () => {}, isRegistered: () => false };
const clipboard = electron.clipboard || { readText: () => '', writeText: () => {}, clear: () => {} };
const systemPreferences = electron.systemPreferences || { isTrustedAccessibilityClient: () => true, getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true };
const dialog = electron.dialog || { showMessageBox: async () => ({ response: 1 }) };
const shell = electron.shell || { openExternal: () => {} };
const Tray = electron.Tray || class { setTitle() {} setToolTip() {} setContextMenu() {} destroy() {} };
const Menu = electron.Menu || { buildFromTemplate: () => ({}) };
const nativeImage = electron.nativeImage || { createEmpty: () => ({}) };
const app = electron.app || { quit: () => {}, setLoginItemSettings: () => {}, getLoginItemSettings: () => ({ openAtLogin: false }) };

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve((stdout || '').trim());
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Hotkey Provider
export class MacOSGlobalHotkeyProvider extends IGlobalHotkeyProvider {
  register(accelerator, callback) {
    try {
      return globalShortcut.register(accelerator, callback);
    } catch (err) {
      console.error(`[MacOSGlobalHotkeyProvider] Failed to register ${accelerator}:`, err);
      return false;
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }

  isRegistered(accelerator) {
    return globalShortcut.isRegistered(accelerator);
  }
}

// 2. Active Application Provider
export class MacOSActiveApplicationProvider extends IActiveApplicationProvider {
  async getFocusedApp() {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set bundleId to bundle identifier of frontApp
        set procId to unix id of frontApp
        set winTitle to ""
        try
          tell frontApp
            set winTitle to name of front window
          end tell
        end try
        return appName & "|||" & bundleId & "|||" & winTitle & "|||" & procId
      end tell
    `;

    try {
      const raw = await runAppleScript(script);
      const [name, bundleId, windowTitle, procId] = raw.split('|||');
      return {
        appId: (bundleId || name || 'unknown').toLowerCase(),
        appName: (name || 'Active App').trim(),
        bundleId: (bundleId || '').trim(),
        processId: procId ? parseInt(procId, 10) : null,
        processName: (name || '').trim(),
        windowTitle: (windowTitle || '').trim(),
        platform: 'darwin'
      };
    } catch (err) {
      return {
        appId: 'unknown',
        appName: 'Active App',
        bundleId: '',
        processId: null,
        processName: '',
        windowTitle: '',
        platform: 'darwin'
      };
    }
  }
}

// 3. Text Insertion Provider
export class MacOSTextInsertionProvider extends ITextInsertionProvider {
  constructor(options = {}) {
    super();
    this.restoreDelayMs = options.restoreDelayMs || 600;
  }

  async insertText(text) {
    if (!text || text.trim().length === 0) {
      return { success: false, error: 'No text to insert' };
    }

    let savedClipboard = '';
    try {
      savedClipboard = clipboard.readText();
    } catch (e) {}

    try {
      clipboard.writeText(text);
      await sleep(40);

      // Simulate Cmd+V via AppleScript (System Events)
      await runAppleScript('tell application "System Events" to keystroke "v" using command down');
      console.log('[MacOSTextInsertionProvider] ✓ Cmd+V keystroke dispatched.');

      setTimeout(() => {
        try {
          if (savedClipboard !== undefined) {
            clipboard.writeText(savedClipboard);
            console.log('[MacOSTextInsertionProvider] ✓ Original clipboard restored.');
          }
        } catch (e) {}
      }, this.restoreDelayMs);

      return { success: true };
    } catch (err) {
      console.error('[MacOSTextInsertionProvider] Keystroke error:', err.message);
      try {
        if (savedClipboard) clipboard.writeText(savedClipboard);
      } catch (e) {}

      return {
        success: false,
        error: `Text insertion failed: ${err.message}. Please grant Accessibility permission in macOS System Settings.`
      };
    }
  }
}

// 4. Clipboard Provider
export class MacOSClipboardProvider extends IClipboardProvider {
  readText() {
    return clipboard.readText();
  }

  writeText(text) {
    clipboard.writeText(text);
  }

  clear() {
    clipboard.clear();
  }
}

// 5. Permission Provider
export class MacOSPermissionProvider extends IPermissionProvider {
  checkAccessibility(prompt = false) {
    try {
      return systemPreferences.isTrustedAccessibilityClient(prompt);
    } catch (err) {
      console.error('[MacOSPermissionProvider] Accessibility check failed:', err);
      return false;
    }
  }

  async checkMicrophone() {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'granted') return true;
      return await systemPreferences.askForMediaAccess('microphone');
    } catch (err) {
      console.error('[MacOSPermissionProvider] Microphone check failed:', err);
      return false;
    }
  }

  openSettings(type) {
    if (type === 'accessibility') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } else if (type === 'microphone') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    }
  }

  async verifyAll() {
    const hasAccessibility = this.checkAccessibility(true);
    const hasMicrophone = await this.checkMicrophone();

    if (!hasAccessibility) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Accessibility Permission Required',
        message: 'Mumble AI needs Accessibility permission to insert transcribed text at your cursor in other apps.',
        detail: 'Please enable Mumble AI in System Settings → Privacy & Security → Accessibility, then restart the app.',
        buttons: ['Open System Settings', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) this.openSettings('accessibility');
      });
    }

    if (!hasMicrophone) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Microphone Permission Required',
        message: 'Mumble AI needs Microphone access to record and transcribe your voice.',
        detail: 'Please enable Microphone access in System Settings → Privacy & Security → Microphone.',
        buttons: ['Open System Settings', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) this.openSettings('microphone');
      });
    }

    return { accessibility: hasAccessibility, microphone: hasMicrophone };
  }
}

// 6. Startup Provider
export class MacOSStartupProvider extends IStartupProvider {
  enableStartup() {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }

  disableStartup() {
    app.setLoginItemSettings({ openAtLogin: false });
  }

  isStartupEnabled() {
    return app.getLoginItemSettings().openAtLogin;
  }
}

// 7. Tray Provider
export class MacOSTrayProvider extends ITrayProvider {
  constructor() {
    super();
    this.tray = null;
    this.options = {};
    this.isRecording = false;
  }

  create(options = {}) {
    this.options = options;
    const icon = nativeImage.createEmpty();
    this.tray = new Tray(icon);
    this.tray.setTitle('🎙️');
    this.tray.setToolTip('Mumble AI — Voice Dictation');
    this.updateMenu();
  }

  setRecordingState(isRecording) {
    this.isRecording = isRecording;
    if (this.tray) {
      this.tray.setTitle(isRecording ? '🔴' : '🎙️');
      this.updateMenu();
    }
  }

  updateMenu() {
    if (!this.tray) return;
    const hotkey = this.options.hotkey || 'F8';
    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.isRecording ? 'Stop Dictation' : `Start Dictation (${hotkey})`,
        click: () => this.options.onToggleDictation && this.options.onToggleDictation()
      },
      { type: 'separator' },
      {
        label: 'Open Web Interface',
        click: () => shell.openExternal(this.options.serverUrl || 'http://localhost:3050')
      },
      {
        label: 'Settings...',
        click: () => this.options.onOpenSettings && this.options.onOpenSettings()
      },
      { type: 'separator' },
      {
        label: 'Quit Mumble AI',
        click: () => app.quit()
      }
    ]);
    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

// 8. Composite macOS Platform Adapter
export class MacOSPlatformAdapter extends IPlatformAdapter {
  constructor() {
    super();
    this.platform = 'darwin';
    this.hotkeys = new MacOSGlobalHotkeyProvider();
    this.activeApp = new MacOSActiveApplicationProvider();
    this.textInsertion = new MacOSTextInsertionProvider();
    this.clipboard = new MacOSClipboardProvider();
    this.permissions = new MacOSPermissionProvider();
    this.startup = new MacOSStartupProvider();
    this.tray = new MacOSTrayProvider();
  }
}
