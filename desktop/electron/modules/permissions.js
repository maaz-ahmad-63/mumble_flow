/**
 * Mumble AI Desktop — macOS Permissions Module
 *
 * Checks and prompts for macOS Accessibility and Microphone permissions.
 */

import { systemPreferences, dialog, shell } from 'electron';
import { runAppleScript } from './textInsertion.js';

/**
 * Check if the application has Accessibility permissions (required for keystroke simulation & active app query).
 * @param {boolean} prompt - If true, prompts the user via macOS system dialog if not trusted.
 * @returns {boolean}
 */
export function checkAccessibilityPermission(prompt = false) {
  if (process.platform !== 'darwin') return true;

  try {
    // Passing true triggers the OS prompt adding the app to Accessibility list
    return systemPreferences.isTrustedAccessibilityClient(prompt);
  } catch (err) {
    console.error('Failed to check accessibility permission:', err);
    return false;
  }
}

/**
 * Check and request Microphone permission on macOS.
 * @returns {Promise<boolean>}
 */
export async function checkMicrophonePermission() {
  if (process.platform !== 'darwin') return true;

  try {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') {
      return true;
    }

    // Request access
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted;
  } catch (err) {
    console.error('Failed to check microphone permission:', err);
    return false;
  }
}

/**
 * Guide the user to open macOS System Settings for missing permissions.
 * @param {'accessibility' | 'microphone'} type
 */
export function openSystemSettings(type) {
  if (process.platform !== 'darwin') return;

  if (type === 'accessibility') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  } else if (type === 'microphone') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  }
}

/**
 * Verify all required permissions on startup and show a friendly modal if missing.
 * @returns {Promise<{accessibility: boolean, microphone: boolean}>}
 */
export async function verifyPermissions() {
  const hasAccessibility = checkAccessibilityPermission(true);
  const hasMicrophone = await checkMicrophonePermission();

  if (!hasAccessibility) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Accessibility Permission Required',
      message: 'Mumble AI needs Accessibility permission to insert transcribed text at your cursor in other apps.',
      detail: 'Please enable Mumble AI in System Settings → Privacy & Security → Accessibility, then restart the app.',
      buttons: ['Open System Settings', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        openSystemSettings('accessibility');
      }
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
      if (response === 0) {
        openSystemSettings('microphone');
      }
    });
  }

  return { accessibility: hasAccessibility, microphone: hasMicrophone };
}
