/**
 * Murmur Flow Desktop — macOS Text Insertion Engine
 *
 * Inserts text at the cursor position in ANY macOS application by:
 * 1. Saving the user's current clipboard contents
 * 2. Copying dictated text to clipboard
 * 3. Simulating Cmd+V via System Events (AppleScript)
 * 4. Restoring original clipboard contents after a brief delay
 *
 * Requires macOS Accessibility permission (System Settings → Privacy → Accessibility).
 */

import { execFile } from 'child_process';
import { clipboard } from 'electron';

// How long to wait (ms) before restoring clipboard.
const CLIPBOARD_RESTORE_DELAY_MS = 600;

import { getCurrentPlatform } from '../platform/index.js';

/**
 * Insert text at the cursor position in the currently focused application.
 * Delegates to Platform Provider Adapter.
 *
 * @param {string} text - The text to insert
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function insertTextAtCursor(text) {
  const platform = getCurrentPlatform();
  return await platform.textInsertion.insertText(text);
}

/**
 * Run an AppleScript command via osascript.
 * @param {string} script
 * @returns {Promise<string>}
 */
export function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
