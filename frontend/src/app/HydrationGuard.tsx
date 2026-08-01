'use client';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth/authStore';

export function HydrationGuard({ children }: { children: ReactNode }) {
  const hydrateFromStorage = useAuthStore((s) => s.hydrateFromStorage);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-ptf-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-ptf-text-3 text-sm">Loading PTF...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
