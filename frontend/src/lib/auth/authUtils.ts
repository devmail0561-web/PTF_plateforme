import type { JwtPayload } from '@/types/graphql';

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const raw = token.split('.')[1];
    return JSON.parse(atob(raw)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = (payload as unknown as { exp?: number }).exp;
  if (!exp) return false;
  return Date.now() / 1000 > exp;
}
