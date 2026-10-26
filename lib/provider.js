import { buildOutlineMessages, buildSceneMessages, buildStoryMessages, validateOutline, validateStoryPrompts, validateUpdatedScene } from './story.js';

export async function createStory(direction, scenes) {
  const result = await request(direction, buildStoryMessages(direction, scenes), 7000, 60000);
  return validateStoryPrompts(result, scenes);
}

export async function createOutline(direction) {
  const result = await request(direction, buildOutlineMessages(direction), 4500, 30000);
  return validateOutline(result, Number.parseInt(direction.storyDuration, 10) / 10);
}

export async function createScene(input) {
  const result = await request(input.direction, buildSceneMessages(input), 2200, 16000);
  return validateUpdatedScene(result, input.story.scenes[input.index], input.kind);
}

async function request(direction, messages, maxTokens, maxLength) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_BASE_URL) throw Object.assign(new Error('Prompt service is not configured.'), { status: 503 });
  const baseUrl = process.env.OPENAI_BASE_URL.replace(/\/$/, '');
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'kimi-k3', messages, temperature: 0.7, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(55_000), cache: 'no-store',
  });
  if (!upstream.ok) { await upstream.body?.cancel(); throw new Error('The story service is temporarily unavailable. Please try again.'); }
  const payload = await upstream.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length > maxLength) throw new Error('The model returned an invalid response.');
  try { return JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('The model returned an invalid response. Please retry.'); }
}
