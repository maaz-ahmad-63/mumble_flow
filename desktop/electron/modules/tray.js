/**
 * Murmur Flow Desktop — System Tray / Menu Bar Module
 */

import { Tray, Menu, nativeImage, shell, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TrayManager {
  constructor(options = {}) {
    this.tray = null;
    this.onToggleDictation = options.onToggleDictation || (() => {});
    this.onOpenSettings = options.onOpenSettings || (() => {});
    this.onOpenWebUI = options.onOpenWebUI || (() => {});
    this.onSelectMode = options.onSelectMode || (() => {});
    this.currentMode = options.currentMode || 'auto';
    this.hotkey = options.hotkey || 'F8';
    this.isRecording = false;
    this.serverUrl = options.serverUrl || 'http://localhost:3050';
  }

  create() {
    // Create simple tray icon or use template image
    const icon = nativeImage.createEmpty();
    // Default 16x16 tray icon representation
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

  setMode(mode) {
    this.currentMode = mode;
    this.updateMenu();
  }

  handleModeChange(mode) {
    this.currentMode = mode;
    this.onSelectMode(mode);
    this.updateMenu();
  }

  updateHotkey(hotkey) {
    this.hotkey = hotkey;
    this.updateMenu();
  }

  updateMenu() {
    if (!this.tray) return;

    const modeLabels = {
      auto: 'Auto (App-Aware)',
      developer: 'Developer / Code',
      prompt: 'Prompt',
      email: 'Email',
      bullet: 'Bullets',
      standup: 'Standup',
      casual: 'Casual',
      formal: 'Formal'
    };

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.isRecording ? 'Stop Dictation' : `Start Dictation (${this.hotkey})`,
        click: () => this.onToggleDictation()
      },
      { type: 'separator' },
      {
        label: `Mode: ${modeLabels[this.currentMode] || this.currentMode}`,
        submenu: [
          { label: 'Auto (App-Aware)', type: 'radio', checked: this.currentMode === 'auto', click: () => this.handleModeChange('auto') },
          { type: 'separator' },
          { label: 'Developer / Code', type: 'radio', checked: this.currentMode === 'developer', click: () => this.handleModeChange('developer') },
          { label: 'Prompt', type: 'radio', checked: this.currentMode === 'prompt', click: () => this.handleModeChange('prompt') },
          { label: 'Email', type: 'radio', checked: this.currentMode === 'email', click: () => this.handleModeChange('email') },
          { label: 'Bullets', type: 'radio', checked: this.currentMode === 'bullet', click: () => this.handleModeChange('bullet') },
          { label: 'Standup', type: 'radio', checked: this.currentMode === 'standup', click: () => this.handleModeChange('standup') },
          { label: 'Casual', type: 'radio', checked: this.currentMode === 'casual', click: () => this.handleModeChange('casual') },
          { label: 'Formal', type: 'radio', checked: this.currentMode === 'formal', click: () => this.handleModeChange('formal') }
        ]
      },
      { type: 'separator' },
      {
        label: 'Open Web Interface',
        click: () => shell.openExternal(this.serverUrl)
      },
      {
        label: 'Settings...',
        click: () => this.onOpenSettings()
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
