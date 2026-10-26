import { buildMessages, validateDirection } from '../../../lib/prompt.js';
import { checkRateLimit, clientIp, verifyTurnstile } from '../../../lib/protection.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function error(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  let body;
  try {
    const size = Number(request.headers.get('content-length'));
    if (size > 12_000) return error('Request too large.', 413);
    body = await request.json();
  } catch {
    return error('Invalid request.', 400);
  }
  const { direction, error: validationError } = validateDirection(body?.direction);
  if (validationError) return error(validationError, 400);
  const ip = clientIp(request);
  const limit = await checkRateLimit(ip);
  if (!limit.allowed) return error('Too many requests. Try again later.', 429);
  if (!await verifyTurnstile(body?.turnstileToken, ip)) return error('Human verification failed. Please retry.', 403);
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_BASE_URL) return error('Prompt service is not configured.', 503);

  try {
    const baseUrl = process.env.OPENAI_BASE_URL.replace(/\/$/, '');
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'kimi-k3',
        messages: buildMessages(direction),
        temperature: 0.7,
        max_tokens: 2200,
      }),
      signal: AbortSignal.timeout(50_000),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      console.error('Kimi provider error:', upstream.status);
      return error('The prompt service is temporarily unavailable. Please try again.', 502);
    }
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 30_000) return error('The model returned an invalid response.', 502);
    let result;
    try {
      result = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      return error('The model returned an invalid response. Please retry.', 502);
    }
    if (!result || ['prompt', 'negative', 'shots'].some(key => typeof result[key] !== 'string' || result[key].length > 12_000) || !result.prompt.trim()) {
      return error('The model returned an incomplete prompt. Please retry.', 502);
    }
    return Response.json({ prompt: result.prompt, negative: result.negative, shots: result.shots }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Kimi request failed:', err.name);
    return error(err.name === 'TimeoutError' ? 'The model took too long. Please retry.' : 'The prompt service is temporarily unavailable.', 502);
  }
}
