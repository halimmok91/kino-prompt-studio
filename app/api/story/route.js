import { validateApprovedStory, validateStory } from '../../../lib/story.js';
import { createOutline, createStory } from '../../../lib/provider.js';
import { checkRateLimit, clientIp, verifyTurnstile } from '../../../lib/protection.js';

export const runtime = 'nodejs';
export const maxDuration = 60;
const error = (message, status = 502) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  let body;
  try {
    if (Number(request.headers.get('content-length')) > 30_000) return error('Request too large.', 413);
    body = await request.json();
  } catch { return error('Invalid request.', 400); }
  const stage = body?.stage === 'prompts' ? 'prompts' : 'outline';
  const input = stage === 'prompts' ? validateApprovedStory(body?.input) : validateStory(body?.direction);
  if (input.error) return error(input.error, 400);
  const direction = input.direction;
  const ip = clientIp(request);
  if (!(await checkRateLimit(ip)).allowed) return error('Too many requests. Try again later.', 429);
  if (!await verifyTurnstile(body?.turnstileToken, ip)) return error('Human verification failed. Please retry.', 403);
  try {
    const story = stage === 'outline' ? await createOutline(direction) : await createStory(direction, input.scenes);
    if (!story) return error('The model returned an incomplete story. Please retry.');
    return Response.json(story, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Kimi story request failed:', err.name);
    return error(err.status ? err.message : err.name === 'TimeoutError' ? 'The model took too long. Please retry.' : 'The story service is temporarily unavailable.', err.status || 502);
  }
}
