import cors from 'cors';

/**
 * Configure secure CORS whitelist.
 * Blocks arbitrary external origins while permitting configured apps and local desktop clients.
 */
export function createCorsMiddleware() {
  const customOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
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

  if (process.env.RENDER_EXTERNAL_URL) {
    defaultAllowedOrigins.push(process.env.RENDER_EXTERNAL_URL.trim().replace(/\/$/, ''));
  }

  const corsOptionsDelegate = (req, callback) => {
    const origin = req.headers?.origin;

    // Allow requests with no origin (like mobile apps, curl, desktop companion, or same-origin)
    if (!origin) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Id', 'X-Request-Id']
      });
    }

    let isAllowed = defaultAllowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (origin === allowed) return true;
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
      return false;
    });

    // Dynamic same-origin detection: compare origin URL host with Host / X-Forwarded-Host header
    if (!isAllowed) {
      try {
        const originUrl = new URL(origin);
        const hostHeader = req.headers?.['x-forwarded-host'] || req.headers?.host;
        if (hostHeader) {
          const hosts = hostHeader.split(',').map(h => h.trim().toLowerCase());
          const originHost = originUrl.host.toLowerCase();
          const originHostname = originUrl.hostname.toLowerCase();
          if (hosts.some(h => h === originHost || h.split(':')[0] === originHostname)) {
            isAllowed = true;
          }
        }
      } catch (e) {
        // Ignore URL parse error
      }
    }

    if (isAllowed) {
      callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Id', 'X-Request-Id']
      });
    } else {
      callback(null, { origin: false });
    }
  };

  return cors(corsOptionsDelegate);
}
