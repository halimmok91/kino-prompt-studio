import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, clientIp, verifyTurnstile } from '../lib/protection.js';

test('production protection fails closed without configuration', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.TURNSTILE_SECRET_KEY;
  assert.equal((await checkRateLimit('127.0.0.1')).allowed, false);
  assert.equal(await verifyTurnstile('', '127.0.0.1'), false);
});

test('Turnstile secret stays server-side and token is verified', async t => {
  process.env.NODE_ENV = 'production';
  process.env.TURNSTILE_SECRET_KEY = 'server-secret';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /^https:\/\/challenges\.cloudflare\.com\//);
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('secret'), 'server-secret');
    assert.equal(body.get('response'), 'visitor-token');
    return Response.json({ success: true });
  });
  assert.equal(await verifyTurnstile('visitor-token', '127.0.0.1'), true);
});

test('Redis errors and provider network errors block production usage', async t => {
  process.env.NODE_ENV = 'production';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-secret';
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await checkRateLimit('127.0.0.1')).allowed, false);
  assert.equal(await verifyTurnstile('token', '127.0.0.1'), false);
});

test('IP extraction uses the first Vercel forwarding address', () => {
  assert.equal(clientIp(new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })), '203.0.113.1');
});
