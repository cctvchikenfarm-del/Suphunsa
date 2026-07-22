'use strict';

const ACCESS_COOKIE = 'ckap_access_token';
const REFRESH_COOKIE = 'ckap_refresh_token';

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return cookies;
      try {
        const key = decodeURIComponent(part.slice(0, separator).trim());
        const value = decodeURIComponent(part.slice(separator + 1).trim());
        cookies[key] = value;
      } catch {
        return cookies;
      }
      return cookies;
    }, {});
}

function tokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.startsWith('Bearer ')) return authorization.slice(7);
  return parseCookies(req.headers.cookie || '')[ACCESS_COOKIE] || null;
}

function cookieOptions({ production = false, maxAgeSeconds } = {}) {
  const parts = ['Path=/', 'HttpOnly', production ? 'SameSite=None' : 'SameSite=Lax'];
  if (production) parts.push('Secure', 'Partitioned');
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  return parts.join('; ');
}

function authCookies(session, production = false) {
  const accessMaxAge = Number(session?.expires_in || 3600);
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; ${cookieOptions({ production, maxAgeSeconds: accessMaxAge })}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; ${cookieOptions({ production, maxAgeSeconds: 60 * 60 * 24 * 30 })}`
  ];
}

function clearAuthCookies(production = false) {
  return [
    `${ACCESS_COOKIE}=; ${cookieOptions({ production, maxAgeSeconds: 0 })}`,
    `${REFRESH_COOKIE}=; ${cookieOptions({ production, maxAgeSeconds: 0 })}`
  ];
}

function refreshTokenFromRequest(req) {
  return parseCookies(req.headers.cookie || '')[REFRESH_COOKIE] || null;
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 8, keyFromRequest } = {}) {
  const attempts = new Map();
  const resolveKey = req => String(keyFromRequest?.(req) || req.ip || req.socket?.remoteAddress || 'unknown');
  const middleware = (req, res, next) => {
    const key = resolveKey(req);
    const now = Date.now();
    if (attempts.size > 5000) {
      for (const [storedKey, stored] of attempts) if (stored.resetAt <= now) attempts.delete(storedKey);
    }
    const record = attempts.get(key);
    if (record && record.resetAt > now && record.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่แล้วลองใหม่' });
    }
    next();
  };
  middleware.recordFailure = req => {
    const key = resolveKey(req);
    const now = Date.now();
    const record = attempts.get(key);
    if (!record || record.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs });
    else record.count += 1;
  };
  middleware.reset = req => attempts.delete(resolveKey(req));
  return middleware;
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  parseCookies,
  tokenFromRequest,
  refreshTokenFromRequest,
  authCookies,
  clearAuthCookies,
  createRateLimiter
};
