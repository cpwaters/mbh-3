import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrainSummary, QueuedRequest, SyncQueue } from '@mbh/offline';
import { createSyncQueue } from '../lib/queue';

// Owns one SyncQueue for the app's lifetime and keeps the UI honest about
// what is waiting for signal. Drains on mount, whenever the browser reports
// it is back online, and on a slow interval as a backstop.
export interface QueueView {
  items: QueuedRequest[];
  pending: number;
  online: boolean;
  enqueue: (type: string, payload: unknown, requestId: string) => Promise<void>;
  drainNow: () => Promise<DrainSummary>;
}

export function useSyncQueue(getIdToken: () => Promise<string | null>): QueueView {
  const queueRef = useRef<SyncQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSyncQueue(getIdToken);
  }
  const queue = queueRef.current;

  const [items, setItems] = useState<QueuedRequest[]>([]);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  const refresh = useCallback(async () => {
    setItems(await queue.items());
  }, [queue]);

  const drainNow = useCallback(async () => {
    const summary = await queue.drain();
    await refresh();
    return summary;
  }, [queue, refresh]);

  const enqueue = useCallback(
    async (type: string, payload: unknown, requestId: string) => {
      await queue.enqueue(type, payload, requestId);
      await refresh();
      // Try to deliver straight away; if offline it stays queued, honestly.
      await drainNow();
    },
    [queue, refresh, drainNow]
  );

  useEffect(() => {
    void refresh();
    void drainNow();

    const onOnline = () => {
      setOnline(true);
      void drainNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const interval = window.setInterval(() => {
      void drainNow();
    }, 15_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(interval);
    };
  }, [refresh, drainNow]);

  return { items, pending: items.length, online, enqueue, drainNow };
}
