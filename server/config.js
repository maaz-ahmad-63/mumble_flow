import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from project root regardless of cwd
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT, 10) || 3050,
  host: process.env.HOST || '0.0.0.0',
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  dataDir: path.join(__dirname, '..', 'data'),
  clientDir: path.join(__dirname, '..', 'client'),

  productName: 'Mumble AI',
  productTagline: 'Your voice, anywhere.',

  // API Keys
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Provider Defaults
  defaultSttProvider: process.env.DEFAULT_STT_PROVIDER || 'groq',
  defaultSttModel: process.env.DEFAULT_STT_MODEL || 'whisper-large-v3-turbo',
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'groq',
  defaultLlmModel: process.env.DEFAULT_LLM_MODEL || 'openai/gpt-oss-20b',
  defaultTone: process.env.DEFAULT_TONE || 'casual',
  autoCopyClipboard: process.env.AUTO_COPY_CLIPBOARD !== 'false',

  // Local Self-Hosted Whisper / LLM Endpoints
  localWhisperUrl: process.env.LOCAL_WHISPER_URL || 'http://localhost:8000/v1/audio/transcriptions',
  localWhisperModel: process.env.LOCAL_WHISPER_MODEL || 'whisper-1',
  localLlmUrl: process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1',
  localLlmModel: process.env.LOCAL_LLM_MODEL || 'llama3.2',

  // Model Specifications
  models: {
    groqSTT: 'whisper-large-v3-turbo',
    groqSTTFallback: 'whisper-large-v3',
    groqLLM: 'openai/gpt-oss-20b',
    groqLLMFallback: 'openai/gpt-oss-120b',
    geminiSTT: 'gemini-3.6-flash',
    geminiLLM: 'gemini-3.6-flash'
  },

  // Streaming WebSocket Config
  streaming: {
    enabled: true,
    path: '/ws/dictate'
  }
};
