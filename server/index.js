// Load .env before service imports. storageService reads provider defaults at import time.
import 'dotenv/config';
import dns from 'node:dns';

// Ensure IPv4 is preferred over IPv6 for dual-stack hosts (prevents ENETUNREACH on IPv4-only cloud hosts like Render)
if (dns && typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { initializeDatabase, isPostgres } from './db/index.js';
import { transcriptionService } from './services/transcriptionService.js';
import { textProcessingService } from './services/textProcessingService.js';
import { providerRegistry } from './providers/ProviderRegistry.js';
import { StreamingDictationServer } from './streaming/streamingDictationServer.js';
import { notetakerService } from './services/notetakerService.js';
import { storage } from './services/storageService.js';
import { resolveTone } from './services/appToneService.js';
import { logger } from './services/logger.js';
import { normalizeAudioFile, cleanOrphanedUploads } from './utils/audioUtils.js';

import { authService } from './services/authService.js';
import { usageService } from './services/usageService.js';
import { quotaService } from './services/quotaService.js';
import { pricingService } from './services/pricingService.js';
import { modelCatalogService } from './services/modelCatalogService.js';
import { apiKeyService } from './services/apiKeyService.js';
import { requireAuth, optionalAuth, requireAdmin } from './middleware/authMiddleware.js';
import { userRepository } from './db/repositories/userRepository.js';
import { usageRepository } from './db/repositories/usageRepository.js';
import { createCorsMiddleware } from './middleware/corsMiddleware.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { requestSecurityHeaders, errorHandler } from './middleware/requestValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = config.uploadsDir || path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Clean orphaned temporary files on startup and periodically
cleanOrphanedUploads(UPLOADS_DIR);
setInterval(() => cleanOrphanedUploads(UPLOADS_DIR), 15 * 60 * 1000).unref();

// Multer storage with explicit audio extension preservation for Groq/Gemini compatibility
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ext || ext === '.') {
      if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav') ext = '.wav';
      else if (file.mimetype === 'audio/mp4' || file.mimetype === 'audio/m4a') ext = '.m4a';
      else if (file.mimetype === 'audio/ogg') ext = '.ogg';
      else if (file.mimetype === 'audio/mp3' || file.mimetype === 'audio/mpeg') ext = '.mp3';
      else ext = '.webm';
    }
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage: storageConfig,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max audio limit
});

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (config.port || 3050);

// Security & API middlewares
app.use(requestSecurityHeaders);
app.use(createCorsMiddleware());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiters
const standardLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 180 });
const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Too many authentication attempts. Please try again later.' });
const dictateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });

app.use('/api/', standardLimiter);

// Structured API request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/api/health') {
      logger.api(req.method, req.path, res.statusCode, elapsed);
    }
  });
  next();
});

// Serve static frontend files
const CLIENT_DIR = config.clientDir || path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_DIR));

// Dedicated routes for marketing website (DESIGN.md inspired)
app.get(['/business', '/website'], (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'website.html'));
});

// ==========================================
// 0. AUTHENTICATION & IDENTITY ENDPOINTS
// ==========================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register({ email, password, name });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'REGISTRATION_FAILED' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ error: err.message, code: 'AUTH_FAILED' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    if (token) {
      authService.logout(token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No active session token' });
  }
  const user = await authService.validateToken(token);
  if (!user) {
    return res.status(401).json({ authenticated: false, error: 'Invalid or expired session token' });
  }
  const profile = await authService.getUserProfile(user.id);
  if (!profile) {
    return res.status(404).json({ error: 'User profile not found' });
  }
  res.json({ success: true, ...profile });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user.id, { currentPassword, newPassword });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'PASSWORD_CHANGE_FAILED' });
  }
});

// ==========================================
// 0.1 ADMIN MANAGEMENT ENDPOINTS (Phase 1 SaaS)
// ==========================================

// List users with status, role, and usage summary (Admin only)
function isTestAccountRecord(u) {
  if (!u) return false;
  const email = (u.email || '').toLowerCase().trim();
  const id = (u.id || '').toLowerCase().trim();
  return Boolean(
    email.endsWith('@test.com') ||
    email.endsWith('@example.com') ||
    id.startsWith('usr_test_') ||
    id.startsWith('usr_p3_') ||
    id.startsWith('usr_concurrent_') ||
    id.startsWith('usr_byok_') ||
    id.startsWith('usr_stream_') ||
    /^(usera_|userb_|hub_|bob_|quota_|conc_|stream_|p3_|saas_)\d+@/.test(email)
  );
}

// List users with status, role, quota, and test account flag (Admin only)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all'; // 'genuine' | 'test' | 'all'

    const users = await userRepository.findAll({ limit: 500, offset: 0, search });

    // Enrich users with usage statistics, quota, and genuine/test account categorization
    let enriched = await Promise.all((users || []).map(async (u) => {
      const stats = await userRepository.getUserStatsSummary(u.id);
      const quota = await quotaService.getUserQuota(u.id);
      const isTestAccount = isTestAccountRecord(u);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status || 'active',
        isTestAccount,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        stats,
        quota
      };
    }));

    if (filter === 'genuine') {
      enriched = enriched.filter(u => !u.isTestAccount);
    } else if (filter === 'test') {
      enriched = enriched.filter(u => u.isTestAccount);
    }

    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);

    res.json({
      success: true,
      users: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user status: 'active' | 'suspended' (Admin only)
app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or suspended' });
    }

    // Safety guard: Admin cannot suspend their own account
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Administrators cannot suspend their own account' });
    }

    const updated = await userRepository.update(targetUserId, { status });
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If suspended, invalidate all active sessions immediately
    if (status === 'suspended') {
      await userRepository.deleteAllUserSessions(targetUserId);
    }

    res.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        status: updated.status || status
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user role: 'user' | 'admin' (Admin only)
app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or admin' });
    }

    // Safety guard: Admin cannot demote their own account
    if (targetUserId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote your own administrator account' });
    }

    const updated = await userRepository.update(targetUserId, { role });
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        status: updated.status || 'active'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System-wide usage and health statistics (Admin only)
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allUsers = (await userRepository.findAll({ limit: 10000, offset: 0 })) || [];
    const totalUsers = allUsers.length;
    const genuineUsers = allUsers.filter(u => !isTestAccountRecord(u));
    const testRecords = allUsers.filter(u => isTestAccountRecord(u));
    const activeUsers = genuineUsers.filter(u => u.status === 'active').length;
    const suspendedUsers = genuineUsers.filter(u => u.status === 'suspended').length;
    const systemUsage = await usageRepository.getGlobalSystemStats();
    const uptimeSeconds = Math.floor(process.uptime());
    const mem = process.memoryUsage();

    res.json({
      success: true,
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        genuineCount: genuineUsers.length,
        testRecordsCount: testRecords.length
      },
      usage: systemUsage,
      system: {
        uptimeSeconds,
        uptimeFormatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
        memoryMb: Math.round(mem.rss / (1024 * 1024)),
        nodeVersion: process.version,
        platform: process.platform,
        status: 'healthy'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Platform-level configuration overview (Admin only - safe metadata only, zero secrets)
app.get('/api/admin/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const sttCatalog = modelCatalogService.getSttModels();
    const llmCatalog = modelCatalogService.getLlmModels();

    res.json({
      success: true,
      defaults: {
        sttProvider: config.defaultSttProvider || 'groq',
        sttModel: config.defaultSttModel || 'whisper-large-v3-turbo',
        llmProvider: config.defaultLlmProvider || 'groq',
        llmModel: config.defaultLlmModel || 'openai/gpt-oss-20b',
        defaultTone: config.defaultTone || 'casual'
      },
      keyStatus: {
        hasGroqKey: Boolean(process.env.GROQ_API_KEY || config.groqApiKey),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || config.geminiApiKey),
        hasOpenaiKey: Boolean(process.env.OPENAI_API_KEY || config.openaiApiKey)
      },
      apiKeysConfigured: {
        groq: Boolean(process.env.GROQ_API_KEY || config.groqApiKey),
        gemini: Boolean(process.env.GEMINI_API_KEY || config.geminiApiKey),
        openai: Boolean(process.env.OPENAI_API_KEY || config.openaiApiKey)
      },
      catalogs: {
        sttModelCount: sttCatalog.length,
        llmModelCount: llmCatalog.length,
        sttModels: sttCatalog,
        llmModels: llmCatalog
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        environment: process.env.NODE_ENV || 'development'
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. RAW TRANSCRIPTION: Audio -> Raw Transcript Only
// ==========================================
app.post('/api/transcribe', dictateLimiter, optionalAuth, upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  let tempFilePath = null;
  const userId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided in request.' });
    }

    tempFilePath = req.file.path;
    const clientDurationMs = req.body.durationMs !== undefined ? req.body.durationMs : (req.body.duration !== undefined ? Number(req.body.duration) * 1000 : null);
    const normalized = normalizeAudioFile(tempFilePath, req.file.mimetype, { durationMs: clientDurationMs });
    tempFilePath = normalized.path;

    if (normalized.isTooShort) {
      logger.info(`[Transcribe API] Pre-STT Guard: ${normalized.validationMessage || 'Audio is too short or silent'} (${normalized.size} bytes). Skipping STT.`);
      return res.json({
        success: true,
        rawTranscript: '',
        language: 'auto',
        duration: 0,
        empty: true,
        message: normalized.validationMessage || 'Audio recording was too short or silent (< 0.5s).',
        latencyMs: Date.now() - startTime,
        provider: 'none',
        model: 'none'
      });
    }

    const {
      sttProvider = storage.getSettings(userId).sttProvider || config.defaultSttProvider || 'groq',
      language = 'auto',
      apiKeyGroq,
      apiKeyGemini,
      apiKeyOpenai
    } = req.body;

    const explicitSttKey = sttProvider === 'gemini' ? apiKeyGemini : sttProvider === 'openai' ? apiKeyOpenai : apiKeyGroq;
    const resolvedStt = explicitSttKey ? { key: explicitSttKey, source: 'user' } : apiKeyService.getDecryptedKey(userId, sttProvider);
    const isByokStt = resolvedStt.source === 'user';

    // Check Audio Quota before calling provider (BYOK is exempt)
    const quotaCheck = quotaService.checkAudioQuota(userId, normalized.size / 16000 / 2, { isByok: isByokStt });
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        error: quotaCheck.reason,
        code: 'QUOTA_EXCEEDED',
        quota: quotaCheck
      });
    }

    const options = {
      apiKey: resolvedStt.key,
      keySource: resolvedStt.source,
      language,
      sttProvider,
      userId,
      originalFilename: `recording${normalized.ext}`,
      mimetype: normalized.mimetype
    };

    logger.info(`[Transcribe API] User: ${userId} | Audio: ${req.file.originalname || path.basename(tempFilePath)} (${(normalized.size / 1024).toFixed(1)} KB, format: ${normalized.ext}) | Provider: ${sttProvider} | BYOK: ${isByokStt}`);

    const asrResult = await transcriptionService.transcribeAudio(tempFilePath, options);
    const totalLatency = Date.now() - startTime;
    const audioSeconds = asrResult.duration || (normalized.size / 32000);

    // Record Usage Event with BYOK separation
    usageService.recordTranscriptionUsage({
      userId,
      sessionId: req.id,
      provider: asrResult.provider,
      model: asrResult.model,
      audioSeconds,
      latencyMs: asrResult.latencyMs || totalLatency,
      status: 'success',
      isByok: isByokStt,
      keySource: resolvedStt.source,
      costIsEstimated: true
    });

    const sttCost = asrResult.isLocal ? 0.0 : pricingService.calculateSttCost(asrResult.provider, asrResult.model, audioSeconds);

    res.json({
      success: true,
      rawTranscript: asrResult.text || '',
      language: asrResult.language || language,
      duration: asrResult.duration || null,
      latencyMs: asrResult.latencyMs || totalLatency,
      provider: asrResult.provider,
      model: asrResult.model,
      sttMode: asrResult.sttMode || (asrResult.isLocal ? 'local' : 'cloud'),
      cost: {
        sttCost,
        totalCost: sttCost,
        isByok: isByokStt
      }
    });
  } catch (err) {
    logger.error(`Transcription Failed: ${err.message}`);
    const resolvedStt = apiKeyService.getDecryptedKey(userId, req.body.sttProvider || 'groq');
    usageService.recordFailure({
      userId,
      sessionId: req.id,
      type: 'transcription',
      provider: req.body.sttProvider || 'unknown',
      model: 'error',
      audioSeconds: 0,
      latencyMs: Date.now() - startTime,
      errorMessage: err.message,
      isByok: resolvedStt.source === 'user',
      keySource: resolvedStt.source
    });
    res.status(500).json({
      error: `Transcription error: ${err.message}`,
      suggestion: 'Please verify your API key in Settings or try another provider.'
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.warn('Could not remove temp audio file:', cleanupErr.message);
      }
    }
  }
});

// ==========================================
// 2. DICTATION PIPELINE: Audio -> ASR -> Zero-Edit
// ==========================================
app.post('/api/dictate', dictateLimiter, optionalAuth, upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  let tempFilePath = null;
  const userId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided in request.' });
    }

    tempFilePath = req.file.path;
    let initial16Hex = '';
    let fileSha256 = '';
    try {
      const fileBuf = fs.readFileSync(tempFilePath);
      initial16Hex = fileBuf.subarray(0, 16).toString('hex');
      fileSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
    } catch (e) {}
    logger.info(`[STAGE 3: SERVER_DICTATE] size=${req.file.size}, mime=${req.file.mimetype}, filename=${req.file.originalname}, first16=${initial16Hex}, sha256=${fileSha256}`);

    const clientDurationMs = req.body.durationMs !== undefined ? req.body.durationMs : (req.body.duration !== undefined ? Number(req.body.duration) * 1000 : null);
    const normalized = normalizeAudioFile(tempFilePath, req.file.mimetype, { durationMs: clientDurationMs });
    tempFilePath = normalized.path;

    if (normalized.isTooShort) {
      logger.info(`[Dictate] Pre-STT Guard: ${normalized.validationMessage || 'Audio is too short or silent'} (${normalized.size} bytes). Skipping STT.`);
      return res.json({
        success: true,
        rawTranscript: '',
        processedText: '',
        isSnippet: false,
        empty: true,
        message: normalized.validationMessage || 'Audio was too short or silent (< 0.5s).',
        durationMs: 0,
        latency: { asrMs: 0, llmMs: 0, totalMs: Date.now() - startTime },
        provider: { stt: req.body.sttProvider || 'none', llm: req.body.llmProvider || 'none' }
      });
    }

    const userSettings = storage.getSettings(userId);
    const rawSettings = storage.getRawSettings(userId);

    // Model selection precedence: Request param -> User Settings -> System Default
    const sttProvider = req.body.sttProvider || userSettings.sttProvider || config.defaultSttProvider || 'groq';
    const sttModel = req.body.sttModel || userSettings.sttModel || config.defaultSttModel || 'whisper-large-v3-turbo';
    const llmProvider = req.body.llmProvider || userSettings.llmProvider || config.defaultLlmProvider || 'groq';
    const llmModel = req.body.llmModel || userSettings.llmModel || config.defaultLlmModel || 'openai/gpt-oss-20b';

    // Validate provider/model selection
    const validation = modelCatalogService.validateSelection({
      sttProvider: req.body.sttProvider,
      sttModel: req.body.sttModel,
      llmProvider: req.body.llmProvider,
      llmModel: req.body.llmModel
    });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid provider or model requested',
        details: validation.errors
      });
    }

    const {
      language = 'auto',
      processName,
      windowTitle,
      apiKeyGroq,
      apiKeyGemini,
      apiKeyOpenai,
      clientSentAt
    } = req.body;

    // Resolve credentials with strict precedence:
    // Explicit request body param > User BYOK encrypted key > Legacy user setting > System .env
    const explicitSttKey = sttProvider === 'gemini' ? apiKeyGemini : sttProvider === 'openai' ? apiKeyOpenai : apiKeyGroq;
    const resolvedStt = explicitSttKey ? { key: explicitSttKey, source: 'user' } : await apiKeyService.getDecryptedKey(userId, sttProvider);
    const isByokStt = resolvedStt.source === 'user';

    const explicitLlmKey = llmProvider === 'gemini' ? apiKeyGemini : llmProvider === 'openai' ? apiKeyOpenai : apiKeyGroq;
    const resolvedLlm = explicitLlmKey ? { key: explicitLlmKey, source: 'user' } : await apiKeyService.getDecryptedKey(userId, llmProvider);
    const isByokLlm = resolvedLlm.source === 'user';

    // Check Quotas (BYOK requests are exempt from platform quotas)
    const audioQuota = await quotaService.checkAudioQuota(userId, 5, { isByok: isByokStt });
    if (!audioQuota.allowed) {
      return res.status(429).json({ error: audioQuota.reason, code: 'QUOTA_EXCEEDED', quota: audioQuota });
    }

    const uploadMs = clientSentAt ? Math.max(0, startTime - parseInt(clientSentAt, 10)) : undefined;

    let applicationContext = null;
    if (req.body.application) {
      try {
        applicationContext = typeof req.body.application === 'string' ? JSON.parse(req.body.application) : req.body.application;
      } catch (e) {}
    }

    const resolved = resolveTone({
      tone: req.body.tone,
      mode: req.body.mode || req.body.tone,
      processName,
      windowTitle,
      appName: req.body.appName,
      bundleId: req.body.bundleId,
      application: applicationContext
    });
    const tone = resolved.tone;
    const appName = resolved.appLabel;
    const resolvedContext = resolved.context;

    const options = {
      apiKey: resolvedStt.key,
      keySource: resolvedStt.source,
      language,
      appName,
      tone,
      mode: resolved.mode,
      application: resolvedContext,
      sttProvider,
      sttModel,
      llmProvider,
      llmModel,
      userId,
      originalFilename: `recording${normalized.ext}`,
      mimetype: normalized.mimetype
    };

    logger.info(`[Dictate] User: ${userId} | Audio: ${req.file.originalname || path.basename(tempFilePath)} (${(normalized.size / 1024).toFixed(1)} KB, format: ${normalized.ext}) | Tone: ${tone} | STT: ${sttProvider} (${sttModel}) [BYOK: ${isByokStt}] | LLM: ${llmProvider} (${llmModel}) [BYOK: ${isByokLlm}]`);

    // Step 1: ASR Transcription
    let asrResult;
    try {
      asrResult = await transcriptionService.transcribeAudio(tempFilePath, options);
    } catch (asrErr) {
      logger.error(`[ASR Error] ${asrErr.message}`);
      usageService.recordFailure({
        userId,
        sessionId: req.id,
        type: 'transcription',
        provider: sttProvider,
        model: sttModel,
        latencyMs: Date.now() - startTime,
        errorMessage: asrErr.message,
        isByok: isByokStt,
        keySource: resolvedStt.source
      });
      return res.status(500).json({
        error: `Transcription error (${sttProvider}): ${asrErr.message}`,
        suggestion: 'Please verify your API key in Settings or try another provider.'
      });
    }

    const rawTranscript = asrResult.text || '';
    const audioSeconds = asrResult.duration || (normalized.size / 32000);

    // Guard: Check for empty transcript or Whisper silence hallucinations (e.g. "S.J.", "you", "Thank you.")
    const cleanTranscript = rawTranscript.trim().replace(/^[\s.,?!'"]+|[\s.,?!'"]+$/g, '');
    const normalizedNoPunct = cleanTranscript.toLowerCase().replace(/[.\s]/g, '');
    const isHallucination = audioSeconds < 2.0 && (
      ['sj', 'sjr', 'you', 'thankyou', 'thanksforwatching'].includes(normalizedNoPunct) ||
      ['s.j.', 's.j', 'sj', 's. j.', 'sjr', 's.j.r', 's.j.r.', 'you', 'thank you', 'thank you.', 'thanks for watching'].includes(cleanTranscript.toLowerCase())
    );

    if (!cleanTranscript || isHallucination) {
      logger.info(`[Dictate] No meaningful audio detected in transcript (raw: "${rawTranscript}"). Skipping AI enhancement & history.`);
      return res.json({
        success: true,
        rawTranscript: '',
        processedText: '',
        isSnippet: false,
        empty: true,
        message: 'No speech detected.',
        durationMs: Math.round(audioSeconds * 1000),
        latency: { asrMs: asrResult.latencyMs || 0, llmMs: 0, totalMs: Date.now() - startTime },
        provider: { stt: asrResult.provider || 'none', llm: req.body.llmProvider || 'none' }
      });
    }

    // Record STT usage with BYOK distinction
    const sttUsage = usageService.recordTranscriptionUsage({
      userId,
      sessionId: req.id,
      provider: asrResult.provider,
      model: asrResult.model,
      audioSeconds,
      latencyMs: asrResult.latencyMs,
      status: 'success',
      isByok: isByokStt,
      keySource: resolvedStt.source,
      costIsEstimated: true
    });

    // Step 2: Zero-Edit Formatting & Optional AI Enhancement
    const zeroEditOptions = {
      ...options,
      apiKey: resolvedLlm.key,
      keySource: resolvedLlm.source,
      tone,
      appName,
      userId
    };

    const zeroEditResult = await textProcessingService.process(rawTranscript, zeroEditOptions);
    const totalLatency = Date.now() - startTime;
    const isEnhancedByAi = Boolean(zeroEditResult.enhancedByAI);
    const inTokens = isEnhancedByAi ? Math.ceil(rawTranscript.length / 4) : 0;
    const outTokens = isEnhancedByAi ? Math.ceil((zeroEditResult.processedText || '').length / 4) : 0;

    // Record LLM usage only if AI was actually invoked
    let llmCost = 0.0;
    if (isEnhancedByAi) {
      const llmUsage = usageService.recordLlmUsage({
        userId,
        sessionId: req.id,
        provider: zeroEditResult.provider,
        model: zeroEditResult.model || 'llm',
        inputTokens: inTokens,
        outputTokens: outTokens,
        latencyMs: zeroEditResult.aiMs || 0,
        type: 'text_processing',
        status: 'success',
        isByok: isByokLlm,
        keySource: resolvedLlm.source,
        costIsEstimated: true
      });
      llmCost = llmUsage?.estimatedCost || 0.0;
    }

    const sttCost = sttUsage?.estimatedCost ?? (asrResult.isLocal ? 0.0 : pricingService.calculateSttCost(asrResult.provider, asrResult.model, audioSeconds));
    const totalCost = pricingService.calculateTotalCost(sttCost, llmCost);

    // Step 3: Record to user history
    const historyEntry = await storage.addHistory({
      rawTranscript,
      processedText: zeroEditResult.processedText,
      durationMs: Math.round((asrResult.duration || 0) * 1000),
      appName,
      tone,
      language: asrResult.language || language,
      latencyAsrMs: asrResult.latencyMs,
      latencyLlmMs: zeroEditResult.aiMs || 0,
      totalLatencyMs: totalLatency,
      isSnippet: zeroEditResult.isSnippet || false,
      sttProvider: asrResult.provider,
      llmProvider: isEnhancedByAi ? zeroEditResult.provider : 'none',
      userId
    }, userId);

    res.json({
      success: true,
      rawTranscript,
      processedText: zeroEditResult.processedText,
      isSnippet: zeroEditResult.isSnippet || false,
      snippetTrigger: zeroEditResult.snippetTrigger || null,
      tone,
      toneSource: resolved.source,
      appName,
      latency: {
        uploadMs: uploadMs !== undefined ? uploadMs : null,
        asrMs: asrResult.latencyMs,
        deterministicMs: zeroEditResult.deterministicMs || 0,
        llmMs: zeroEditResult.aiMs || 0,
        totalMs: totalLatency
      },
      cost: {
        sttCost,
        llmCost,
        totalCost,
        isByok: isByokStt || isByokLlm
      },
      telemetry: {
        sttProvider: asrResult.provider,
        sttModel: asrResult.model,
        llmProvider: isEnhancedByAi ? zeroEditResult.provider : 'deterministic',
        llmModel: isEnhancedByAi ? zeroEditResult.model : 'none',
        sttCost,
        llmCost,
        totalCost,
        inputTokens: inTokens,
        outputTokens: outTokens,
        audioSeconds,
        latency: totalLatency,
        isByok: isByokStt || isByokLlm
      },
      pipeline: {
        sttMode: asrResult.sttMode || (asrResult.isLocal ? 'local' : 'cloud'),
        enhancedByAI: isEnhancedByAi,
        escalationReason: zeroEditResult.escalationReason || 'deterministic_processing_sufficient'
      },
      durationMs: Math.round((asrResult.duration || 0) * 1000),
      provider: {
        stt: asrResult.provider,
        sttModel: asrResult.model,
        sttKeySource: resolvedStt.source,
        llm: isEnhancedByAi ? zeroEditResult.provider : 'deterministic-engine',
        llmModel: isEnhancedByAi ? zeroEditResult.model : 'none',
        llmKeySource: resolvedLlm.source
      },
      historyId: historyEntry.id
    });
  } catch (err) {
    logger.error(`Dictation Pipeline Failed: ${err.message}`);
    usageService.recordFailure({
      userId,
      sessionId: req.id,
      type: 'dictation_pipeline',
      provider: req.body?.sttProvider || 'unknown',
      model: req.body?.sttModel || 'default',
      latencyMs: Date.now() - startTime,
      errorMessage: err.message
    });
    res.status(500).json({ error: err.message || 'Internal processing error' });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.warn('Could not remove temp audio file:', cleanupErr.message);
      }
    }
  }
});

// ==========================================
// 3. TEXT PROCESSING: Raw Text -> Zero-Edit
// ==========================================
app.post('/api/process-text', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;
  try {
    const rawSettings = await storage.getRawSettings(userId);
    const userSettings = await storage.getSettings(userId);

    const {
      text,
      llmProvider = userSettings?.llmProvider || config.defaultLlmProvider || 'groq',
      processName,
      windowTitle,
      apiKeyGroq,
      apiKeyGemini,
      apiKeyOpenai
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required.' });
    }

    const explicitLlmKey = llmProvider === 'gemini' ? apiKeyGemini : llmProvider === 'openai' ? apiKeyOpenai : (apiKeyGroq || req.body.apiKey);
    const resolvedLlm = explicitLlmKey ? { key: explicitLlmKey, source: 'user' } : await apiKeyService.getDecryptedKey(userId, llmProvider);
    const isByokLlm = resolvedLlm.source === 'user';

    // Check LLM Quota (BYOK requests are exempt)
    const llmQuota = await quotaService.checkLlmQuota(userId, { isByok: isByokLlm });
    if (!llmQuota.allowed) {
      return res.status(429).json({ error: llmQuota.reason, code: 'QUOTA_EXCEEDED', quota: llmQuota });
    }

    let applicationContext = null;
    if (req.body.application) {
      try {
        applicationContext = typeof req.body.application === 'string' ? JSON.parse(req.body.application) : req.body.application;
      } catch (e) {}
    }

    const resolved = resolveTone({
      tone: req.body.tone,
      mode: req.body.mode || req.body.tone,
      processName,
      windowTitle,
      appName: req.body.appName,
      bundleId: req.body.bundleId,
      application: applicationContext
    });
    const tone = resolved.tone;
    const appName = resolved.appLabel;

    const options = {
      tone,
      mode: resolved.mode,
      appName,
      application: resolved.context,
      llmProvider,
      llmModel: req.body.llmModel || userSettings?.llmModel || config.defaultLlmModel || 'openai/gpt-oss-20b',
      userId,
      apiKey: resolvedLlm.key,
      keySource: resolvedLlm.source
    };

    const result = await textProcessingService.process(text, options);

    // Record LLM usage with BYOK separation
    usageService.recordLlmUsage({
      userId,
      sessionId: req.id,
      provider: result.provider,
      model: result.model,
      inputTokens: Math.ceil(text.length / 4),
      outputTokens: Math.ceil((result.processedText || '').length / 4),
      latencyMs: result.latencyMs,
      type: 'text_processing',
      status: 'success',
      isByok: isByokLlm,
      keySource: resolvedLlm.source,
      costIsEstimated: true
    });

    // Save to user history
    await storage.addHistory({
      rawTranscript: text,
      processedText: result.processedText,
      durationMs: 0,
      appName,
      tone,
      language: 'en',
      latencyAsrMs: 0,
      latencyLlmMs: result.latencyMs,
      totalLatencyMs: result.latencyMs,
      isSnippet: result.isSnippet || false,
      sttProvider: 'client-webspeech',
      llmProvider,
      userId
    }, userId);

    res.json({
      success: true,
      rawTranscript: text,
      processedText: result.processedText,
      isSnippet: result.isSnippet || false,
      snippetTrigger: result.snippetTrigger || null,
      tone,
      toneSource: resolved.source,
      appName,
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model
    });
  } catch (err) {
    logger.error(`Process Text Failed: ${err.message}`);
    const resolvedLlm = apiKeyService.getDecryptedKey(userId, req.body?.llmProvider || 'groq');
    usageService.recordFailure({
      userId,
      sessionId: req.id,
      type: 'text_processing',
      provider: req.body?.llmProvider || 'unknown',
      model: req.body?.llmModel || 'default',
      latencyMs: Date.now() - startTime,
      errorMessage: err.message,
      isByok: resolvedLlm.source === 'user',
      keySource: resolvedLlm.source
    });
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. COMMAND MODE: Voice-to-Action Editing
// ==========================================
app.post('/api/command', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;
  const userSettings = storage.getSettings(userId);

  try {
    const {
      instruction,
      selectedText,
      llmProvider = userSettings.llmProvider || config.defaultLlmProvider || 'groq',
      apiKeyGroq,
      apiKeyGemini,
      apiKeyOpenai
    } = req.body;

    if (!instruction || !selectedText) {
      return res.status(400).json({ error: 'Both instruction and selectedText are required.' });
    }

    const explicitLlmKey = llmProvider === 'gemini' ? apiKeyGemini : llmProvider === 'openai' ? apiKeyOpenai : (apiKeyGroq || req.body.apiKey);
    const resolvedLlm = explicitLlmKey ? { key: explicitLlmKey, source: 'user' } : apiKeyService.getDecryptedKey(userId, llmProvider);
    const isByokLlm = resolvedLlm.source === 'user';

    const llmQuota = quotaService.checkLlmQuota(userId, { isByok: isByokLlm });
    if (!llmQuota.allowed) {
      return res.status(429).json({ error: llmQuota.reason, code: 'QUOTA_EXCEEDED', quota: llmQuota });
    }

    const systemPrompt = `You are WhisperFlow Command Mode.
Your task: Execute the user's voice command on the provided target text.
Examples: "make this concise", "translate to Spanish", "turn into bullet points", "fix grammar".

Output ONLY the transformed text. Do not add explanations, conversational remarks, or markdown wrapping unless requested.`;

    const promptText = `USER COMMAND: ${instruction}\n\nTARGET TEXT:\n${selectedText}`;
    const options = {
      apiKey: resolvedLlm.key
    };

    const provider = providerRegistry.getLlmProvider(llmProvider);
    const result = await provider.formatText(systemPrompt, promptText, options);

    usageService.recordLlmUsage({
      userId,
      sessionId: req.id,
      provider: result.provider,
      model: result.model,
      inputTokens: Math.ceil(promptText.length / 4),
      outputTokens: Math.ceil((result.text || '').length / 4),
      latencyMs: Date.now() - startTime,
      type: 'command',
      status: 'success',
      isByok: isByokLlm,
      keySource: resolvedLlm.source,
      costIsEstimated: true
    });

    res.json({
      success: true,
      transformedText: result.text,
      latencyMs: Date.now() - startTime,
      provider: result.provider,
      model: result.model
    });
  } catch (err) {
    logger.error(`Command Mode Failed: ${err.message}`);
    const resolvedLlm = await apiKeyService.getDecryptedKey(userId, req.body?.llmProvider || 'groq');
    usageService.recordFailure({
      userId,
      sessionId: req.id,
      type: 'command',
      provider: req.body?.llmProvider || 'unknown',
      model: 'default',
      latencyMs: Date.now() - startTime,
      errorMessage: err.message,
      isByok: resolvedLlm?.source === 'user',
      keySource: resolvedLlm?.source || 'system'
    });
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. NOTETAKER: Meeting Notes & Action Items
// ==========================================
app.post('/api/notetaker/summarize', optionalAuth, async (req, res) => {
  const userId = req.user.id;
  const rawSettings = await storage.getRawSettings(userId);
  const userSettings = await storage.getSettings(userId);

  try {
    const {
      transcript,
      title = 'Team Discussion',
      participants = ['Stephen', 'Nathalie', 'Mikel'],
      durationSeconds = 180,
      llmProvider = userSettings.llmProvider || config.defaultLlmProvider || 'groq',
      apiKeyGroq,
      apiKeyGemini
    } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'Transcript is required.' });
    }

    const options = {
      title,
      participants,
      durationSeconds,
      llmProvider,
      apiKey: llmProvider === 'gemini' ? (apiKeyGemini || rawSettings.apiKeyGemini) : (apiKeyGroq || rawSettings.apiKeyGroq),
      userId
    };

    const result = await notetakerService.summarizeMeeting(transcript, options);

    usageService.recordLlmUsage({
      userId,
      sessionId: req.id,
      provider: llmProvider,
      model: 'meeting-summary',
      inputTokens: Math.ceil(transcript.length / 4),
      outputTokens: 400,
      latencyMs: 1200,
      type: 'notetaker',
      status: 'success'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error(`Notetaker Failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. SETTINGS, DICTIONARY, SNIPPETS, HISTORY (Scoped to User)
// ==========================================

// Settings (API Keys are NEVER exposed)
app.get('/api/settings', optionalAuth, async (req, res) => {
  try {
    const settings = await storage.getSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', optionalAuth, async (req, res) => {
  try {
    const updated = await storage.updateSettings(req.body, req.user.id);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6b. BRING YOUR OWN KEY (BYOK) - Phase 2
// ==========================================

// List configured keys for user (Safe: keyHint only, NEVER returns raw decrypted key)
app.get('/api/keys', optionalAuth, async (req, res) => {
  try {
    const keys = await apiKeyService.listUserKeys(req.user.id);
    res.json({ success: true, keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add or update an encrypted user API key
app.post('/api/keys', optionalAuth, async (req, res) => {
  try {
    const { provider, key, validate = true } = req.body;
    if (!provider || !key) {
      return res.status(400).json({ error: 'Provider and key are required' });
    }
    const result = await apiKeyService.saveUserKey({
      userId: req.user.id,
      provider,
      rawKey: key,
      validate: validate !== false
    });
    res.json({ success: true, key: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a user API key (reverts to system defaults if present)
app.delete('/api/keys/:provider', optionalAuth, async (req, res) => {
  try {
    const provider = (req.params.provider || '').toLowerCase();
    await apiKeyService.deleteUserKey(req.user.id, provider);
    res.json({
      success: true,
      provider,
      message: `Custom API key for ${provider} removed. System key will be used if configured.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate an API key (either raw key in body, or user's stored BYOK key)
app.post('/api/keys/validate', optionalAuth, async (req, res) => {
  try {
    const { provider, key } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    const p = provider.toLowerCase().trim();
    let keyToTest = key;
    if (!keyToTest) {
      const stored = await apiKeyService.getDecryptedKey(req.user.id, p);
      if (!stored.key) {
        return res.status(400).json({ error: `No configured API key found for ${p} to validate.` });
      }
      keyToTest = stored.key;
    }

    const check = await apiKeyService.validateKey(p, keyToTest);
    if (check.valid) {
      await apiKeyService.repo.updateValidationStatus(req.user.id, p, 'valid');
    } else {
      await apiKeyService.repo.updateValidationStatus(req.user.id, p, 'invalid');
    }

    res.json({ success: true, ...check });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dictionary
app.get('/api/dictionary', optionalAuth, async (req, res) => {
  try {
    const dict = await storage.getDictionary(req.user.id);
    res.json(dict);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dictionary', optionalAuth, async (req, res) => {
  try {
    await storage.addDictionaryItem(req.body, req.user.id);
    const updated = await storage.getDictionary(req.user.id);
    res.json({ success: true, dictionary: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/dictionary/:id', optionalAuth, async (req, res) => {
  try {
    const updated = await storage.updateDictionaryItem(req.params.id, req.body, req.user.id);
    res.json({ success: true, dictionary: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/dictionary/:id', optionalAuth, async (req, res) => {
  try {
    const updated = await storage.deleteDictionaryItem(req.params.id, req.user.id);
    res.json({ success: true, dictionary: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Snippets
app.get('/api/snippets', optionalAuth, async (req, res) => {
  try {
    const snippets = await storage.getSnippets(req.user.id);
    res.json(snippets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/snippets', optionalAuth, async (req, res) => {
  try {
    await storage.addSnippet(req.body, req.user.id);
    const updated = await storage.getSnippets(req.user.id);
    res.json({ success: true, snippets: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/snippets/:id', optionalAuth, async (req, res) => {
  try {
    const updated = await storage.updateSnippet(req.params.id, req.body, req.user.id);
    res.json({ success: true, snippets: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/snippets/:id', optionalAuth, async (req, res) => {
  try {
    const updated = await storage.deleteSnippet(req.params.id, req.user.id);
    res.json({ success: true, snippets: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History
app.get('/api/history', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = await storage.getHistory(limit, req.user.id);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history', optionalAuth, async (req, res) => {
  try {
    await storage.clearHistory(req.user.id);
    res.json({ success: true, history: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Meetings
app.get('/api/meetings', optionalAuth, async (req, res) => {
  try {
    const meetings = await storage.getMeetings(req.user.id);
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/meetings/:id', optionalAuth, async (req, res) => {
  try {
    const meeting = await storage.getMeetingById(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. USAGE, QUOTAS & PRIVACY (Phase 9)
// ==========================================

app.get('/api/usage', optionalAuth, async (req, res) => {
  try {
    const stats = await usageService.getUserStats(req.user.id);
    const events = await usageService.getUserEvents(req.user.id);
    res.json({ success: true, stats, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usage/events', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const status = req.query.status || null;
    const events = await usageService.getUserEvents(req.user.id, { limit, offset, status });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quotas', optionalAuth, async (req, res) => {
  try {
    const quota = await quotaService.getUserQuota(req.user.id);
    const stats = await usageService.getUserStats(req.user.id);
    const remainingMinutes = Math.max(0, Math.round(((quota?.monthlyAudioMinutes || 0) - (stats?.systemAudioMinutes || 0)) * 100) / 100);
    const remainingLlmRequests = Math.max(0, (quota?.monthlyLlmRequests || 0) - (stats?.systemLlmRequests || 0));
    res.json({
      success: true,
      quota,
      stats,
      remainingMinutes,
      remainingLlmRequests,
      byokUnlimited: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usage/dashboard', optionalAuth, async (req, res) => {
  try {
    const dashboard = await usageService.getDashboardStats(req.user.id);
    const quota = await quotaService.getUserQuota(req.user.id);
    res.json({ success: true, quota, ...dashboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Usage & Platform Telemetry Overview (Admin only)
app.get('/api/admin/usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const adminStats = await usageService.getGlobalAdminStats();
    res.json({ success: true, ...adminStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Quota Configuration (Admin only)
app.patch('/api/admin/users/:id/quota', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { tier, monthlyAudioMinutes, monthlyLlmRequests, monthlyBudgetUsd } = req.body;
    const updatedQuota = await quotaService.setUserQuota(targetUserId, tier, {
      monthlyAudioMinutes,
      monthlyLlmRequests,
      monthlyBudgetUsd
    });
    res.json({ success: true, quota: updatedQuota });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. MODEL CATALOG & LIVE COST ESTIMATOR (Phase 11)
// ==========================================

app.get('/api/models', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || 'default_user';
    const catalog = await modelCatalogService.getFullCatalog(userId);
    res.json({ success: true, ...catalog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models/stt', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || 'default_user';
    const models = await modelCatalogService.getSttModels(userId);
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models/llm', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || 'default_user';
    const models = await modelCatalogService.getLlmModels(userId);
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models/pricing', (req, res) => {
  const catalog = modelCatalogService.getFullCatalog();
  res.json({
    success: true,
    currency: 'USD',
    stt: (catalog.stt || []).map(m => ({
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
      pricePerMinute: m.pricePerMinute,
      pricePerHour: m.pricePerHour,
      pricingSource: m.pricingSource,
      effectiveDate: m.effectiveDate
    })),
    llm: (catalog.llm || []).map(m => ({
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
      inputPricePer1M: m.inputPricePer1M,
      outputPricePer1M: m.outputPricePer1M,
      pricingSource: m.pricingSource,
      effectiveDate: m.effectiveDate
    }))
  });
});

app.get('/api/models/:provider', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || 'default_user';
    const provider = req.params.provider.toLowerCase();
    const stt = (await modelCatalogService.getSttModels(userId)).filter(m => m.provider === provider);
    const llm = (await modelCatalogService.getLlmModels(userId)).filter(m => m.provider === provider);
    const status = await modelCatalogService.getProviderStatus(provider, 'all', userId);
    res.json({
      success: true,
      provider,
      status,
      modelsSTT: stt,
      modelsLLM: llm
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/estimate', (req, res) => {
  const estimation = modelCatalogService.estimateCost(req.body);
  res.json({ success: true, ...estimation });
});

// Delete all user data (Privacy & GDPR compliance)
app.delete('/api/user/data', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await storage.clearHistory(userId);
    // Clear dictionary and snippets for user
    const dict = await storage.getDictionary(userId);
    for (const d of dict) await storage.deleteDictionaryItem(d.id, userId);
    const snips = await storage.getSnippets(userId);
    for (const s of snips) await storage.deleteSnippet(s.id, userId);

    res.json({ success: true, message: 'All user data and history successfully wiped.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Status & Available Models
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.2.0',
    uptime: process.uptime(),
    providers: providerRegistry.getStatus()
  });
});

app.get('/api/status/local-stt', async (req, res) => {
  const localStatus = await transcriptionService.getLocalStatus();
  res.json({ success: true, ...localStatus });
});

// Error handling middleware
app.use(errorHandler);

let serverInstance = null;

export function attachStreamingServer(server) {
  return new StreamingDictationServer(server);
}

async function startServer(port = DEFAULT_PORT, host = HOST) {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error(`\n❌ [Database Fatal] Failed to initialize database: ${err.message}`);
    if (isPostgres()) {
      console.error(`[Database Fatal] Halting server startup. In production with DATABASE_URL, PostgreSQL is required.\n`);
    }
    throw err;
  }

  const server = app.listen(port, host, () => {
    serverInstance = server;
    // Attach WebSocket streaming handler for real-time dictation
    attachStreamingServer(server);

    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`\n======================================================`);
    console.log(`🎙️  Mumble AI Server running at: http://${displayHost}:${port} (listening on ${host}:${port})`);
    console.log(`🔒  Security & Multi-User Isolation Active`);
    console.log(`🌊  WebSocket Streaming Dictation ready at: ws://${displayHost}:${port}${config.streaming.path}`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1, host);
    } else {
      console.error('Server error:', err);
    }
  });

  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer(DEFAULT_PORT, HOST).catch(() => {
    process.exit(1);
  });
}

export { app, startServer };
