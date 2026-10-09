const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Event listeners for main -> renderer state updates
  onStateChange: (callback) => ipcRenderer.on('state-change', (_event, value) => callback(value)),
  onAudioLevel: (callback) => ipcRenderer.on('audio-level', (_event, value) => callback(value)),
  onInterimTranscript: (callback) => ipcRenderer.on('interim-transcript', (_event, value) => callback(value)),
  onCancelAudio: (callback) => ipcRenderer.on('cancel-audio', (_event) => callback()),
  
  // Renderer -> Main actions
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  cancelRecording: () => ipcRenderer.send('cancel-recording'),
  sendAudioChunk: (buffer) => ipcRenderer.send('audio-chunk', buffer),
  sendFinalAudio: (buffer) => ipcRenderer.send('audio-final', buffer)
});
