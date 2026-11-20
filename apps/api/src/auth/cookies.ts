import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/guards';
import type { Tokens } from './auth.service';

/** Parses "15m" / "1h" / "900" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const m = ttl.match(/^(\d+)([smhd])?$/);
  if (!m) return 15 * 60_000;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] ?? 's') as 's' | 'm' | 'h' | 'd'];
  return n * unit;
}

function base(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

/**
 * Tokens live in httpOnly cookies so JavaScript (and XSS) cannot read them.
 * The web app proxies /api/* to this API, so cookies are first-party on the web domain.
 */
export function setAuthCookies(res: Response, tokens: Tokens, env: Env) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base(env), maxAge: ttlToMs(env.JWT_ACCESS_TTL) });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(env),
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86_400_000,
  });
}

export function clearAuthCookies(res: Response, env: Env) {
  res.clearCookie(ACCESS_COOKIE, base(env));
  res.clearCookie(REFRESH_COOKIE, base(env));
}
