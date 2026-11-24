/**
 * Mumble AI Desktop — Native Hook Manager
 *
 * Provides a resilient, crash-proof isolation boundary around uiohook-napi.
 * Prevents native module ABI, architecture mismatch, or DLL loading failures from
 * crashing the Electron main process, guaranteeing that the Main Studio Dashboard
 * always launches and displays properly regardless of native hook state.
 */

let uIOhookInstance = null;
let UiohookKeyConstants = null;
let isLoaded = false;
let loadError = null;

try {
  // In packaged desktop environments, enforce PREBUILDS_ONLY so node-gyp-build
  // resolves the exact matching prebuilt binary for the target OS and architecture.
  if (process.resourcesPath || process.env.NODE_ENV === 'production') {
    process.env.PREBUILDS_ONLY = '1';
  }

  const uiohookModule = await import('uiohook-napi');
  uIOhookInstance = uiohookModule.uIOhook;
  UiohookKeyConstants = uiohookModule.UiohookKey;
  isLoaded = Boolean(uIOhookInstance && typeof uIOhookInstance.start === 'function');
  if (isLoaded) {
    console.log(`[NativeHookManager] ✓ Successfully loaded uiohook-napi native module (platform: ${process.platform}, arch: ${process.arch}).`);
  }
} catch (err) {
  loadError = err;
  isLoaded = false;
  console.error(`[NativeHookManager] ⚠️ WARNING: Native keyboard hook (uiohook-napi) failed to load: ${err.message}`);
  console.error(`[NativeHookManager] Diagnostic info: Platform=${process.platform}, Arch=${process.arch}, Node=${process.versions.node}, Electron=${process.versions?.electron || 'N/A'}`);
}

class NativeHookManager {
  get isAvailable() {
    return isLoaded;
  }

  get error() {
    return loadError ? loadError.message : null;
  }

  get hook() {
    return uIOhookInstance;
  }

  get keys() {
    return UiohookKeyConstants || {};
  }

  start() {
    if (!this.isAvailable) {
      console.warn('[NativeHookManager] Cannot start hook: Native module not loaded.');
      return false;
    }
    try {
      this.hook.start();
      return true;
    } catch (e) {
      console.error('[NativeHookManager] Failed to start uIOhook:', e.message);
      return false;
    }
  }

  stop() {
    if (!this.isAvailable) return;
    try {
      this.hook.stop();
    } catch (e) {}
  }

  on(event, handler) {
    if (!this.isAvailable) return;
    try {
      this.hook.on(event, handler);
    } catch (e) {}
  }

  keyTap(key, modifiers = []) {
    if (!this.isAvailable || typeof this.hook.keyTap !== 'function') {
      throw new Error(`Native keyTap unavailable: ${this.error || 'module not loaded'}`);
    }
    this.hook.keyTap(key, modifiers);
  }
}

export const nativeHookManager = new NativeHookManager();
export { UiohookKeyConstants as UiohookKey };
