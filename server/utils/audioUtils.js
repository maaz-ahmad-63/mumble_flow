import fs from 'fs';
import path from 'path';
import { logger } from '../services/logger.js';

/**
 * Inspect magic bytes of audio file to accurately identify container format.
 * Solves browser discrepancies (e.g. Safari recording MP4 but labeled as WebM).
 * Supported Groq Whisper formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, opus, wav, webm
 */
export function detectAudioContainer(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    if (stats.size < 12) return null;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(32);
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);

    // 1. WAV: 'RIFF' .... 'WAVE'
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
      return { ext: '.wav', mimetype: 'audio/wav', format: 'wav' };
    }

    // 2. OGG / Opus: 'OggS'
    if (buffer.toString('ascii', 0, 4) === 'OggS') {
      return { ext: '.ogg', mimetype: 'audio/ogg', format: 'ogg' };
    }

    // 3. WebM / EBML: 0x1A 0x45 0xDF 0xA3
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      return { ext: '.webm', mimetype: 'audio/webm', format: 'webm' };
    }

    // 4. MP4 / M4A / AAC (Safari audio): bytes 4-8 equal 'ftyp'
    if (buffer.toString('ascii', 4, 8) === 'ftyp') {
      return { ext: '.m4a', mimetype: 'audio/mp4', format: 'm4a' };
    }

    // 5. FLAC: 'fLaC'
    if (buffer.toString('ascii', 0, 4) === 'fLaC') {
      return { ext: '.flac', mimetype: 'audio/flac', format: 'flac' };
    }

    // 6. MP3: 'ID3' or MPEG frame sync (0xFF 0xFB / 0xFA / 0xF3 / 0xF2)
    if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
      return { ext: '.mp3', mimetype: 'audio/mpeg', format: 'mp3' };
    }
  } catch (err) {
    logger.warn(`Could not detect audio container for ${filePath}: ${err.message}`);
  }
  return null;
}

/**
 * Pre-STT audio duration and validity guard.
 * Rejects empty, corrupt, or very short recordings (< 0.5s or empty audio containers)
 * before any STT provider is called, preventing Whisper hallucinations (e.g. "S.J.")
 * and unnecessary token/quota usage.
 */
export function validateAudioPreSTT(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      valid: false,
      reason: 'file_not_found',
      message: 'Audio file not found or unreadable.'
    };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return {
      valid: false,
      reason: 'empty_file',
      message: 'Audio file is empty (0 bytes).'
    };
  }

  // 1. Explicit duration passed from client (e.g. durationMs or duration seconds)
  const durationMs = options.durationMs !== undefined && options.durationMs !== null
    ? Number(options.durationMs)
    : (options.duration !== undefined ? Number(options.duration) * 1000 : null);

  if (durationMs !== null && !isNaN(durationMs) && durationMs > 0 && durationMs < 500) {
    return {
      valid: false,
      reason: 'too_short',
      durationMs,
      message: 'Recording too short (< 0.5s).'
    };
  }

  // 2. Format-specific size & duration inspections
  const ext = (options.ext || path.extname(filePath)).toLowerCase();

  // For WAV files: 44-byte header + PCM data. 16kHz 16-bit mono = 32,000 bytes/sec
  if (ext === '.wav') {
    if (stats.size < 44) {
      return { valid: false, reason: 'too_short', message: 'Incomplete WAV header.' };
    }
    // Inspect WAV header for duration
    try {
      const fd = fs.openSync(filePath, 'r');
      const hdr = Buffer.alloc(44);
      fs.readSync(fd, hdr, 0, 44, 0);
      fs.closeSync(fd);
      const byteRate = hdr.readUInt32LE(28);
      if (byteRate > 0) {
        const dataBytes = Math.max(0, stats.size - 44);
        const durationSec = dataBytes / byteRate;
        if (durationSec < 0.5) {
          return {
            valid: false,
            reason: 'too_short',
            durationMs: Math.round(durationSec * 1000),
            message: 'Recording too short (< 0.5s).'
          };
        }
      }
    } catch (e) {}

    // Fallback: anything under ~8,000 bytes for standard WAV is < 0.25s
    if (stats.size < 8000) {
      return { valid: false, reason: 'too_short', message: 'Recording too short (< 0.5s).' };
    }
  }

  // For WebM, OGG, MP4, MP3: An audio container with less than 1,500 bytes has minimal to no audio frames
  if (stats.size < 1500) {
    return {
      valid: false,
      reason: 'too_short',
      message: 'Recording too short or silent (< 0.5s).'
    };
  }

  return { valid: true, size: stats.size };
}

/**
 * Normalizes an audio file on disk:
 * Verifies its magic bytes, renames with correct extension if mismatched,
 * and returns the normalized path and verified mimetype with pre-STT validation.
 */
export function normalizeAudioFile(filePath, clientMimetype = '', options = {}) {
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      mimetype: clientMimetype,
      ext: path.extname(filePath),
      size: 0,
      isTooShort: true,
      validationReason: 'file_not_found',
      validationMessage: 'Audio file not found'
    };
  }

  const stats = fs.statSync(filePath);
  const detected = detectAudioContainer(filePath);

  let currentExt = path.extname(filePath).toLowerCase();
  let finalPath = filePath;
  let finalMime = clientMimetype;

  if (detected) {
    finalMime = detected.mimetype;
    if (currentExt !== detected.ext) {
      const parsed = path.parse(filePath);
      finalPath = path.join(parsed.dir, `${parsed.name}${detected.ext}`);
      try {
        fs.renameSync(filePath, finalPath);
        logger.info(`[Audio Normalizer] Corrected extension from "${currentExt}" to "${detected.ext}" based on container inspection.`);
      } catch (renameErr) {
        logger.warn(`Could not rename audio file: ${renameErr.message}`);
        finalPath = filePath;
      }
    }
  }

  const validation = validateAudioPreSTT(finalPath, {
    ext: path.extname(finalPath).toLowerCase(),
    durationMs: options?.durationMs ?? (options?.duration ? options.duration * 1000 : null)
  });

  return {
    path: finalPath,
    mimetype: finalMime,
    ext: path.extname(finalPath).toLowerCase(),
    size: stats.size,
    isTooShort: !validation.valid,
    validationReason: validation.reason,
    validationMessage: validation.message
  };
}

/**
 * Clean up orphan files in uploads directory older than 15 minutes.
 */
export function cleanOrphanedUploads(uploadsDir, maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!fs.existsSync(uploadsDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const full = path.join(uploadsDir, file);
      try {
        const stats = fs.statSync(full);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full);
        }
      } catch (e) {}
    }
  } catch (err) {
    logger.warn(`Orphan upload cleanup failed: ${err.message}`);
  }
}
