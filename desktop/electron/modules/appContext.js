/**
 * Mumble AI — Application Context & Mode Engine
 *
 * 1. AppContext schema:
 *    {
 *      name: string,
 *      appName: string,
 *      bundleId: string,
 *      windowTitle: string,
 *      category: 'developer/code' | 'email' | 'AI/chat' | 'browser' | 'terminal' | 'communication' | 'documents' | 'unknown',
 *      recommendedMode: 'developer' | 'email' | 'prompt' | 'browser' | 'terminal' | 'casual' | 'formal'
 *    }
 *
 * 2. Precedence:
 *    MANUAL MODE > APP AUTO-DETECTION
 *    - Manual mode works globally across all apps.
 *    - Only Auto mode uses app-aware detection.
 *    - Unknown apps safely fall back to Casual.
 */

export const CATEGORIES = {
  DEVELOPER_CODE: 'developer/code',
  EMAIL: 'email',
  AI_CHAT: 'AI/chat',
  BROWSER: 'browser',
  TERMINAL: 'terminal',
  COMMUNICATION: 'communication',
  DOCUMENTS: 'documents',
  UNKNOWN: 'unknown'
};

/**
 * Check if the application or window belongs to Mumble AI itself
 */
export function isMumbleApp(appInfo) {
  if (!appInfo) return false;
  const name = String(appInfo.appName || appInfo.name || '').toLowerCase();
  const bundle = String(appInfo.bundleId || '').toLowerCase();
  const title = String(appInfo.windowTitle || '').toLowerCase();

  return (
    name === 'electron' ||
    name === 'mumble ai' ||
    name === 'mumble-ai' ||
    name === 'murmur flow' ||
    name === 'whisperflow' ||
    name === 'mumble-ai-desktop' ||
    bundle.includes('mumble-ai') ||
    bundle.includes('murmur-flow') ||
    (bundle.startsWith('com.electron.') && (name === 'electron' || title.includes('mumble'))) ||
    title.includes('mumble ai') ||
    title.includes('whisperflow') ||
    title.includes('murmur flow')
  );
}

/**
 * Normalizes process/app name
 */
function normalizeProcessName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\.(exe|app)$/, '');
}

/**
 * Classifies an application into category and recommended mode
 */
export function classifyAppContext(rawInfo = {}) {
  const appName = String(rawInfo.appName || rawInfo.name || 'Active App').trim();
  const bundleId = String(rawInfo.bundleId || '').trim();
  const windowTitle = String(rawInfo.windowTitle || '').trim();

  const proc = normalizeProcessName(rawInfo.processName || appName);
  const bundle = bundleId.toLowerCase();
  const title = windowTitle.toLowerCase();

  // 1. Web-based specific apps (window title or web domain match inside browsers)
  // Gmail
  if (title.includes('gmail') || title.includes('google mail') || bundle.includes('gmail')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.EMAIL,
      recommendedMode: 'email'
    };
  }

  // ChatGPT
  if (title.includes('chatgpt') || (title.includes('openai') && !title.includes('api')) || bundle.includes('openai.chat') || proc === 'chatgpt') {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.AI_CHAT,
      recommendedMode: 'prompt'
    };
  }

  // Claude
  if (title.includes('claude') || bundle.includes('claudefordesktop') || proc === 'claude') {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.AI_CHAT,
      recommendedMode: 'prompt'
    };
  }

  // Outlook / Proton Mail
  if (title.includes('outlook') || title.includes('proton mail') || ['outlook', 'microsoft outlook', 'olk'].includes(proc) || bundle.includes('microsoft.outlook')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.EMAIL,
      recommendedMode: 'email'
    };
  }

  // 2. Desktop Developer / Code Applications
  // VS Code
  if (['code', 'visual studio code', 'code - insiders', 'vscodium'].includes(proc) || bundle.includes('vscode') || bundle.includes('visualstudio.code')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.DEVELOPER_CODE,
      recommendedMode: 'developer'
    };
  }

  // Cursor
  if (proc === 'cursor' || bundle.includes('cursor')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.DEVELOPER_CODE,
      recommendedMode: 'developer'
    };
  }

  // Xcode
  if (proc === 'xcode' || bundle.includes('dt.xcode')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.DEVELOPER_CODE,
      recommendedMode: 'developer'
    };
  }

  // Other Developer IDEs (JetBrains, Sublime, Zed, Windsurf)
  if (
    ['idea', 'idea64', 'pycharm', 'pycharm64', 'webstorm', 'webstorm64', 'goland', 'goland64', 'rider', 'clion', 'phpstorm', 'android studio', 'studio64', 'zed', 'sublime_text', 'sublime text', 'windsurf'].includes(proc) ||
    bundle.includes('jetbrains') || bundle.includes('sublimetext') || bundle.includes('zed') || title.includes('github.com')
  ) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.DEVELOPER_CODE,
      recommendedMode: 'developer'
    };
  }

  // 3. Terminal & Shells
  if (
    ['terminal', 'windowsterminal', 'powershell', 'pwsh', 'cmd', 'wt', 'gnome-terminal-server', 'konsole'].includes(proc) ||
    bundle === 'com.apple.terminal'
  ) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.TERMINAL,
      recommendedMode: 'terminal'
    };
  }

  if (['iterm', 'iterm2'].includes(proc) || bundle.includes('iterm2')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.TERMINAL,
      recommendedMode: 'terminal'
    };
  }

  if (['warp', 'alacritty', 'wezterm', 'wezterm-gui', 'kitty'].includes(proc) || bundle.includes('warp') || bundle.includes('alacritty')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.TERMINAL,
      recommendedMode: 'terminal'
    };
  }

  // 4. Communication & Messaging
  if (proc === 'slack' || bundle.includes('slack') || title.includes('slack')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.COMMUNICATION,
      recommendedMode: 'casual'
    };
  }

  if (proc === 'discord' || bundle.includes('discord') || title.includes('discord')) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.COMMUNICATION,
      recommendedMode: 'casual'
    };
  }

  if (
    ['whatsapp', 'telegram', 'teams', 'ms-teams', 'microsoft teams', 'signal'].includes(proc) ||
    bundle.includes('whatsapp') || bundle.includes('telegram') || bundle.includes('teams')
  ) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.COMMUNICATION,
      recommendedMode: 'casual'
    };
  }

  // 5. Desktop Mail
  if (['mail', 'thunderbird'].includes(proc) || bundle === 'com.apple.mail') {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.EMAIL,
      recommendedMode: 'email'
    };
  }

  // 6. Documents & Notes
  if (
    ['winword', 'microsoft word', 'pages', 'notion', 'obsidian'].includes(proc) ||
    bundle.includes('microsoft.word') || bundle.includes('notion') || bundle.includes('obsidian') ||
    title.includes('google docs') || title.includes('notion') || title.includes('obsidian')
  ) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.DOCUMENTS,
      recommendedMode: 'formal'
    };
  }

  // 7. Web Browsers (when no specific web app title matched)
  if (
    ['chrome', 'google chrome'].includes(proc) || bundle.includes('google.chrome') ||
    proc === 'safari' || bundle.includes('apple.safari') ||
    proc === 'firefox' || bundle.includes('mozilla.firefox') ||
    ['arc', 'edge', 'msedge', 'microsoft edge', 'brave'].includes(proc) ||
    bundle.includes('thebrowser.browser') || bundle.includes('microsoft.edgemac') || bundle.includes('brave')
  ) {
    return {
      name: appName,
      appName,
      bundleId,
      windowTitle,
      category: CATEGORIES.BROWSER,
      recommendedMode: 'browser'
    };
  }

  // 8. Unknown / Generic Fallback
  return {
    name: appName || 'Active App',
    appName: appName || 'Active App',
    bundleId,
    windowTitle,
    category: CATEGORIES.UNKNOWN,
    recommendedMode: 'casual'
  };
}

/**
 * Normalizes manual mode keyword to standard mode name
 */
export function normalizeManualMode(modeStr) {
  if (!modeStr) return 'casual';
  const norm = String(modeStr).trim().toLowerCase();
  switch (norm) {
    case 'dev':
    case 'developer':
    case 'code':
      return 'developer';
    case 'prompt':
    case 'ai':
      return 'prompt';
    case 'email':
    case 'mail':
      return 'email';
    case 'bullet':
    case 'bullets':
      return 'bullets';
    case 'standup':
      return 'standup';
    case 'formal':
    case 'professional':
      return 'formal';
    case 'casual':
      return 'casual';
    case 'browser':
      return 'browser';
    case 'terminal':
      return 'terminal';
    default:
      return norm;
  }
}

/**
 * Resolve effective mode given selectedMode (global) and detected appContext.
 * Priority: MANUAL MODE > APP AUTO-DETECTION
 * Only Auto mode uses app-aware detection.
 *
 * @returns {{ finalMode: string, source: 'manual' | 'app-aware' | 'fallback', category: string, appName: string, selectedMode: string }}
 */
export function resolveEffectiveMode(selectedMode = 'auto', appContext = {}) {
  const normSelected = String(selectedMode || 'auto').trim().toLowerCase();

  // If manual mode is selected (anything other than 'auto'), manual mode WINS everywhere
  if (normSelected && normSelected !== 'auto') {
    const finalMode = normalizeManualMode(normSelected);
    return {
      finalMode,
      source: 'manual',
      category: appContext.category || CATEGORIES.UNKNOWN,
      appName: appContext.appName || 'Active App',
      selectedMode
    };
  }

  // Auto mode -> use app-aware detection
  const category = appContext.category || CATEGORIES.UNKNOWN;
  if (category !== CATEGORIES.UNKNOWN && appContext.recommendedMode) {
    return {
      finalMode: appContext.recommendedMode,
      source: 'app-aware',
      category,
      appName: appContext.appName || 'Active App',
      selectedMode: 'auto'
    };
  }

  // Unknown app safely falls back to casual
  return {
    finalMode: 'casual',
    source: 'fallback',
    category: CATEGORIES.UNKNOWN,
    appName: appContext.appName || 'Active App',
    selectedMode: 'auto'
  };
}

/**
 * Format and print exact AppContext diagnostic logs as required:
 * [AppContext] app=...
 * [AppContext] category=...
 * [AppContext] selectedMode=...
 * [AppContext] finalMode=...
 * [AppContext] source=manual|app-aware|fallback
 */
export function logAppContextDiagnostic({ app, category, selectedMode, finalMode, source }) {
  console.log(`[AppContext] app=${app}`);
  console.log(`[AppContext] category=${category}`);
  console.log(`[AppContext] selectedMode=${selectedMode}`);
  console.log(`[AppContext] finalMode=${finalMode}`);
  console.log(`[AppContext] source=${source}`);
}
