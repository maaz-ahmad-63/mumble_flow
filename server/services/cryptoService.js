/**
 * Mumble AI — Cryptographic Service
 *
 * Provides authenticated encryption at rest using AES-256-GCM.
 * Keeps encryption secrets server-side and safely masks API keys for display.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

// Derive a persistent 32-byte (256-bit) encryption key using scrypt
const MASTER_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || config.jwtSecret || 'mumble-ai-secure-encryption-seed-2026';
const KEY_SALT = 'mumble-ai-byok-storage-salt-v1';
const ENCRYPTION_KEY = crypto.scryptSync(MASTER_SECRET, KEY_SALT, 32);

export class CryptoService {
  constructor(key = ENCRYPTION_KEY) {
    this.key = key;
  }

  /**
   * Encrypt plaintext string using AES-256-GCM authenticated encryption.
   * Format: iv:authTag:ciphertext (all in hex)
   *
   * @param {string} plaintext
   * @returns {string} Encrypted payload string
   */
  encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Plaintext string is required for encryption');
    }

    // 12-byte random IV standard for GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag(); // 16 bytes

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  /**
   * Decrypt and verify payload using AES-256-GCM.
   * Throws if tampered with or corrupted.
   *
   * @param {string} encryptedString - Format iv:authTag:ciphertext
   * @returns {string} Decrypted plaintext string
   */
  decrypt(encryptedString) {
    if (!encryptedString || typeof encryptedString !== 'string') {
      throw new Error('Encrypted payload is required for decryption');
    }

    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format (expected iv:authTag:ciphertext)');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final() // Throws if authTag verification fails
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Mask an API key for safe UI display and logs without leaking the secret.
   * e.g. "gsk_1234567890abcdef" -> "gsk_...cdef"
   *
   * @param {string} rawKey
   * @returns {string}
   */
  maskKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return '';
    const clean = rawKey.trim();
    if (clean.length <= 8) {
      return '••••' + clean.slice(-2);
    }
    // Extract prefix if recognized (e.g. gsk_, sk-, AIza)
    const prefixMatch = clean.match(/^([a-zA-Z0-9_-]{3,6})/);
    const prefix = prefixMatch ? prefixMatch[1] : clean.slice(0, 3);
    const suffix = clean.slice(-4);
    return `${prefix}••••${suffix}`;
  }
}

export const cryptoService = new CryptoService();
