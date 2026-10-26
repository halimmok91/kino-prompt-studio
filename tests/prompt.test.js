import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, OPTIONS, validateDirection } from '../lib/prompt.js';

const direction = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values[0]]));
direction.idea = 'A fisherman casts a net at dawn';
direction.audio = 'Water and distant birds';

test('valid direction preserves every field', () => {
  assert.deepEqual(validateDirection(direction), { direction });
  const messages = buildMessages(direction);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content, /A fisherman casts a net at dawn/);
  assert.match(messages[1].content, /480p/);
  assert.match(messages[0].content, /one-sentence summary/);
  assert.match(messages[0].content, /contiguous/);
  assert.match(messages[0].content, /No subtitles/);
});

test('duration and resolution reject unsupported custom values', () => {
  assert.match(validateDirection({ ...direction, duration: '7s' }).error, /duration/);
  assert.match(validateDirection({ ...direction, resolution: '4K' }).error, /resolution/);
  assert.match(validateDirection({ ...direction, ratio: '21:9' }).error, /aspect ratio/);
});

test('other controls support bounded manual entries', () => {
  const custom = { ...direction, camera: 'Custom movement through the reeds', style: 'Hand-cut paper animation' };
  assert.equal(validateDirection(custom).direction.camera, custom.camera);
  assert.equal(validateDirection({ ...direction, camera: 'x'.repeat(121) }).error, 'Invalid camera movement.');
  assert.equal(validateDirection({ ...direction, camera: '   ' }).error, 'Enter your camera movement.');
});

test('untrusted and oversized inputs fail safely', () => {
  for (const input of [null, [], 'x', 42]) assert.equal(validateDirection(input).error, 'Invalid direction.');
  assert.equal(validateDirection({ ...direction, idea: '' }).error, 'Describe your scene first.');
  assert.equal(validateDirection({ ...direction, idea: 'x'.repeat(801) }).error, 'Invalid idea.');
  assert.equal(validateDirection({ ...direction, audio: 'x'.repeat(301) }).error, 'Invalid audio.');
  assert.equal(validateDirection({ ...direction, camera: 'bad\0value' }).error, 'Invalid camera movement.');
});
