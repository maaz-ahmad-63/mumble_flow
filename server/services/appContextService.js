/**
 * Mumble AI — Application Context & Mode Resolution Service (Phase 8)
 *
 * Provides normalized macOS application detection, configurable application profiles,
 * and predictable precedence-based mode resolution.
 *
 * Precedence Order:
 * 1. Explicit user-selected mode (Manual mode ALWAYS wins)
 * 2. Application-specific mode profile (e.g. Cursor -> Developer, Gmail -> Professional)
 * 3. Application category default (e.g. messaging -> Casual, terminal -> Terminal)
 * 4. Global default mode (Settings.defaultTone)
 */

import { storage } from './storageService.js';

export const CATEGORY_DEFAULT_MODES = {
  developer: 'developer',
  terminal: 'terminal',
  messaging: 'casual',
  email: 'professional',
  browser: 'natural',
  notes: 'natural',
  other: 'casual'
};

export const DEFAULT_APP_PROFILES = [
  // Developer IDEs & Editors
  {
    id: 'cursor',
    name: 'Cursor',
    bundleIds: ['com.todesktop.230313mzl4w4u92', 'cursor'],
    processNames: ['cursor'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    bundleIds: ['com.microsoft.VSCode', 'com.microsoft.VSCodeInsiders', 'com.visualstudio.code'],
    processNames: ['code', 'code - insiders', 'visual studio code', 'vscodium'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'jetbrains',
    name: 'JetBrains IDE',
    bundleIds: ['com.jetbrains.intellij', 'com.jetbrains.pycharm', 'com.jetbrains.webstorm', 'com.jetbrains.goland'],
    processNames: ['idea', 'idea64', 'pycharm', 'webstorm', 'goland', 'rider', 'clion', 'phpstorm', 'android studio', 'studio64'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'xcode',
    name: 'Xcode',
    bundleIds: ['com.apple.dt.Xcode'],
    processNames: ['xcode'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    bundleIds: ['com.sublimetext.4', 'com.sublimetext.3'],
    processNames: ['sublime_text', 'sublime text'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'zed',
    name: 'Zed',
    bundleIds: ['dev.zed.Zed'],
    processNames: ['zed'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },

  // Terminal & Shells
  {
    id: 'terminal',
    name: 'Terminal',
    bundleIds: ['com.apple.Terminal'],
    processNames: ['terminal', 'windowsterminal', 'powershell', 'pwsh', 'cmd', 'wt', 'gnome-terminal-server', 'konsole'],
    category: 'terminal',
    defaultMode: 'terminal',
    enabled: true
  },
  {
    id: 'iterm2',
    name: 'iTerm2',
    bundleIds: ['com.googlecode.iterm2'],
    processNames: ['iterm', 'iterm2'],
    category: 'terminal',
    defaultMode: 'terminal',
    enabled: true
  },
  {
    id: 'warp',
    name: 'Warp',
    bundleIds: ['dev.warp.Warp-Stable'],
    processNames: ['warp'],
    category: 'terminal',
    defaultMode: 'terminal',
    enabled: true
  },
  {
    id: 'alacritty',
    name: 'Alacritty',
    bundleIds: ['org.alacritty'],
    processNames: ['alacritty'],
    category: 'terminal',
    defaultMode: 'terminal',
    enabled: true
  },

  // Web Browsers (Default to Natural)
  {
    id: 'chrome',
    name: 'Google Chrome',
    bundleIds: ['com.google.Chrome'],
    processNames: ['google chrome', 'chrome'],
    category: 'browser',
    defaultMode: 'natural',
    enabled: true
  },
  {
    id: 'safari',
    name: 'Safari',
    bundleIds: ['com.apple.Safari'],
    processNames: ['safari'],
    category: 'browser',
    defaultMode: 'natural',
    enabled: true
  },
  {
    id: 'firefox',
    name: 'Firefox',
    bundleIds: ['org.mozilla.firefox'],
    processNames: ['firefox'],
    category: 'browser',
    defaultMode: 'natural',
    enabled: true
  },
  {
    id: 'arc',
    name: 'Arc',
    bundleIds: ['company.thebrowser.Browser'],
    processNames: ['arc'],
    category: 'browser',
    defaultMode: 'natural',
    enabled: true
  },

  // Browser-based Specific Apps (Window Title Match wins over Browser Process)
  {
    id: 'gmail',
    name: 'Gmail',
    titleIncludes: ['gmail', 'google mail'],
    category: 'email',
    defaultMode: 'professional',
    enabled: true
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    bundleIds: ['com.openai.chat'],
    titleIncludes: ['chatgpt', 'openai'],
    category: 'developer',
    defaultMode: 'prompt',
    enabled: true
  },
  {
    id: 'claude',
    name: 'Claude',
    bundleIds: ['com.anthropic.claudefordesktop'],
    titleIncludes: ['claude', 'claude.ai'],
    category: 'developer',
    defaultMode: 'prompt',
    enabled: true
  },
  {
    id: 'github_web',
    name: 'GitHub',
    titleIncludes: ['github.com', 'github'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },
  {
    id: 'browser_ide',
    name: 'Browser IDE',
    titleIncludes: ['stackblitz', 'codesandbox', 'replit', 'gitpod', 'codepen'],
    category: 'developer',
    defaultMode: 'developer',
    enabled: true
  },

  // Messaging & Collaboration
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    bundleIds: ['net.whatsapp.WhatsApp', 'com.whatsapp.desktop'],
    processNames: ['whatsapp'],
    titleIncludes: ['whatsapp'],
    category: 'messaging',
    defaultMode: 'casual',
    enabled: true
  },
  {
    id: 'slack',
    name: 'Slack',
    bundleIds: ['com.tinyspeck.slackmacgap'],
    processNames: ['slack'],
    titleIncludes: ['slack'],
    category: 'messaging',
    defaultMode: 'casual',
    enabled: true
  },
  {
    id: 'discord',
    name: 'Discord',
    bundleIds: ['com.hnc.Discord'],
    processNames: ['discord'],
    titleIncludes: ['discord'],
    category: 'messaging',
    defaultMode: 'casual',
    enabled: true
  },
  {
    id: 'telegram',
    name: 'Telegram',
    bundleIds: ['ru.keepcoder.Telegram'],
    processNames: ['telegram'],
    titleIncludes: ['telegram'],
    category: 'messaging',
    defaultMode: 'casual',
    enabled: true
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    bundleIds: ['com.microsoft.teams', 'com.microsoft.teams2'],
    processNames: ['teams', 'ms-teams', 'microsoft teams'],
    titleIncludes: ['teams'],
    category: 'messaging',
    defaultMode: 'casual',
    enabled: true
  },

  // Email Desktop
  {
    id: 'apple_mail',
    name: 'Mail',
    bundleIds: ['com.apple.mail'],
    processNames: ['mail'],
    category: 'email',
    defaultMode: 'professional',
    enabled: true
  },
  {
    id: 'outlook',
    name: 'Outlook',
    bundleIds: ['com.microsoft.Outlook'],
    processNames: ['outlook', 'microsoft outlook', 'olk'],
    titleIncludes: ['outlook'],
    category: 'email',
    defaultMode: 'professional',
    enabled: true
  },

  // Notes & Documents
  {
    id: 'apple_notes',
    name: 'Notes',
    bundleIds: ['com.apple.Notes'],
    processNames: ['notes'],
    category: 'notes',
    defaultMode: 'natural',
    enabled: true
  },
  {
    id: 'textedit',
    name: 'TextEdit',
    bundleIds: ['com.apple.TextEdit'],
    processNames: ['textedit'],
    category: 'notes',
    defaultMode: 'natural',
    enabled: true
  },
  {
    id: 'notion',
    name: 'Notion',
    bundleIds: ['notion.id'],
    processNames: ['notion'],
    category: 'notes',
    defaultMode: 'natural',
    enabled: true
  }
];

export class AppContextService {
  constructor() {
    this.defaultProfiles = DEFAULT_APP_PROFILES;
  }

  /**
   * Get active application profiles (merged from custom storage settings if available).
   */
  getProfiles() {
    const settings = storage.getSettings();
    if (Array.isArray(settings.appProfiles) && settings.appProfiles.length > 0) {
      return settings.appProfiles;
    }
    return this.defaultProfiles;
  }

  /**
   * Normalize raw application telemetry into a structured ApplicationContext object.
   *
   * @param {object} rawContext { processName, bundleId, windowTitle, appName, name }
   * @returns {object} { appId, appName, bundleId, category, windowTitle }
   */
  normalizeContext(rawContext = {}) {
    if (!rawContext || (typeof rawContext !== 'object' && typeof rawContext !== 'string')) {
      return {
        appId: 'unknown',
        appName: 'Unknown Application',
        bundleId: '',
        category: 'other',
        windowTitle: ''
      };
    }

    if (typeof rawContext === 'string') {
      rawContext = { appName: rawContext, processName: rawContext };
    }

    const processName = String(rawContext.processName || rawContext.name || rawContext.appName || '').trim().toLowerCase().replace(/\.(exe|app)$/, '');
    const bundleId = String(rawContext.bundleId || '').trim().toLowerCase();
    const windowTitle = String(rawContext.windowTitle || '').trim();
    const titleLower = windowTitle.toLowerCase();
    const fallbackName = rawContext.appName || rawContext.name || rawContext.processName || 'Unknown Application';

    const profiles = this.getProfiles();

    // 1. Check title matches first (e.g. Gmail or ChatGPT in Chrome tab)
    if (titleLower) {
      const byTitle = profiles.find(p =>
        p.enabled !== false &&
        Array.isArray(p.titleIncludes) &&
        p.titleIncludes.some(frag => titleLower.includes(String(frag).toLowerCase()))
      );
      if (byTitle) {
        return {
          appId: byTitle.id,
          appName: byTitle.name,
          bundleId: bundleId || (byTitle.bundleIds && byTitle.bundleIds[0]) || '',
          category: byTitle.category || 'other',
          windowTitle
        };
      }
    }

    // 2. Check bundle identifier (exact native macOS match)
    if (bundleId) {
      const byBundle = profiles.find(p =>
        p.enabled !== false &&
        Array.isArray(p.bundleIds) &&
        p.bundleIds.some(b => b.toLowerCase() === bundleId)
      );
      if (byBundle) {
        return {
          appId: byBundle.id,
          appName: byBundle.name,
          bundleId,
          category: byBundle.category || 'other',
          windowTitle
        };
      }
    }

    // 3. Check process name
    if (processName) {
      const byProcess = profiles.find(p =>
        p.enabled !== false &&
        Array.isArray(p.processNames) &&
        p.processNames.some(pr => pr.toLowerCase() === processName)
      );
      if (byProcess) {
        return {
          appId: byProcess.id,
          appName: byProcess.name,
          bundleId: bundleId || (byProcess.bundleIds && byProcess.bundleIds[0]) || '',
          category: byProcess.category || 'other',
          windowTitle
        };
      }
    }

    // 4. Fallback for unmapped or unknown applications
    return {
      appId: processName || 'unknown',
      appName: fallbackName,
      bundleId,
      category: 'other',
      windowTitle
    };
  }

  /**
   * Resolve dictation mode with strict precedence.
   *
   * Precedence:
   * 1. Explicit user mode (if explicitly set and !== 'auto') -> NEVER OVERRIDDEN!
   * 2. Application-specific mode profile (if autoAppMode enabled)
   * 3. Category default mode (if autoAppMode enabled)
   * 4. Global default mode (fallbackTone)
   *
   * @param {object} params
   * @returns {{ mode: string, appLabel: string, source: string, context: object }}
   */
  resolveMode(params = {}) {
    const safeParams = (params && typeof params === 'object') ? params : {};
    const {
      mode,
      tone,
      toneSource,
      application,
      processName,
      bundleId,
      windowTitle,
      appName
    } = safeParams;

    const settings = storage.getSettings();
    const autoAppMode = settings.autoAppMode !== false;
    const fallbackTone = settings.defaultTone || 'casual';

    const requestedMode = tone || mode;
    const isExplicitUserMode = requestedMode && requestedMode !== 'auto' && toneSource !== 'auto';

    // 1. Explicit user-selected mode ALWAYS wins!
    if (isExplicitUserMode) {
      const normalizedContext = this.normalizeContext(application || { processName, bundleId, windowTitle, appName });
      return {
        mode: requestedMode,
        tone: requestedMode,
        appLabel: normalizedContext.appName || 'General',
        source: 'user-explicit',
        context: normalizedContext
      };
    }

    // Normalize application context
    const context = this.normalizeContext(application || { processName, bundleId, windowTitle, appName });

    // If auto application mode is disabled, use global default mode
    if (!autoAppMode) {
      return {
        mode: fallbackTone,
        tone: fallbackTone,
        appLabel: context.appName,
        source: 'global-default',
        context
      };
    }

    // 2. Application profile mode
    const profiles = this.getProfiles();
    const matchedProfile = profiles.find(p => p.id === context.appId && p.enabled !== false);
    if (matchedProfile && matchedProfile.defaultMode) {
      return {
        mode: matchedProfile.defaultMode,
        tone: matchedProfile.defaultMode,
        appLabel: matchedProfile.name,
        source: 'app-profile',
        context
      };
    }

    // 3. Category default mode
    if (context.category && CATEGORY_DEFAULT_MODES[context.category]) {
      return {
        mode: CATEGORY_DEFAULT_MODES[context.category],
        tone: CATEGORY_DEFAULT_MODES[context.category],
        appLabel: context.appName,
        source: 'category-default',
        context
      };
    }

    // 4. Global fallback
    return {
      mode: fallbackTone,
      tone: fallbackTone,
      appLabel: context.appName,
      source: 'global-default',
      context
    };
  }
}

export const appContextService = new AppContextService();
