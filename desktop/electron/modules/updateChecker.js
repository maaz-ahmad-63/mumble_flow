/**
 * Mumble AI Desktop — Automatic Update Checker
 *
 * Checks GitHub Releases for new desktop app versions.
 * Compares current semantic version with the latest release on GitHub.
 * Alerts users with an update prompt and direct download action.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Safe runtime resolution for Electron APIs (allows running under both Electron & Node test suites)
let electron = {};
try {
  // @ts-ignore
  electron = await import('electron');
} catch (e) {}

const app = electron.app || { getVersion: () => '1.0.0' };
const dialog = electron.dialog || { showMessageBox: async () => ({ response: 0 }) };
const shell = electron.shell || { openExternal: async () => {} };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_OWNER = 'maaz-ahmad-63';
const REPO_NAME = 'mumble_flow';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

/**
 * Compare two semantic versions (e.g. '1.1.0' vs '1.0.0' or 'v1.1.0' vs '1.0.0')
 * Returns:
 *   1 if v1 > v2 (v1 is newer)
 *  -1 if v1 < v2 (v1 is older)
 *   0 if equal
 */
export function compareVersions(v1, v2) {
  const clean = (v) => String(v || '').trim().replace(/^[vV]/, '').split('-')[0];
  const parts1 = clean(v1).split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = clean(v2).split('.').map(p => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Get current application version from Electron or package.json
 */
export function getCurrentVersion() {
  try {
    if (app && typeof app.getVersion === 'function') {
      const ver = app.getVersion();
      if (ver && ver !== '0.0.0') return ver;
    }
  } catch (e) {}

  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch (e) {}

  return '1.0.0';
}

export class UpdateChecker {
  constructor(options = {}) {
    this.owner = options.owner || REPO_OWNER;
    this.repo = options.repo || REPO_NAME;
    this.apiUrl = options.apiUrl || GITHUB_RELEASES_URL;
    this.isChecking = false;
  }

  /**
   * Check for updates on GitHub Releases.
   * @param {Object} [options]
   * @param {boolean} [options.isManual=false] - True if triggered by user click (shows up-to-date alert)
   * @param {BrowserWindow} [options.parentWindow=null] - Parent window for the modal dialog
   */
  async checkForUpdates({ isManual = false, parentWindow = null } = {}) {
    if (this.isChecking) return;
    this.isChecking = true;

    const currentVersion = getCurrentVersion();
    console.log(`[UpdateChecker] Checking for updates (current version: v${currentVersion}, manual: ${isManual})...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000); // 7s timeout

      const response = await fetch(this.apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Mumble-AI-Desktop-App'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[UpdateChecker] No releases published yet on GitHub repository.');
          if (isManual) {
            await dialog.showMessageBox(parentWindow, {
              type: 'info',
              title: 'Mumble AI Updates',
              message: `You are on version v${currentVersion}`,
              detail: 'No public releases are currently available on GitHub.',
              buttons: ['OK']
            });
          }
          return { hasUpdate: false, currentVersion };
        }
        throw new Error(`GitHub API returned status ${response.status}`);
      }

      const release = await response.json();
      const latestTag = release.tag_name || release.name || '';
      const releaseNotes = release.body ? release.body.slice(0, 300) : 'Performance improvements and bug fixes.';

      const isNewer = compareVersions(latestTag, currentVersion) > 0;

      if (isNewer) {
        console.log(`[UpdateChecker] Update found! Latest: ${latestTag}, Current: v${currentVersion}`);

        // Find appropriate installer asset for current platform
        let downloadUrl = release.html_url;
        if (Array.isArray(release.assets) && release.assets.length > 0) {
          const isMac = process.platform === 'darwin';
          const isWin = process.platform === 'win32';
          const isArm = process.arch === 'arm64';

          const matchingAsset = release.assets.find(asset => {
            const name = (asset.name || '').toLowerCase();
            if (isMac) {
              if (isArm && name.includes('arm64') && name.endsWith('.dmg')) return true;
              return name.endsWith('.dmg');
            }
            if (isWin) {
              return name.endsWith('.exe');
            }
            return false;
          });

          if (matchingAsset && matchingAsset.browser_download_url) {
            downloadUrl = matchingAsset.browser_download_url;
          }
        }

        const { response: choice } = await dialog.showMessageBox(parentWindow, {
          type: 'info',
          title: 'Update Available — Mumble AI',
          message: `A new version of Mumble AI (${latestTag}) is available!`,
          detail: `You are currently running v${currentVersion}.\n\nRelease notes:\n${releaseNotes}\n\nWould you like to download and install the update now?`,
          buttons: ['Download Update Now', 'Later', 'View on GitHub'],
          defaultId: 0,
          cancelId: 1
        });

        if (choice === 0) {
          console.log(`[UpdateChecker] User chose to download update. Opening: ${downloadUrl}`);
          await shell.openExternal(downloadUrl);
        } else if (choice === 2) {
          await shell.openExternal(release.html_url);
        }

        return { hasUpdate: true, latestVersion: latestTag, currentVersion, downloadUrl };
      } else {
        console.log(`[UpdateChecker] Mumble AI is up to date (v${currentVersion}).`);
        if (isManual) {
          await dialog.showMessageBox(parentWindow, {
            type: 'info',
            title: 'Mumble AI is Up to Date',
            message: `You have the latest version (v${currentVersion})!`,
            detail: 'No newer updates are available.',
            buttons: ['OK']
          });
        }
        return { hasUpdate: false, currentVersion };
      }
    } catch (err) {
      console.warn('[UpdateChecker] Could not check for updates:', err.message);
      if (isManual) {
        await dialog.showMessageBox(parentWindow, {
          type: 'warning',
          title: 'Update Check Failed',
          message: 'Unable to check for updates right now.',
          detail: `Please verify your internet connection or check https://github.com/${this.owner}/${this.repo}/releases directly.`,
          buttons: ['OK']
        });
      }
      return { hasUpdate: false, error: err.message };
    } finally {
      this.isChecking = false;
    }
  }
}

export const updateChecker = new UpdateChecker();
