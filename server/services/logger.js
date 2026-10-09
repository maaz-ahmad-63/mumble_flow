import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, 'app.log');

/**
 * Mask sensitive tokens/keys in log strings
 */
function sanitize(msg) {
  if (typeof msg !== 'string') return msg;
  return msg
    .replace(/(gsk_[a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]+/g, '$1***')
    .replace(/(AIza[a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]+/g, '$1***');
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function writeToFile(level, formattedMsg) {
  try {
    const line = `[${timestamp()}] [${level.toUpperCase()}] ${sanitize(formattedMsg)}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    // Ignore write failure to avoid crashing app
  }
}

export const logger = {
  info(msg, ...args) {
    const text = [msg, ...args].join(' ');
    console.log(`\x1b[36mℹ\x1b[0m [${timestamp()}] ${sanitize(text)}`);
    writeToFile('INFO', text);
  },

  success(msg, ...args) {
    const text = [msg, ...args].join(' ');
    console.log(`\x1b[32m✓\x1b[0m [${timestamp()}] \x1b[32m${sanitize(text)}\x1b[0m`);
    writeToFile('SUCCESS', text);
  },

  warn(msg, ...args) {
    const text = [msg, ...args].join(' ');
    console.warn(`\x1b[33m⚠\x1b[0m [${timestamp()}] \x1b[33m${sanitize(text)}\x1b[0m`);
    writeToFile('WARN', text);
  },

  error(msg, ...args) {
    const text = [msg, ...args].join(' ');
    console.error(`\x1b[31m✖\x1b[0m [${timestamp()}] \x1b[31m${sanitize(text)}\x1b[0m`);
    writeToFile('ERROR', text);
  },

  debug(msg, ...args) {
    if (process.env.DEBUG) {
      const text = [msg, ...args].join(' ');
      console.log(`[DEBUG] [${timestamp()}] ${sanitize(text)}`);
      writeToFile('DEBUG', text);
    }
  },

  api(method, endpoint, statusCode, durationMs, details = '') {
    const color = statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    const text = `${method} ${endpoint} ${statusCode} (${durationMs}ms) ${details}`.trim();
    console.log(`${color}●\x1b[0m [${timestamp()}] ${sanitize(text)}`);
    writeToFile('API', text);
  }
};
