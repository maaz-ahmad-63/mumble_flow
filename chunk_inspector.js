import * as electronModule from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.versions.electron) {
  const electronBin = typeof electronModule.default === 'string'
    ? electronModule.default
    : path.join(__dirname, 'desktop/electron/node_modules/.bin/electron');
  const child = spawn(electronBin, [__filename], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const electron = electronModule.default || electronModule;
  const { app, BrowserWindow, ipcMain } = electron;

  app.whenReady().then(() => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    ipcMain.on('chunk-log', (event, { index, size, first4, first16 }) => {
      console.log(`[Chunk ${index}] size=${size}, first4=${first4}, first16=${first16}`);
    });

    ipcMain.on('done', () => {
      console.log('Inspection complete.');
      app.quit();
    });

    const html = `
    <!DOCTYPE html><html><body><script>
      const { ipcRenderer } = require('electron');

      async function run() {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const osc = audioCtx.createOscillator();
        osc.connect(dest);
        osc.start();

        const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
        let idx = 0;
        mr.ondataavailable = async (e) => {
          const buf = new Uint8Array(await e.data.arrayBuffer());
          const first4 = Array.from(buf.subarray(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
          const first16 = Array.from(buf.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
          ipcRenderer.send('chunk-log', { index: idx++, size: buf.length, first4, first16 });
        };

        mr.onstop = () => {
          ipcRenderer.send('done');
        };

        mr.start(250);
        await new Promise(r => setTimeout(r, 2000));
        mr.stop();
      }
      run();
    </script></body></html>
    `;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}
