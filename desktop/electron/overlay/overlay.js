/**
 * Mumble AI Overlay UI & Audio Controller
 */

const stateLabel = document.getElementById('stateLabel');
const targetApp = document.getElementById('targetApp');
const liveTranscript = document.getElementById('liveTranscript');
const hotkeyBadge = document.getElementById('hotkeyBadge');
const waveformBars = document.querySelectorAll('.waveform .bar');

let currentSession = null;
let audioContext = null;
let analyser = null;
let animFrameId = null;

// Listen to State Changes from Main Process
if (window.electronAPI) {
  if (window.electronAPI.onCancelAudio) {
    window.electronAPI.onCancelAudio(() => {
      cancelLocalAudioCapture();
    });
  }

  window.electronAPI.onStateChange(async (stateData) => {
    console.log('[STAGE 4: OVERLAY_STATE_RECEIVED]', stateData);
    const { state, target, hotkey, message, interim } = stateData;

    document.body.className = `state-${state}`;

    if (hotkey) hotkeyBadge.textContent = hotkey;
    if (target) targetApp.textContent = target;
    else targetApp.textContent = '';

    if (state === 'idle') {
      stateLabel.textContent = `Ready (Press ${hotkey || 'F8'})`;
      liveTranscript.style.display = 'none';
      cancelLocalAudioCapture();
    } else if (state === 'recording') {
      stateLabel.textContent = 'Listening...';
      liveTranscript.style.display = 'none';
      liveTranscript.textContent = '';
      startLocalAudioCapture();
    } else if (state === 'processing') {
      stateLabel.textContent = 'Transcribing & Formatting...';
      stopLocalAudioCapture();
    } else if (state === 'success') {
      stateLabel.textContent = message || 'Inserted at cursor!';
      stopLocalAudioCapture();
    } else if (state === 'error') {
      stateLabel.textContent = message || 'Dictation error';
      stopLocalAudioCapture();
    }

    if (interim) {
      liveTranscript.style.display = 'block';
      liveTranscript.textContent = `"${interim}"`;
    }
  });

  window.electronAPI.onInterimTranscript((text) => {
    if (text) {
      liveTranscript.style.display = 'block';
      liveTranscript.textContent = `"${text}"`;
    }
  });
}

// Click the floating pill widget to toggle/stop recording
const hudElement = document.getElementById('hud');
if (hudElement) {
  hudElement.addEventListener('click', () => {
    if (document.body.classList.contains('state-recording') && window.electronAPI) {
      window.electronAPI.stopRecording();
    }
  });
}

// Press Escape inside overlay to cancel
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && window.electronAPI) {
    cancelLocalAudioCapture();
    window.electronAPI.cancelRecording();
  }
});

/**
 * Cancel local audio capture immediately, discarding buffer
 */
function cancelLocalAudioCapture() {
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
        currentSession.stream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      currentSession.stream = null;
    }
  }
  stopLocalAudioCapture();
}

/**
 * Start native microphone capture inside overlay renderer with isolated session
 */
async function startLocalAudioCapture() {
  // 1. Forcefully clean up any stale or previous session
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
        currentSession.stream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
    }
  }

  // 2. Instantiate new isolated session context
  const session = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    chunks: [],
    recorder: null,
    stream: null,
    isCancelled: false,
    startTime: 0
  };
  currentSession = session;

  console.log(`[STAGE 5: OVERLAY_MIC_REQUESTING] Starting session ${session.id}...`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Check if session was cancelled during getUserMedia await
    if (session.isCancelled || currentSession !== session) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    session.stream = stream;

    // Setup Audio Analyzer for Live Waveform
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    visualizeAudio();

    // Setup MediaRecorder
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    session.recorder = recorder;

    // SYNCHRONOUS chunk collection isolated strictly to this session
    recorder.ondataavailable = (e) => {
      if (session.isCancelled || currentSession !== session) return;
      if (e.data && e.data.size > 0) {
        session.chunks.push(e.data);
        console.log(`[STAGE 5: OVERLAY_AUDIO_CHUNK] session=${session.id}, chunk=${e.data.size} bytes, totalChunks=${session.chunks.length}`);
      }
    };

    recorder.onstop = async () => {
      console.log(`[STAGE 6: OVERLAY_MEDIARECORDER_STOPPED] session=${session.id}, totalChunks=${session.chunks.length}, isCancelled=${session.isCancelled}`);
      recorder.ondataavailable = null;
      recorder.onstop = null;

      // Stop tracks strictly inside onstop after MediaRecorder has completely finalized
      if (session.stream) {
        session.stream.getTracks().forEach((track) => track.stop());
        session.stream = null;
      }

      if (session.isCancelled || currentSession !== session) {
        session.chunks = [];
        return;
      }

      const rawChunks = [...session.chunks];
      session.chunks = []; // Clear immediately to ensure chunks cannot mix into any other recording

      if (rawChunks.length === 0) {
        console.warn(`[Overlay] session=${session.id}: No audio chunks recorded.`);
        return;
      }

      const blob = new Blob(rawChunks, { type: recorder.mimeType || 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      let uint8 = new Uint8Array(arrayBuffer);

      // WebM Header Verification: Verify Chunk 0 contains WebM initialization header (1a 45 df a3)
      const first4Hex = Array.from(uint8.subarray(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (first4Hex !== '1a45dfa3') {
        console.warn(`[STAGE 1: HEADER_MISMATCH] First 4 bytes are "${first4Hex}", not "1a45dfa3". Searching for EBML header...`);
        let headerOffset = -1;
        for (let i = 0; i <= uint8.length - 4; i++) {
          if (uint8[i] === 0x1a && uint8[i+1] === 0x45 && uint8[i+2] === 0xdf && uint8[i+3] === 0xa3) {
            headerOffset = i;
            break;
          }
        }
        if (headerOffset > 0) {
          console.warn(`[STAGE 1: HEADER_RECOVERED] Found EBML header at offset ${headerOffset}. Slicing off orphaned prefix.`);
          uint8 = uint8.subarray(headerOffset);
        } else {
          console.error('[STAGE 1: HEADER_NOT_FOUND] Could not locate 1a45dfa3 in payload.');
        }
      }

      const first16Hex = Array.from(uint8.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
      let sha256 = '';
      try {
        if (window.crypto && window.crypto.subtle) {
          const hashBuf = await window.crypto.subtle.digest('SHA-256', uint8);
          sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
      } catch (e) {}
      const durationMs = session.startTime ? Date.now() - session.startTime : 0;

      console.log(`[STAGE 1: RENDERER_BLOB] size=${uint8.length}, mime=${recorder.mimeType || 'audio/webm'}, duration=${durationMs}ms, first16=${first16Hex}, sha256=${sha256}`);
      console.log(`[STAGE 7: OVERLAY_SEND_FINAL_AUDIO] emitting audio-final to main process (${uint8.length} bytes)`);

      if (window.electronAPI) {
        window.electronAPI.sendFinalAudio(Array.from(uint8));
      }
    };

    session.startTime = Date.now();
    recorder.start(250); // Emit chunks every 250ms
    console.log(`[STAGE 5: OVERLAY_RECORDER_STARTED] session=${session.id} active.`);
  } catch (err) {
    console.error('[STAGE 5: OVERLAY_MIC_ERROR] Failed to capture microphone:', err);
    if (window.electronAPI) {
      window.electronAPI.cancelRecording();
    }
  }
}

/**
 * Stop local audio capture and send audio to main process
 */
function stopLocalAudioCapture() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (currentSession && currentSession.recorder && currentSession.recorder.state !== 'inactive') {
    try {
      currentSession.recorder.stop();
    } catch (e) {}
  }
}

/**
 * Animate waveform bars based on audio frequency data
 */
function visualizeAudio() {
  if (!analyser) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    analyser.getByteFrequencyData(dataArray);

    waveformBars.forEach((bar, index) => {
      const val = dataArray[index * 3] || 0;
      const height = Math.max(4, Math.min(18, (val / 255) * 18));
      bar.style.height = `${height}px`;
    });

    animFrameId = requestAnimationFrame(draw);
  }

  draw();
}
