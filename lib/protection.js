export function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim().slice(0, 64) || 'unknown';
}

export async function verifyTurnstile(token, ip) {
  if (process.env.NODE_ENV !== 'production') return true;
  if (!process.env.TURNSTILE_SECRET_KEY || typeof token !== 'string' || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

export async function checkRateLimit(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') return { allowed: false };
    return { allowed: true };
  }
  const bucket = Math.floor(Date.now() / 3_600_000);
  const key = `kino:rate:${ip}:${bucket}`;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3700, 'NX']]),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) return { allowed: false };
    const result = await response.json();
    return { allowed: Number(result[0]?.result) <= 10 };
  } catch {
    return { allowed: false };
  }
}
