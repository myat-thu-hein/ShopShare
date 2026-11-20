import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protected routes (UX layer). The API enforces auth and roles on every request;
 * this only redirects early so people don't see a flash of a page they can't use.
 */
const RULES: { prefix: string; roles?: string[] }[] = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/seller', roles: ['SELLER', 'ADMIN'] },
  { prefix: '/orders' },
  { prefix: '/wishlist' },
  { prefix: '/profile' },
  { prefix: '/checkout/success' },
];

function decodeRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json.exp === 'number' && json.exp * 1000 < Date.now()) return null;
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const access = req.cookies.get('ss_at')?.value;
  const refresh = req.cookies.get('ss_rt')?.value;
  if (!access && !refresh) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  // With a fresh access token we can check the role now; otherwise the client refreshes and RoleGate decides.
  const role = access ? decodeRole(access) : null;
  if (rule.roles && role && !rule.roles.includes(role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/seller/:path*',
    '/orders/:path*',
    '/wishlist',
    '/profile',
    '/checkout/success',
  ],
};
