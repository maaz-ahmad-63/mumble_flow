/**
 * Mumble AI Desktop — Platform Provider Factory
 *
 * Resolves the appropriate platform adapter for the host operating system
 * (macOS, Windows, Linux, Web).
 */

import { MacOSPlatformAdapter } from './macos/index.js';
import { WindowsPlatformAdapter } from './windows/index.js';

let platformInstance = null;

/**
 * Get the singleton PlatformAdapter for the active operating system.
 * @param {string} [overridePlatform] - Optional platform override for testing
 * @returns {import('./interfaces.js').IPlatformAdapter}
 */
export function getPlatformAdapter(overridePlatform) {
  const targetPlatform = overridePlatform || process.platform;

  if (targetPlatform === 'darwin') {
    return new MacOSPlatformAdapter();
  } else if (targetPlatform === 'win32') {
    return new WindowsPlatformAdapter();
  } else {
    // Default fallback to Windows/generic adapter
    return new WindowsPlatformAdapter();
  }
}

export function getCurrentPlatform() {
  if (!platformInstance) {
    platformInstance = getPlatformAdapter();
  }
  return platformInstance;
}

export * from './interfaces.js';
export { MacOSPlatformAdapter } from './macos/index.js';
export { WindowsPlatformAdapter } from './windows/index.js';
