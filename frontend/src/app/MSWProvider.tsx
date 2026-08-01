'use client';
import { useEffect } from 'react';

export function MSWProviderInner() {
  useEffect(() => {
    import('../mocks/browser').then(({ worker }) => {
      worker.start({
        onUnhandledRequest: 'bypass',
        serviceWorker: { url: '/mockServiceWorker.js' },
      });
    });
  }, []);

  return null;
}
