import * as electronModule from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.versions.electron) {
  const electronBin = typeof electronModule.default === 'string'
    ? electronModule.default
    : path.join(__dirname, 'desktop/electron/node_modules/.bin/electron');
  console.log('[Runner] Starting Electron test recorder via:', electronBin);
  const child = spawn(electronBin, [__filename], { stdio: 'inherit' });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  const electron = electronModule.default || electronModule;
  const { app, BrowserWindow, ipcMain } = electron;

  app.whenReady().then(async () => {
    console.log('[Main] Electron ready. Creating test window...');
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    ipcMain.on('audio-recorded', async (event, { scenario, buffer, mimeType }) => {
      const uint8 = Buffer.from(buffer);
      const filename = `/tmp/test_scenario_${scenario}.webm`;
      fs.writeFileSync(filename, uint8);
      console.log(`[Scenario ${scenario}] Written ${uint8.length} bytes to ${filename}`);
      console.log(`[Scenario ${scenario}] First 4 bytes (hex):`, uint8.subarray(0, 4).toString('hex'));
      console.log(`[Scenario ${scenario}] Recorded mimeType:`, mimeType);
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <body>
    <script>
      const { ipcRenderer } = require('electron');
      const fs = require('fs');

      async function runScenario(scenario, stopTrackEarly) {
        console.log('[Renderer] Running scenario:', scenario, '(stopTrackEarly: ' + stopTrackEarly + ')');
        const audioCtx = new AudioContext();
        let wavBuf;
        try {
          wavBuf = fs.readFileSync('/tmp/speech.wav');
        } catch (e) {
          // Fallback synthetic buffer if /tmp/speech.wav not present
          const sampleRate = audioCtx.sampleRate;
          const numChannels = 1;
          const frameCount = sampleRate * 2;
          const buffer = audioCtx.createBuffer(numChannels, frameCount, sampleRate);
          const channelData = buffer.getChannelData(0);
          for (let i = 0; i < frameCount; i++) {
            channelData[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
          }
          wavBuf = null;
        }

        let audioBuffer;
        if (wavBuf) {
          audioBuffer = await audioCtx.decodeAudioData(wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength));
        } else {
          audioBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
        }

        const dest = audioCtx.createMediaStreamDestination();
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;
        source.connect(dest);
        source.start();

        const mediaStream = dest.stream;
        const mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        const stoppedPromise = new Promise((resolve) => {
          mediaRecorder.onstop = async () => {
            console.log('[Renderer] onstop fired for scenario:', scenario);
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            if (!stopTrackEarly) {
              mediaStream.getTracks().forEach(t => t.stop());
            }
            resolve({ buffer: Array.from(new Uint8Array(arrayBuffer)), mimeType: mediaRecorder.mimeType });
          };
        });

        mediaRecorder.start(250);

        // Record for 3 seconds per scenario to test cleanly
        await new Promise(r => setTimeout(r, 3000));

        if (stopTrackEarly) {
          mediaRecorder.stop();
          // Stop tracks immediately (triggers potential corruption/truncation)
          mediaStream.getTracks().forEach(t => t.stop());
        } else {
          // Stop recorder cleanly, tracks stopped inside onstop
          mediaRecorder.stop();
        }

        const result = await stoppedPromise;
        source.stop();
        audioCtx.close();
        ipcRenderer.send('audio-recorded', { scenario, ...result });
      }

      async function start() {
        await runScenario('A_early_stop', true);
        await runScenario('B_clean_stop', false);
        ipcRenderer.send('all-done');
      }

      start();
    </script>
    </body>
    </html>
    `;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    ipcMain.on('all-done', () => {
      console.log('[Main] All scenarios complete.');
      app.quit();
    });
  });
}
