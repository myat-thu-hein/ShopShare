/**
 * Browser API client. Calls go to /api/* on this same origin (proxied to NestJS by
 * next.config rewrites), so httpOnly auth cookies are sent automatically.
 *
 * When a request gets 401, we try ONE token refresh and retry. Concurrent 401s share
 * the same refresh promise, so the refresh token is only rotated once.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; retry?: boolean };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { body, retry = true, headers, ...rest } = opts;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...rest,
    credentials: 'include',
    headers: { ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let errors: { path: string; message: string }[] | undefined;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
      errors = data.errors;
    } catch {
      /* not JSON */
    }
    if (res.status === 429) message = 'Too many requests — please wait a moment and try again.';
    throw new ApiError(res.status, message, errors);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.errors?.length ? e.errors.map((x) => x.message).join('. ') : e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
