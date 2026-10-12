/**
 * WhisperFlow API Client & Web Speech Fallback Driver
 */

function getFilenameForMime(mimeType) {
  if (!mimeType) return 'recording.webm';
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'recording.m4a';
  if (lower.includes('wav')) return 'recording.wav';
  if (lower.includes('ogg') || lower.includes('opus')) return 'recording.ogg';
  if (lower.includes('mp3') || lower.includes('mpeg')) return 'recording.mp3';
  return 'recording.webm';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs / 1000}s`));
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export class ZeroEditClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Send audio blob to /api/dictate
   */
  async sendAudioDictation(audioBlob, mimeType, options = {}) {
    const filename = getFilenameForMime(mimeType || audioBlob.type);
    const clientSentAt = Date.now();

    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    formData.append('sttProvider', options.sttProvider || 'groq');
    if (options.sttModel) formData.append('sttModel', options.sttModel);
    formData.append('llmProvider', options.llmProvider || 'groq');
    if (options.llmModel) formData.append('llmModel', options.llmModel);
    formData.append('tone', options.tone || 'casual');
    formData.append('appName', options.appName || 'General');
    formData.append('language', options.language || 'auto');
    formData.append('clientSentAt', clientSentAt.toString());

    if (options.apiKeyGroq) formData.append('apiKeyGroq', options.apiKeyGroq);
    if (options.apiKeyGemini) formData.append('apiKeyGemini', options.apiKeyGemini);
    if (options.apiKeyOpenai) formData.append('apiKeyOpenai', options.apiKeyOpenai);

    const response = await fetchWithTimeout(`${this.baseUrl}/api/dictate`, {
      method: 'POST',
      body: formData
    }, 25000);

    const clientRoundtripMs = Date.now() - clientSentAt;
    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.statusText || 'Failed to parse response' };
    }

    if (!response.ok) {
      throw new Error(data.error || 'Dictation API failed');
    }

    data.clientRoundtripMs = clientRoundtripMs;
    return data;
  }

  /**
   * Send audio blob to /api/transcribe (raw transcription only)
   */
  async transcribeAudio(audioBlob, mimeType, options = {}) {
    const filename = getFilenameForMime(mimeType || audioBlob.type);
    const clientSentAt = Date.now();

    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    formData.append('sttProvider', options.sttProvider || 'groq');
    formData.append('language', options.language || 'auto');
    formData.append('clientSentAt', clientSentAt.toString());

    if (options.apiKeyGroq) formData.append('apiKeyGroq', options.apiKeyGroq);
    if (options.apiKeyGemini) formData.append('apiKeyGemini', options.apiKeyGemini);

    const response = await fetchWithTimeout(`${this.baseUrl}/api/transcribe`, {
      method: 'POST',
      body: formData
    }, 25000);

    const clientRoundtripMs = Date.now() - clientSentAt;
    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.statusText || 'Failed to parse response' };
    }
    if (!response.ok) {
      throw new Error(data.error || 'Transcription API failed');
    }

    data.clientRoundtripMs = clientRoundtripMs;
    return data;
  }

  /**
   * Process raw text through Zero-Edit Engine
   */
  async processText(text, options = {}) {
    const response = await fetchWithTimeout(`${this.baseUrl}/api/process-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        tone: options.tone || 'casual',
        appName: options.appName || 'General',
        llmProvider: options.llmProvider || 'groq',
        apiKeyGroq: options.apiKeyGroq,
        apiKeyGemini: options.apiKeyGemini
      })
    }, 20000);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.statusText || 'Failed to parse response' };
    }
    if (!response.ok) {
      throw new Error(data.error || 'Text processing failed');
    }
    return data;
  }

  /**
   * Execute voice command on highlighted text
   */
  async executeCommand(instruction, selectedText, options = {}) {
    const response = await fetchWithTimeout(`${this.baseUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        selectedText,
        llmProvider: options.llmProvider || 'groq',
        apiKeyGroq: options.apiKeyGroq,
        apiKeyGemini: options.apiKeyGemini
      })
    }, 20000);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.statusText || 'Failed to parse response' };
    }
    if (!response.ok) {
      throw new Error(data.error || 'Command execution failed');
    }
    return data;
  }

  /**
   * Summarize meeting
   */
  async summarizeMeeting(transcript, options = {}) {
    const response = await fetchWithTimeout(`${this.baseUrl}/api/notetaker/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        title: options.title || 'Meeting Notes',
        participants: options.participants || ['Stephen', 'Nathalie', 'Mikel'],
        llmProvider: options.llmProvider || 'groq',
        apiKeyGroq: options.apiKeyGroq,
        apiKeyGemini: options.apiKeyGemini
      })
    }, 25000);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.statusText || 'Failed to parse response' };
    }
    if (!response.ok) {
      throw new Error(data.error || 'Meeting summarization failed');
    }
    return data;
  }

  /**
   * Native Browser Web Speech API Driver
   * Zero API key required, runs instantly in Chrome/Edge/Safari
   */
  startWebSpeechRecognition(onResult, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Web Speech API is not supported in this browser. Please use Groq or Gemini audio recording.');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = (event) => {
      if (onError) onError(event.error);
    };

    recognition.start();
    return recognition;
  }
}

export const zeroEditClient = new ZeroEditClient();
