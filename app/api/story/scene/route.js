import { validateSceneUpdate } from '../../../../lib/story.js';
import { createScene } from '../../../../lib/provider.js';
import { checkRateLimit, clientIp, verifyTurnstile } from '../../../../lib/protection.js';

export const runtime = 'nodejs';
export const maxDuration = 60;
const error = (message, status = 502) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  let body;
  try {
    if (Number(request.headers.get('content-length')) > 100_000) return error('Request too large.', 413);
    body = await request.json();
  } catch { return error('Invalid request.', 400); }
  const input = validateSceneUpdate(body?.input);
  if (input.error) return error(input.error, 400);
  const ip = clientIp(request);
  if (!(await checkRateLimit(ip)).allowed) return error('Too many requests. Try again later.', 429);
  if (!await verifyTurnstile(body?.turnstileToken, ip)) return error('Human verification failed. Please retry.', 403);
  try {
    const scene = await createScene(input);
    if (!scene) return error('The model returned an invalid scene. Your edits are unchanged.');
    return Response.json({ scene }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Kimi scene request failed:', err.name);
    return error(err.status ? err.message : err.name === 'TimeoutError' ? 'The model took too long. Please retry.' : 'The story service is temporarily unavailable.', err.status || 502);
  }
}
