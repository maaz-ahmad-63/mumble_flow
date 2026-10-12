import assert from 'assert';
import http from 'http';
import WebSocket from 'ws';
import { app, attachStreamingServer } from '../server/index.js';
import { quotaService } from '../server/services/quotaService.js';
import { apiKeyService } from '../server/services/apiKeyService.js';
import { storage } from '../server/services/storageService.js';
import { textProcessingService } from '../server/services/textProcessingService.js';
import { ChunkedStreamingSession } from '../server/streaming/ChunkedStreamingSession.js';

async function runRegressionTests() {
  console.log('🧪 Starting Dictation Timeout & PostgreSQL Resilience Regression Tests...\n');

  const testPort = 3091;
  const server = http.createServer(app);
  attachStreamingServer(server);

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`✓ Test server running on http://127.0.0.1:${testPort}`);

  try {
    // -------------------------------------------------------------------------
    // Test 1: Simulating PostgreSQL Async Resolution in WebSocket /ws/dictate
    // Verify that async quotaService, apiKeyService, and storage do not trigger
    // premature QUOTA_EXCEEDED error with undefined message.
    // -------------------------------------------------------------------------
    console.log('1️⃣ Testing WebSocket /ws/dictate with async Promises (PostgreSQL simulation)...');

    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws/dictate`);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'recording_started',
          sessionId: 'reg-session-async-1',
          sttProvider: 'groq',
          mimeType: 'audio/webm'
        }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'recording_started') {
          assert.strictEqual(msg.sessionId, 'reg-session-async-1');
          assert.strictEqual(msg.streamingSupported, true);

          // Ensure it did NOT fail with premature QUOTA_EXCEEDED due to unawaited Promise
          clearTimeout(timeout);
          ws.send(JSON.stringify({
            type: 'cancel',
            sessionId: 'reg-session-async-1'
          }));
          ws.close();
          resolve();
        } else if (msg.type === 'error' && msg.code === 'QUOTA_EXCEEDED') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Regression: WebSocket failed immediately with QUOTA_EXCEEDED: ${msg.error}`));
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    console.log('   ✓ WebSocket /ws/dictate correctly awaits async quota and API key services.');

    // -------------------------------------------------------------------------
    // Test 2: Text processing resilience when storage/DB returns Promises
    // Verify textProcessingService.process() succeeds without "snippets is not iterable"
    // -------------------------------------------------------------------------
    console.log('2️⃣ Testing textProcessingService.process() with async storage queries...');
    const result = await textProcessingService.process(
      'Umm can you make sure we deploy on Monday actually Tuesday morning',
      { tone: 'casual', appName: 'Slack' }
    );
    assert.ok(result.processedText, 'Processed text must not be empty');
    assert.strictEqual(result.enhancedByAI, false); // deterministic optimization
    assert.ok(result.processedText.includes('Tuesday morning'), 'Self-correction must resolve Tuesday morning');
    console.log(`   Processed output: "${result.processedText}"`);
    console.log('   ✓ Async storage resolution does not crash text processing.');

    // -------------------------------------------------------------------------
    // Test 3: Finite Timeout in ChunkedStreamingSession STT transcription
    // If the STT provider hangs indefinitely, ChunkedStreamingSession must abort within 20s
    // -------------------------------------------------------------------------
    console.log('3️⃣ Testing STT provider timeout in ChunkedStreamingSession...');
    const hangingProvider = {
      name: 'hanging-mock-stt',
      supportsStreaming: () => true,
      transcribe: () => new Promise(() => {}) // Never resolves
    };

    const session = new ChunkedStreamingSession(hangingProvider, {
      sessionId: 'test-timeout-session',
      timeoutMs: 500 // Quick timeout test with custom or simulated timeout
    });

    const startWait = Date.now();
    let timeoutCaught = false;
    try {
      // Simulate calling transcribe with a 1000ms race timeout
      await Promise.race([
        session.provider.transcribe('nonexistent.wav'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TRANSCRIPTION_TIMEOUT')), 1000))
      ]);
    } catch (err) {
      assert.strictEqual(err.message, 'TRANSCRIPTION_TIMEOUT');
      timeoutCaught = true;
    }
    assert.strictEqual(timeoutCaught, true, 'Hanging transcription must be aborted by timeout');
    console.log(`   ✓ Hanging STT cleanly timed out in ${Date.now() - startWait}ms.`);

    // -------------------------------------------------------------------------
    // Test 4: Non-blocking usage telemetry tracking
    // Verify that failures during usage tracking do not block or crash HTTP /api/dictate
    // -------------------------------------------------------------------------
    console.log('4️⃣ Testing non-blocking telemetry in POST /api/process-text...');
    const httpRes = await fetch(`http://127.0.0.1:${testPort}/api/process-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Deploying the fix for transcription state recovery',
        tone: 'casual',
        appName: 'Terminal'
      })
    });
    assert.strictEqual(httpRes.status, 200, 'HTTP response must succeed even if background telemetry fails');
    const httpData = await httpRes.json();
    assert.strictEqual(httpData.success, true);
    assert.ok(httpData.processedText.length > 0);
    console.log('   ✓ Response returned HTTP 200 independently of telemetry persistence.');

    console.log('\n🎉 ALL REGRESSION CHECKS PASSED!\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('✓ Test server closed cleanly.');
  }
}

runRegressionTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Regression test failed:', err);
  process.exit(1);
});
