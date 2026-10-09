import { getCurrentPlatform } from '../platform/index.js';
import { classifyAppContext } from './appContext.js';

/**
 * Get information about the currently active/frontmost application.
 * Delegates to Platform Provider Adapter and returns a classified AppContext object.
 * @returns {Promise<{name: string, appName: string, bundleId: string, windowTitle: string, category: string, recommendedMode: string}>}
 */
export async function getFocusedApplication() {
  try {
    const platform = getCurrentPlatform();
    const appInfo = await platform.activeApp.getFocusedApp();
    return classifyAppContext(appInfo);
  } catch (err) {
    return classifyAppContext({ name: 'Active App', appName: 'Active App', bundleId: '', windowTitle: '' });
  }
}
