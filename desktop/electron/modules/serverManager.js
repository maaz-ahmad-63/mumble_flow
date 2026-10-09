/**
 * Murmur Flow Desktop — Server Manager
 *
 * Ensures the Murmur Flow Express backend is running.
 * If already running locally (e.g. on port 3050), connects to it.
 * If not running, spawns the Express server in the background.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const remote = (process.env.MUMBLE_SERVER_URL || process.env.MUMBLE_BACKEND_URL || '').trim().replace(/\/+$/, '');
    this.isRemote = Boolean(remote && !remote.includes('localhost') && !remote.includes('127.0.0.1'));
    this.baseUrl = remote || `http://localhost:${port}`;
  }

  /**
   * Check if a health check responds on the given URL or port.
   * Supports both http and https deployed backends via fetch.
   * @param {string|number} target Url or port
   * @returns {Promise<boolean>}
   */
  async checkHealth(target = this.baseUrl) {
    const url = typeof target === 'number' ? `http://localhost:${target}/health` : target.endsWith('/health') ? target : `${target}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check candidate ports to see if a Murmur Flow server is already active.
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
      console.log(`[ServerManager] Connecting to remote deployed backend at ${this.baseUrl}...`);
      const isHealthy = await this.checkHealth(this.baseUrl);
      if (isHealthy) {
        console.log(`[ServerManager] Remote Mumble backend is healthy and ready at ${this.baseUrl}`);
      } else {
        console.warn(`[ServerManager] Remote Mumble backend at ${this.baseUrl} did not respond to /health. Proceeding with configured URL.`);
      }
      return this.baseUrl;
    }

    const activeUrl = await this.findActiveServer();
    if (activeUrl) {
      this.baseUrl = activeUrl;
      console.log(`[ServerManager] Connected to active Murmur Flow server at ${this.baseUrl}`);
      return this.baseUrl;
    }

    console.log('[ServerManager] Starting embedded Murmur Flow server...');
    const projectRoot = path.resolve(__dirname, '../../..');
    const serverPath = path.resolve(projectRoot, 'server/index.js');
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

    console.warn(`[ServerManager] Server started but health check timed out. Defaulting to ${this.baseUrl}`);
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
