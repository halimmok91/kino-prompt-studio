import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS } from '../lib/prompt.js';
import { POST } from '../app/api/build/route.js';

const direction = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values[0]]));
direction.idea = 'A fisherman casts a net at dawn';
function request(body = { direction }) {
  return new Request('http://localhost/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body) });
}

test.beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = 'https://provider.test/v1';
  process.env.OPENAI_MODEL = 'kimi-k3';
});

test('server validates before spending provider tokens', async () => {
  const response = await POST(request({ direction: { ...direction, duration: '20s' } }));
  assert.equal(response.status, 400);
});

test('provider response is returned as three editable sections', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://provider.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'kimi-k3');
    assert.equal(payload.messages[1].role, 'user');
    return Response.json({ choices: [{ message: { content: JSON.stringify({ prompt: 'Main direction', negative: 'No flicker', shots: '00:00 opening' }) } }] });
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { prompt: 'Main direction', negative: 'No flicker', shots: '00:00 opening' });
});

test('malformed model output does not reach the client', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: 'not json' } }] }));
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /invalid response/);
});

test('missing provider credentials never expose secrets', async () => {
  delete process.env.OPENAI_API_KEY;
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Prompt service is not configured.' });
});

test('oversized requests are rejected', async () => {
  const req = request();
  req.headers.set('content-length', '12001');
  assert.equal((await POST(req)).status, 413);
});
