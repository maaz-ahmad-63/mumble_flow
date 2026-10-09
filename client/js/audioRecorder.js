/**
 * WhisperFlow Production Audio Recorder & Live Analyser
 * Robust across macOS Chrome and Safari with:
 * - Formal state machine
 * - Safari MP4 & Chrome WebM dynamic format negotiation
 * - Adaptive Voice Activity Detection (VAD)
 * - Flexible sample-rate acquisition
 * - Immediate clean cancellation
 */

export const RecorderState = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  STOPPING: 'stopping',
  CANCELLED: 'cancelled'
};

export class AudioRecorder {
  constructor(onWaveformUpdate, onSilenceDetected, onAudioChunk) {
    this.onWaveformUpdate = onWaveformUpdate;
    this.onSilenceDetected = onSilenceDetected;
    this.onAudioChunk = onAudioChunk;

    this.state = RecorderState.IDLE;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animFrameId = null;
    this.audioChunks = [];

    this.startTime = 0;
    this.stopPromiseResolve = null;

    // Voice Activity Detection (VAD) Settings
    this.vadEnabled = true;
    this.vadSilenceMs = 1800; // 1.8s of silence after speech to auto-finish
    this.lastSpokenTime = 0;
    this.hasSpoken = false;
    this.consecutiveSpeechFrames = 0;
    this.noiseFloor = 6;
    this.calibrationFrames = 0;
    this.calibrationSum = 0;
  }

  setVadEnabled(enabled, silenceMs = 1800) {
    this.vadEnabled = Boolean(enabled);
    this.vadSilenceMs = Math.max(1000, silenceMs);
  }

  isRecording() {
    return this.state === RecorderState.RECORDING || this.state === RecorderState.STARTING;
  }

  getState() {
    return this.state;
  }

  /**
   * Determine best supported audio container for current browser
   * Chrome/Firefox -> audio/webm;codecs=opus
   * Safari macOS/iOS -> audio/mp4 or audio/aac
   */
  getBestSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    const candidateMimes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];

    for (const mime of candidateMimes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }

    return '';
  }

  /**
   * Request mic stream with graceful fallback constraints
   */
  async acquireUserMedia() {
    // 1. Try modern ideal constraints (avoids hard 16kHz rejection on Safari)
    const primaryConstraints = {
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    try {
      return await navigator.mediaDevices.getUserMedia(primaryConstraints);
    } catch (err) {
      console.warn('Primary audio constraints rejected, trying minimal fallback constraints:', err.name);
      // 2. Fallback to basic audio constraint for strict systems or Safari
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  /**
   * Translate browser DOMExceptions into clear, actionable user messages
   */
  formatMicrophoneError(err) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access was denied. Please allow microphone permissions in your browser URL bar.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone found. Please connect an input device or check System Settings.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Microphone is busy or blocked by another application (e.g. Zoom, FaceTime, or OS Privacy settings).';
      case 'OverconstrainedError':
        return 'Microphone does not support the requested audio settings.';
      case 'AbortError':
        return 'Microphone hardware connection was interrupted.';
      default:
        return `Microphone error: ${err.message || err.name}`;
    }
  }

  async start() {
    if (this.state !== RecorderState.IDLE) {
      return;
    }

    this.state = RecorderState.STARTING;
    this.audioChunks = [];
    this.hasSpoken = false;
    this.consecutiveSpeechFrames = 0;
    this.calibrationFrames = 0;
    this.calibrationSum = 0;
    this.noiseFloor = 6;

    try {
      this.audioStream = await this.acquireUserMedia();

      // If user hit cancel while prompt was open
      if (this.state === RecorderState.CANCELLED) {
        this.cleanup();
        return;
      }

      // Initialize Web Audio API for Live Waveform Analysis & RMS Monitoring
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume().catch(() => {});
        }
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.7;
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
      }

      const mimeType = this.getBestSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;

      this.mediaRecorder = new MediaRecorder(this.audioStream, options);

      this.chunkSequence = 0;
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0 && this.state !== RecorderState.CANCELLED) {
          this.audioChunks.push(event.data);
          if (this.onAudioChunk) {
            this.onAudioChunk(event.data, this.chunkSequence++);
          }
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleRecorderStopped();
      };

      this.mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        this.cleanup();
      };

      // 200ms time slice for real-time streaming chunks
      this.mediaRecorder.start(200);
      this.state = RecorderState.RECORDING;
      this.startTime = Date.now();
      this.lastSpokenTime = Date.now();

      this.startWaveformLoop();
    } catch (err) {
      this.state = RecorderState.IDLE;
      this.cleanup();
      const message = this.formatMicrophoneError(err);
      console.error('[AudioRecorder Error]', err);
      throw new Error(message);
    }
  }

  startWaveformLoop() {
    const loop = () => {
      if (this.state !== RecorderState.RECORDING || !this.analyser) {
        return;
      }

      this.analyser.getByteFrequencyData(this.dataArray);

      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const avg = sum / this.dataArray.length;

      // 1. First 300ms: dynamic noise floor calibration
      if (this.calibrationFrames < 20) {
        this.calibrationFrames++;
        this.calibrationSum += avg;
        this.noiseFloor = Math.max(4, this.calibrationSum / this.calibrationFrames);
      }

      const speechThreshold = Math.max(8, this.noiseFloor + 7);
      const now = Date.now();

      // 2. VAD: detect voice activity vs background hiss
      if (avg > speechThreshold) {
        this.consecutiveSpeechFrames++;
        if (this.consecutiveSpeechFrames >= 3) {
          this.hasSpoken = true;
          this.lastSpokenTime = now;
        }
      } else {
        this.consecutiveSpeechFrames = 0;
      }

      // 3. VAD: Silence auto-stop after speech detected
      if (this.vadEnabled && this.hasSpoken && (now - this.lastSpokenTime > this.vadSilenceMs)) {
        if (this.onSilenceDetected && this.state === RecorderState.RECORDING) {
          this.onSilenceDetected();
          return;
        }
      }

      if (this.onWaveformUpdate) {
        this.onWaveformUpdate(this.dataArray, avg);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    loop();
  }

  /**
   * Gracefully stop recording and resolve with audio blob and exact duration
   */
  stop() {
    return new Promise((resolve) => {
      if (this.state !== RecorderState.RECORDING && this.state !== RecorderState.STARTING) {
        this.cleanup();
        return resolve(null);
      }

      this.state = RecorderState.STOPPING;
      this.stopPromiseResolve = resolve;

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {
          console.warn('Error calling mediaRecorder.stop():', e);
          this.handleRecorderStopped();
        }
      } else {
        this.handleRecorderStopped();
      }
    });
  }

  handleRecorderStopped() {
    if (this.state === RecorderState.CANCELLED) {
      if (this.stopPromiseResolve) {
        this.stopPromiseResolve(null);
        this.stopPromiseResolve = null;
      }
      this.cleanup();
      return;
    }

    const durationMs = Math.max(0, Date.now() - this.startTime);
    const mimeType = (this.mediaRecorder && this.mediaRecorder.mimeType) || this.getBestSupportedMimeType() || 'audio/webm';
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });

    const resolveFn = this.stopPromiseResolve;
    this.stopPromiseResolve = null;
    this.cleanup();

    if (resolveFn) {
      resolveFn({
        blob: audioBlob,
        mimeType,
        durationMs,
        hasSpoken: this.hasSpoken
      });
    }
  }

  /**
   * Cancel recording immediately, discarding all recorded audio
   */
  cancel() {
    this.state = RecorderState.CANCELLED;

    if (this.mediaRecorder) {
      // Detach listeners to prevent resolving stop promise or emitting data
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      if (this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
    }

    if (this.stopPromiseResolve) {
      this.stopPromiseResolve(null);
      this.stopPromiseResolve = null;
    }

    this.cleanup();
  }

  cleanup() {
    this.state = RecorderState.IDLE;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      this.audioStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close().catch(() => {});
      } catch (e) {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.audioChunks = [];
  }
}
