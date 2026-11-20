import 'server-only';

/**
 * Server-side fetch for public data in Server Components (SSR/ISR for SEO).
 * Talks to the API directly over the internal URL.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
let warned = 0;

export async function serverGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api${path}`, { next: { revalidate } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
    return (await res.json()) as T;
  } catch (e) {
    const msg = (e as Error).message;
    // Pages still render (with empty states). Warn instead of error so the dev overlay stays quiet,
    // and say what is actually wrong. Throttled to one message per 10 seconds.
    if (Date.now() - warned > 10_000) {
      warned = Date.now();
      console.warn(
        msg === 'fetch failed'
          ? `[serverGet] Cannot reach the API at ${API_URL} (${path}). Is it running? Check http://127.0.0.1:4000/api/health`
          : `[serverGet] ${path}: ${msg}`,
      );
    }
    return null;
  }
}
