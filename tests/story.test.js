import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS } from '../lib/prompt.js';
import {
  buildOutlineMessages, buildSceneMessages, buildStoryMessages,
  validateApprovedStory, validateOutline, validateSceneUpdate,
  validateStory, validateStoryPrompts, validateUpdatedScene,
} from '../lib/story.js';

const direction = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values[0]]));
Object.assign(direction, { idea: 'A fisherman follows a lost lantern through a storm', storyDuration: '30s' });
const scene = (overrides = {}) => ({
  title: 'The lost lantern', summary: 'The fisherman follows a distant glow.',
  duration: '10s', transition: 'Direct cut', camera: 'Slow dolly in', angle: 'Eye level',
  composition: 'Rule of thirds', light: 'Moonlit', mood: 'Tense & mysterious',
  audio: 'Rain and distant thunder', action: 'He walks through the mangroves.',
  locks: ['character'], prompt: '', ...overrides,
});
const outline = [scene(), scene({ duration: '5s', title: 'Home' }), scene({ duration: '15s', title: 'Dawn' })];
const continuity = Object.fromEntries(['character', 'wardrobe', 'props', 'environment', 'style', 'details'].map(key => [key, `${key} facts`]));

test('story validates supported durations and optional direction', () => {
  for (const duration of ['30s', '60s', '90s']) {
    const result = validateStory({ ...direction, storyDuration: duration, pacing: 'Slow burn', ending: 'He gets home.' });
    assert.equal(result.direction.duration, '10s');
    assert.equal(result.direction.storyDuration, duration);
    assert.match(buildOutlineMessages(result.direction)[0].content, new RegExp(`exactly ${Number.parseInt(duration) / 10} connected`));
  }
  assert.match(validateStory({ ...direction, storyDuration: '120s' }).error, /story duration/);
  assert.match(validateStory(null).error, /story duration/);
  assert.match(validateStory({ ...direction, idea: '' }).error, /Describe/);
});

test('story preserves established visual and safety controls', () => {
  assert.match(validateStory({ ...direction, resolution: '4K' }).error, /resolution/);
  assert.match(validateStory({ ...direction, idea: 'x'.repeat(801) }).error, /idea/);
  assert.match(validateStory({ ...direction, camera: 'x'.repeat(121) }).error, /camera/);
  assert.match(validateStory({ ...direction, ending: 'x'.repeat(401) }).error, /ending/);
});

test('outline validation strips extra fields and rejects malformed values', () => {
  const result = validateOutline({ scenes: outline.map(item => ({ ...item, duration: '10s', extra: 'discard' })) }, 3);
  assert.equal(result.scenes.length, 3);
  assert.equal(result.scenes[0].extra, undefined);
  assert.equal(result.scenes[0].prompt, '');
  assert.equal(validateOutline({ scenes: outline.slice(1) }, 3), null);
  assert.equal(validateOutline({ scenes: [scene({ title: 42 })] }, 1), null);
  assert.equal(validateOutline({ scenes: [scene({ duration: '30s' })] }, 1), null);
  assert.equal(validateOutline({ scenes: [scene({ transition: 'Dissolve' })] }, 1), null);
});

test('approved outline supports edited scenes, flexible durations, and scene limits', () => {
  const checked = validateApprovedStory({ direction, scenes: outline });
  assert.equal(checked.error, undefined);
  assert.deepEqual(checked.scenes.map(item => item.duration), ['10s', '5s', '15s']);
  assert.equal(validateApprovedStory({ direction, scenes: Array(13).fill(scene()) }).scenes, undefined);
  assert.equal(validateApprovedStory({ direction, scenes: Array(12).fill(scene({ duration: '15s' })) }).error, undefined);
  assert.equal(validateApprovedStory({ direction, scenes: [scene({ duration: '15s' }), ...Array(12).fill(scene({ duration: '15s' }))].slice(1) }).error, undefined);
  assert.equal(validateApprovedStory({ direction, scenes: [] }).error !== undefined, true);
  assert.match(buildStoryMessages(direction, outline)[0].content, /approved duration/);
  assert.doesNotMatch(buildStoryMessages(direction, outline)[0].content, /requested duration is 10/);
});

test('final prompts cannot override approved metadata', () => {
  const generated = { continuity, scenes: outline.map((item, index) => ({ ...item, title: 'Model override', prompt: `Prompt ${index}` })) };
  const result = validateStoryPrompts(generated, outline);
  assert.deepEqual(result.scenes.map(item => item.title), outline.map(item => item.title));
  assert.deepEqual(result.scenes.map(item => item.prompt), ['Prompt 0', 'Prompt 1', 'Prompt 2']);
  assert.equal(validateStoryPrompts({ continuity, scenes: [{ prompt: '' }] }, [scene()]), null);
  assert.equal(validateStoryPrompts({ continuity: { ...continuity, character: '' }, scenes: [{ prompt: 'ok' }] }, [scene()]), null);
});

test('scene updates validate full story and prompt-only regeneration preserves metadata', () => {
  const story = { continuity, scenes: outline.map(item => ({ ...item, prompt: 'Original prompt' })) };
  const update = validateSceneUpdate({ direction, story, index: 1, kind: 'prompt' });
  assert.equal(update.error, undefined);
  assert.match(buildSceneMessages(update)[0].content, /preserving/);
  const original = story.scenes[1];
  assert.equal(validateUpdatedScene({ ...original, prompt: 'New prompt' }, original, 'prompt').prompt, 'New prompt');
  assert.equal(validateUpdatedScene({ ...original, title: 'Changed', prompt: 'New prompt' }, original, 'prompt'), null);
  assert.equal(validateUpdatedScene({ ...original, duration: '12s' }, original, 'full'), null);
  assert.deepEqual(validateUpdatedScene({ ...original, locks: [] }, original, 'full').locks, ['character']);
});

test('scene updates reject invalid indices, kinds, counts, and durations', () => {
  const story = { continuity, scenes: [scene({ prompt: 'Prompt' })] };
  for (const patch of [{ index: -1 }, { index: 1 }, { kind: 'other' }]) {
    assert.equal(validateSceneUpdate({ direction, story, index: 0, kind: 'full', ...patch }).error !== undefined, true);
  }
  assert.equal(validateSceneUpdate({ direction, story: { continuity, scenes: Array(13).fill(scene({ prompt: 'Prompt' })) }, index: 0, kind: 'full' }).error !== undefined, true);
});
