import cors from 'cors';

/**
 * Configure secure CORS whitelist.
 * Blocks arbitrary external origins while permitting configured apps and local desktop clients.
 */
export function createCorsMiddleware() {
  const customOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  const defaultAllowedOrigins = [
    'http://localhost:3050',
    'http://127.0.0.1:3050',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'vscode-webview://',
    'electron://',
    ...customOrigins
  ];

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, desktop companion, or same-origin)
      if (!origin) return callback(null, true);

      const isAllowed = defaultAllowedOrigins.some(allowed => {
        if (allowed === '*') return true;
        if (origin === allowed) return true;
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
        return false;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: Origin "${origin}" is not allowed.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Id', 'X-Request-Id']
  });
}
