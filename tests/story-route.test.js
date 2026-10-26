import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS } from '../lib/prompt.js';
import { POST } from '../app/api/story/route.js';
import { POST as updateScene } from '../app/api/story/scene/route.js';

const direction = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values[0]]));
Object.assign(direction, { idea: 'A fisherman follows a lost lantern through a storm', storyDuration: '30s' });
const scene = { title: 'Lost lantern', summary: 'A search begins.', duration: '10s', transition: 'Direct cut', camera: 'Slow dolly in', angle: 'Eye level', composition: 'Rule of thirds', light: 'Moonlit', mood: 'Tense & mysterious', audio: 'Rain', action: 'He follows a glow.', locks: ['character'] };
const outline = [scene, { ...scene, title: 'The glow' }, { ...scene, title: 'Home' }];
const continuity = Object.fromEntries(['character', 'wardrobe', 'props', 'environment', 'style', 'details'].map(key => [key, `${key} facts`]));
function request(body = { direction }, path = '/api/story') {
  return new Request('http://localhost' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body) });
}
const providerResult = content => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

test.beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = 'https://provider.test/v1';
  process.env.OPENAI_MODEL = 'kimi-k3';
});

test('outline endpoint returns editable scenes without generating prompts', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://provider.test/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'kimi-k3');
    assert.equal(body.max_tokens, 4500);
    return providerResult({ scenes: outline });
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.scenes.length, 3);
  assert.equal(result.continuity, undefined);
  assert.ok(result.scenes.every(item => item.prompt === ''));
});

test('finalization preserves approved metadata and returns only generated prompts', async t => {
  t.mock.method(globalThis, 'fetch', async () => providerResult({ continuity, scenes: outline.map(item => ({ ...item, title: 'Ignored override', prompt: `Prompt for ${item.title}` })) }));
  const response = await POST(request({ stage: 'prompts', input: { direction, scenes: outline } }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.scenes.map(item => item.title), outline.map(item => item.title));
  assert.equal(result.scenes[0].prompt, 'Prompt for Lost lantern');
});

test('story endpoint rejects malformed and incomplete output', async t => {
  t.mock.method(globalThis, 'fetch', async () => providerResult({ scenes: outline.slice(1) }));
  assert.equal((await POST(request())).status, 502);
});

test('story validates before calling provider', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Provider must not be called'));
  assert.equal((await POST(request({ direction: { ...direction, storyDuration: '120s' } }))).status, 400);
  assert.equal((await POST(request({ stage: 'prompts', input: { direction, scenes: [] } }))).status, 400);
});

test('story requires production credentials', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
});

test('single-scene endpoint reuses validation and returns updated scene', async t => {
  const story = { continuity, scenes: [{ ...scene, prompt: 'Original' }] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://provider.test/v1/chat/completions');
    assert.equal(JSON.parse(options.body).max_tokens, 2200);
    return providerResult({ ...scene, prompt: 'Rewritten' });
  });
  const response = await updateScene(request({ input: { direction, story, index: 0, kind: 'prompt' } }, '/api/story/scene'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).scene.prompt, 'Rewritten');
});
