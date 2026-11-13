import assert from 'assert';
import { ServerManager, DEFAULT_PRODUCTION_URL } from '../desktop/electron/modules/serverManager.js';
import { WebSocket } from 'ws';

console.log('🧪 Starting Desktop Backend Resolution & Production Connectivity Tests...\n');

// 1. Test ServerManager resolution logic
console.log('1️⃣ Testing ServerManager URL & WebSocket derivation...');

// Case A: Default packaged mode (simulation)
const origEnv = process.env.MUMBLE_SERVER_URL;
const origBackendEnv = process.env.MUMBLE_BACKEND_URL;
delete process.env.MUMBLE_SERVER_URL;
delete process.env.MUMBLE_BACKEND_URL;

// Test unpackaged dev mode
const devMgr = new ServerManager(3050);
console.log(`   Dev Manager resolved: ${devMgr.baseUrl} (isRemote: ${devMgr.isRemote})`);
assert.strictEqual(devMgr.baseUrl, 'http://localhost:3050');
assert.strictEqual(devMgr.isRemote, false);
assert.strictEqual(devMgr.getWsUrl('/ws/dictate'), 'ws://localhost:3050/ws/dictate');
console.log('   ✓ Unpackaged dev mode correctly defaults to http://localhost:3050');

// Test explicit MUMBLE_SERVER_URL override with production URL
process.env.MUMBLE_SERVER_URL = DEFAULT_PRODUCTION_URL;
const prodMgr = new ServerManager(3050);
console.log(`   Prod Manager resolved: ${prodMgr.baseUrl} (isRemote: ${prodMgr.isRemote})`);
assert.strictEqual(prodMgr.baseUrl, 'https://136-83-131-239.sslip.io');
assert.strictEqual(prodMgr.isRemote, true);
assert.strictEqual(prodMgr.getWsUrl('/ws/dictate'), 'wss://136-83-131-239.sslip.io/ws/dictate');
console.log('   ✓ Production URL derivation resolves to wss://136-83-131-239.sslip.io/ws/dictate');

// Test explicit localhost override via MUMBLE_SERVER_URL
process.env.MUMBLE_SERVER_URL = 'http://localhost:3050';
const localOverrideMgr = new ServerManager(3050);
assert.strictEqual(localOverrideMgr.baseUrl, 'http://localhost:3050');
assert.strictEqual(localOverrideMgr.isRemote, false);
assert.strictEqual(localOverrideMgr.getWsUrl('/ws/dictate'), 'ws://localhost:3050/ws/dictate');
console.log('   ✓ Explicit localhost via MUMBLE_SERVER_URL correctly sets isRemote: false');

// Restore env
if (origEnv) process.env.MUMBLE_SERVER_URL = origEnv; else delete process.env.MUMBLE_SERVER_URL;
if (origBackendEnv) process.env.MUMBLE_BACKEND_URL = origBackendEnv; else delete process.env.MUMBLE_BACKEND_URL;

// 2. Test live production backend connectivity
console.log('\n2️⃣ Testing Live Production Backend Health Check...');
const testMgr = new ServerManager(3050);
testMgr.baseUrl = DEFAULT_PRODUCTION_URL;
testMgr.isRemote = true;

const isHealthy = await testMgr.checkHealth();
console.log(`   Health check result for ${DEFAULT_PRODUCTION_URL}: ${isHealthy ? 'HEALTHY (HTTP 200)' : 'UNREACHABLE'}`);
assert.strictEqual(isHealthy, true, 'Production backend should respond with HTTP 200');
console.log('   ✓ Production backend health check passed.');

// 3. Test live production WebSocket endpoint
console.log('\n3️⃣ Testing Live Production WebSocket endpoint (/ws/dictate)...');
const wsUrl = testMgr.getWsUrl('/ws/dictate');
console.log(`   Connecting to WebSocket: ${wsUrl}`);

await new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl);
  const timeout = setTimeout(() => {
    ws.terminate();
    reject(new Error('WebSocket connection timed out after 5s'));
  }, 5000);

  ws.on('open', () => {
    clearTimeout(timeout);
    console.log('   ✓ WebSocket connection established successfully on production backend!');
    ws.close();
    resolve();
  });

  ws.on('error', (err) => {
    clearTimeout(timeout);
    reject(err);
  });
});

// 4. Test live production REST /api/dictate endpoint guard
console.log('\n4️⃣ Testing Live Production REST /api/dictate endpoint...');
const dictateUrl = `${DEFAULT_PRODUCTION_URL}/api/dictate`;
const emptyFormData = new FormData();
const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00])], { type: 'audio/webm' });
emptyFormData.append('audio', blob, 'test.webm');
emptyFormData.append('durationMs', '100');

const dictateRes = await fetch(dictateUrl, {
  method: 'POST',
  body: emptyFormData
});

console.log(`   /api/dictate response status: ${dictateRes.status}`);
assert.strictEqual(dictateRes.ok, true, '/api/dictate should return HTTP 200');
const dictateData = await dictateRes.json();
console.log('   /api/dictate response body:', dictateData);
assert.strictEqual(dictateData.success, true);
console.log('   ✓ Production REST /api/dictate endpoint tested successfully.');

console.log('\n✨ ALL DESKTOP BACKEND RESOLUTION & PRODUCTION CONNECTIVITY TESTS PASSED WITH 100% SUCCESS.\n');

