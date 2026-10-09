import { appContextService, DEFAULT_APP_PROFILES } from './appContextService.js';

export const DEFAULT_APP_TONE_RULES = [
  // Web apps inside a browser. Matched on the window title.
  { label: 'Gmail', tone: 'formal', titleIncludes: ['gmail'] },
  { label: 'Outlook', tone: 'formal', titleIncludes: ['outlook'] },
  { label: 'Proton Mail', tone: 'formal', titleIncludes: ['proton mail'] },
  { label: 'Google Docs', tone: 'formal', titleIncludes: ['google docs'] },
  { label: 'Slack', tone: 'casual', titleIncludes: ['slack'] },
  { label: 'Discord', tone: 'casual', titleIncludes: ['discord'] },
  { label: 'WhatsApp', tone: 'casual', titleIncludes: ['whatsapp'] },
  { label: 'Telegram', tone: 'casual', titleIncludes: ['telegram'] },
  { label: 'GitHub', tone: 'code', titleIncludes: ['github'] },
  { label: 'ChatGPT', tone: 'prompt', titleIncludes: ['chatgpt'] },
  { label: 'Claude', tone: 'prompt', titleIncludes: ['claude'] },
  { label: 'Browser IDE', tone: 'code', titleIncludes: ['stackblitz', 'codesandbox', 'replit', 'gitpod'] },

  // Web Browsers
  { label: 'Chrome', tone: 'browser', mode: 'browser', process: ['google chrome', 'chrome'] },
  { label: 'Safari', tone: 'browser', mode: 'browser', process: ['safari'] },
  { label: 'Firefox', tone: 'browser', mode: 'browser', process: ['firefox'] },
  { label: 'Arc', tone: 'browser', mode: 'browser', process: ['arc'] },
  { label: 'Edge', tone: 'browser', mode: 'browser', process: ['edge', 'msedge', 'microsoft edge'] },

  // Desktop apps. Matched on the process or app name.
  { label: 'VS Code', tone: 'code', mode: 'developer', process: ['code', 'code - insiders', 'visual studio code', 'vscodium'] },
  { label: 'Cursor', tone: 'code', mode: 'developer', process: ['cursor'] },
  { label: 'Windsurf', tone: 'code', mode: 'developer', process: ['windsurf'] },
  { label: 'JetBrains IDE', tone: 'code', mode: 'developer', process: ['idea', 'idea64', 'pycharm', 'pycharm64', 'webstorm', 'webstorm64', 'goland', 'goland64', 'rider', 'rider64', 'clion', 'clion64', 'phpstorm', 'phpstorm64', 'android studio', 'studio64'] },
  { label: 'Visual Studio', tone: 'code', mode: 'developer', process: ['devenv'] },
  { label: 'Sublime Text', tone: 'code', mode: 'developer', process: ['sublime_text', 'sublime text'] },
  { label: 'Zed', tone: 'code', mode: 'developer', process: ['zed'] },
  { label: 'Xcode', tone: 'code', mode: 'developer', process: ['xcode'] },
  { label: 'Terminal', tone: 'terminal', mode: 'terminal', process: ['windowsterminal', 'powershell', 'pwsh', 'cmd', 'terminal', 'iterm2', 'iterm', 'warp', 'alacritty', 'wezterm', 'wezterm-gui', 'kitty', 'gnome-terminal-server', 'konsole'] },
  { label: 'Slack', tone: 'casual', mode: 'casual', process: ['slack'] },
  { label: 'Discord', tone: 'casual', mode: 'casual', process: ['discord'] },
  { label: 'WhatsApp', tone: 'casual', mode: 'casual', process: ['whatsapp'] },
  { label: 'Telegram', tone: 'casual', mode: 'casual', process: ['telegram'] },
  { label: 'Signal', tone: 'casual', mode: 'casual', process: ['signal'] },
  { label: 'Microsoft Teams', tone: 'casual', mode: 'casual', process: ['ms-teams', 'teams', 'microsoft teams'] },
  { label: 'Outlook', tone: 'formal', mode: 'email', process: ['outlook', 'olk', 'microsoft outlook'] },
  { label: 'Mail', tone: 'formal', mode: 'email', process: ['mail', 'thunderbird'] },
  { label: 'Word', tone: 'formal', mode: 'formal', process: ['winword', 'microsoft word'] }
];

function normalizeProcess(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\.(exe|app)$/, '');
}

export function matchAppRule({ processName, windowTitle } = {}, rules = DEFAULT_APP_TONE_RULES) {
  const title = String(windowTitle || '').toLowerCase();
  const proc = normalizeProcess(processName);

  if (title) {
    const byTitle = rules.find(rule =>
      Array.isArray(rule.titleIncludes) &&
      rule.titleIncludes.some(fragment => title.includes(String(fragment).toLowerCase()))
    );
    if (byTitle) return byTitle;
  }

  if (proc) {
    const byProcess = rules.find(rule =>
      Array.isArray(rule.process) &&
      rule.process.some(name => normalizeProcess(name) === proc)
    );
    if (byProcess) return byProcess;
  }

  return null;
}

/**
 * Resolves the tone and mode for a request. Only `tone: "auto"` or unset is resolved; any
 * explicit tone the user picked is kept with highest priority (MANUAL MODE > APP AUTO-DETECTION).
 */
export function resolveTone({ tone, mode: requestedMode, processName, windowTitle, appName, bundleId, application } = {}, { rules, fallbackTone = 'casual' } = {}) {
  const mode = requestedMode || tone;
  if (mode && mode !== 'auto') {
    return { tone: mode, mode: mode, appLabel: appName || 'General', source: 'manual' };
  }

  // 1. Structured application context provided by client
  if (application && application.recommendedMode) {
    const isKnown = application.category && application.category !== 'unknown';
    return {
      tone: application.recommendedMode,
      mode: application.recommendedMode,
      appLabel: application.appName || application.name || appName || 'General',
      category: application.category || 'unknown',
      context: application,
      source: isKnown ? 'app-aware' : 'fallback'
    };
  }

  // 2. Rule-based matching against window title / process name
  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_APP_TONE_RULES;
  const rule = matchAppRule({ processName: processName || appName, windowTitle }, activeRules);
  if (rule) {
    const resolvedMode = rule.mode || (rule.tone === 'code' ? 'developer' : (rule.tone === 'formal' ? (rule.label === 'Gmail' ? 'email' : 'professional') : rule.tone));
    return {
      tone: rule.tone,
      mode: resolvedMode,
      appLabel: rule.label,
      source: 'app-rule'
    };
  }

  const fallback = fallbackTone === 'auto' ? 'casual' : fallbackTone;
  return {
    tone: fallback,
    mode: fallback,
    appLabel: appName || 'General',
    source: 'default'
  };
}

