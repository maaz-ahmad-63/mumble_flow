/**
 * Sliding window in-memory rate limiter with route-specific buckets
 */
export function createRateLimiter({ windowMs = 60 * 1000, max = 120, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map();

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.resetTime > windowMs) {
        hits.delete(key);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    // Skip rate limiter in test mode if SKIP_RATE_LIMIT is set
    if (process.env.SKIP_RATE_LIMIT) return next();

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userId = req.user?.id || 'anonymous';
    const key = `${clientIp}:${userId}:${req.baseUrl || req.path}`;
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now - record.resetTime > windowMs) {
      record = { count: 1, resetTime: now };
      hits.set(key, record);
    } else {
      record.count++;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((record.resetTime + windowMs) / 1000));

    if (record.count > max) {
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: Math.ceil((record.resetTime + windowMs - now) / 1000)
      });
    }

    next();
  };
}
