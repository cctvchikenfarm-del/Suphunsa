'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCookies,
  tokenFromRequest,
  authCookies,
  clearAuthCookies,
  createRateLimiter
} = require('../security-utils');
const { thailandDate, thailandMonth } = require('../time-utils');

test('cookie parser and request token support HttpOnly session flow', () => {
  assert.deepEqual(parseCookies('a=1; ckap_access_token=abc%20123'), { a: '1', ckap_access_token: 'abc 123' });
  assert.equal(tokenFromRequest({ headers: { cookie: 'ckap_access_token=cookie-token' } }), 'cookie-token');
  assert.equal(tokenFromRequest({ headers: { cookie: 'ckap_access_token=cookie-token', authorization: 'Bearer header-token' } }), 'header-token');
});

test('production auth cookies are HttpOnly, Secure and clearable', () => {
  const cookies = authCookies({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, true);
  assert.equal(cookies.length, 2);
  assert.equal(cookies.every(value => value.includes('HttpOnly') && value.includes('Secure') && value.includes('SameSite=None') && value.includes('Partitioned')), true);
  assert.equal(clearAuthCookies(true).every(value => value.includes('Max-Age=0')), true);
});

test('login limiter blocks attempts beyond configured maximum', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyFromRequest: req => `${req.ip}|${req.body.email}` });
  const req = { ip: '127.0.0.1', headers: {}, body: { email: 'owner@example.com' } };
  let status = null;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(payload) { return payload; } };
  let nextCount = 0;
  limiter(req, res, () => { nextCount += 1; });
  limiter.recordFailure(req);
  limiter(req, res, () => { nextCount += 1; });
  limiter.recordFailure(req);
  limiter(req, res, () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(status, 429);
  limiter.reset(req);
  limiter(req, res, () => { nextCount += 1; });
  assert.equal(nextCount, 3);
});

test('Thailand date does not fall into previous UTC month after local midnight', () => {
  const instant = new Date('2026-07-31T18:30:00.000Z');
  assert.equal(thailandDate(instant), '2026-08-01');
  assert.equal(thailandMonth(instant), '2026-08');
});
