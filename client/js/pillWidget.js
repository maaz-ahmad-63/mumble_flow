/**
 * WhisperFlow Floating Pill / Dynamic Island Controller
 */

export class PillWidget {
  constructor({ onRecordStart, onRecordStop, onToneChange, onProviderChange, onHandsFreeToggle }) {
    this.onRecordStart = onRecordStart;
    this.onRecordStop = onRecordStop;
    this.onToneChange = onToneChange;
    this.onProviderChange = onProviderChange;
    this.onHandsFreeToggle = onHandsFreeToggle;

    this.container = document.getElementById('floatingPill');
    this.pill = document.getElementById('flowPill');
    this.micBtn = document.getElementById('pillMicBtn');
    this.statusText = document.getElementById('pillStatusText');
    this.canvas = document.getElementById('pillWaveform');
    this.spinner = document.getElementById('pillSpinner');
    this.toneSelect = document.getElementById('pillToneSelect');
    this.providerSelect = document.getElementById('pillProviderSelect');
    this.handsFreeBtn = document.getElementById('pillHandsFreeBtn');

    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'copied'
    this.isHandsFree = false;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.initEventListeners();
  }

  initEventListeners() {
    // Mic Button Click
    this.micBtn.addEventListener('click', () => {
      if (this.state === 'idle') {
        this.onRecordStart();
      } else if (this.state === 'listening') {
        this.onRecordStop();
      }
    });

    // Tone Select Change
    if (this.toneSelect) {
      this.toneSelect.addEventListener('change', (e) => {
        if (this.onToneChange) this.onToneChange(e.target.value);
      });
    }

    // Provider Select Change
    if (this.providerSelect) {
      this.providerSelect.addEventListener('change', (e) => {
        if (this.onProviderChange) this.onProviderChange(e.target.value);
      });
    }

    // Hands-Free Mode Toggle
    if (this.handsFreeBtn) {
      this.handsFreeBtn.addEventListener('click', () => {
        this.setHandsFree(!this.isHandsFree);
        if (this.onHandsFreeToggle) this.onHandsFreeToggle(this.isHandsFree);
      });
    }
  }

  setHandsFree(enabled) {
    this.isHandsFree = Boolean(enabled);
    if (this.handsFreeBtn) {
      this.handsFreeBtn.classList.toggle('is-active', this.isHandsFree);
      this.handsFreeBtn.setAttribute('aria-pressed', this.isHandsFree ? 'true' : 'false');
    }
    this.updateStatusText();
  }

  setState(state, customMessage) {
    this.state = state;
    this.pill.classList.remove('is-listening', 'is-processing', 'is-copied');

    switch (state) {
      case 'listening':
        this.pill.classList.add('is-listening');
        const sttType = this.providerSelect?.value === 'local-whisper' ? 'Local' : 'Cloud';
        this.statusText.textContent = customMessage || (this.isHandsFree ? `Listening · ${sttType} (Hands-free)` : `Listening · ${sttType}`);
        break;

      case 'processing':
        this.pill.classList.add('is-processing');
        this.statusText.textContent = customMessage || 'Processing';
        break;

      case 'copied':
        this.pill.classList.add('is-copied');
        this.statusText.textContent = 'Copied';
        setTimeout(() => {
          if (this.state === 'copied') {
            this.setState('idle');
          }
        }, 2200);
        break;

      case 'idle':
      default:
        this.updateStatusText();
        this.clearWaveform();
        break;
    }
  }

  updateStatusText() {
    const sttType = this.providerSelect?.value === 'local-whisper' ? 'Local' : 'Cloud';
    if (this.state === 'listening') {
      this.statusText.textContent = this.isHandsFree ? `Listening · ${sttType} (Hands-free)` : `Listening · ${sttType}`;
    } else if (this.state === 'idle') {
      this.statusText.textContent = this.isHandsFree ? `Hands-free on · ${sttType}` : 'Hold Space / F8';
    }
  }

  drawWaveform(frequencyData, volume) {
    if (!this.ctx || this.state !== 'listening') return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    const barCount = 9;
    const barWidth = 2;
    const gap = 4;
    const startX = (width - (barCount * (barWidth + gap) - gap)) / 2;
    const color = getComputedStyle(this.canvas).color || '#f4f1ec';

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(i * (frequencyData.length / barCount));
      const value = frequencyData[dataIndex] || 0;
      const barHeight = Math.max(2, (value / 255) * height);
      const x = startX + i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  clearWaveform() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  getTone() {
    return this.toneSelect ? this.toneSelect.value : 'casual';
  }

  setTone(tone) {
    if (this.toneSelect) {
      this.toneSelect.value = tone;
    }
  }

  getProvider() {
    return this.providerSelect ? this.providerSelect.value : 'groq';
  }

  setProvider(provider) {
    if (this.providerSelect) {
      this.providerSelect.value = provider;
    }
  }
}

