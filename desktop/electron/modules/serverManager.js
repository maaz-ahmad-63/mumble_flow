/**
 * Mumble AI Desktop — Server Manager
 *
 * Ensures the Mumble AI Express backend is running.
 * If already running locally (e.g. on port 3050), connects to it.
 * If not running, spawns the Express server in the background.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

// Safe runtime resolution for Electron APIs (allows running under both Electron & Node test suites)
let electronApp = null;
try {
  const electron = await import('electron');
  electronApp = electron.app || null;
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default production backend URL for packaged macOS and Windows desktop applications.
 */
export const DEFAULT_PRODUCTION_URL = 'https://136-83-131-239.sslip.io';

/**
 * Locate the appropriate Node.js binary.
 * In Electron, process.execPath is the Electron executable.
 * We prioritize system Node (Node 22/24) where features like SQLite and ES modules run natively.
 */
function findNodeBinary() {
  const commonPaths = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
    process.env.NODE_PATH
  ].filter(Boolean);

  for (const candidate of commonPaths) {
    if (fs.existsSync(candidate)) {
      try {
        const ver = execSync(`"${candidate}" -v`, { encoding: 'utf8', timeout: 1000 }).trim();
        console.log(`[ServerManager] Found system Node at ${candidate} (${ver})`);
        return candidate;
      } catch {
        // Continue searching
      }
    }
  }

  try {
    const whichNode = execSync('which node', { encoding: 'utf8', timeout: 1000 }).trim();
    if (whichNode && fs.existsSync(whichNode)) {
      return whichNode;
    }
  } catch {
    // Continue fallback
  }

  // Fallback to electron binary with ELECTRON_RUN_AS_NODE
  return process.execPath;
}

export class ServerManager {
  constructor(port = 3050) {
    this.port = port;
    this.serverProcess = null;

    const envUrl = (process.env.MUMBLE_SERVER_URL || process.env.MUMBLE_BACKEND_URL || '').trim().replace(/\/+$/, '');
    const isExplicitLocal = Boolean(envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')));
    const isPackaged = Boolean(
      (electronApp && electronApp.isPackaged) ||
      (process.resourcesPath && !process.env.ELECTRON_IS_DEV)
    );

    if (envUrl) {
      // 1. Explicit user/dev environment override (allows custom remote or explicit localhost)
      this.baseUrl = envUrl;
      this.isRemote = !isExplicitLocal;
      console.log(`[ServerManager] Using environment configured backend URL: ${this.baseUrl} (isRemote: ${this.isRemote})`);
    } else if (isPackaged) {
      // 2. Packaged production desktop application defaults to production cloud backend
      this.baseUrl = DEFAULT_PRODUCTION_URL;
      this.isRemote = true;
      console.log(`[ServerManager] Packaged desktop app detected. Defaulting to production backend: ${this.baseUrl}`);
    } else {
      // 3. Unpackaged local developer mode without explicit URL
      this.baseUrl = `http://localhost:${port}`;
      this.isRemote = false;
      console.log(`[ServerManager] Development mode detected. Defaulting to local backend: ${this.baseUrl}`);
    }
  }

  /**
   * Derive the WebSocket URL corresponding to the resolved base URL.
   * Automatically translates http:// -> ws:// and https:// -> wss://.
   * @param {string} endpoint WebSocket endpoint path (default: '/ws/dictate')
   * @returns {string} Fully-qualified WebSocket URL
   */
  getWsUrl(endpoint = '/ws/dictate') {
    const cleanBase = this.baseUrl.replace(/\/+$/, '');
    const wsProto = cleanBase.startsWith('https:') ? 'wss:' : 'ws:';
    const host = cleanBase.replace(/^https?:\/\//i, '');
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${wsProto}//${host}${cleanPath}`;
  }

  /**
   * Check if a health check responds on the given URL or port.
   * Supports both http and https deployed backends via fetch, checking /health and /api/health.
   * @param {string|number} target Url or port
   * @returns {Promise<boolean>}
   */
  async checkHealth(target = this.baseUrl) {
    const clean = typeof target === 'number'
      ? `http://localhost:${target}`
      : String(target).replace(/\/+$/, '');

    const candidates = clean.endsWith('/health')
      ? [clean]
      : [`${clean}/health`, `${clean}/api/health`];

    for (const url of candidates) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) return true;
      } catch {
        // Continue to next candidate URL
      }
    }
    return false;
  }

  /**
   * Check candidate ports to see if a Mumble AI server is already active.
   * @returns {Promise<string|null>}
   */
  async findActiveServer() {
    if (this.isRemote) {
      const ok = await this.checkHealth(this.baseUrl);
      return ok ? this.baseUrl : null;
    }

    const candidatePorts = [this.port, this.port + 1, 3050, 3051, 3052];
    const uniquePorts = [...new Set(candidatePorts)];

    for (const port of uniquePorts) {
      if (await this.checkHealth(port)) {
        return `http://localhost:${port}`;
      }
    }
    return null;
  }

  /**
   * Start the server if not already active.
   * @returns {Promise<string>} Base URL of the running server
   */
  async ensureRunning() {
    if (this.isRemote) {
      console.log(`[ServerManager] Connecting to remote backend at ${this.baseUrl}...`);
      const isHealthy = await this.checkHealth(this.baseUrl);
      if (isHealthy) {
        console.log(`[ServerManager] ✓ Remote backend is healthy and reachable at ${this.baseUrl}`);
      } else {
        console.error(`[ServerManager] ❌ Connection failed: Remote backend at ${this.baseUrl} is unreachable or not responding to /health or /api/health.`);
        console.error(`[ServerManager] Please verify your network connection or ensure MUMBLE_SERVER_URL is correct.`);
      }
      return this.baseUrl;
    }

    const activeUrl = await this.findActiveServer();
    if (activeUrl) {
      this.baseUrl = activeUrl;
      console.log(`[ServerManager] Connected to active Mumble AI server at ${this.baseUrl}`);
      return this.baseUrl;
    }

    console.log('[ServerManager] Starting embedded Mumble AI server...');
    const isPackaged = Boolean(process.resourcesPath && !process.env.ELECTRON_IS_DEV && fs.existsSync(path.join(process.resourcesPath, 'server/index.js')));
    const projectRoot = isPackaged ? process.resourcesPath : path.resolve(__dirname, '../../..');
    const serverPath = isPackaged ? path.join(process.resourcesPath, 'server/index.js') : path.resolve(projectRoot, 'server/index.js');
    const nodeBinary = findNodeBinary();

    console.log(`[ServerManager] Launching server using: ${nodeBinary} -> ${serverPath}`);

    const isElectronBinary = nodeBinary === process.execPath;
    const spawnEnv = {
      ...process.env,
      PORT: String(this.port),
      ...(isElectronBinary ? { ELECTRON_RUN_AS_NODE: '1' } : {})
    };

    try {
      this.serverProcess = spawn(nodeBinary, [serverPath], {
        cwd: projectRoot,
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.serverProcess.stdout?.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.log(`[Server] ${text}`);
      });

      this.serverProcess.stderr?.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.error(`[Server ERR] ${text}`);
      });

      this.serverProcess.on('error', (err) => {
        console.error('[ServerManager] Failed to spawn server process:', err);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.log(`[ServerManager] Server process exited (code: ${code}, signal: ${signal})`);
        this.serverProcess = null;
      });
    } catch (err) {
      console.error('[ServerManager] Error initiating server process:', err);
    }

    // Wait for server to become healthy on port or port + 1
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 250));
      const healthyUrl = await this.findActiveServer();
      if (healthyUrl) {
        this.baseUrl = healthyUrl;
        console.log(`[ServerManager] Embedded server is healthy and ready at ${this.baseUrl}`);
        return this.baseUrl;
      }
      attempts++;
    }

    console.error(`[ServerManager] ❌ Local backend on port ${this.port} could not be started or health check timed out.`);
    return this.baseUrl;
  }

  /**
   * Stop the server process if spawned by this manager.
   */
  stop() {
    if (this.serverProcess) {
      console.log('[ServerManager] Stopping embedded server process...');
      try {
        this.serverProcess.kill('SIGTERM');
      } catch (e) {
        // Ignore
      }
      this.serverProcess = null;
    }
  }
}
