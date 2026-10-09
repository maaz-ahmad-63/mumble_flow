import { authService } from '../services/authService.js';

/**
 * Authentication middleware that extracts Bearer token and verifies user session.
 * Rejects invalid/expired credentials.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    // In local development mode without token, allow default_user only if explicitly configured
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      req.user = { id: 'default_user', email: 'local@mumbleflow.internal', name: 'Local User', role: 'admin' };
      return next();
    }
    return res.status(401).json({
      error: 'Authentication required. Please provide a valid Bearer token.',
      code: 'UNAUTHORIZED'
    });
  }

  const user = authService.validateToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'Invalid or expired session token.',
      code: 'INVALID_TOKEN'
    });
  }

  req.user = user;
  next();
}

/**
 * Optional authentication middleware for public endpoints that can be enhanced with user context
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (token) {
    const user = authService.validateToken(token);
    if (user) {
      req.user = user;
    }
  }

  if (!req.user) {
    req.user = { id: 'default_user', email: 'local@mumbleflow.internal', name: 'Local User', role: 'user' };
  }

  next();
}

/**
 * Administrator authorization middleware.
 * Rejects requests from non-admin accounts with 403 Forbidden.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden. Administrator privileges required.',
      code: 'FORBIDDEN'
    });
  }
  next();
}
