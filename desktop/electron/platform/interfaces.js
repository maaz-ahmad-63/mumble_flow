/**
 * Mumble AI Desktop — Platform Provider Interface Specifications
 *
 * Defines the contract that every OS adapter (macOS, Windows, Linux, Web)
 * MUST implement to ensure complete separation between Core logic and Native OS APIs.
 */

/**
 * @typedef {Object} NormalizedAppContext
 * @property {string} appId - Canonical lowercase application slug (e.g. 'cursor', 'vscode', 'chrome')
 * @property {string} appName - Human-readable application name (e.g. 'Cursor', 'Visual Studio Code')
 * @property {string} [bundleId] - macOS bundle identifier (e.g. 'com.todesktop.230313mzl4w4u92') or empty on other OS
 * @property {number|null} [processId] - Native operating system process identifier
 * @property {string} [processName] - Binary process name (e.g. 'Code.exe', 'cursor', 'slack')
 * @property {string} [windowTitle] - Active window title string
 * @property {'developer'|'terminal'|'messaging'|'email'|'browser'|'notes'|'other'} category - Application category
 * @property {'darwin'|'win32'|'linux'|'web'} platform - Source platform identifier
 */

/**
 * IGlobalHotkeyProvider
 * Manages global keyboard shortcuts across the desktop operating system.
 */
export class IGlobalHotkeyProvider {
  /**
   * Register a global hotkey.
   * @param {string} accelerator - e.g. 'F8', 'Option+Space', 'CommandOrControl+Shift+D'
   * @param {Function} callback - Trigger callback
   * @returns {boolean} Success status
   */
  register(accelerator, callback) {
    throw new Error('IGlobalHotkeyProvider.register() must be implemented by platform adapter.');
  }

  /**
   * Unregister all registered global shortcuts.
   */
  unregisterAll() {
    throw new Error('IGlobalHotkeyProvider.unregisterAll() must be implemented by platform adapter.');
  }

  /**
   * Check if a given accelerator is registered.
   * @param {string} accelerator
   * @returns {boolean}
   */
  isRegistered(accelerator) {
    throw new Error('IGlobalHotkeyProvider.isRegistered() must be implemented by platform adapter.');
  }
}

/**
 * IActiveApplicationProvider
 * Identifies the currently focused/frontmost window and application on the OS.
 */
export class IActiveApplicationProvider {
  /**
   * Query the frontmost focused application.
   * @returns {Promise<NormalizedAppContext>}
   */
  async getFocusedApp() {
    throw new Error('IActiveApplicationProvider.getFocusedApp() must be implemented by platform adapter.');
  }
}

/**
 * ITextInsertionProvider
 * Inserts text directly at the cursor location in whatever application is active.
 */
export class ITextInsertionProvider {
  /**
   * Insert text at cursor position in the active application.
   * @param {string} text - The transcribed and formatted text
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async insertText(text) {
    throw new Error('ITextInsertionProvider.insertText() must be implemented by platform adapter.');
  }
}

/**
 * IClipboardProvider
 * Safe clipboard access for reading, writing, and restoring contents.
 */
export class IClipboardProvider {
  readText() {
    throw new Error('IClipboardProvider.readText() must be implemented by platform adapter.');
  }

  writeText(text) {
    throw new Error('IClipboardProvider.writeText() must be implemented by platform adapter.');
  }

  clear() {
    throw new Error('IClipboardProvider.clear() must be implemented by platform adapter.');
  }
}

/**
 * IPermissionProvider
 * Checks and requests necessary OS permissions (Accessibility, Microphone, Screen/Window).
 */
export class IPermissionProvider {
  /**
   * Check accessibility / UI automation permission.
   * @param {boolean} prompt - Whether to trigger OS prompt dialog
   * @returns {Promise<boolean>|boolean}
   */
  checkAccessibility(prompt = false) {
    throw new Error('IPermissionProvider.checkAccessibility() must be implemented by platform adapter.');
  }

  /**
   * Check microphone access permission.
   * @returns {Promise<boolean>}
   */
  async checkMicrophone() {
    throw new Error('IPermissionProvider.checkMicrophone() must be implemented by platform adapter.');
  }

  /**
   * Open OS settings panel for a given permission.
   * @param {'accessibility'|'microphone'} type
   */
  openSettings(type) {
    throw new Error('IPermissionProvider.openSettings() must be implemented by platform adapter.');
  }

  /**
   * Verify all required permissions on startup.
   * @returns {Promise<{ accessibility: boolean, microphone: boolean }>}
   */
  async verifyAll() {
    throw new Error('IPermissionProvider.verifyAll() must be implemented by platform adapter.');
  }
}

/**
 * IStartupProvider
 * Manages launch at system boot / login.
 */
export class IStartupProvider {
  enableStartup() {
    throw new Error('IStartupProvider.enableStartup() must be implemented by platform adapter.');
  }

  disableStartup() {
    throw new Error('IStartupProvider.disableStartup() must be implemented by platform adapter.');
  }

  isStartupEnabled() {
    throw new Error('IStartupProvider.isStartupEnabled() must be implemented by platform adapter.');
  }
}

/**
 * ITrayProvider
 * Manages the system tray / menu bar status icon.
 */
export class ITrayProvider {
  create(options) {
    throw new Error('ITrayProvider.create() must be implemented by platform adapter.');
  }

  setRecordingState(isRecording) {
    throw new Error('ITrayProvider.setRecordingState() must be implemented by platform adapter.');
  }

  destroy() {
    throw new Error('ITrayProvider.destroy() must be implemented by platform adapter.');
  }
}

/**
 * IPlatformAdapter
 * Container bundling all platform-specific providers for a given operating system.
 */
export class IPlatformAdapter {
  constructor() {
    this.platform = 'unknown';
    /** @type {IGlobalHotkeyProvider} */
    this.hotkeys = null;
    /** @type {IActiveApplicationProvider} */
    this.activeApp = null;
    /** @type {ITextInsertionProvider} */
    this.textInsertion = null;
    /** @type {IClipboardProvider} */
    this.clipboard = null;
    /** @type {IPermissionProvider} */
    this.permissions = null;
    /** @type {IStartupProvider} */
    this.startup = null;
    /** @type {ITrayProvider} */
    this.tray = null;
  }
}
