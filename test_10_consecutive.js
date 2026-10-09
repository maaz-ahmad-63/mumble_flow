import * as electronModule from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const SERVER_URL = 'http://localhost:3050';

if (!process.versions.electron) {
  const electronBin = typeof electronModule.default === 'string'
    ? electronModule.default
    : path.join(__dirname, 'desktop/electron/node_modules/.bin/electron');
  console.log('[Runner] Starting 10 Consecutive Recordings Suite via Electron...');
  const child = spawn(electronBin, [__filename], { stdio: 'inherit' });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  const electron = electronModule.default || electronModule;
  const { app, BrowserWindow, ipcMain } = electron;

  app.whenReady().then(async () => {
    console.log('[Main] Electron initialized. Launching test window...');
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    win.webContents.on('console-message', (e, level, msg) => console.log('[Renderer]', msg));
    win.webContents.on('render-process-gone', (e, details) => console.error('[Renderer Gone]', details));

    const results = [];

    ipcMain.handle('upload-audio', async (event, { index, mode, appName, audioArray, rendererSha256, rendererFirst16 }) => {
      const uint8 = new Uint8Array(audioArray);
      const mainFirst16 = Buffer.from(uint8.subarray(0, 16)).toString('hex');
      const mainSha256 = crypto.createHash('sha256').update(uint8).digest('hex');

      console.log(`\n======================================================`);
      console.log(`[TEST RUN ${index}/10] Mode: ${mode} | App: ${appName}`);
      console.log(`[STAGE 2: MAIN_BUFFER] size=${uint8.length}, mime=audio/webm, filename=dictation.webm, first16=${mainFirst16}, sha256=${mainSha256}`);

      if (rendererSha256 !== mainSha256) {
        throw new Error(`Renderer SHA-256 (${rendererSha256}) != Main SHA-256 (${mainSha256})`);
      }
      if (rendererFirst16 !== mainFirst16) {
        throw new Error(`Renderer first16 (${rendererFirst16}) != Main first16 (${mainFirst16})`);
      }

      const blob = new Blob([uint8], { type: 'audio/webm' });
      const formData = new globalThis.FormData();
      formData.append('audio', blob, 'dictation.webm');
      formData.append('tone', mode);
      formData.append('mode', mode);
      formData.append('appName', appName);
      formData.append('processName', appName);

      const resp = await fetch(`${SERVER_URL}/api/dictate`, {
        method: 'POST',
        body: formData
      });

      const json = await resp.json();
      console.log(`[TEST RUN ${index}/10 RESULT] HTTP ${resp.status} - success: ${json.success}, transcript: "${json.rawTranscript || json.text || ''}"`);

      return {
        status: resp.status,
        success: json.success,
        transcript: json.rawTranscript || json.text || '',
        mainSha256,
        mainFirst16,
        size: uint8.length
      };
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <body>
    <script>
      const { ipcRenderer } = require('electron');
      const fs = require('fs');
      const nodeCrypto = require('crypto');

      window.addEventListener('error', (e) => console.error('[Renderer Error]', e.message, e.filename, e.lineno));
      window.addEventListener('unhandledrejection', (e) => console.error('[Renderer Rejection]', e.reason));

      let currentSession = null;

      function createIsolatedSession(id) {
        if (currentSession) {
          currentSession.isCancelled = true;
          currentSession.chunks = [];
          if (currentSession.recorder) {
            currentSession.recorder.ondataavailable = null;
            currentSession.recorder.onstop = null;
            try {
              if (currentSession.recorder.state !== 'inactive') currentSession.recorder.stop();
            } catch (e) {}
          }
          if (currentSession.stream) {
            try {
              currentSession.stream.getTracks().forEach(t => t.stop());
            } catch (e) {}
          }
        }

        const session = {
          id,
          chunks: [],
          recorder: null,
          stream: null,
          isCancelled: false,
          startTime: 0
        };
        currentSession = session;
        return session;
      }

      async function recordAudioSession(index, mode, appName, durationMs) {
        console.log('[Renderer] Starting recording session #' + index + ' (' + mode + ', ' + appName + ')...');
        const session = createIsolatedSession(\`session_\${index}_\${Date.now()}\`);

        const audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        let audioBuffer;
        try {
          const wavBuf = fs.readFileSync('/tmp/speech.wav');
          const ab = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
          audioBuffer = await audioCtx.decodeAudioData(ab);
        } catch (e) {
          console.error('[Audio Decode Error]', e);
          audioBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
        }

        const dest = audioCtx.createMediaStreamDestination();
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.loop = true;
        src.connect(dest);
        src.start();

        session.stream = dest.stream;
        const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
        session.recorder = recorder;

        let firstChunkHeader = null;

        recorder.ondataavailable = (e) => {
          if (session.isCancelled || currentSession !== session) return;
          if (e.data && e.data.size > 0) {
            if (session.chunks.length === 0) {
              // Capture first chunk header
              e.data.arrayBuffer().then(buf => {
                const u = new Uint8Array(buf);
                firstChunkHeader = Array.from(u.subarray(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
              });
            }
            session.chunks.push(e.data);
          }
        };

        const stoppedPromise = new Promise((resolve) => {
          recorder.onstop = async () => {
            recorder.ondataavailable = null;
            recorder.onstop = null;

            if (session.stream) {
              session.stream.getTracks().forEach(t => t.stop());
              session.stream = null;
            }

            const rawChunks = [...session.chunks];
            session.chunks = [];

            const blob = new Blob(rawChunks, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            let uint8 = new Uint8Array(arrayBuffer);

            const first16Hex = Array.from(uint8.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
            const sha256 = nodeCrypto.createHash('sha256').update(uint8).digest('hex');
            const duration = Date.now() - session.startTime;

            console.log(\`[STAGE 1: RENDERER_BLOB] size=\${uint8.length}, mime=audio/webm, duration=\${duration}ms, first16=\${first16Hex}, sha256=\${sha256}\`);

            src.stop();
            audioCtx.close();

            resolve({
              audioArray: Array.from(uint8),
              rendererSha256: sha256,
              rendererFirst16: first16Hex,
              size: uint8.length
            });
          };
        });

        session.startTime = Date.now();
        recorder.start(250);

        await new Promise(r => setTimeout(r, durationMs));

        recorder.stop();
        const recorded = await stoppedPromise;

        const result = await ipcRenderer.invoke('upload-audio', {
          index,
          mode,
          appName,
          audioArray: recorded.audioArray,
          rendererSha256: recorded.rendererSha256,
          rendererFirst16: recorded.rendererFirst16
        });

        return result;
      }

      async function runAll10() {
        const testPlans = [
          { mode: 'auto', appName: 'Google Chrome', duration: 1500 },
          { mode: 'auto', appName: 'Visual Studio Code', duration: 1200 },
          { mode: 'developer', appName: 'Cursor', duration: 1800 },
          { mode: 'developer', appName: 'Terminal', duration: 1000 },
          { mode: 'auto', appName: 'Slack', duration: 1400 },
          { mode: 'developer', appName: 'Xcode', duration: 1600 },
          { mode: 'auto', appName: 'Safari', duration: 1100 },
          { mode: 'developer', appName: 'iTerm2', duration: 1300 },
          { mode: 'auto', appName: 'Gmail', duration: 1700 },
          { mode: 'developer', appName: 'Visual Studio Code', duration: 1500 },
        ];

        const summary = [];
        for (let i = 0; i < testPlans.length; i++) {
          const t = testPlans[i];
          const res = await recordAudioSession(i + 1, t.mode, t.appName, t.duration);
          summary.push({ run: i + 1, mode: t.mode, app: t.appName, ...res });
          // Short delay between recordings to simulate natural consecutive usage
          await new Promise(r => setTimeout(r, 400));
        }

        ipcRenderer.send('test-summary', summary);
      }

      runAll10();
    </script>
    </body>
    </html>
    `;

    ipcMain.on('test-summary', (event, summary) => {
      console.log('\n======================================================');
      console.log('🏁 10 CONSECUTIVE RECORDINGS TEST SUMMARY');
      console.log('======================================================');
      let allPassed = true;
      summary.forEach(s => {
        const passed = s.status === 200 && s.success && s.mainFirst16.startsWith('1a45dfa3');
        if (!passed) allPassed = false;
        console.log(`Run #${s.run.toString().padStart(2)}: [${passed ? 'PASS' : 'FAIL'}] Mode=${s.mode.padEnd(9)} App=${s.app.padEnd(18)} Size=${s.size}B First4=${s.mainFirst16.slice(0, 8)} SHA=${s.mainSha256.slice(0, 16)}... Transcript="${s.transcript}"`);
      });
      console.log('======================================================');
      if (allPassed) {
        console.log('✅ ALL 10 CONSECUTIVE RECORDINGS PASSED WITH 100% SUCCESS!');
      } else {
        console.error('❌ SOME RUNS FAILED!');
      }
      console.log('======================================================\n');
      app.quit();
      process.exit(allPassed ? 0 : 1);
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}
