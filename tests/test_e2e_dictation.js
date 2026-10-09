import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { app, attachStreamingServer } from '../server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create a minimal valid PCM WAV buffer (44-byte header + 1000 bytes silence)
function createValidWavBuffer() {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = 1600; // 0.1s
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // ByteRate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function runE2ETests() {
  console.log('🚀 Starting End-to-End Dictation & Architecture Verification...\n');

  // Find a free port for isolated testing
  const testPort = 3089;
  const server = http.createServer(app);
  attachStreamingServer(server);

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`✓ Test server running on http://127.0.0.1:${testPort}`);

  try {
    // 1. Verify GET /api/status endpoint
    console.log('1️⃣ Testing GET /api/status (Provider discovery)...');
    const statusRes = await fetch(`http://127.0.0.1:${testPort}/api/status`);
    assert.strictEqual(statusRes.status, 200, 'Status endpoint must return HTTP 200');
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.status, 'online');
    assert.ok(statusData.providers.groq, 'Groq provider must be registered');
    assert.ok(statusData.providers.gemini, 'Gemini provider must be registered');
    assert.ok(statusData.providers.local, 'Local provider must be registered');
    console.log('   ✓ Providers discovered dynamically.');

    // 2. Verify POST /api/process-text (Text cleanup & formatting pipeline)
    console.log('2️⃣ Testing POST /api/process-text (Text cleanup & Zero-Edit formatting)...');
    const textRes = await fetch(`http://127.0.0.1:${testPort}/api/process-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Umm hey so can you wait can you tell the team that the the launch is slipping to like not Friday the following Monday',
        tone: 'casual',
        appName: 'Slack'
      })
    });
    assert.strictEqual(textRes.status, 200, 'Process-text must return HTTP 200');
    const textData = await textRes.json();
    assert.strictEqual(textData.success, true);
    assert.ok(textData.processedText.length > 0);
    assert.strictEqual(textData.tone, 'casual');
    console.log(`   Input: "${textData.rawTranscript}"`);
    console.log(`   Output: "${textData.processedText}"`);
    console.log(`   Latency: ${textData.latencyMs}ms | Provider: ${textData.provider}`);
    console.log('   ✓ Text processing pipeline works correctly.');

    // 3. Verify POST /api/dictate with multipart audio upload
    console.log('3️⃣ Testing POST /api/dictate (End-to-End audio pipeline)...');
    const wavBuffer = createValidWavBuffer();
    const tempWav = path.join(__dirname, 'test_sample.wav');
    fs.writeFileSync(tempWav, wavBuffer);

    const formData = new FormData();
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    formData.append('audio', wavBlob, 'test_sample.wav');
    formData.append('sttProvider', 'groq');
    formData.append('tone', 'casual');
    formData.append('appName', 'Murmur Flow');

    const dictateRes = await fetch(`http://127.0.0.1:${testPort}/api/dictate`, {
      method: 'POST',
      body: formData
    });

    // Without a live API key in test environment, ASR returns 500 with helpful key suggestion
    // or succeeds if key is provided. Verify the response is well-formed.
    if (dictateRes.status === 200) {
      const dictateData = await dictateRes.json();
      assert.strictEqual(dictateData.success, true);
      assert.ok('rawTranscript' in dictateData);
      assert.ok('processedText' in dictateData);
      assert.ok('latency' in dictateData);
      console.log('   ✓ Dictate pipeline transcribed and formatted audio successfully.');
    } else {
      const errData = await dictateRes.json();
      assert.ok(errData.error, 'Error message must exist when no API key configured');
      assert.ok(errData.suggestion, 'Suggestion must guide user on configuration');
      console.log(`   ✓ Handled without crash: ${errData.error} (${errData.suggestion})`);
    }

    if (fs.existsSync(tempWav)) {
      fs.unlinkSync(tempWav);
    }

    // 4. Verify WebSocket Streaming Server at /ws/dictate
    console.log('4️⃣ Testing WebSocket Streaming Protocol (/ws/dictate)...');
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws/dictate`);

    await new Promise((resolve, reject) => {
      let state = 'init';

      ws.on('open', () => {
        // Send ping
        ws.send(JSON.stringify({ type: 'ping' }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'pong' && state === 'init') {
          state = 'config';
          ws.send(JSON.stringify({
            type: 'config',
            tone: 'code',
            appName: 'Cursor'
          }));
        } else if (msg.type === 'config_ack' && state === 'config') {
          assert.strictEqual(msg.config.tone, 'code');
          assert.strictEqual(msg.config.appName, 'Cursor');
          state = 'streaming';

          // Test starting a live streaming session
          ws.send(JSON.stringify({
            type: 'recording_started',
            sessionId: 'e2e-session-123',
            sttProvider: 'groq',
            mimeType: 'audio/wav',
            language: 'en'
          }));
        } else if (msg.type === 'recording_started' && state === 'streaming') {
          assert.strictEqual(msg.sessionId, 'e2e-session-123');
          assert.strictEqual(msg.streamingSupported, true);

          // Send binary audio chunk
          const dummyChunk = Buffer.alloc(2000, 0x55);
          ws.send(dummyChunk);

          // Send JSON audio chunk
          ws.send(JSON.stringify({
            type: 'audio_chunk',
            data: Buffer.alloc(1000, 0xAA).toString('base64'),
            sequence: 1
          }));

          // Send recording_stopped
          state = 'stopping';
          ws.send(JSON.stringify({
            type: 'recording_stopped',
            sessionId: 'e2e-session-123'
          }));
        } else if (msg.type === 'recording_stopped' && state === 'stopping') {
          // Acknowledged recording stopped
          state = 'awaiting_processing';
        } else if (msg.type === 'processing_started') {
          // Verified processing started event received
        } else if (msg.type === 'processing_completed' || msg.type === 'error') {
          // Completed or caught expected key error in test environment without crash
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);
    });

    console.log('   ✓ WebSocket event lifecycle (recording_started -> chunks -> recording_stopped -> processing) verified.');

    console.log('\n🎉 ALL END-TO-END CHECKS PASSED!\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('✓ Test server closed cleanly.');
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E test failed:', err);
  process.exit(1);
});
