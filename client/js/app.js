/**
 * WhisperFlow Main Application Controller
 */

import { AudioRecorder } from './audioRecorder.js';
import { PillWidget } from './pillWidget.js';
import { HotkeyManager } from './hotkeyManager.js';
import { zeroEditClient } from './zeroEditClient.js';
import { streamingClient } from './streamingClient.js';
import { DictionaryManager } from './dictionary.js';
import { SnippetsManager } from './snippets.js';
import { CommandModeManager } from './commandMode.js';
import { NotetakerManager } from './notetaker.js';
import { soundEffects } from './soundEffects.js';

// Global fetch interceptor to attach Authorization Bearer token to all /api/ requests
const _nativeFetch = window.fetch;
window.fetch = async function(resource, init = {}) {
  const token = localStorage.getItem('mumble_auth_token');
  if (token && typeof resource === 'string' && resource.startsWith('/api/')) {
    init = init || {};
    init.headers = init.headers || {};
    if (init.headers instanceof Headers) {
      if (!init.headers.has('Authorization')) {
        init.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(init.headers)) {
      if (!init.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
        init.headers.push(['Authorization', `Bearer ${token}`]);
      }
    } else {
      if (!init.headers['Authorization'] && !init.headers['authorization']) {
        init.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return _nativeFetch.call(this, resource, init);
};

class WhisperFlowApp {
  constructor() {
    this.currentUser = null;
    this.authModal = document.getElementById('authModal');
    this.userBadgeBtn = document.getElementById('userBadge');
    this.audioRecorder = null;
    this.pillWidget = null;
    this.hotkeyManager = null;
    this.dictionaryManager = null;
    this.snippetsManager = null;
    this.commandModeManager = null;
    this.notetakerManager = null;
    this.soundEffects = soundEffects;
    this.webhookUrl = '';

    this.streamingClient = streamingClient;
    this.streamConfirmedSegments = new Map();
    this.streamInterimText = '';

    this.sandboxTextarea = document.getElementById('sandboxTextarea');
    this.rawTranscriptEl = document.getElementById('diffRawText');
    this.polishedTextEl = document.getElementById('diffPolishedText');
    this.latencyBadgeEl = document.getElementById('metricLatency');
    this.speedBadgeEl = document.getElementById('metricSpeed');
    this.zeroEditRateEl = document.getElementById('metricZeroEdit');
    this.durationBadgeEl = document.getElementById('metricDuration');
    this.uploadBadgeEl = document.getElementById('metricUpload');
    this.asrBadgeEl = document.getElementById('metricAsr');
    this.costBadgeEl = document.getElementById('metricCost');

    this.settingsModal = document.getElementById('settingsModal');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsCloseBtn = document.getElementById('settingsCloseBtn');
    this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');

    this.settingsGroqKeyInput = document.getElementById('settingGroqKey');
    this.settingsGeminiKeyInput = document.getElementById('settingGeminiKey');
    this.settingsOpenaiKeyInput = document.getElementById('settingOpenaiKey');
    this.settingSoundEffectsInput = document.getElementById('settingSoundEffects');
    this.settingAutoCopyInput = document.getElementById('settingAutoCopy');
    this.settingAutoAppModeInput = document.getElementById('settingAutoAppMode');
    this.settingVadEnabledInput = document.getElementById('settingVadEnabled');
    this.settingWebhookUrlInput = document.getElementById('settingWebhookUrl');

    this.settingSttProviderSelect = document.getElementById('settingSttProvider');
    this.settingSttModelSelect = document.getElementById('settingSttModel');
    this.settingLlmProviderSelect = document.getElementById('settingLlmProvider');
    this.settingLlmModelSelect = document.getElementById('settingLlmModel');
    this.settingTranscriptionModeSelect = document.getElementById('settingTranscriptionMode');
    this.settingAiEnhancementSelect = document.getElementById('settingAiEnhancement');

    // Multi-Model State
    this.currentSttProvider = 'groq';
    this.currentSttModel = 'whisper-large-v3-turbo';
    this.currentLlmProvider = 'groq';
    this.currentLlmModel = 'openai/gpt-oss-20b';
    this.currentAiEnhancement = 'auto';
    this.modelCatalog = null;

    this.init();
  }

  async init() {
    // 1. Initialize Pill Widget
    this.pillWidget = new PillWidget({
      onRecordStart: () => this.startRecording(this.pillWidget.isHandsFree),
      onRecordStop: () => this.stopRecording(),
      onToneChange: (tone) => {
        this.updateActiveToneChip(tone);
        this.showToast(`Style set to ${this.formatTone(tone) || tone}`);
      },
      onProviderChange: (provider) => this.showToast(`Provider switched: ${provider.toUpperCase()}`),
      onHandsFreeToggle: (enabled) => {
        if (this.hotkeyManager) this.hotkeyManager.setRecordingState(this.audioRecorder.isRecording(), enabled);
        this.showToast(enabled ? 'Hands-free mode enabled' : 'Push-to-talk mode enabled', 'info');
      }
    });

    // 2. Initialize Streaming Client Callbacks
    this.streamingClient.onRecordingStarted = () => {
      this.streamConfirmedSegments.clear();
      this.streamInterimText = '';
      this.updateLiveTranscriptDisplay();
    };

    this.streamingClient.onTranscriptInterim = (data) => {
      this.streamInterimText = data.text;
      this.updateLiveTranscriptDisplay();
      if (this.pillWidget && this.pillWidget.state === 'listening' && this.pillWidget.statusText) {
        this.pillWidget.statusText.textContent = data.text.length > 25 ? `${data.text.substring(0, 22)}...` : data.text;
      }
    };

    this.streamingClient.onTranscriptFinal = (data) => {
      if (data.segmentId !== undefined && data.text) {
        this.streamConfirmedSegments.set(data.segmentId, data.text);
      }
      this.streamInterimText = '';
      this.updateLiveTranscriptDisplay();
    };

    this.streamingClient.onProcessingStarted = () => {
      this.pillWidget.setState('processing', 'Transcribing');
    };

    this.streamingClient.onProcessingCompleted = (data) => {
      this.handleStreamingDictationSuccess(data);
    };

    this.streamingClient.onError = (err) => {
      console.warn('[Streaming Error]', err);
      if (!err.recoverable) {
        this.showToast(`Streaming note: ${err.error || 'Temporary provider failure'}`, 'error');
      }
    };

    // 3. Initialize Audio Recorder with live visualizer, VAD auto-silence, and chunk streamer
    this.audioRecorder = new AudioRecorder(
      (freqData, volume) => {
        this.pillWidget.drawWaveform(freqData, volume);
      },
      () => {
        // Voice Activity Detection triggered: Auto-finish after silence
        if (this.audioRecorder.isRecording()) {
          this.showToast('Silence detected. Finishing the line.', 'info');
          this.stopRecording();
        }
      },
      (chunkBlob, sequence) => {
        // Stream audio chunk while user is speaking!
        if (this.streamingClient) {
          this.streamingClient.sendChunk(chunkBlob, sequence);
        }
      }
    );

    // 3. Initialize Hotkey Manager (Spacebar Push-to-Talk, F8 toggle & Escape to cancel)
    this.hotkeyManager = new HotkeyManager({
      onPushToTalkStart: (isHandsFree) => {
        this.startRecording(isHandsFree);
      },
      onPushToTalkStop: () => {
        this.stopRecording();
      },
      onCancel: () => {
        this.cancelRecording();
      },
      onHandsFreeToggle: (enabled) => {
        if (this.pillWidget) this.pillWidget.setHandsFree(enabled);
        this.showToast(enabled ? 'Hands-free locked (Double-tap)' : 'Push-to-talk active', 'info');
      }
    });

    // 4. Initialize Sub-Managers
    this.dictionaryManager = new DictionaryManager();
    this.snippetsManager = new SnippetsManager({
      onSnippetTriggered: (trigger) => this.testSnippetTrigger(trigger)
    });
    this.commandModeManager = new CommandModeManager({
      onExecuteCommand: (instruction, text) => this.executeCommand(instruction, text)
    });
    this.notetakerManager = new NotetakerManager({
      onSummarize: (transcript) => this.summarizeMeeting(transcript)
    });

    // 5. Setup Tabs, Modals, Tone Chips, and Export Handlers
    this.setupTabs();
    this.setupTheme();
    this.setupToneChips();
    this.setupExportActions();
    this.setupSettingsModal();
    this.setupAuthModal();
    this.setupAdminPanel();
    this.setupSampleButtons();
    this.setupClearCopyButtons();
    this.setupHistory();
    this.setupModelHub();
    this.setupCostEstimator();
    this.setupUsageDashboard();
    this.checkAuthStatus();
    this.loadInitialSettings();
    this.loadHistory();
    this.handleUrlParams();
  }

  handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme');
    if (theme) {
      const btn = document.querySelector(`[data-theme-choice="${theme}"]`);
      if (btn) btn.click();
    }
    const tab = params.get('tab') || params.get('view');
    if (tab) {
      const viewMap = {
        'dictate': 'viewDictation',
        'viewdictation': 'viewDictation',
        'history': 'viewHistory',
        'viewhistory': 'viewHistory',
        'models': 'viewModels',
        'viewmodels': 'viewModels',
        'aimodels': 'viewModels',
        'usage': 'viewUsage',
        'viewusage': 'viewUsage',
        'notes': 'viewNotetaker',
        'notetaker': 'viewNotetaker',
        'viewnotetaker': 'viewNotetaker',
        'command': 'viewCommand',
        'viewcommand': 'viewCommand',
        'dictionary': 'viewDictionary',
        'viewdictionary': 'viewDictionary',
        'snippets': 'viewSnippets',
        'viewsnippets': 'viewSnippets',
        'admin': 'viewAdmin',
        'viewadmin': 'viewAdmin'
      };
      const viewId = viewMap[tab.toLowerCase()] || tab;
      const tabBtn = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
      if (tabBtn) {
        tabBtn.click();
      } else if (viewId && document.getElementById(viewId)) {
        this.activateView?.(viewId);
      }
    }
    const sample = params.get('sample');
    if (sample) {
      const sampleBtn = document.querySelector(`[data-sample-clip="${sample}"]`);
      if (sampleBtn) setTimeout(() => sampleBtn.click(), 100);
    }
    const summarize = params.get('summarize');
    if (summarize === 'true') {
      const sumBtn = document.getElementById('notetakerSummarizeBtn');
      if (sumBtn) setTimeout(() => sumBtn.click(), 150);
    }
    const modal = params.get('modal');
    if (modal === 'settings') {
      if (this.settingsBtn) this.settingsBtn.click();
    }
    const pillState = params.get('pill');
    if (pillState && this.pillWidget) {
      this.pillWidget.setState(pillState);
    }
  }

  // --- RECORDING PIPELINE ---

  async startRecording(isHandsFree = false) {
    if (this.audioRecorder.isRecording()) return;
    try {
      this.soundEffects.playStart();
      this.pillWidget.setState('listening');
      this.pillWidget.setHandsFree(isHandsFree || this.pillWidget.isHandsFree);
      this.hotkeyManager.setRecordingState(true, isHandsFree || this.pillWidget.isHandsFree);

      const provider = this.pillWidget.getProvider();
      const mimeType = this.audioRecorder.getBestSupportedMimeType();

      // Start low-latency streaming session immediately
      if (provider !== 'webspeech') {
        const tone = this.pillWidget.getTone();
        this.streamingClient.startRecording({
          sttProvider: provider,
          mimeType,
          language: 'auto',
          tone,
          mode: tone
        }).catch((err) => console.warn('[Streaming Start Notice]', err.message));
      }

      await this.audioRecorder.start();
    } catch (err) {
      this.pillWidget.setState('idle');
      this.pillWidget.setHandsFree(false);
      this.hotkeyManager.setRecordingState(false);
      this.showToast(err.message, 'error');
    }
  }

  async stopRecording() {
    if (!this.audioRecorder.isRecording()) return;
    this.soundEffects.playStop();
    this.hotkeyManager.setRecordingState(false);
    this.pillWidget.setState('processing', 'Transcribing');

    // Notify streaming server that user stopped speaking
    this.streamingClient.stopRecording();

    const result = await this.audioRecorder.stop();
    if (!result || !result.blob) {
      this.pillWidget.setState('idle');
      return;
    }

    // Ignore accidental micro-clicks or silence under 500ms (< 0.5s)
    if (result.durationMs < 500 || (result.hasSpoken === false && result.durationMs < 1000)) {
      this.streamingClient.cancel();
      this.pillWidget.setState('idle');
      this.showToast('Recording too short or silent (< 0.5s). Hold Space to speak.', 'info');
      return;
    }

    const provider = this.pillWidget.getProvider();
    const tone = this.pillWidget.getTone();

    // Check if user selected native Web Speech API
    if (provider === 'webspeech') {
      this.handleWebSpeechFlow(tone);
      return;
    }

    // Fallback: If streaming client was disconnected, fall back to upload endpoint
    if (!this.streamingClient.isConnected) {
      try {
        const dictateRes = await zeroEditClient.sendAudioDictation(result.blob, result.mimeType, {
          sttProvider: this.currentSttProvider || provider,
          sttModel: this.currentSttModel,
          llmProvider: this.currentLlmProvider || (provider === 'local-whisper' ? 'local-llm' : provider),
          llmModel: this.currentLlmModel,
          tone: tone,
          appName: 'Mumble AI Sandbox'
        });

        if (dictateRes.empty) {
          this.pillWidget.setState('idle');
          this.showToast(dictateRes.message || 'No speech detected.', 'info');
          return;
        }

        this.handleDictationSuccess(dictateRes, result.durationMs);
      } catch (err) {
        console.error('Dictation error:', err);
        this.pillWidget.setState('idle');
        this.showToast(`Error: ${err.message}`, 'error');
      }
    }
  }

  cancelRecording() {
    this.soundEffects.playClick();
    this.audioRecorder.cancel();
    this.streamingClient.cancel();
    this.hotkeyManager.resetState();
    this.pillWidget.setHandsFree(false);
    this.pillWidget.setState('idle');
    this.streamConfirmedSegments.clear();
    this.streamInterimText = '';
    this.updateLiveTranscriptDisplay();
    this.showToast('Dictation cancelled', 'info');
  }

  updateLiveTranscriptDisplay() {
    if (!this.rawTranscriptEl) return;

    const finalParts = Array.from(this.streamConfirmedSegments.values());
    const finalHtml = finalParts.map((t) => `<span class="transcript-final">${this.escapeHtml(t)}</span>`).join(' ');
    const interimHtml = this.streamInterimText
      ? `<span class="transcript-interim">${this.escapeHtml(this.streamInterimText)}</span>`
      : '';

    if (!finalHtml && !interimHtml) {
      this.rawTranscriptEl.innerHTML = '—';
      this.rawTranscriptEl.classList.add('is-idle');
    } else {
      this.rawTranscriptEl.innerHTML = finalHtml && interimHtml
        ? `${finalHtml} ${interimHtml}`
        : (finalHtml || interimHtml);
      this.rawTranscriptEl.classList.remove('is-idle');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  handleStreamingDictationSuccess(data) {
    this.pillWidget.setState('idle');
    if (data.empty || (!data.rawTranscript && !data.processedText)) {
      this.showToast(data.message || 'No speech detected.', 'info');
      return;
    }

    const raw = (data.rawTranscript || '').trim();
    const clean = (data.processedText || raw).trim();
    this.streamConfirmedSegments.clear();
    this.streamInterimText = '';

    if (this.rawTranscriptEl) {
      this.rawTranscriptEl.innerHTML = `<span class="transcript-final">${this.escapeHtml(raw)}</span>`;
      this.rawTranscriptEl.classList.remove('is-idle');
    }
    if (this.polishedTextEl) {
      this.polishedTextEl.textContent = clean;
      this.polishedTextEl.classList.remove('is-idle');
    }

    this.injectText(clean);
    this.soundEffects.playSuccess();
    this.loadHistory();

    // Telemetry updates
    const asrMs = data.latency?.asrMs || 0;
    const totalMs = data.latency?.totalMs || 0;
    const durationMs = data.durationMs || 0;

    if (this.latencyBadgeEl) {
      this.latencyBadgeEl.textContent = totalMs ? `${totalMs}ms` : (asrMs ? `${asrMs}ms` : '—');
    }
    if (this.durationBadgeEl && durationMs > 0) {
      this.durationBadgeEl.textContent = `${(durationMs / 1000).toFixed(1)}s`;
    }
    if (this.uploadBadgeEl) {
      this.uploadBadgeEl.textContent = '0ms (streamed)';
    }
    if (this.asrBadgeEl && asrMs > 0) {
      this.asrBadgeEl.textContent = `${asrMs}ms`;
    }
    if (this.speedBadgeEl && durationMs > 0 && raw) {
      const words = raw.trim().split(/\s+/).filter(Boolean).length;
      const minutes = durationMs / 60000;
      const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
      this.speedBadgeEl.textContent = `${wpm} wpm`;
    }
    if (this.zeroEditRateEl) {
      this.zeroEditRateEl.textContent = '100%';
    }
  }

  handleWebSpeechFlow(tone) {
    this.pillWidget.setState('listening');
    const speechStart = Date.now();
    try {
      zeroEditClient.startWebSpeechRecognition(
        async (rawTranscript) => {
          this.pillWidget.setState('processing');
          const elapsed = Date.now() - speechStart;
          try {
            const res = await zeroEditClient.processText(rawTranscript, {
              tone,
              appName: 'Mumble AI Sandbox'
            });
            this.handleDictationSuccess(res, elapsed);
          } catch (e) {
            this.showToast(e.message, 'error');
            this.pillWidget.setState('idle');
          }
        },
        (error) => {
          this.pillWidget.setState('idle');
          this.showToast(`Speech recognition error: ${error}`, 'error');
        }
      );
    } catch (e) {
      this.pillWidget.setState('idle');
      this.showToast(e.message, 'error');
    }
  }

  handleDictationSuccess(res, durationMs) {
    const raw = res.rawTranscript || '';
    const clean = res.processedText || '';

    // Play pleasant confirmation bell
    this.soundEffects.playSuccess();

    // Update Diff Elements
    if (this.rawTranscriptEl) {
      this.rawTranscriptEl.textContent = raw || '(No speech detected)';
      this.rawTranscriptEl.classList.remove('is-idle');
    }
    if (this.polishedTextEl) {
      this.polishedTextEl.textContent = clean || '—';
      this.polishedTextEl.classList.toggle('is-idle', !clean);
    }
    this.loadHistory();

    // Clean, direct injection into editor at active cursor position
    this.injectText(clean);

    // --- REAL PERFORMANCE MEASUREMENTS (NO FAKE METRICS) ---
    const effectiveDurationMs = durationMs || res.durationMs || (res.duration ? res.duration * 1000 : 0);
    const totalLatency = res.clientRoundtripMs || res.latency?.totalMs || res.latencyMs;

    // 1. Total Latency
    if (this.latencyBadgeEl) {
      this.latencyBadgeEl.textContent = totalLatency ? `${totalLatency}ms` : '—';
    }

    // 2. Real Recording Duration
    if (this.durationBadgeEl) {
      if (effectiveDurationMs > 0) {
        this.durationBadgeEl.textContent = `${(effectiveDurationMs / 1000).toFixed(1)}s`;
      } else {
        this.durationBadgeEl.textContent = '—';
      }
    }

    // 3. Real Upload Transfer Time
    const uploadMs = res.latency?.uploadMs !== undefined && res.latency?.uploadMs !== null
      ? res.latency.uploadMs
      : (res.clientRoundtripMs && res.latency?.totalMs ? Math.max(0, res.clientRoundtripMs - res.latency.totalMs) : null);
    if (this.uploadBadgeEl) {
      this.uploadBadgeEl.textContent = uploadMs !== null && uploadMs !== undefined ? `${uploadMs}ms` : '—';
    }

    // 4. Real ASR Transcription Latency
    const asrMs = res.latency?.asrMs || res.latencyAsrMs;
    if (this.asrBadgeEl) {
      this.asrBadgeEl.textContent = asrMs ? `${asrMs}ms` : '—';
    }

    // 5. Real Speech Rate (Words Per Minute)
    const words = (clean || raw).trim().split(/\s+/).filter(Boolean).length;
    if (this.speedBadgeEl) {
      if (effectiveDurationMs > 500 && words > 0) {
        const wpm = Math.round(words / (effectiveDurationMs / 60000));
        this.speedBadgeEl.textContent = `${wpm} wpm`;
      } else {
        this.speedBadgeEl.textContent = '—';
      }
    }

    // 6. Real Zero-Edit Accuracy Rate (Calculated from token preservation)
    if (this.zeroEditRateEl) {
      const accuracyScore = this.calculateZeroEditAccuracy(raw, clean);
      this.zeroEditRateEl.textContent = accuracyScore !== null ? `${accuracyScore}%` : '—';
    }

    // Auto copy to clipboard
    navigator.clipboard.writeText(clean).catch(() => {});

    // Trigger Pill Copied state
    this.pillWidget.setState('copied');
    this.showToast(res.isSnippet ? `Expanded Snippet: "${res.snippetTrigger}"` : `Transcribed & Copied!`);

    // Async Dispatch to Webhook if configured
    if (this.webhookUrl && clean) {
      this.dispatchWebhookPayload({
        event: 'dictation.completed',
        processedText: clean,
        rawTranscript: raw,
        tone: this.pillWidget.getTone(),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Direct text insertion into sandbox editor at current cursor position
   */
  injectText(text) {
    if (!this.sandboxTextarea || !text) return;
    const el = this.sandboxTextarea;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;

    if (typeof start === 'number' && typeof end === 'number' && document.activeElement === el) {
      const before = current.substring(0, start);
      const after = current.substring(end);
      const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
      const inserted = (needsSpace ? ' ' : '') + text;
      el.value = before + inserted + after;
      el.selectionStart = el.selectionEnd = start + inserted.length;
    } else {
      const prefix = current.length > 0 && !current.endsWith('\n') ? current + '\n\n' : current;
      el.value = prefix + text;
      el.scrollTop = el.scrollHeight;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Calculate true zero-edit preservation score between raw speech and formatted text
   */
  calculateZeroEditAccuracy(raw, clean) {
    if (!raw || !clean) return null;
    const rawTokens = raw.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const cleanTokens = clean.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    if (rawTokens.length === 0 || cleanTokens.length === 0) return null;

    const cleanWordMap = new Map();
    for (const token of cleanTokens) {
      cleanWordMap.set(token, (cleanWordMap.get(token) || 0) + 1);
    }

    let preserved = 0;
    for (const token of rawTokens) {
      const count = cleanWordMap.get(token);
      if (count > 0) {
        preserved++;
        cleanWordMap.set(token, count - 1);
      }
    }

    const ratio = Math.round((preserved / Math.max(rawTokens.length, cleanTokens.length)) * 100);
    return Math.min(100, Math.max(0, ratio));
  }

  // --- SAMPLE VOICE TRIGGERS ---

  setupSampleButtons() {
    const samples = {
      meeting: `Umm hey so can you actually wait can you tell the team that the the launch is gonna slip I think to like not Friday the following Monday because we're still waiting on legal to sign off on the new terms page and yeah just let them know we'll have a real timeline by end of week sorry end of day Thursday`,
      code: `Hey team in user authentication service line 45 the get user by id function is throwing an unhandled null exception when accessing token header so please run git pull and update the env variable port to 3000`,
      email: `Hi David hope you are having a productive week following up on our demo last Tuesday wanted to check if you and the team had a chance to review the proposal let me know if Thursday 2pm works for a quick sync`
    };

    document.querySelectorAll('[data-sample-clip]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.getAttribute('data-sample-clip');
        const text = samples[key];
        if (!text) return;

        const tone = key === 'code' ? 'code' : key === 'email' ? 'formal' : 'casual';
        this.pillWidget.setState('processing');

        try {
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          const estimatedDurationMs = Math.round((wordCount / 2.5) * 1000); // ~150 wpm spoken rate
          const res = await zeroEditClient.processText(text, {
            tone,
            appName: key === 'code' ? 'VS Code' : key === 'email' ? 'Gmail' : 'Slack',
            llmProvider: this.pillWidget.getProvider()
          });
          this.handleDictationSuccess(res, estimatedDurationMs);
        } catch (err) {
          this.pillWidget.setState('idle');
          this.showToast(err.message, 'error');
        }
      });
    });
  }

  async testSnippetTrigger(trigger) {
    this.pillWidget.setState('processing');
    try {
      const res = await zeroEditClient.processText(trigger, {
        tone: 'casual',
        appName: 'Slack'
      });
      this.handleDictationSuccess(res);
    } catch (e) {
      this.pillWidget.setState('idle');
      this.showToast(e.message, 'error');
    }
  }

  async executeCommand(instruction, text) {
    const provider = this.pillWidget.getProvider();
    return await zeroEditClient.executeCommand(instruction, text, {
      llmProvider: provider
    });
  }

  async summarizeMeeting(transcript) {
    const provider = this.pillWidget.getProvider();
    return await zeroEditClient.summarizeMeeting(transcript, {
      llmProvider: provider
    });
  }

  // --- TONE CHIPS & PRESETS ---

  setupToneChips() {
    const chips = document.querySelectorAll('.tone-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const tone = chip.getAttribute('data-tone');
        this.soundEffects.playClick();
        this.updateActiveToneChip(tone);
        this.pillWidget.setTone(tone);
        this.showToast(`Style set to ${this.formatTone(tone) || tone}`);
      });
    });
  }

  updateActiveToneChip(tone) {
    const chips = document.querySelectorAll('.tone-chip');
    chips.forEach(chip => {
      if (chip.getAttribute('data-tone') === tone) {
        chip.classList.add('active');
        chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // --- EXPORT ACTIONS (.md, .txt, Webhook) ---

  setupExportActions() {
    const exportMdBtn = document.getElementById('exportMdBtn');
    const exportTxtBtn = document.getElementById('exportTxtBtn');
    const webhookBtn = document.getElementById('webhookBtn');

    if (exportMdBtn) {
      exportMdBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        const text = this.sandboxTextarea?.value;
        if (!text || !text.trim()) {
          this.showToast('Sandbox is empty — nothing to export', 'error');
          return;
        }
        this.downloadFile(text, 'mumble-dictation.md', 'text/markdown');
        this.showToast('Downloaded Markdown (.md) file!');
      });
    }

    if (exportTxtBtn) {
      exportTxtBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        const text = this.sandboxTextarea?.value;
        if (!text || !text.trim()) {
          this.showToast('Sandbox is empty — nothing to export', 'error');
          return;
        }
        this.downloadFile(text, 'mumble-dictation.txt', 'text/plain');
        this.showToast('Downloaded Text (.txt) file!');
      });
    }

    if (webhookBtn) {
      webhookBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        const text = this.sandboxTextarea?.value;
        if (!text || !text.trim()) {
          this.showToast('Sandbox is empty — nothing to dispatch', 'error');
          return;
        }
        if (!this.webhookUrl) {
          this.openSettingsModal();
          this.showToast('Please enter your Webhook URL in Settings first', 'info');
          const webhookField = document.getElementById('settingWebhookUrl');
          if (webhookField) {
            setTimeout(() => {
              webhookField.scrollIntoView({ behavior: 'smooth', block: 'center' });
              webhookField.focus();
            }, 150);
          }
          return;
        }
        this.dispatchWebhookPayload({
          event: 'manual.export',
          text,
          tone: this.pillWidget.getTone(),
          timestamp: new Date().toISOString()
        });
      });
    }
  }

  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async dispatchWebhookPayload(payload) {
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'Mumble AI',
          ...payload
        })
      });
      this.showToast('Webhook sent.');
    } catch (err) {
      console.warn('Webhook dispatch failed:', err);
      this.showToast(`Webhook error: ${err.message}`, 'error');
    }
  }

  // --- TABS & UI HELPERS ---

  setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const views = document.querySelectorAll('.view-panel');

    const activate = (viewId) => {
      tabs.forEach(t => {
        const on = t.getAttribute('data-view') === viewId;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      views.forEach(v => v.classList.toggle('active', v.id === viewId));

      if (viewId === 'viewModels') {
        this.loadModelHub();
      } else if (viewId === 'viewUsage') {
        this.loadUsageDashboard();
      } else if (viewId === 'viewHistory') {
        this.loadFullHistory();
      } else if (viewId === 'viewAdmin') {
        this.loadAdminPanel();
      }
    };

    this.activateView = activate;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.soundEffects.playClick();
        activate(tab.getAttribute('data-view'));
      });
    });

    const wordmark = document.getElementById('wordmarkBtn');
    if (wordmark) {
      wordmark.addEventListener('click', () => activate('viewDictation'));
    }

    const openModelHubQuickBtn = document.getElementById('openModelHubQuickBtn');
    if (openModelHubQuickBtn) {
      openModelHubQuickBtn.addEventListener('click', () => activate('viewModels'));
    }

    const pillModelQuickBtn = document.getElementById('pillModelQuickBtn');
    if (pillModelQuickBtn) {
      pillModelQuickBtn.addEventListener('click', () => activate('viewModels'));
    }
  }

  setupTheme() {
    const buttons = document.querySelectorAll('[data-theme-choice]');
    const apply = (theme) => {
      if (theme !== 'light' && theme !== 'dark' && theme !== 'contrast') return;
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('whisperflow-theme', theme); } catch (e) {}
      buttons.forEach(btn => {
        const on = btn.getAttribute('data-theme-choice') === theme;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };

    buttons.forEach(btn => {
      btn.addEventListener('click', () => apply(btn.getAttribute('data-theme-choice')));
    });
  }

  setupHistory() {
    const clearBtn = document.getElementById('historyClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearHistory());
    }
  }

  async loadHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    try {
      const res = await fetch('/api/history?limit=20');
      const items = await res.json();
      this.renderHistory(Array.isArray(items) ? items : []);
    } catch (err) {
      list.replaceChildren();
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'History could not be loaded.';
      list.appendChild(p);
    }
  }

  renderHistory(items) {
    const list = document.getElementById('historyList');
    const clearBtn = document.getElementById('historyClearBtn');
    if (!list) return;
    list.replaceChildren();
    if (clearBtn) clearBtn.disabled = items.length === 0;

    if (items.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'Nothing dictated yet. Hold Space to begin.';
      list.appendChild(p);
      return;
    }

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';

      const time = document.createElement('span');
      time.className = 'history-time';
      const tone = this.formatTone(item.tone);
      const when = this.formatHistoryTime(item.timestamp);
      time.textContent = [when, tone].filter(Boolean).join(' · ');

      const excerpt = document.createElement('span');
      excerpt.className = 'history-excerpt';
      const fullText = (item.processedText || item.rawTranscript || 'Empty dictation').trim();
      excerpt.textContent = fullText;
      btn.title = fullText;

      btn.append(time, excerpt);
      btn.addEventListener('click', () => {
        if (this.sandboxTextarea) this.sandboxTextarea.value = item.processedText || '';
        if (this.rawTranscriptEl) {
          this.rawTranscriptEl.textContent = item.rawTranscript || '—';
          this.rawTranscriptEl.classList.toggle('is-idle', !item.rawTranscript);
        }
        if (this.polishedTextEl) {
          this.polishedTextEl.textContent = item.processedText || '—';
          this.polishedTextEl.classList.toggle('is-idle', !item.processedText);
        }
        if (item.tone) {
          this.pillWidget.setTone(item.tone);
          this.updateActiveToneChip(item.tone);
        }
        if (item.totalLatencyMs && this.latencyBadgeEl) {
          this.latencyBadgeEl.textContent = `${item.totalLatencyMs}ms`;
        }
      });
      list.appendChild(btn);
    });
  }

  async clearHistory() {
    try {
      await fetch('/api/history', { method: 'DELETE' });
      this.renderHistory([]);
    } catch (err) {
      this.showToast('Could not clear history.', 'error');
    }
  }

  formatHistoryTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  formatTone(tone) {
    const names = {
      casual: 'Casual',
      formal: 'Formal',
      developer: 'Developer',
      terminal: 'Terminal',
      executive: 'Executive',
      code: 'Code',
      bullet: 'Bullets',
      standup: 'Standup',
      social: 'Social',
      prompt: 'Prompt',
      support: 'Support',
      translate_es: 'Spanish',
      translate_fr: 'French',
      translate_de: 'German',
      translate_hi: 'Hindi',
      translate_ja: 'Japanese',
      raw: 'Raw'
    };
    return names[tone] || '';
  }

  setupClearCopyButtons() {
    const clearBtn = document.getElementById('clearEditorBtn');
    const copyBtn = document.getElementById('copyEditorBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.sandboxTextarea.value = '';
        if (this.rawTranscriptEl) {
          this.rawTranscriptEl.textContent = '—';
          this.rawTranscriptEl.classList.add('is-idle');
        }
        if (this.polishedTextEl) {
          this.polishedTextEl.textContent = '—';
          this.polishedTextEl.classList.add('is-idle');
        }
        if (this.latencyBadgeEl) this.latencyBadgeEl.textContent = '—';
        if (this.speedBadgeEl) this.speedBadgeEl.textContent = '—';
        if (this.zeroEditRateEl) this.zeroEditRateEl.textContent = '—';
        this.showToast('Editor cleared');
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!this.sandboxTextarea.value) return;
        this.soundEffects.playSuccess();
        navigator.clipboard.writeText(this.sandboxTextarea.value);
        this.showToast('Copied all text to clipboard!');
      });
    }
  }

  openSettingsModal() {
    if (!this.settingsModal) return;
    this.settingsModal.classList.add('is-open', 'active');
    this.loadInitialSettings();
    this.loadByokKeys();
  }

  closeSettingsModal() {
    if (!this.settingsModal) return;
    this.settingsModal.classList.remove('is-open', 'active');
  }

  setupSettingsModal() {
    if (this.settingsBtn && this.settingsModal) {
      this.settingsBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.openSettingsModal();
      });
    }

    if (this.settingsCloseBtn && this.settingsModal) {
      this.settingsCloseBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.closeSettingsModal();
      });
    }

    if (this.cancelSettingsBtn && this.settingsModal) {
      this.cancelSettingsBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.closeSettingsModal();
      });
    }

    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }

    this.setupByokControls();

    const purgeBtn = document.getElementById('purgeDataBtn');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', async () => {
        if (!confirm('Are you absolutely sure you want to permanently delete all dictation history, personal dictionary items, and snippets? This cannot be undone.')) return;
        try {
          await fetch('/api/user/data', { method: 'DELETE' });
          this.showToast('All user data and history purged successfully.');
          this.loadHistory();
          if (this.dictionaryManager) this.dictionaryManager.loadDictionary();
          if (this.snippetsManager) this.snippetsManager.loadSnippets();
          this.loadUsageDashboard();
        } catch (e) {
          this.showToast(`Purge failed: ${e.message}`, 'error');
        }
      });
    }

    // Close on background click
    window.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettingsModal();
      }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.settingsModal && (this.settingsModal.classList.contains('is-open') || this.settingsModal.classList.contains('active'))) {
        this.closeSettingsModal();
      }
    });
  }

  setupByokControls() {
    const bindProvider = (provider, validateBtnId, removeBtnId, inputId, feedbackId) => {
      const validateBtn = document.getElementById(validateBtnId);
      const removeBtn = document.getElementById(removeBtnId);
      const input = document.getElementById(inputId);
      const feedback = document.getElementById(feedbackId);

      if (validateBtn) {
        validateBtn.addEventListener('click', async () => {
          this.soundEffects.playClick();
          const val = input ? input.value.trim() : '';
          await this.validateByokKey(provider, val, feedback);
        });
      }

      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          this.soundEffects.playClick();
          if (!confirm(`Are you sure you want to remove your custom ${provider.toUpperCase()} API key?`)) return;
          await this.removeByokKey(provider, input, feedback);
        });
      }
    };

    bindProvider('groq', 'btnValidateGroq', 'btnRemoveGroq', 'settingGroqKey', 'groqFeedback');
    bindProvider('openai', 'btnValidateOpenai', 'btnRemoveOpenai', 'settingOpenaiKey', 'openaiFeedback');
    bindProvider('gemini', 'btnValidateGemini', 'btnRemoveGemini', 'settingGeminiKey', 'geminiFeedback');
  }

  async validateByokKey(provider, key, feedbackEl) {
    if (feedbackEl) {
      feedbackEl.className = 'key-feedback loading';
      feedbackEl.textContent = `Validating ${provider.toUpperCase()} key with provider...`;
    }

    try {
      const res = await fetch('/api/keys/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key || undefined })
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        if (feedbackEl) {
          feedbackEl.className = 'key-feedback success';
          feedbackEl.textContent = `✓ Key is valid & operational (${data.latencyMs}ms)`;
        }
        this.soundEffects.playSuccess();
        await this.loadByokKeys();
        this.loadModelHub();
      } else {
        if (feedbackEl) {
          feedbackEl.className = 'key-feedback error';
          feedbackEl.textContent = `✗ ${data.error || 'Credential validation failed'}`;
        }
      }
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.className = 'key-feedback error';
        feedbackEl.textContent = `✗ Network error: ${err.message}`;
      }
    }
  }

  async removeByokKey(provider, inputEl, feedbackEl) {
    if (feedbackEl) {
      feedbackEl.className = 'key-feedback loading';
      feedbackEl.textContent = `Removing ${provider.toUpperCase()} key...`;
    }

    try {
      const res = await fetch(`/api/keys/${provider}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (inputEl) inputEl.value = '';
        if (feedbackEl) {
          feedbackEl.className = 'key-feedback success';
          feedbackEl.textContent = `✓ Removed custom key. Reverted to system defaults.`;
        }
        this.showToast(`Removed custom ${provider.toUpperCase()} key.`);
        await this.loadByokKeys();
        this.loadModelHub();
      } else {
        if (feedbackEl) {
          feedbackEl.className = 'key-feedback error';
          feedbackEl.textContent = `✗ ${data.error || 'Failed to remove key'}`;
        }
      }
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.className = 'key-feedback error';
        feedbackEl.textContent = `✗ Network error: ${err.message}`;
      }
    }
  }

  async loadByokKeys() {
    try {
      const res = await fetch('/api/keys');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.keys)) return;

      const keyMap = new Map(data.keys.map(k => [k.provider, k]));

      const updateProviderUI = (provider, badgeId, inputId, removeBtnId) => {
        const keyInfo = keyMap.get(provider);
        const badge = document.getElementById(badgeId);
        const input = document.getElementById(inputId);
        const removeBtn = document.getElementById(removeBtnId);

        if (!keyInfo) return;

        if (keyInfo.source === 'user' && keyInfo.isConfigured) {
          if (badge) {
            badge.className = 'status-indicator byok';
            badge.textContent = `BYOK Active (${keyInfo.keyHint})`;
          }
          if (input && !input.value) {
            input.placeholder = `${keyInfo.keyHint} (Encrypted at rest)`;
          }
          if (removeBtn) removeBtn.style.display = 'inline-block';
        } else if (keyInfo.source === 'system' && keyInfo.isConfigured) {
          if (badge) {
            badge.className = 'status-indicator available';
            badge.textContent = 'System Managed';
          }
          if (input && !input.value) {
            input.placeholder = 'System key active (Paste here to override)';
          }
          if (removeBtn) removeBtn.style.display = 'none';
        } else {
          if (badge) {
            badge.className = 'status-indicator requires_key';
            badge.textContent = 'Not Configured';
          }
          if (input && !input.value) {
            input.placeholder = provider === 'groq' ? 'gsk_…' : provider === 'gemini' ? 'AIza…' : 'sk-proj-…';
          }
          if (removeBtn) removeBtn.style.display = 'none';
        }
      };

      updateProviderUI('groq', 'groqKeyBadge', 'settingGroqKey', 'btnRemoveGroq');
      updateProviderUI('openai', 'openaiKeyBadge', 'settingOpenaiKey', 'btnRemoveOpenai');
      updateProviderUI('gemini', 'geminiKeyBadge', 'settingGeminiKey', 'btnRemoveGemini');
    } catch (e) {
      console.warn('[BYOK] Could not load user keys:', e);
    }
  }

  async loadInitialSettings() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();

      this.currentSttProvider = settings.sttProvider || 'groq';
      this.currentSttModel = settings.sttModel || 'whisper-large-v3-turbo';
      this.currentLlmProvider = settings.llmProvider || 'groq';
      this.currentLlmModel = settings.llmModel || 'openai/gpt-oss-20b';
      this.currentAiEnhancement = settings.aiEnhancement || 'auto';

      if (this.settingsGroqKeyInput && settings.hasGroqKey) {
        this.settingsGroqKeyInput.placeholder = '•••••••••••••••• (API Key Configured)';
      }
      if (this.settingsGeminiKeyInput && settings.hasGeminiKey) {
        this.settingsGeminiKeyInput.placeholder = '•••••••••••••••• (API Key Configured)';
      }
      if (this.settingsOpenaiKeyInput && settings.hasOpenaiKey) {
        this.settingsOpenaiKeyInput.placeholder = '•••••••••••••••• (API Key Configured)';
      }

      if (this.settingSoundEffectsInput && typeof settings.soundEffects !== 'undefined') {
        this.settingSoundEffectsInput.checked = settings.soundEffects;
        this.soundEffects.setEnabled(settings.soundEffects);
      }
      if (this.settingAutoCopyInput && typeof settings.autoCopy !== 'undefined') {
        this.settingAutoCopyInput.checked = settings.autoCopy;
      }
      if (this.settingAutoAppModeInput && typeof settings.autoAppMode !== 'undefined') {
        this.settingAutoAppModeInput.checked = settings.autoAppMode;
      }
      if (this.settingSttProviderSelect && settings.sttProvider) {
        this.settingSttProviderSelect.value = settings.sttProvider;
      }
      if (this.settingSttModelSelect && settings.sttModel) {
        this.settingSttModelSelect.value = settings.sttModel;
      }
      if (this.settingLlmProviderSelect && settings.llmProvider) {
        this.settingLlmProviderSelect.value = settings.llmProvider;
      }
      if (this.settingLlmModelSelect && settings.llmModel) {
        this.settingLlmModelSelect.value = settings.llmModel;
      }
      if (this.settingTranscriptionModeSelect && settings.transcriptionMode) {
        this.settingTranscriptionModeSelect.value = settings.transcriptionMode;
      }
      if (this.settingAiEnhancementSelect && settings.aiEnhancement) {
        this.settingAiEnhancementSelect.value = settings.aiEnhancement;
      }
      if (this.settingWebhookUrlInput && settings.webhookUrl) {
        this.settingWebhookUrlInput.value = settings.webhookUrl;
        this.webhookUrl = settings.webhookUrl;
      }

      this.updateModelIndicatorUI();
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }

  updateModelIndicatorUI() {
    const sttBadge = document.getElementById('sttModelName');
    const llmBadge = document.getElementById('llmModelName');
    const aiModeBadge = document.getElementById('aiModeName');
    const pillStt = document.getElementById('pillSttName');

    if (sttBadge) {
      sttBadge.textContent = `${this.currentSttProvider.toUpperCase()} · ${this.currentSttModel}`;
    }
    if (llmBadge) {
      llmBadge.textContent = `${this.currentLlmProvider.toUpperCase()} · ${this.currentLlmModel}`;
    }
    if (aiModeBadge) {
      aiModeBadge.textContent = (this.currentAiEnhancement || 'auto').toUpperCase();
    }
    if (pillStt) {
      pillStt.textContent = `${this.currentSttProvider} · ${this.currentSttModel.split('-')[0]}`;
    }

    if (this.pillWidget) {
      this.pillWidget.setProvider(this.currentSttProvider);
    }
  }

  // --- MODEL HUB & LIVE COST ESTIMATOR (Phase 11) ---

  setupModelHub() {
    this.loadModelHub();
  }

  async loadModelHub() {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (!data.success) return;
      this.modelCatalog = data;

      this.renderModelCards('stt', data.stt || []);
      this.renderModelCards('llm', data.llm || []);

      const sttCountEl = document.getElementById('sttModelCount');
      if (sttCountEl) sttCountEl.textContent = `${(data.stt || []).length} models`;
      const llmCountEl = document.getElementById('llmModelCount');
      if (llmCountEl) llmCountEl.textContent = `${(data.llm || []).length} models`;

      this.updateCostEstimator();
    } catch (e) {
      console.warn('[Model Hub Load Notice]', e);
    }
  }

  renderModelCards(type, models) {
    const container = document.getElementById(type === 'stt' ? 'sttModelCardsGrid' : 'llmModelCardsGrid');
    if (!container) return;
    container.replaceChildren();

    models.forEach((m) => {
      const isSelected = type === 'stt' 
        ? (this.currentSttProvider === m.provider && this.currentSttModel === m.model)
        : (this.currentLlmProvider === m.provider && this.currentLlmModel === m.model);

      const card = document.createElement('div');
      card.className = `model-card ${isSelected ? 'is-selected' : ''}`;

      const pricingText = type === 'stt'
        ? `$${(m.pricePerMinute || 0).toFixed(6)} / min`
        : `$${(m.inputPricePer1M || 0).toFixed(2)} in · $${(m.outputPricePer1M || 0).toFixed(2)} out / 1M`;

      const capBadges = (m.capabilities || []).map(c => `<span class="cap-badge">${c.replace(/_/g, ' ')}</span>`).join('');

      const badgeClass = (m.statusBadge === 'BYOK Active' || m.source === 'user') ? 'byok' : (m.status || 'available');

      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-model-name">${this.escapeHtml(m.displayName || m.model)}</div>
            <div class="card-provider-name">${this.escapeHtml(m.provider)}</div>
          </div>
          <div class="card-pricing-badge">${pricingText}</div>
        </div>
        <div class="card-capabilities">${capBadges}</div>
        <div class="card-bottom">
          <span class="status-indicator ${badgeClass}">${this.escapeHtml(m.statusBadge || 'Available')}</span>
          <button type="button" class="btn-select-model">${isSelected ? 'Active Model' : (type === 'stt' ? 'Select for STT' : 'Select for AI')}</button>
        </div>
      `;

      const selectBtn = card.querySelector('.btn-select-model');
      selectBtn.addEventListener('click', async () => {
        this.soundEffects.playClick();
        if (type === 'stt') {
          this.currentSttProvider = m.provider;
          this.currentSttModel = m.model;
          if (this.settingSttProviderSelect) this.settingSttProviderSelect.value = m.provider;
          if (this.settingSttModelSelect) this.settingSttModelSelect.value = m.model;
        } else {
          this.currentLlmProvider = m.provider;
          this.currentLlmModel = m.model;
          if (this.settingLlmProviderSelect) this.settingLlmProviderSelect.value = m.provider;
          if (this.settingLlmModelSelect) this.settingLlmModelSelect.value = m.model;
        }

        await this.persistModelSelection();
        this.updateModelIndicatorUI();
        this.renderModelCards('stt', this.modelCatalog?.stt || []);
        this.renderModelCards('llm', this.modelCatalog?.llm || []);
        this.updateCostEstimator();
        this.showToast(`Active ${type.toUpperCase()} switched to ${m.displayName}`);
      });

      container.appendChild(card);
    });
  }

  async persistModelSelection() {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sttProvider: this.currentSttProvider,
          sttModel: this.currentSttModel,
          llmProvider: this.currentLlmProvider,
          llmModel: this.currentLlmModel
        })
      });
    } catch (e) {
      console.warn('Could not persist model selection:', e);
    }
  }

  setupCostEstimator() {
    const minInput = document.getElementById('estAudioMinutes');
    const inTokensInput = document.getElementById('estInputTokens');
    const outTokensInput = document.getElementById('estOutputTokens');

    const onInputChange = () => {
      document.getElementById('estMinutesDisplay').textContent = minInput.value;
      document.getElementById('estInputTokensDisplay').textContent = Number(inTokensInput.value).toLocaleString();
      document.getElementById('estOutputTokensDisplay').textContent = Number(outTokensInput.value).toLocaleString();
      this.updateCostEstimator();
    };

    if (minInput) minInput.addEventListener('input', onInputChange);
    if (inTokensInput) inTokensInput.addEventListener('input', onInputChange);
    if (outTokensInput) outTokensInput.addEventListener('input', onInputChange);
  }

  async updateCostEstimator() {
    const min = Number(document.getElementById('estAudioMinutes')?.value || 5);
    const inTokens = Number(document.getElementById('estInputTokens')?.value || 1000);
    const outTokens = Number(document.getElementById('estOutputTokens')?.value || 300);

    const activePairText = document.getElementById('estActivePairText');
    if (activePairText) {
      activePairText.textContent = `Active Pair: ${this.currentSttProvider.toUpperCase()} (${this.currentSttModel}) + ${this.currentLlmProvider.toUpperCase()} (${this.currentLlmModel})`;
    }

    try {
      const res = await fetch('/api/models/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sttProvider: this.currentSttProvider,
          sttModel: this.currentSttModel,
          audioMinutes: min,
          llmProvider: this.currentLlmProvider,
          llmModel: this.currentLlmModel,
          inputTokens: inTokens,
          outputTokens: outTokens
        })
      });
      const data = await res.json();
      if (data.success && data.estimatedCost) {
        document.getElementById('estSttCostValue').textContent = `$${data.estimatedCost.sttCost.toFixed(6)}`;
        document.getElementById('estLlmCostValue').textContent = `$${data.estimatedCost.llmCost.toFixed(6)}`;
        document.getElementById('estTotalCostValue').textContent = `$${data.estimatedCost.totalCost.toFixed(6)}`;
      }
    } catch (e) {
      console.warn('Cost estimator update failed:', e);
    }
  }

  // --- USAGE & COST DASHBOARD (Phase 11) ---

  setupUsageDashboard() {
    const refreshBtn = document.getElementById('refreshUsageBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.loadUsageDashboard();
      });
    }
  }

  async loadUsageDashboard() {
    try {
      const res = await fetch('/api/usage/dashboard');
      const data = await res.json();
      if (!data.success) return;

      const today = data.today || {};
      const month = data.thisMonth || {};
      const quota = data.quota || {};

      // 1. Quota Progress
      const quotaTierEl = document.getElementById('dashQuotaTierBadge');
      if (quotaTierEl) quotaTierEl.textContent = (quota.tier || 'free').toUpperCase();

      const limitMins = Number(quota.monthlyAudioMinutes) || 60;
      const usedMins = Number(month.systemAudioMinutes) || 0;
      const pctAudio = Math.min(100, Math.round((usedMins / limitMins) * 100));
      const audioTextEl = document.getElementById('dashQuotaAudioText');
      if (audioTextEl) audioTextEl.textContent = `${usedMins.toFixed(1)} / ${limitMins} min (${pctAudio}%)`;
      const audioBarEl = document.getElementById('dashQuotaAudioBar');
      if (audioBarEl) {
        audioBarEl.style.width = `${pctAudio}%`;
        if (pctAudio >= 100) audioBarEl.style.background = 'var(--danger, #ff6c4c)';
        else if (pctAudio >= 80) audioBarEl.style.background = '#f59e0b';
        else audioBarEl.style.background = 'var(--accent, #ffa946)';
      }

      const limitReqs = Number(quota.monthlyLlmRequests) || 500;
      const usedReqs = Number(month.systemRequests) || 0;
      const pctLlm = Math.min(100, Math.round((usedReqs / limitReqs) * 100));
      const llmTextEl = document.getElementById('dashQuotaLlmText');
      if (llmTextEl) llmTextEl.textContent = `${usedReqs} / ${limitReqs} reqs (${pctLlm}%)`;
      const llmBarEl = document.getElementById('dashQuotaLlmBar');
      if (llmBarEl) {
        llmBarEl.style.width = `${pctLlm}%`;
        if (pctLlm >= 100) llmBarEl.style.background = 'var(--danger, #ff6c4c)';
        else if (pctLlm >= 80) llmBarEl.style.background = '#f59e0b';
        else llmBarEl.style.background = 'var(--accent, #ffa946)';
      }

      // 2. Metrics Cards
      document.getElementById('dashTodayAudio').textContent = `${(today.audioMinutes || 0).toFixed(1)} min`;
      document.getElementById('dashTodayRequests').textContent = `${today.sttRequests || 0} dictations`;
      document.getElementById('dashTodayCost').textContent = `$${(today.totalCost || 0).toFixed(4)}`;

      document.getElementById('dashMonthAudio').textContent = `${(month.audioMinutes || 0).toFixed(1)} min`;
      document.getElementById('dashMonthRequests').textContent = `${month.sttRequests || 0} dictations`;
      document.getElementById('dashMonthCost').textContent = `$${(month.totalCost || 0).toFixed(4)}`;

      // Platform Cost vs BYOK Volume
      const platformCostEl = document.getElementById('dashPlatformCost');
      if (platformCostEl) platformCostEl.textContent = `$${(month.platformCost || 0).toFixed(4)}`;
      const sysAudioEl = document.getElementById('dashSystemAudioMins');
      if (sysAudioEl) sysAudioEl.textContent = `${(month.systemAudioMinutes || 0).toFixed(1)} min`;

      const byokCostEl = document.getElementById('dashByokCost');
      if (byokCostEl) byokCostEl.textContent = `$${(month.byokCost || 0).toFixed(4)}`;
      const byokAudioEl = document.getElementById('dashByokAudioMins');
      if (byokAudioEl) byokAudioEl.textContent = `${(month.byokAudioMinutes || 0).toFixed(1)} min`;
      const byokReqsEl = document.getElementById('dashByokRequests');
      if (byokReqsEl) byokReqsEl.textContent = `${month.byokRequests || 0}`;

      // 3. Provider Table
      const provTable = document.getElementById('dashProviderTableBody');
      if (provTable) {
        if (!data.breakdownByProvider || data.breakdownByProvider.length === 0) {
          provTable.innerHTML = `<tr><td colspan="5" class="empty-cell">No usage recorded yet.</td></tr>`;
        } else {
          provTable.innerHTML = data.breakdownByProvider.map(p => `
            <tr>
              <td><strong>${this.escapeHtml(p.provider)}</strong></td>
              <td>${p.requestCount}</td>
              <td>${p.audioMinutes} min</td>
              <td style="color: var(--success); font-weight: 500;">$${(p.platformCost || 0).toFixed(6)} <span class="badge-est">Est.</span></td>
              <td style="color: #818cf8; font-weight: 500;">$${(p.byokCost || 0).toFixed(6)} <span class="badge-est">Est.</span></td>
            </tr>
          `).join('');
        }
      }

      // 4. Model Table
      const modelTable = document.getElementById('dashModelTableBody');
      if (modelTable) {
        if (!data.breakdownByModel || data.breakdownByModel.length === 0) {
          modelTable.innerHTML = `<tr><td colspan="5" class="empty-cell">No usage recorded yet.</td></tr>`;
        } else {
          modelTable.innerHTML = data.breakdownByModel.map(m => `
            <tr>
              <td><strong>${this.escapeHtml(m.model)}</strong></td>
              <td><span class="cap-badge">${this.escapeHtml(m.type)}</span></td>
              <td>${m.requestCount}</td>
              <td>${m.type === 'transcription' ? `${m.audioMinutes} min` : `${(m.totalTokens || 0).toLocaleString()} tok`}</td>
              <td style="color: var(--success); font-weight: 500;">$${(m.estimatedCost || 0).toFixed(6)} <span class="badge-est">Est.</span></td>
            </tr>
          `).join('');
        }
      }

      // 5. Recent Usage History Table
      const historyTable = document.getElementById('dashRecentHistoryBody');
      if (historyTable && data.recentHistory) {
        if (data.recentHistory.length === 0) {
          historyTable.innerHTML = `<tr><td colspan="8" class="empty-cell">No events recorded yet.</td></tr>`;
        } else {
          historyTable.innerHTML = data.recentHistory.map(evt => {
            const time = new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isByok = evt.isByok;
            const sourceBadge = isByok
              ? `<span class="badge-byok">BYOK</span>`
              : `<span class="badge-system">Platform</span>`;
            const isSuccess = evt.status === 'success';
            const statusBadge = isSuccess
              ? `<span class="badge" style="background: rgba(52,211,153,0.15); color: #34d399; font-size: 11px; padding: 2px 8px; border-radius: 99px;">Success</span>`
              : `<span class="badge" style="background: rgba(255,108,76,0.15); color: #ff6c4c; font-size: 11px; padding: 2px 8px; border-radius: 99px;" title="${this.escapeHtml(evt.errorMessage || '')}">Failed</span>`;
            const costStr = isSuccess ? `$${(evt.userCost || 0).toFixed(6)} <span class="badge-est">Est.</span>` : '$0.000000';
            const usageMetric = evt.type === 'transcription' ? `${evt.audioSeconds}s` : `${evt.totalTokens || 0} tok`;

            return `
              <tr>
                <td style="font-size: 12px; color: var(--text-dim);">${time}</td>
                <td><span class="cap-badge">${this.escapeHtml(evt.type)}</span></td>
                <td><strong>${this.escapeHtml(evt.provider)}</strong> / <span style="font-size: 12px;">${this.escapeHtml(evt.model)}</span></td>
                <td>${usageMetric}</td>
                <td>${evt.latencyMs}ms</td>
                <td>${sourceBadge}</td>
                <td style="font-weight: 500;">${costStr}</td>
                <td>${statusBadge}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (e) {
      console.warn('Dashboard load failed:', e);
    }
  }

  async loadFullHistory() {
    const grid = document.getElementById('historyFullList');
    if (!grid) return;
    try {
      const res = await fetch('/api/history?limit=100');
      const items = await res.json();
      grid.replaceChildren();

      if (!items || items.length === 0) {
        grid.innerHTML = '<p class="empty-state">No dictation history found.</p>';
        return;
      }

      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-item';
        card.innerHTML = `
          <div class="history-item-meta" style="margin-bottom: 6px;">
            <span>${this.formatHistoryTime(item.timestamp)} · ${this.formatTone(item.tone)}</span>
            <span>${item.sttProvider || 'groq'} → ${item.llmProvider || 'none'}</span>
          </div>
          <div class="history-item-text" style="-webkit-line-clamp: 4;">
            ${this.escapeHtml(item.processedText || item.rawTranscript || '')}
          </div>
          <div class="history-item-meta" style="margin-top: 6px;">
            <span>Latency: ${item.totalLatencyMs || 0}ms</span>
            <span style="color: var(--success);">$${((item.cost || 0)).toFixed(6)}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          if (this.sandboxTextarea) this.sandboxTextarea.value = item.processedText || '';
          this.activateView('viewDictation');
        });
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<p class="empty-state">Failed to load history.</p>';
    }
  }

  async saveSettings() {
    const apiKeyGroq = this.settingsGroqKeyInput?.value.trim() || '';
    const apiKeyGemini = this.settingsGeminiKeyInput?.value.trim() || '';
    const apiKeyOpenai = this.settingsOpenaiKeyInput?.value.trim() || '';
    const soundEffectsVal = this.settingSoundEffectsInput ? this.settingSoundEffectsInput.checked : true;
    const autoCopyVal = this.settingAutoCopyInput ? this.settingAutoCopyInput.checked : true;
    const autoAppModeVal = this.settingAutoAppModeInput ? this.settingAutoAppModeInput.checked : true;
    const vadEnabledVal = this.settingVadEnabledInput ? this.settingVadEnabledInput.checked : true;
    const webhookUrlVal = this.settingWebhookUrlInput?.value.trim() || '';

    const sttProviderVal = this.settingSttProviderSelect?.value || this.currentSttProvider || 'groq';
    const sttModelVal = this.settingSttModelSelect?.value || this.currentSttModel || 'whisper-large-v3-turbo';
    const llmProviderVal = this.settingLlmProviderSelect?.value || this.currentLlmProvider || 'groq';
    const llmModelVal = this.settingLlmModelSelect?.value || this.currentLlmModel || 'openai/gpt-oss-20b';
    const transcriptionModeVal = this.settingTranscriptionModeSelect?.value || 'auto';
    const aiEnhancementVal = this.settingAiEnhancementSelect?.value || 'auto';

    this.currentSttProvider = sttProviderVal;
    this.currentSttModel = sttModelVal;
    this.currentLlmProvider = llmProviderVal;
    this.currentLlmModel = llmModelVal;
    this.currentAiEnhancement = aiEnhancementVal;

    this.soundEffects.setEnabled(soundEffectsVal);
    this.audioRecorder.setVadEnabled(vadEnabledVal);
    this.webhookUrl = webhookUrlVal;

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeyGroq,
          apiKeyGemini,
          apiKeyOpenai,
          sttProvider: sttProviderVal,
          sttModel: sttModelVal,
          llmProvider: llmProviderVal,
          llmModel: llmModelVal,
          soundEffects: soundEffectsVal,
          autoCopy: autoCopyVal,
          autoAppMode: autoAppModeVal,
          vadEnabled: vadEnabledVal,
          webhookUrl: webhookUrlVal,
          transcriptionMode: transcriptionModeVal,
          aiEnhancement: aiEnhancementVal
        })
      });
      this.soundEffects.playSuccess();
      this.closeSettingsModal();
      this.updateModelIndicatorUI();
      if (this.settingsGroqKeyInput) this.settingsGroqKeyInput.value = '';
      if (this.settingsOpenaiKeyInput) this.settingsOpenaiKeyInput.value = '';
      if (this.settingsGeminiKeyInput) this.settingsGeminiKeyInput.value = '';
      await this.loadByokKeys();
      this.loadModelHub();
      this.showToast('Settings saved successfully!');
    } catch (e) {
      alert('Failed to save settings: ' + e.message);
    }
  }

  // --- AUTHENTICATION & IDENTITY (Phase 1 SaaS) ---

  async checkAuthStatus() {
    const signInBtn = document.getElementById('headerSignInBtn');
    const userGroup = document.getElementById('headerUserGroup');
    const userName = document.getElementById('headerUserName');
    const userRoleBadge = document.getElementById('headerUserRoleBadge');
    const adminTab = document.getElementById('navTabAdmin');
    const avatarEl = document.getElementById('userAvatarText');

    const token = localStorage.getItem('mumble_auth_token');
    if (!token) {
      // User is not signed in
      this.currentUser = null;
      if (signInBtn) signInBtn.style.display = 'inline-flex';
      if (userGroup) userGroup.style.display = 'none';
      if (adminTab) adminTab.style.display = 'none';
      if (avatarEl) avatarEl.textContent = 'M';
      return;
    }

    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          this.currentUser = data.user;
          const initial = (data.user.name || 'U')[0].toUpperCase();
          if (avatarEl) avatarEl.textContent = initial;
          if (userName) userName.textContent = data.user.name || 'User';
          if (userRoleBadge) {
            userRoleBadge.textContent = data.user.role || 'user';
            userRoleBadge.style.display = data.user.role === 'admin' ? 'inline-block' : 'none';
          }

          if (signInBtn) signInBtn.style.display = 'none';
          if (userGroup) userGroup.style.display = 'flex';

          if (this.userBadgeBtn) {
            this.userBadgeBtn.title = `${data.user.name} (${data.user.email}) · ${data.user.role}`;
          }

          // Toggle Admin navigation tab based on role
          if (adminTab) {
            adminTab.style.display = data.user.role === 'admin' ? '' : 'none';
          }
          if (data.user.role === 'admin' && document.getElementById('viewAdmin')?.classList.contains('active')) {
            this.loadAdminPanel();
          }
          return;
        }
      } else {
        // Invalid or expired token
        localStorage.removeItem('mumble_auth_token');
      }
    } catch (e) {
      console.warn('Auth check skipped:', e.message);
    }

    // Default unauthenticated / local state
    this.currentUser = null;
    if (signInBtn) signInBtn.style.display = 'inline-flex';
    if (userGroup) userGroup.style.display = 'none';
    if (adminTab) adminTab.style.display = 'none';
    if (avatarEl) avatarEl.textContent = 'M';
    if (document.getElementById('viewAdmin')?.classList.contains('active')) {
      const authNotice = document.getElementById('adminAuthNotice');
      const mainContent = document.getElementById('adminMainContent');
      if (authNotice) authNotice.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
    }
  }

  setupAuthModal() {
    const signInBtn = document.getElementById('headerSignInBtn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.openAuthModal(true);
      });
    }

    const headerSignOutBtn = document.getElementById('headerSignOutBtn');
    if (headerSignOutBtn) {
      headerSignOutBtn.addEventListener('click', async () => {
        this.soundEffects.playClick();
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        localStorage.removeItem('mumble_auth_token');
        this.currentUser = null;
        this.showToast('Signed out');
        await this.checkAuthStatus();
        this.loadInitialSettings();
        if (document.getElementById('viewAdmin')?.classList.contains('active')) {
          document.querySelector('[data-view="viewDictation"]')?.click();
        }
      });
    }

    // Quick demo fills
    const quickAdmin = document.getElementById('quickFillAdminBtn');
    if (quickAdmin) {
      quickAdmin.addEventListener('click', () => {
        const emailInput = document.getElementById('loginEmail');
        const passInput = document.getElementById('loginPassword');
        if (emailInput) emailInput.value = 'admin@mumble.ai';
        if (passInput) passInput.value = 'AdminPassword123!';
        this.showToast('Admin credentials filled. Click Sign In');
      });
    }

    const quickUser = document.getElementById('quickFillUserBtn');
    if (quickUser) {
      quickUser.addEventListener('click', () => {
        const emailInput = document.getElementById('loginEmail');
        const passInput = document.getElementById('loginPassword');
        if (emailInput) emailInput.value = 'user@mumble.ai';
        if (passInput) passInput.value = 'UserPassword123!';
        this.showToast('User credentials filled. Click Sign In');
      });
    }

    if (this.userBadgeBtn && this.authModal) {
      this.userBadgeBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.openAuthModal();
      });
    }

    const closeBtn = document.getElementById('authCloseBtn');
    if (closeBtn && this.authModal) {
      closeBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.closeAuthModal();
      });
    }

    // Tab switching between Sign In & Create Account
    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');
    const formLogin = document.getElementById('authLoginForm');
    const formRegister = document.getElementById('authRegisterForm');

    if (tabLogin && tabRegister && formLogin && formRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabLogin.style.fontWeight = '700';
        tabRegister.classList.remove('active');
        tabRegister.style.fontWeight = '500';
        formLogin.style.display = 'block';
        formRegister.style.display = 'none';
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabRegister.style.fontWeight = '700';
        tabLogin.classList.remove('active');
        tabLogin.style.fontWeight = '500';
        formRegister.style.display = 'block';
        formLogin.style.display = 'none';
      });
    }

    // Login Form Submit
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;
        const submitBtn = document.getElementById('submitLoginBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Login failed');
          }

          localStorage.setItem('mumble_auth_token', data.token);
          this.currentUser = data.user;
          this.showToast(`Signed in as ${data.user.name}`);
          this.closeAuthModal();
          await this.checkAuthStatus();
          this.loadInitialSettings();
          this.loadHistory();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Register Form Submit
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName')?.value;
        const email = document.getElementById('regEmail')?.value;
        const password = document.getElementById('regPassword')?.value;
        const submitBtn = document.getElementById('submitRegisterBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Registration failed');
          }

          localStorage.setItem('mumble_auth_token', data.token);
          this.currentUser = data.user;
          this.showToast(`Account created! Welcome, ${data.user.name}`);
          this.closeAuthModal();
          await this.checkAuthStatus();
          this.loadInitialSettings();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Change Password Form Submit
    const changePassForm = document.getElementById('changePasswordForm');
    if (changePassForm) {
      changePassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('authCurrentPass')?.value;
        const newPassword = document.getElementById('authNewPass')?.value;
        const btn = document.getElementById('changePasswordBtn');
        if (btn) btn.disabled = true;

        try {
          const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Password update failed');
          }

          if (data.token) {
            localStorage.setItem('mumble_auth_token', data.token);
          }
          this.showToast('Password updated successfully');
          changePassForm.reset();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('authLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        localStorage.removeItem('mumble_auth_token');
        this.currentUser = null;
        this.showToast('Signed out');
        this.closeAuthModal();
        await this.checkAuthStatus();
        this.loadInitialSettings();
        if (document.getElementById('viewAdmin')?.classList.contains('active')) {
          document.querySelector('[data-view="viewDictation"]')?.click();
        }
      });
    }

    // Switch Account
    const switchBtn = document.getElementById('authSwitchBtn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        const profileSec = document.getElementById('authProfileSection');
        const formSec = document.getElementById('authFormSection');
        if (profileSec && formSec) {
          profileSec.style.display = 'none';
          formSec.style.display = 'block';
        }
      });
    }

    // Close on background click
    window.addEventListener('click', (e) => {
      if (e.target === this.authModal) {
        this.closeAuthModal();
      }
    });
  }

  openAuthModal(forceForm = false) {
    if (!this.authModal) return;
    const profileSec = document.getElementById('authProfileSection');
    const formSec = document.getElementById('authFormSection');

    if (this.currentUser && !forceForm) {
      if (profileSec) profileSec.style.display = 'block';
      if (formSec) formSec.style.display = 'none';

      const nameEl = document.getElementById('authProfileName');
      const emailEl = document.getElementById('authProfileEmail');
      const roleEl = document.getElementById('authProfileRole');
      const statusEl = document.getElementById('authProfileStatus');
      const avatarEl = document.getElementById('authProfileAvatar');

      if (nameEl) nameEl.textContent = this.currentUser.name || 'User';
      if (emailEl) emailEl.textContent = this.currentUser.email || '';
      if (roleEl) roleEl.textContent = this.currentUser.role || 'user';
      if (statusEl) statusEl.textContent = this.currentUser.status || 'active';
      if (avatarEl) avatarEl.textContent = (this.currentUser.name || 'U')[0].toUpperCase();
    } else {
      if (profileSec) profileSec.style.display = 'none';
      if (formSec) formSec.style.display = 'block';
      document.getElementById('authTabLogin')?.click();
    }

    this.authModal.classList.add('is-open', 'active');
  }

  closeAuthModal() {
    if (!this.authModal) return;
    this.authModal.classList.remove('is-open', 'active');
  }

  // --- ADMIN PANEL (Phase 1 SaaS & Phase 3 Telemetry) ---

  setupAdminPanel() {
    const refreshBtn = document.getElementById('adminRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.loadAdminPanel();
      });
    }

    const loginPromptBtn = document.getElementById('adminLoginPromptBtn');
    if (loginPromptBtn) {
      loginPromptBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.openAuthModal();
      });
    }

    const searchInput = document.getElementById('adminUserSearch');
    const filterSelect = document.getElementById('adminUserFilter');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const fVal = filterSelect?.value || 'genuine';
        debounceTimer = setTimeout(() => this.loadAdminUsers(e.target.value, fVal), 250);
      });
    }
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const searchVal = searchInput?.value || '';
        this.loadAdminUsers(searchVal, e.target.value);
      });
    }

    // Bind Quota Modal events
    const quotaModal = document.getElementById('adminQuotaModal');
    const quotaForm = document.getElementById('adminQuotaForm');
    const quotaCancel = document.getElementById('quotaModalCancelBtn');
    const tierSelect = document.getElementById('quotaTierSelect');

    if (quotaCancel && quotaModal) {
      quotaCancel.addEventListener('click', () => {
        quotaModal.style.display = 'none';
      });
    }

    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        const t = e.target.value;
        const audioInp = document.getElementById('quotaAudioLimit');
        const llmInp = document.getElementById('quotaLlmLimit');
        if (t === 'pro') {
          if (audioInp) audioInp.value = 1000;
          if (llmInp) llmInp.value = 10000;
        } else if (t === 'business') {
          if (audioInp) audioInp.value = 5000;
          if (llmInp) llmInp.value = 50000;
        } else {
          if (audioInp) audioInp.value = 60;
          if (llmInp) llmInp.value = 500;
        }
      });
    }

    if (quotaForm) {
      quotaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('quotaModalUserId').value;
        const tier = document.getElementById('quotaTierSelect').value;
        const monthlyAudioMinutes = Number(document.getElementById('quotaAudioLimit').value) || 60;
        const monthlyLlmRequests = Number(document.getElementById('quotaLlmLimit').value) || 500;
        const monthlyBudgetUsd = Number(document.getElementById('quotaBudgetLimit').value) || 0;
        await this.saveUserQuota(userId, { tier, monthlyAudioMinutes, monthlyLlmRequests, monthlyBudgetUsd });
      });
    }
  }

  async loadAdminPanel() {
    const authNotice = document.getElementById('adminAuthNotice');
    const mainContent = document.getElementById('adminMainContent');
    const spinner = document.getElementById('adminRefreshSpinner');

    if (spinner) spinner.style.display = 'inline-block';

    try {
      // Check auth status first by pinging /api/admin/stats
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.status === 401 || statsRes.status === 403) {
        if (authNotice) authNotice.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
        return;
      }

      if (authNotice) authNotice.style.display = 'none';
      if (mainContent) mainContent.style.display = 'block';

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) {
          this.renderAdminStats(statsData);
        }
      }

      const searchVal = document.getElementById('adminUserSearch')?.value || '';
      const filterVal = document.getElementById('adminUserFilter')?.value || 'genuine';

      await Promise.allSettled([
        this.loadAdminConfig(),
        this.loadAdminUsers(searchVal, filterVal),
        this.loadAdminUsageTelemetry()
      ]);
    } catch (e) {
      console.warn('Failed to load admin panel:', e.message);
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  }

  renderAdminStats(data) {
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const totalGenuine = data.users.genuineCount !== undefined ? data.users.genuineCount : data.users.total;
    setEl('adminTotalUsers', totalGenuine);
    setEl('adminActiveUsers', `${data.users.active} active${data.users.testRecordsCount ? ` (${data.users.testRecordsCount} test rows)` : ''}`);
    setEl('adminSuspendedUsers', `${data.users.suspended} suspended`);
    setEl('adminTotalDictations', data.usage.totalDictations);
    setEl('adminAudioMinutes', `${data.usage.totalAudioMinutes}m`);
    setEl('adminTotalTokens', (data.usage.totalTokens || 0).toLocaleString());
    setEl('adminTotalCost', `$${(data.usage.totalEstimatedCost || 0).toFixed(4)}`);
    setEl('adminUptime', `Uptime: ${data.system.uptimeFormatted}`);
    setEl('adminMemory', `Memory: ${data.system.memoryMb} MB`);
    const healthEl = document.getElementById('adminSystemHealth');
    if (healthEl) {
      healthEl.textContent = data.system.status === 'healthy' ? 'Healthy' : 'Degraded';
      healthEl.style.color = data.system.status === 'healthy' ? 'var(--success, #34d399)' : 'var(--danger, #ff6c4c)';
    }
  }

  async loadAdminStats() {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;
      this.renderAdminStats(data);
    } catch (e) {
      console.warn('Failed to load admin stats:', e.message);
    }
  }

  async loadAdminConfig() {
    try {
      const res = await fetch('/api/admin/config');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setEl('adminConfStt', (data.defaults?.sttProvider || 'groq').toUpperCase());
      setEl('adminConfSttModel', data.defaults?.sttModel || 'whisper-large-v3-turbo');
      setEl('adminConfLlm', (data.defaults?.llmProvider || 'groq').toUpperCase());
      setEl('adminConfLlmModel', data.defaults?.llmModel || 'openai/gpt-oss-20b');
      setEl('adminConfTone', data.defaults?.defaultTone || 'casual');

      setEl('adminKeyGroq', data.keyStatus?.hasGroqKey ? '✓ Active & Available' : '⚠️ Missing (set GROQ_API_KEY)');
      setEl('adminKeyGemini', data.keyStatus?.hasGeminiKey ? '✓ Active & Available' : '⚠️ Not configured');
      setEl('adminKeyOpenai', data.keyStatus?.hasOpenaiKey ? '✓ Active & Available' : '⚠️ Not configured');

      setEl('adminDiagNode', data.system?.nodeVersion || 'Node.js 20+');
      setEl('adminDiagPlatform', data.system?.platform || 'POSIX / Host');
      setEl('adminDiagMemory', `${data.system?.memoryMb || 0} MB (RSS)`);
      setEl('adminDiagEnv', data.environment || 'development');
      setEl('adminSttCatalogCount', `${data.catalogs?.sttModelCount || 0} Models`);
      setEl('adminLlmCatalogCount', `${data.catalogs?.llmModelCount || 0} Models`);
    } catch (e) {
      console.warn('Failed to load admin config:', e.message);
    }
  }

  async loadAdminUsers(searchQuery = '', filterType = '') {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    if (!filterType) {
      filterType = document.getElementById('adminUserFilter')?.value || 'genuine';
    }

    tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="text-align: center; padding: 2rem;">
      <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px;">↻</span> Loading accounts...
    </td></tr>`;

    try {
      const url = `/api/admin/users?limit=50&filter=${encodeURIComponent(filterType)}&search=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = res.status === 401 || res.status === 403 ? 'Admin access required' : `Server error (${res.status})`;
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="text-align: center; color: var(--danger); padding: 2rem;">
          <div style="margin-bottom: 0.5rem;">⚠️ ${errText}</div>
          <button type="button" class="btn-quiet btn-xs" id="adminUsersRetryBtn">Retry</button>
        </td></tr>`;
        document.getElementById('adminUsersRetryBtn')?.addEventListener('click', () => this.loadAdminUsers(searchQuery, filterType));
        return;
      }
      const data = await res.json();
      if (!data.success || !Array.isArray(data.users) || data.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="text-align: center; padding: 2rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">👥</div>
          <div>${searchQuery ? `No user accounts found matching "${this.escapeHtml(searchQuery)}"` : 'No user accounts found for selected filter.'}</div>
        </td></tr>`;
        return;
      }

      tbody.innerHTML = '';
      data.users.forEach(u => {
        const tr = document.createElement('tr');
        const isSelf = this.currentUser && this.currentUser.id === u.id;
        const isActive = u.status === 'active';
        const isAdmin = u.role === 'admin';

        const statusBadge = isActive
          ? `<span class="badge" style="background: var(--success-bg, rgba(52,211,153,0.15)); color: var(--success, #34d399); font-size: 11px; padding: 2px 8px; border-radius: 99px;">Active</span>`
          : `<span class="badge" style="background: var(--danger-bg, rgba(255,108,76,0.15)); color: var(--danger, #ff6c4c); font-size: 11px; padding: 2px 8px; border-radius: 99px;">Suspended</span>`;

        const roleBadge = isAdmin
          ? `<span class="badge" style="background: var(--accent-subtle, rgba(255,169,70,0.15)); color: var(--accent-hover, #e8952e); font-size: 11px; padding: 2px 8px; border-radius: 99px;">Admin</span>`
          : `<span class="badge" style="background: var(--bg-elevated, #f5f4f0); color: var(--text-muted); font-size: 11px; padding: 2px 8px; border-radius: 99px;">User</span>`;

        const testBadge = u.isTestAccount
          ? `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 10px; padding: 2px 6px; border-radius: 99px; margin-left: 6px;">Test Record</span>`
          : `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #0284c7; font-size: 10px; padding: 2px 6px; border-radius: 99px; margin-left: 6px;">Genuine</span>`;

        const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-';
        const tierBadge = `<span class="cap-badge">${this.escapeHtml((u.quota?.tier || 'free').toUpperCase())}</span>`;
        const usageText = u.stats ? `${tierBadge} ${u.stats.dictationsCount} dict · ${u.stats.audioMinutes}m` : tierBadge;

        tr.innerHTML = `
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-weight: 600;">${this.escapeHtml(u.name)}</span>
              ${testBadge}
            </div>
            <div class="hint" style="font-size: 12px;">${this.escapeHtml(u.email)}</div>
          </td>
          <td>${roleBadge}</td>
          <td>${statusBadge}</td>
          <td style="font-size: 13px;">${createdDate}</td>
          <td style="font-size: 13px;">${usageText}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
              <button type="button" class="btn-quiet btn-xs edit-quota-btn" data-id="${u.id}" data-email="${u.email}">
                Quota
              </button>
              <button type="button" class="btn-quiet btn-xs toggle-status-btn" data-id="${u.id}" data-target-status="${isActive ? 'suspended' : 'active'}" ${isSelf ? 'disabled title="Cannot modify self"' : ''}>
                ${isActive ? 'Suspend' : 'Activate'}
              </button>
              <button type="button" class="btn-quiet btn-xs toggle-role-btn" data-id="${u.id}" data-target-role="${isAdmin ? 'user' : 'admin'}" ${isSelf ? 'disabled title="Cannot modify self"' : ''}>
                ${isAdmin ? 'Demote' : 'Promote'}
              </button>
            </div>
          </td>
        `;

        // Bind Action buttons
        const quotaBtn = tr.querySelector('.edit-quota-btn');
        if (quotaBtn) {
          quotaBtn.addEventListener('click', () => {
            this.openQuotaModal(u);
          });
        }

        const statusBtn = tr.querySelector('.toggle-status-btn');
        if (statusBtn && !isSelf) {
          statusBtn.addEventListener('click', async () => {
            const newStatus = statusBtn.dataset.targetStatus;
            if (!confirm(`Are you sure you want to ${newStatus} account ${u.email}?`)) return;
            await this.updateUserStatus(u.id, newStatus);
          });
        }

        const roleBtn = tr.querySelector('.toggle-role-btn');
        if (roleBtn && !isSelf) {
          roleBtn.addEventListener('click', async () => {
            const newRole = roleBtn.dataset.targetRole;
            if (!confirm(`Are you sure you want to change ${u.email} to ${newRole}?`)) return;
            await this.updateUserRole(u.id, newRole);
          });
        }

        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="text-align: center; color: var(--danger); padding: 2rem;">
        <div style="margin-bottom: 0.5rem;">⚠️ Failed to load users: ${this.escapeHtml(e.message)}</div>
        <button type="button" class="btn-quiet btn-xs" id="adminUsersRetryBtn">Retry</button>
      </td></tr>`;
      document.getElementById('adminUsersRetryBtn')?.addEventListener('click', () => this.loadAdminUsers(searchQuery));
    }
  }

  async loadAdminUsageTelemetry() {
    const provTable = document.getElementById('adminProviderCostsTableBody');
    const failTable = document.getElementById('adminFailuresTableBody');

    if (provTable) {
      provTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; padding: 1.5rem;">
        <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px;">↻</span> Loading provider telemetry...
      </td></tr>`;
    }
    if (failTable) {
      failTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; padding: 1.5rem;">
        <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px;">↻</span> Loading reliability telemetry...
      </td></tr>`;
    }

    try {
      const res = await fetch('/api/admin/usage');
      if (!res.ok) {
        const errMsg = res.status === 401 || res.status === 403 ? 'Admin access required' : `Server error (${res.status})`;
        if (provTable) {
          provTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; color: var(--danger); padding: 1.5rem;">
            <div style="margin-bottom: 0.5rem;">⚠️ ${errMsg}</div>
            <button type="button" class="btn-quiet btn-xs" id="adminUsageRetryBtn">Retry</button>
          </td></tr>`;
          document.getElementById('adminUsageRetryBtn')?.addEventListener('click', () => this.loadAdminUsageTelemetry());
        }
        if (failTable) {
          failTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; color: var(--danger); padding: 1.5rem;">⚠️ ${errMsg}</td></tr>`;
        }
        return;
      }
      const data = await res.json();
      if (!data.success) return;

      // 1. Populate Provider Costs Table
      if (provTable) {
        if (!data.providerCosts || data.providerCosts.length === 0) {
          provTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; padding: 1.5rem;">
            <div style="font-size: 1.25rem; margin-bottom: 0.25rem;">📊</div>
            <div>No provider activity recorded for this billing cycle.</div>
          </td></tr>`;
        } else {
          provTable.innerHTML = data.providerCosts.map(p => `
            <tr>
              <td><strong>${this.escapeHtml(p.provider)}</strong></td>
              <td>${p.totalRequests}</td>
              <td>${p.audioMinutes}m</td>
              <td>${(p.totalTokens || 0).toLocaleString()}</td>
              <td style="color: var(--success, #34d399); font-weight: 600;">$${(p.platformCost || 0).toFixed(4)} <span class="badge-est">Est.</span></td>
              <td style="color: #818cf8; font-weight: 600;">$${(p.byokCost || 0).toFixed(4)} <span class="badge-est">Est.</span></td>
              <td>${p.failures > 0 ? `<span style="color: var(--danger, #ff6c4c); font-weight: 600;">${p.failures}</span>` : '0'}</td>
            </tr>
          `).join('');
        }
      }

      // 2. Populate Failures Table
      if (failTable) {
        if (!data.recentFailures || data.recentFailures.length === 0) {
          failTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; color: var(--success, #34d399); padding: 1.5rem;">
            <span style="font-weight: 600; font-size: 1.1rem; margin-right: 4px;">✓</span> Zero system failures recorded. All services operational.
          </td></tr>`;
        } else {
          failTable.innerHTML = data.recentFailures.map(f => {
            const time = f.createdAt ? new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
            return `
              <tr>
                <td style="font-size: 12px; color: var(--text-dim);">${time}</td>
                <td>${this.escapeHtml(f.userEmail || f.userId || 'Unknown')}</td>
                <td><span class="cap-badge">${this.escapeHtml(f.type || 'dictation')}</span></td>
                <td>${this.escapeHtml(f.provider)} / ${this.escapeHtml(f.model)}</td>
                <td>${f.latencyMs || 0}ms</td>
                <td>${f.isByok ? '<span class="badge-byok">BYOK</span>' : '<span class="badge-system">Platform</span>'}</td>
                <td style="color: var(--danger, #ff6c4c); font-size: 12px;" title="${this.escapeHtml(f.errorMessage || '')}">
                  ${this.escapeHtml(f.errorMessage || 'Operation failed')}
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (e) {
      if (provTable) {
        provTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; color: var(--danger); padding: 1.5rem;">
          <div style="margin-bottom: 0.5rem;">⚠️ Failed to load provider telemetry: ${this.escapeHtml(e.message)}</div>
          <button type="button" class="btn-quiet btn-xs" id="adminUsageRetryBtn">Retry</button>
        </td></tr>`;
        document.getElementById('adminUsageRetryBtn')?.addEventListener('click', () => this.loadAdminUsageTelemetry());
      }
      if (failTable) {
        failTable.innerHTML = `<tr><td colspan="7" class="table-empty" style="text-align: center; color: var(--danger); padding: 1.5rem;">⚠️ Failed to load failure log</td></tr>`;
      }
    }
  }

  openQuotaModal(user) {
    const modal = document.getElementById('adminQuotaModal');
    if (!modal) return;
    document.getElementById('quotaModalUserId').value = user.id;
    document.getElementById('quotaModalUserEmail').textContent = user.email;
    const tier = user.quota?.tier || 'free';
    document.getElementById('quotaTierSelect').value = tier;
    document.getElementById('quotaAudioLimit').value = user.quota?.monthlyAudioMinutes || 60;
    document.getElementById('quotaLlmLimit').value = user.quota?.monthlyLlmRequests || 500;
    document.getElementById('quotaBudgetLimit').value = user.quota?.monthlyBudgetUsd || 0;
    modal.style.display = 'flex';
  }

  async saveUserQuota(userId, quotaData) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/quota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotaData)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update quota');
      }
      this.showToast('Quota updated successfully');
      document.getElementById('adminQuotaModal').style.display = 'none';
      await this.loadAdminUsers();
      await this.loadAdminUsageTelemetry();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  async updateUserStatus(userId, status) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update status');
      }
      this.showToast(`User status updated to ${status}`);
      await this.loadAdminUsers();
      await this.loadAdminStats();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  async updateUserRole(userId, role) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update role');
      }
      this.showToast(`User role updated to ${role}`);
      await this.loadAdminUsers();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 160ms ease-out';
      setTimeout(() => toast.remove(), 160);
    }, 3200);
  }
}

// Bootstrap when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.mumbleAI = new WhisperFlowApp();
  window.whisperFlow = window.mumbleAI;
});

