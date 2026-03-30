import { useState, useEffect, useRef, useCallback } from 'react';
import type { Operation } from '../types';
import { fetchApi } from '../utils/api';

export interface GenericQueueItem {
  id: string;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
}

export interface UseSyncQueueReturn {
  syncQueue: Operation[];
  addToSyncQueue: (operation: Operation) => void;
  genericSyncQueue: GenericQueueItem[];
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  isSyncing: boolean;
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  failedOperations: { id: number; error: string }[];
}

export function useSyncQueue(
  apiBaseUrl: string,
  showToast: (message: string, type: 'success' | 'error') => void
): UseSyncQueueReturn {
  const [syncQueue, setSyncQueue] = useState<Operation[]>(() => {
    const saved = localStorage.getItem('sync_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const syncQueueRef = useRef<Operation[]>([]);
  const processingQueue = useRef(false);

  const [genericSyncQueue, setGenericSyncQueue] = useState<GenericQueueItem[]>(() => {
    const saved = localStorage.getItem('generic_sync_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const genericSyncQueueRef = useRef(genericSyncQueue);
  const processingGenericQueue = useRef(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [failedOperations, setFailedOperations] = useState<{ id: number; error: string }[]>([]);
  // Internal retry counter — not exposed to callers
  const [syncTrigger, setSyncTrigger] = useState(0);

  useEffect(() => {
    syncQueueRef.current = syncQueue;
    localStorage.setItem('sync_queue', JSON.stringify(syncQueue));
  }, [syncQueue]);

  useEffect(() => {
    genericSyncQueueRef.current = genericSyncQueue;
    localStorage.setItem('generic_sync_queue', JSON.stringify(genericSyncQueue));
  }, [genericSyncQueue]);

  // Encapsulates the merge-or-append logic so callers don't need processingQueue.current
  const addToSyncQueue = useCallback((operation: Operation) => {
    setSyncQueue(prev => {
      const existingIndex = prev.findIndex(op => op.id === operation.id);

      if (existingIndex !== -1 && (existingIndex > 0 || !processingQueue.current)) {
        const newQueue = [...prev];
        newQueue[existingIndex] = operation;
        console.log(`[SyncQueue] Merged update for operation ${operation.id} at position ${existingIndex}`);
        return newQueue;
      }

      if (existingIndex === 0 && processingQueue.current) {
        const secondEntryIndex = prev.findIndex((op, i) => i > 0 && op.id === operation.id);
        if (secondEntryIndex !== -1) {
          const newQueue = [...prev];
          newQueue[secondEntryIndex] = operation;
          console.log(`[SyncQueue] Merged update for operation ${operation.id} at pending position ${secondEntryIndex}`);
          return newQueue;
        }
      }

      console.log(`[SyncQueue] Added new update for operation ${operation.id} to queue`);
      return [...prev, operation];
    });
  }, []);

  const pushToGenericQueue = useCallback((url: string, method: string, payload: any) => {
    setGenericSyncQueue(prev => [
      ...prev,
      { id: Date.now().toString() + Math.random().toString(), timestamp: Date.now(), url, method, payload },
    ]);
    showToast('Ação registrada (sincronizando em background)', 'success');
  }, [showToast]);

  // ── Operations bulk-sync queue processor ──
  useEffect(() => {
    const processQueue = async () => {
      if (syncQueue.length === 0) {
        setIsSyncing(false);
        return;
      }
      if (processingQueue.current) return;

      processingQueue.current = true;
      setIsSyncing(true);

      const operationsToSync = [...syncQueue];
      try {
        const response = await fetchApi(`${apiBaseUrl}/api/operations/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations: operationsToSync }),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Falha na sincronização em lote');

        const result = await response.json();
        const { failed } = result;
        setSyncQueue([]);
        setFailedOperations(failed);

        if (failed.length > 0) {
          showToast(`Falha em ${failed.length} operações: ${failed.map((f: { id: number }) => f.id).join(', ')}`, 'error');
        } else {
          showToast('Sincronização concluída com sucesso', 'success');
        }
      } catch (error) {
        console.error('Sync error', error);
        setTimeout(() => {
          processingQueue.current = false;
          setSyncTrigger(prev => prev + 1);
        }, 5000);
        return;
      } finally {
        processingQueue.current = false;
      }
    };

    processQueue();
  }, [syncQueue, syncTrigger]); // apiBaseUrl and showToast are stable references

  // ── Generic HTTP queue processor ──
  useEffect(() => {
    if (genericSyncQueue.length === 0) return;

    const processGenericQueue = async () => {
      if (processingGenericQueue.current) return;
      processingGenericQueue.current = true;
      setIsSyncing(true);

      const itemsToProcess = [...genericSyncQueue];
      const itemsFailed: GenericQueueItem[] = [];

      for (const item of itemsToProcess) {
        try {
          const response = await fetchApi(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Falha na request genérica');
        } catch (error) {
          console.error('Generic Sync Error on', item.url, error);
          itemsFailed.push(item);
        }
      }

      setGenericSyncQueue(itemsFailed);
      processingGenericQueue.current = false;
      setIsSyncing(false);
    };

    const flushTimeout = setTimeout(processGenericQueue, 2000);
    return () => clearTimeout(flushTimeout);
  }, [genericSyncQueue]);

  // ── Graceful shutdown: flush pending queues when tab hides or closes ──
  // Dep array is intentionally [] — both queues are read via refs to avoid stale closures
  useEffect(() => {
    const handleShutdown = () => {
      const queue = syncQueueRef.current;
      if (queue.length > 0) {
        const url = `${apiBaseUrl}/api/operations/sync-all`;
        const blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });
        const sent = navigator.sendBeacon?.(url, blob);
        if (!sent) {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queue),
            keepalive: true,
            credentials: 'include',
          }).catch(() => {});
        }
      }

      const gQueue = genericSyncQueueRef.current;
      if (gQueue.length > 0) {
        for (const item of gQueue) {
          const gBlob = new Blob([JSON.stringify(item.payload)], { type: 'application/json' });
          const gSent = navigator.sendBeacon?.(item.url, gBlob);
          if (!gSent) {
            fetch(item.url, {
              method: item.method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
              keepalive: true,
              credentials: 'include',
            }).catch(() => {});
          }
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleShutdown();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', handleShutdown);
    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', handleShutdown);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    syncQueue,
    addToSyncQueue,
    genericSyncQueue,
    pushToGenericQueue,
    isSyncing,
    setIsSyncing,
    failedOperations,
  };
}
