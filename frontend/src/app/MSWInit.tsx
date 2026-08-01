'use client';
import dynamic from 'next/dynamic';

const MSWProvider = dynamic(
  () => import('./MSWProvider').then((m) => ({ default: m.MSWProviderInner })),
  { ssr: false }
);

export function MSWInit() {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== 'enabled') return null;
  return <MSWProvider />;
}
