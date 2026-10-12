import crypto from 'node:crypto';
import { userRepository } from '../db/repositories/userRepository.js';
import { workspaceRepository } from '../db/repositories/workspaceRepository.js';
import { quotaService } from './quotaService.js';
import { config } from '../config.js';

const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY_DAYS = 30;

/**
 * Secure password hashing using scrypt with random salt
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored hash using timingSafeEqual
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Sign JWT-like secure token with HMAC-SHA256
 */
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode HMAC-SHA256 token
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

export class AuthService {
  constructor(userRepo = userRepository, wsRepo = workspaceRepository) {
    this.userRepo = userRepo;
    this.wsRepo = wsRepo;
  }

  async register({ email, password, name, role = 'user' }) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      throw new Error('A valid email address is required (e.g. user@domain.com)');
    }
    if (!password || password.trim().length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!name || name.trim().length < 2) {
      throw new Error('Name must be at least 2 characters long');
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await this.userRepo.findByEmail(cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = hashPassword(password);

    const user = await this.userRepo.create({
      id: userId,
      email: cleanEmail,
      passwordHash,
      name: name.trim(),
      role,
      status: 'active'
    });

    // Create default personal workspace
    const workspaceId = `ws_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
    const slug = `${cleanName}-${crypto.randomBytes(3).toString('hex')}`;
    await this.wsRepo.createWorkspace({
      id: workspaceId,
      name: `${name}'s Workspace`,
      slug,
      ownerId: userId
    });

    // Initialize quota tier
    await quotaService.setUserQuota(userId, 'free');

    const token = await this.generateSession(userId);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status || 'active'
      },
      workspace: {
        id: workspaceId,
        name: `${name}'s Workspace`
      }
    };
  }

  async login({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(cleanEmail);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (user.status === 'suspended') {
      throw new Error('Your account is suspended. Please contact an administrator.');
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    const token = await this.generateSession(user.id);
    const workspaces = await this.wsRepo.findUserWorkspaces(user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status || 'active'
      },
      workspaces
    };
  }

  generateSession(userId) {
    const exp = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    const token = signToken({
      sub: userId,
      jti: crypto.randomBytes(12).toString('hex'),
      iat: Math.floor(Date.now() / 1000),
      exp
    });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(exp * 1000).toISOString();

    const createRes = this.userRepo.createSession({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt
    });

    if (createRes instanceof Promise) {
      return createRes.then(() => token);
    }
    return token;
  }

  validateToken(token) {
    const payload = verifyToken(token);
    if (!payload || !payload.sub) return null;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionRes = this.userRepo.findSession(tokenHash);

    const handleSession = (session) => {
      if (!session) return null;

      if (session.status === 'suspended') {
        this.userRepo.deleteSession(tokenHash);
        return null;
      }

      return {
        id: session.user_id,
        email: session.email,
        name: session.name,
        role: session.role,
        status: session.status || 'active'
      };
    };

    if (sessionRes instanceof Promise) {
      return sessionRes.then(handleSession);
    }
    return handleSession(sessionRes);
  }

  logout(token) {
    if (!token) return;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return this.userRepo.deleteSession(tokenHash);
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }
    if (newPassword.trim().length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error('User not found');

    const fullUser = await this.userRepo.findByEmail(user.email);
    if (!fullUser || !verifyPassword(currentPassword, fullUser.password_hash)) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = hashPassword(newPassword);
    await this.userRepo.update(userId, { passwordHash });

    // Invalidate all prior sessions on password change
    await this.userRepo.deleteAllUserSessions(userId);
    const newToken = await this.generateSession(userId);

    return { success: true, token: newToken };
  }

  async getUserProfile(userId) {
    const user = await this.userRepo.findById(userId);
    if (!user) return null;
    const workspaces = await this.wsRepo.findUserWorkspaces(userId);
    const quota = await quotaService.getUserQuota(userId);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status || 'active',
        createdAt: user.created_at
      },
      workspaces,
      quota
    };
  }
}

export const authService = new AuthService();
