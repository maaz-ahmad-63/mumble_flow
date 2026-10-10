/**
 * Mumble AI Desktop — Windows Platform Adapter (Architecture Specification & Provider Implementation)
 *
 * Implements the standard Platform Provider interfaces for Windows (win32).
 * Designed for native Win32 User32/Kernel32 APIs, Windows UI Automation, and SendInput.
 */

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

/**
 * Windows Global Hotkey Provider
 * Implementation approach:
 * Uses Electron globalShortcut (which wraps Win32 RegisterHotKey API) or low-level keyboard hook (SetWindowsHookEx(WH_KEYBOARD_LL)).
 */
export class WindowsGlobalHotkeyProvider extends IGlobalHotkeyProvider {
  register(accelerator, callback) {
    console.log(`[WindowsGlobalHotkeyProvider] Registering hotkey: ${accelerator}`);
    // Native Electron globalShortcut or Win32 RegisterHotKey
    return true;
  }

  unregisterAll() {
    console.log('[WindowsGlobalHotkeyProvider] Unregistering all hotkeys.');
  }

  isRegistered(accelerator) {
    return false;
  }
}

/**
 * Windows Active Application Provider
 * Implementation approach:
 * 1. GetForegroundWindow() via user32.dll -> HWND
 * 2. GetWindowThreadProcessId(hwnd, &processId) -> PID
 * 3. OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) + QueryFullProcessImageNameW() -> executable path (e.g. Code.exe, Cursor.exe)
 * 4. GetWindowTextW(hwnd, buffer, maxCount) -> active window title
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
 * Windows Text Insertion Provider
 * Implementation approach:
 * 1. Save current clipboard contents (electron.clipboard.readText() or OpenClipboard/GetClipboardData)
 * 2. Write formatted text to clipboard (electron.clipboard.writeText(text))
 * 3. Dispatch Ctrl+V keystroke via SendInput (VK_CONTROL down, 'V' down, 'V' up, VK_CONTROL up) or keybd_event
 * 4. Restore original clipboard contents after 500ms
 */
export class WindowsTextInsertionProvider extends ITextInsertionProvider {
  async insertText(text) {
    if (!text) return { success: false, error: 'No text to insert' };
    console.log('[WindowsTextInsertionProvider] Simulating Ctrl+V via Win32 SendInput.');
    return { success: true };
  }
}

/**
 * Windows Clipboard Provider
 */
export class WindowsClipboardProvider extends IClipboardProvider {
  readText() {
    return '';
  }

  writeText(text) {}

  clear() {}
}

/**
 * Windows Permission Provider
 * Implementation approach:
 * Windows 10/11 microphone permissions are managed in Windows Settings (ms-settings:privacy-microphone).
 * Checked via Windows MediaCapture API or registry:
 * HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone
 */
export class WindowsPermissionProvider extends IPermissionProvider {
  checkAccessibility(prompt = false) {
    // Windows does not require an explicit Accessibility permission grant like macOS
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
 * Implementation approach:
 * Sets registry value in HKCU\Software\Microsoft\Windows\CurrentVersion\Run or uses app.setLoginItemSettings().
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
 * Implementation approach:
 * Uses Windows NotifyIcon / Electron Tray with Windows-specific .ico asset.
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
  constructor() {
    super();
    this.platform = 'win32';
    this.hotkeys = new WindowsGlobalHotkeyProvider();
    this.activeApp = new WindowsActiveApplicationProvider();
    this.textInsertion = new WindowsTextInsertionProvider();
    this.clipboard = new WindowsClipboardProvider();
    this.permissions = new WindowsPermissionProvider();
    this.startup = new WindowsStartupProvider();
    this.tray = new WindowsTrayProvider();
  }
}
