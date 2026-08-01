import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/dashboard', '/wallet'];
const AUTH_ROUTES = ['/login', '/register', '/onboarding'];

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return Date.now() / 1000 > payload.exp;
  } catch {
    return true; // malformed token = treat as expired
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('ptf_auth_token')?.value;
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // Token is present but expired — clear cookie and redirect to login
  const tokenValid = token && !isTokenExpired(token);

  if (isProtected && !tokenValid) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token && !tokenValid) {
      // Clear the expired cookie
      response.cookies.delete('ptf_auth_token');
    }
    return response;
  }
  if (isAuthRoute && tokenValid && !pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/wallet/:path*', '/login', '/register', '/onboarding'],
};
