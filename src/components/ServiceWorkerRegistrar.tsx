'use client';

import { useEffect } from 'react';

/**
 * Registers the NoteBase Service Worker cleanly so pages and static JS chunks
 * remain available offline inside Android WebView and mobile browsers.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
