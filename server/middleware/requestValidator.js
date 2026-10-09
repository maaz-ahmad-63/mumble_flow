import crypto from 'node:crypto';

/**
 * Request tracking, ID injection, and payload validation middleware
 */
export function requestSecurityHeaders(req, res, next) {
  // Inject unique request ID
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Secure HTTP response headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
}

/**
 * Structured error handler
 */
export function errorHandler(err, req, res, next) {
  const requestId = req.id || 'unknown';
  const status = err.status || err.statusCode || (err.message?.includes('CORS') ? 403 : 500);

  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code || (status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR'),
    requestId
  });
}
