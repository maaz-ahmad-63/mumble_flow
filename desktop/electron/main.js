/**
 * Mumble AI Desktop — Main Process
 *
 * macOS Native Voice Dictation Client (Wispr Flow style)
 */

import { app, BrowserWindow, globalShortcut, ipcMain, screen, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { uIOhook, UiohookKey } from 'uiohook-napi';

import { insertTextAtCursor } from './modules/textInsertion.js';
import { getFocusedApplication } from './modules/focusedApp.js';
import { verifyPermissions } from './modules/permissions.js';
import { ServerManager } from './modules/serverManager.js';
import { TrayManager } from './modules/tray.js';
import { isMumbleApp, classifyAppContext, resolveEffectiveMode } from './modules/appContext.js';
import { desktopAuthManager } from './modules/authManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let overlayWindow = null;
let settingsWindow = null;
let serverManager = null;
let trayManager = null;

let isRecording = false;
let isCancelled = false;
let recordingTriggerSource = 'none'; // 'space' | 'f8' | 'ui'
let recordingStartTime = 0;
let currentHotkey = 'F8';
let serverBaseUrl = 'http://localhost:3050';
let activeTargetApp = 'System';
let hideTimeout = null;
let selectedMode = 'auto'; // 'auto' | 'developer' | 'prompt' | 'email' | 'bullet' | 'standup' | 'casual' | 'formal'

// Space hold-to-talk tracking
let isSpaceKeyDown = false;
let spaceHoldTimer = null;
const SPACE_HOLD_THRESHOLD_MS = 300; // > 300ms is a hold; < 300ms is a normal space tap

/**
 * Initialize overlay window
 */
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const windowWidth = 460;
  const windowHeight = 80;
  const x = Math.round((width - windowWidth) / 2);
  const y = height - windowHeight - 40; // Float above dock

  overlayWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false, // NEVER steal focus from active text box!
    acceptFirstMouse: false,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

/**
 * Update the state of the HUD overlay
 */
function setHUDState(state, options = {}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const payload = {
    state,
    target: options.target || activeTargetApp,
    hotkey: currentHotkey,
    message: options.message || '',
    interim: options.interim || ''
  };

  overlayWindow.webContents.send('state-change', payload);

  if (state === 'recording' || state === 'processing') {
    if (hideTimeout) clearTimeout(hideTimeout);
    overlayWindow.showInactive();
  } else if (state === 'success' || state === 'error') {
    if (hideTimeout) clearTimeout(hideTimeout);
    overlayWindow.showInactive();
    hideTimeout = setTimeout(() => {
      if (!isRecording && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
        setHUDState('idle');
      }
    }, 1800);
  } else if (state === 'idle') {
    overlayWindow.hide();
  }
}

/**
 * Register Global Hotkeys (Option+Space / Cmd+Shift+D aliases for Mac keyboards).
 * Note: F8 is handled exclusively via uIOhook native event hook to eliminate double-trigger race conditions.
 */
function registerGlobalHotkey(hotkey = 'F8') {
  globalShortcut.unregisterAll();
  currentHotkey = hotkey;

  // If user configured a non-F8 custom hotkey, register it with globalShortcut
  if (hotkey !== 'F8') {
    const primaryOk = globalShortcut.register(hotkey, () => {
      console.log(`[Hotkey] Triggered custom primary hotkey: ${hotkey}`);
      toggleDictation();
    });
    if (!primaryOk) {
      console.warn(`[Hotkey] Could not register custom hotkey ${hotkey}.`);
    }
  }

  // Register Mac-friendly aliases in case F8 is intercepted by media keys
  const aliases = ['Alt+Space', 'CommandOrControl+Shift+D'];
  for (const alias of aliases) {
    if (alias !== hotkey) {
      try {
        globalShortcut.register(alias, () => {
          console.log(`[Hotkey] Triggered alias hotkey: ${alias}`);
          toggleDictation();
        });
      } catch (e) {}
    }
  }

  console.log(`[Hotkey] Global F8 handled exclusively via uIOhook. Registered aliases: ${aliases.join(', ')}`);

  if (trayManager) {
    trayManager.updateHotkey(hotkey);
  }
}

let lastAppContext = { name: 'Active App', appName: 'Active App', bundleId: '', windowTitle: '', category: 'unknown', recommendedMode: 'casual' };
let lastNonMumbleAppContext = null;
let currentEffectiveResolution = { finalMode: 'casual', source: 'fallback', category: 'unknown', appName: 'Active App' };

/**
 * Start Dictation
 */
async function startDictation(source = 'f8') {
  if (isRecording) {
    console.log(`[STAGE 3: START_DICTATION_IGNORED] Already recording. Source: ${source}`);
    return;
  }
  isRecording = true;
  isCancelled = false;
  recordingTriggerSource = source;
  recordingStartTime = Date.now();
  console.log(`[STAGE 3: START_DICTATION] 🎙️ Recording STARTED (source: ${source})`);
  if (trayManager) trayManager.setRecordingState(true);

  try {
    const rawFocused = await getFocusedApplication();
    if (isMumbleApp(rawFocused)) {
      if (lastNonMumbleAppContext) {
        lastAppContext = lastNonMumbleAppContext;
      } else {
        lastAppContext = rawFocused;
      }
    } else {
      lastNonMumbleAppContext = rawFocused;
      lastAppContext = rawFocused;
    }
  } catch (e) {
    if (!lastAppContext) {
      lastAppContext = classifyAppContext({ name: 'Active App', appName: 'Active App' });
    }
  }

  activeTargetApp = lastAppContext.appName || lastAppContext.name || 'Active App';

  // Priority: MANUAL MODE > APP AUTO-DETECTION
  currentEffectiveResolution = resolveEffectiveMode(selectedMode, lastAppContext);
  const { finalMode, source: modeSource, category } = currentEffectiveResolution;

  // Requirement 6: Log at recording start
  console.log(`[AppContext] app=${activeTargetApp}`);
  console.log(`[AppContext] category=${category}`);
  console.log(`[AppContext] selectedMode=${selectedMode}`);
  console.log(`[AppContext] finalMode=${finalMode}`);
  console.log(`[AppContext] source=${modeSource}`);

  console.log(`[STAGE 3: ACTIVE_APP_RESOLVED] app=${activeTargetApp} (mode: ${finalMode}, source: ${modeSource})`);
  setHUDState('recording', { target: activeTargetApp });
}

/**
 * Stop Dictation & Process
 */
async function stopDictation() {
  if (!isRecording) {
    console.log('[STAGE 6: STOP_DICTATION_IGNORED] Not recording.');
    return;
  }
  isRecording = false;
  console.log(`[STAGE 6: STOP_DICTATION] ⏹️ Recording STOPPED (source: ${recordingTriggerSource}), processing...`);
  if (trayManager) trayManager.setRecordingState(false);
  setHUDState('processing', { target: activeTargetApp });
}

/**
 * Cancel Dictation Immediately (Clean up, discard audio, return to idle)
 */
function cancelDictation() {
  if (spaceHoldTimer) {
    clearTimeout(spaceHoldTimer);
    spaceHoldTimer = null;
  }
  if (!isRecording) return;

  isRecording = false;
  isCancelled = true;
  recordingTriggerSource = 'none';
  console.log('[Dictation] ❌ Recording CANCELLED by user. Discarding audio & returning to idle.');

  if (trayManager) trayManager.setRecordingState(false);

  // Notify overlay window to cancel capture and discard buffer immediately
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('cancel-audio');
  }

  setHUDState('idle');
}

let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 350;

/**
 * Toggle Dictation On/Off (F8 hotkey) with 350ms debounce guard
 */
async function toggleDictation() {
  const now = Date.now();
  if (now - lastToggleTime < TOGGLE_DEBOUNCE_MS) {
    console.log(`[Toggle] Ignored duplicate toggle event (${now - lastToggleTime}ms < ${TOGGLE_DEBOUNCE_MS}ms).`);
    return;
  }
  lastToggleTime = now;

  if (!isRecording) {
    await startDictation('f8');
  } else {
    await stopDictation();
  }
}

/**
 * Initialize Global Native Input Hooks (Hold Space & Esc Cancel)
 * Works globally across macOS and Windows without stealing keyboard focus or breaking normal typing.
 */
function initGlobalInputHooks() {
  console.log('[STAGE 1: HOOK_INIT] Registering uIOhook listeners...');
  uIOhook.on('keydown', (e) => {
    // 0. GLOBAL F8: Native low-level interception for global F8 hotkey (bypasses OS media key overrides)
    if (e.keycode === UiohookKey.F8) {
      console.log('[STAGE 2: KEYDOWN_F8] F8 pressed globally via uIOhook -> Toggling dictation');
      toggleDictation();
      return;
    }

    // 1. ESC CANCEL: While recording, pressing Esc immediately cancels the recording
    if (e.keycode === UiohookKey.Escape) {
      if (isRecording) {
        console.log('[STAGE 2: KEYDOWN_ESC] Escape pressed while recording -> Cancelling dictation');
        cancelDictation();
      }
      return; // When not recording, Esc behaves normally
    }

    // 2. HOLD SPACE: Holding Space starts recording
    if (e.keycode === UiohookKey.Space) {
      if (isSpaceKeyDown) return; // Ignore auto-repeat keydown events while key is held down
      isSpaceKeyDown = true;
      console.log('[STAGE 2: KEYDOWN_SPACE] Space pressed. Waiting for hold threshold (300ms)...');

      // Only initiate space-hold if not already recording
      if (!isRecording) {
        if (spaceHoldTimer) clearTimeout(spaceHoldTimer);
        spaceHoldTimer = setTimeout(() => {
          spaceHoldTimer = null;
          if (isSpaceKeyDown && !isRecording) {
            console.log('[STAGE 2: SPACE_HOLD_TRIGGERED] Space held > 300ms -> Starting dictation (Hold-to-Talk)');
            startDictation('space');
          }
        }, SPACE_HOLD_THRESHOLD_MS);
      }
      return;
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Space) {
      isSpaceKeyDown = false;

      // If released before threshold, it was a normal space tap
      if (spaceHoldTimer) {
        clearTimeout(spaceHoldTimer);
        spaceHoldTimer = null;
        console.log('[STAGE 2: KEYUP_SPACE_TAP] Normal space tap released before 300ms. Ignored.');
        return;
      }

      // If recording was started by holding Space, releasing Space stops recording and processes audio
      if (isRecording && recordingTriggerSource === 'space') {
        console.log('[STAGE 2: KEYUP_SPACE_RELEASE] Space released -> Stopping dictation and processing');
        stopDictation();
      }
    }
  });

  try {
    uIOhook.start();
    console.log('[STAGE 1: HOOK_OK] Native global keyboard hook active (Space hold-to-talk, F8 & Esc cancel enabled).');
  } catch (err) {
    console.warn('[STAGE 1: HOOK_FAIL] Could not start uIOhook native hook:', err.message);
  }
}

/**
 * Send recorded audio buffer to Mumble AI backend /api/dictate
 */
async function processAudio(audioBuffer) {
  try {
    // If user cancelled, drop audio immediately
    if (isCancelled) {
      console.log('[Dictation] Discarding audio payload because recording was cancelled.');
      isCancelled = false;
      return;
    }

    const elapsedRecMs = recordingStartTime ? (Date.now() - recordingStartTime) : 0;
    const uint8 = new Uint8Array(audioBuffer);
    const first4Hex = Buffer.from(uint8.subarray(0, 4)).toString('hex');
    const first16Hex = Buffer.from(uint8.subarray(0, 16)).toString('hex');
    const sha256 = crypto.createHash('sha256').update(uint8).digest('hex');
    const mimeType = 'audio/webm';
    const filename = 'dictation.webm';
    console.log(`[STAGE 2: MAIN_BUFFER] size=${uint8.length}, mime=${mimeType}, filename=${filename}, first16=${first16Hex}, sha256=${sha256}`);

    // PRE-STT DURATION/AUDIO GUARD:
    // If audio recording was under 500ms or payload is smaller than minimal audio container header (~1000 bytes)
    if (elapsedRecMs > 0 && elapsedRecMs < 500) {
      console.log(`[Dictation] Pre-STT guard: Recording duration too short (${elapsedRecMs}ms < 500ms). Skipping STT.`);
      setHUDState('error', { message: 'Recording too short (< 0.5s)' });
      return;
    }
    if (uint8.length < 1000) {
      console.log(`[Dictation] Pre-STT guard: Audio payload too small (${uint8.length} bytes < 1000B). Skipping STT.`);
      setHUDState('error', { message: 'No speech detected' });
      return;
    }

    setHUDState('processing', { message: 'Transcribing & Enhancing...' });

    const resolution = currentEffectiveResolution || resolveEffectiveMode(selectedMode, lastAppContext);
    const finalMode = resolution.finalMode || 'casual';
    const modeSource = resolution.source || 'fallback';

    const blob = new Blob([uint8], { type: 'audio/webm' });
    const formData = new globalThis.FormData();
    formData.append('audio', blob, 'dictation.webm');
    formData.append('tone', finalMode);
    formData.append('mode', finalMode);
    formData.append('toneSource', modeSource);
    formData.append('appName', lastAppContext.appName || lastAppContext.name || activeTargetApp);
    formData.append('processName', lastAppContext.appName || lastAppContext.name || activeTargetApp);
    formData.append('bundleId', lastAppContext.bundleId || '');
    formData.append('windowTitle', lastAppContext.windowTitle || '');
    formData.append('application', JSON.stringify(lastAppContext));

    const apiUrl = `${serverBaseUrl}/api/dictate`;
    console.log(`[Dictation] Uploading ${uint8.length} bytes (${elapsedRecMs}ms) to ${apiUrl} for app: ${lastAppContext.name || activeTargetApp}...`);

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: desktopAuthManager.getAuthHeaders(),
        body: formData
      });
    } catch (fetchErr) {
      if (serverManager && (fetchErr?.cause?.code === 'ECONNREFUSED' || fetchErr?.message?.includes('fetch failed'))) {
        console.warn('[Dictation] Server connection refused. Attempting to ensure server is running...');
        serverBaseUrl = await serverManager.ensureRunning();
        const retryUrl = `${serverBaseUrl}/api/dictate`;
        console.log(`[Dictation] Retrying upload to ${retryUrl}...`);
        response = await fetch(retryUrl, {
          method: 'POST',
          headers: desktopAuthManager.getAuthHeaders(),
          body: formData
        });
      } else {
        throw fetchErr;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Dictation] Server error (${response.status}):`, errorText);
      setHUDState('error', { message: `Server error: ${response.status}` });
      return;
    }

    const result = await response.json();
    console.log('[Dictation] Server response:', result);

    // Guard: Return gracefully with nothing detected / recording too short
    if (result.empty || result.isTooShort) {
      console.log(`[Dictation] Server reported empty/short audio: ${result.message}`);
      setHUDState('error', { message: result.message || 'No speech detected' });
      return;
    }

    if (!result.success) {
      const errorMsg = result.error || 'Transcription failed';
      setHUDState('error', { message: errorMsg });
      return;
    }

    const finalOutput = result.processedText || result.text || result.finalText || result.rawTranscript || '';

    if (!finalOutput || finalOutput.trim().length === 0) {
      setHUDState('error', { message: result.message || 'No speech detected' });
      return;
    }

    console.log(`[STAGE 10: TEXT_INSERTION_START] Inserting text: "${finalOutput}"`);

    // Insert text directly at cursor in active app!
    const insertResult = await insertTextAtCursor(finalOutput);

    if (insertResult.success) {
      console.log('[STAGE 10: TEXT_INSERTION_SUCCESS] Text successfully dispatched via keystroke.');
      setHUDState('success', { message: 'Inserted at cursor!' });
    } else {
      console.error('[STAGE 10: TEXT_INSERTION_FAIL] Insertion failed:', insertResult.error);
      setHUDState('error', { message: insertResult.error || 'Failed to insert' });
    }
  } catch (err) {
    console.error('[STAGE 8: PROCESS_AUDIO_ERROR]', err);
    setHUDState('error', { message: err.message || 'Server connection error' });
  }
}

// App Lifecycle
app.whenReady().then(async () => {
  // Start or connect to Mumble AI Server
  serverManager = new ServerManager(3050);
  serverBaseUrl = await serverManager.ensureRunning();

  // Create Overlay HUD Window
  createOverlayWindow();

  // Verify macOS permissions
  await verifyPermissions();

  // Register Primary Hotkey (F8)
  registerGlobalHotkey(currentHotkey);

  // Initialize Global Native Input Hooks (Hold Space & Esc Cancel)
  initGlobalInputHooks();

  // Setup System Tray
  trayManager = new TrayManager({
    hotkey: currentHotkey,
    serverUrl: serverBaseUrl,
    currentMode: selectedMode,
    onSelectMode: (mode) => {
      selectedMode = mode;
      console.log(`[Desktop] Active mode changed to: ${mode}`);
    },
    onToggleDictation: toggleDictation,
    onOpenSettings: () => {
      // Open settings in browser
      import('electron').then(({ shell }) => shell.openExternal(`${serverBaseUrl}`));
    }
  });
  trayManager.create();

  // IPC Handlers
  ipcMain.on('stop-recording', () => {
    console.log('[IPC: stop-recording] received from renderer');
    if (isRecording) stopDictation();
  });

  ipcMain.on('cancel-recording', () => {
    console.log('[IPC: cancel-recording] received from renderer');
    cancelDictation();
  });

  ipcMain.on('audio-final', async (_event, audioData) => {
    console.log(`[STAGE 7: IPC_AUDIO_FINAL] Received audio-final from renderer (payload length: ${audioData ? audioData.length : 0})`);
    if (isCancelled) {
      console.log('[STAGE 7: DISCARD_CANCELLED] Discarding audio because session was cancelled.');
      isCancelled = false;
      return;
    }
    await processAudio(audioData);
  });

  // Auth IPC Handlers
  ipcMain.handle('auth:get-token', () => desktopAuthManager.getToken());
  ipcMain.handle('auth:set-token', (_event, token, user) => desktopAuthManager.setToken(token, user));
  ipcMain.handle('auth:clear-token', () => desktopAuthManager.clearToken());
});

app.on('will-quit', () => {
  try {
    uIOhook.stop();
  } catch (e) {}
  globalShortcut.unregisterAll();
  if (serverManager) serverManager.stop();
  if (trayManager) trayManager.destroy();
});

app.on('window-all-closed', (e) => {
  // Do not quit when overlay window closes (menu-bar / hotkey daemon app)
  e.preventDefault();
});
