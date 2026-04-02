import { useState, useEffect, useRef, useCallback } from 'react';
import type { Operation } from '../types';
import { encodeHtmlField, wrapWithEncoding } from '../utils/wafEncoding';
import { fetchApi } from '../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max attempts per individual operation before moving it to the dead-letter queue. */
const MAX_RETRIES_PER_OP = 4;

/** Debounce: wait this long after the last queue change before processing. */
const DEBOUNCE_MS = 1500;

/** Per-request network timeout. Protects against slow Databricks queries. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Exponential backoff base: attempt 0 → 5s, 1 → 15s, 2 → 45s, 3 → 135s */
const BACKOFF_BASE_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenericQueueItem {
  id: string;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
}

/** An item that has persistently failed and needs user attention. */
export interface DeadLetterItem {
  operation: Operation;
  /** ISO timestamp of first failure */
  failedAt: string;
  /** Last error message */
  lastError: string;
  retries: number;
}

export interface UseSyncQueueReturn {
  syncQueue: Operation[];
  addToSyncQueue: (operation: Operation) => void;
  retryDeadLetter: (operationId: number) => void;
  discardDeadLetter: (operationId: number) => void;
  deadLetterQueue: DeadLetterItem[];
  genericSyncQueue: GenericQueueItem[];
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  isSyncing: boolean;
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  failedOperations: { id: number; error: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wraps fetchApi with an AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchApi(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fields that contain complex nested data requiring the full bulk-update pipeline.
 * If ANY of these differ from the snapshot, full sync is used.
 */
const FULL_SYNC_FIELDS = [
  'events', 'taskRules', 'ratingHistory', 'contacts',
  'taskExceptions', 'projects', 'guarantees', 'covenants', 'defaultMonitoring',
];

const PATCH_ONLY_FIELDS = new Set([
  'watchlist', 'status', 'ratingOperation', 'responsibleAnalyst',
  'structuringAnalyst', 'description', 'area', 'name', 'segmento',
  'maturityDate', 'estimatedDate', 'wasStructured', 'movedToLegacyDate',
]);

function requiresFullSync(op: Operation): boolean {
  const raw = localStorage.getItem(`op_snapshot_${op.id}`);
  if (!raw) return true;
  try {
    const snapshot = JSON.parse(raw) as Record<string, any>;
    for (const field of FULL_SYNC_FIELDS) {
      if (JSON.stringify(snapshot[field] ?? null) !== JSON.stringify((op as any)[field] ?? null))
        return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Retorna true se APENAS os eventos mudaram (outros full-sync fields intactos).
 * Nesses casos, usa /sync-events ao invés do bulk-update completo.
 */
function requiresEventsOnlySync(op: Operation): boolean {
  const raw = localStorage.getItem(`op_snapshot_${op.id}`);
  if (!raw) return false;
  try {
    const snapshot = JSON.parse(raw) as Record<string, any>;
    const eventsChanged =
      JSON.stringify(snapshot['events'] ?? null) !== JSON.stringify((op as any)['events'] ?? null);
    if (!eventsChanged) return false;
    // Verifica se algum outro campo full-sync mudou além de events
    const otherFullSyncFields = FULL_SYNC_FIELDS.filter(f => f !== 'events');
    const otherChanged = otherFullSyncFields.some(
      field => JSON.stringify(snapshot[field] ?? null) !== JSON.stringify((op as any)[field] ?? null)
    );
    return !otherChanged;
  } catch {
    return false;
  }
}


/**
 * Computa o DELTA de eventos: apenas novos, modificados e deletados.
 *
 * PROBLEMA ANTERIOR: enviava TODOS os eventos da operação a cada sync.
 * Uma operação com 150 eventos + 1 novo gerava um payload de 151 eventos
 * codificados em Base64 → centenas de KB → Azure WAF bloqueava com 403.
 *
 * SOLUÇÃO: compara o estado atual com o snapshot do localStorage e envia
 * apenas o diff, o que reduz o payload de N eventos para ≤ K eventos
 * alterados (tipicamente 1).
 *
 * O backend já é idempotente: IDs numéricos existentes → UPDATE/skip,
 * IDs temporários (não-numéricos) → INSERT, { deleted: true } → DELETE.
 */
function buildEventsPayload(op: Operation): Record<string, any> {
  const events = ((op as any).events ?? []) as any[];

  // Carrega o snapshot para calcular o delta
  const raw = localStorage.getItem(`op_snapshot_${op.id}`);
  const snapshotEvents: any[] = raw ? (JSON.parse(raw).events ?? []) : [];
  const snapshotMap = new Map<string, any>(
    snapshotEvents.map((e: any) => [String(e.id ?? ''), e])
  );

  /** Normaliza um campo para comparação — ignora diferenças de tipo null/undefined/'' */
  const norm = (v: unknown) => (v == null || v === '' ? '' : String(v));

  /** Dado um evento, retorna true se ele mudou em relação ao snapshot */
  const eventChanged = (ev: any): boolean => {
    const snap = snapshotMap.get(String(ev.id ?? ''));
    if (!snap) return true; // novo evento → não estava no snapshot
    return (
      norm(ev.date)?.substring(0, 10) !== norm(snap.date)?.substring(0, 10) ||
      norm(ev.type)             !== norm(snap.type) ||
      norm(ev.title)            !== norm(snap.title) ||
      norm(ev.description)      !== norm(snap.description) ||
      norm(ev.nextSteps)        !== norm(snap.nextSteps) ||
      norm(ev.attentionPoints)  !== norm(snap.attentionPoints) ||
      norm(ev.ourAttendees)     !== norm(snap.ourAttendees) ||
      norm(ev.operationAttendees) !== norm(snap.operationAttendees)
    );
  };

  // Eventos novos ou modificados
  const changedEvents = events.filter(e => {
    const id = String(e.id ?? '');
    // ID temporário (ex: Date.now()) → novo evento
    const isTemporary = !id || !/^\d+$/.test(id);
    if (isTemporary) return true;
    // ID numérico → verifica se mudou
    return eventChanged(e);
  });

  // Eventos deletados (estavam no snapshot mas não estão mais no estado atual)
  const currentIds = new Set(events.map(e => String(e.id ?? '')));
  const deletedEvents = snapshotEvents
    .filter(e => {
      const id = String(e.id ?? '');
      return /^\d+$/.test(id) && !currentIds.has(id);
    })
    .map(e => ({ ...e, deleted: true }));

  const deltaEvents = [...changedEvents, ...deletedEvents];

  console.log(
    `[SyncQueue] buildEventsPayload op ${op.id}: delta=${deltaEvents.length} ` +
    `(total=${events.length}, snapshot=${snapshotEvents.length})`
  );

  // encodeHtmlField + __html_encoded via wrapWithEncoding
  return wrapWithEncoding(
    {
      responsibleAnalyst: op.responsibleAnalyst,
      events: deltaEvents.map(e => ({
        ...e,
        description:     encodeHtmlField(e.description),
        nextSteps:       encodeHtmlField(e.nextSteps),
        attentionPoints: encodeHtmlField(e.attentionPoints),
      })),
    },
    [] // campos já codificados manualmente; __html_encoded adicionado pelo wrapWithEncoding
  );
}


function buildPatchPayload(op: Operation): Record<string, any> {
  const raw = localStorage.getItem(`op_snapshot_${op.id}`);
  const snapshot: Partial<Operation> = raw ? JSON.parse(raw) : {};
  const patch: Record<string, any> = { responsibleAnalyst: op.responsibleAnalyst };
  for (const field of PATCH_ONLY_FIELDS) {
    const v = (op as any)[field];
    if (v !== (snapshot as any)[field]) patch[field] = v;
  }
  return patch;
}

/** Salva apenas os campos que determinam full vs patch sync — não o objeto inteiro. */
function saveSnapshot(op: Operation) {
  const slim: Record<string, any> = { id: op.id };
  for (const field of FULL_SYNC_FIELDS) {
    slim[field] = (op as any)[field] ?? null;
  }
  try {
    localStorage.setItem(`op_snapshot_${op.id}`, JSON.stringify(slim));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn(`[SyncQueue] localStorage quota excedida ao salvar snapshot op ${op.id}. Próximo sync será full.`);
    }
  }
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn(`[SyncQueue] localStorage quota excedida ao salvar '${key}'. Dados de sync podem não sobreviver ao reload.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSyncQueue(
  apiBaseUrl: string,
  showToast: (message: string, type: 'success' | 'error') => void
): UseSyncQueueReturn {

  // ── Active queue (operations pending sync) ──
  const [syncQueue, setSyncQueue] = useState<Operation[]>(() =>
    loadFromStorage<Operation[]>('sync_queue', [])
  );
  const syncQueueRef = useRef<Operation[]>(syncQueue);

  // ── Dead-letter queue (persistently failed, needs user action) ──
  const [deadLetterQueue, setDeadLetterQueue] = useState<DeadLetterItem[]>(() =>
    loadFromStorage<DeadLetterItem[]>('dead_letter_queue', [])
  );

  // ── Per-operation retry counters (not persisted — reset on reload is fine) ──
  const retryCounts = useRef<Map<number, number>>(new Map());

  // ── Backoff delay per operation (tracks the current backoff ms) ──
  const backoffMs = useRef<Map<number, number>>(new Map());

  // ── Processing guards ──
  const processingQueue = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Generic queue ──
  const [genericSyncQueue, setGenericSyncQueue] = useState<GenericQueueItem[]>(() =>
    loadFromStorage<GenericQueueItem[]>('generic_sync_queue', [])
  );
  const genericSyncQueueRef = useRef(genericSyncQueue);
  const processingGenericQueue = useRef(false);

  // ── Other state ──
  const [isSyncing, setIsSyncing] = useState(false);
  const [failedOperations, setFailedOperations] = useState<{ id: number; error: string }[]>([]);
  const [syncTrigger, setSyncTrigger] = useState(0);

  // ── Persist to localStorage on change ──
  useEffect(() => {
    syncQueueRef.current = syncQueue;
    saveToStorage('sync_queue', syncQueue);
  }, [syncQueue]);

  useEffect(() => {
    saveToStorage('dead_letter_queue', deadLetterQueue);
  }, [deadLetterQueue]);

  useEffect(() => {
    genericSyncQueueRef.current = genericSyncQueue;
    saveToStorage('generic_sync_queue', genericSyncQueue);
  }, [genericSyncQueue]);

  // ── Queue management ──

  const addToSyncQueue = useCallback((operation: Operation) => {
    setSyncQueue(prev => {
      const existingIndex = prev.findIndex(op => op.id === operation.id);

      if (existingIndex !== -1 && (existingIndex > 0 || !processingQueue.current)) {
        const next = [...prev];
        next[existingIndex] = operation;
        console.log(`[SyncQueue] Merged update for op ${operation.id} at index ${existingIndex}`);
        return next;
      }

      if (existingIndex === 0 && processingQueue.current) {
        const pendingIdx = prev.findIndex((op, i) => i > 0 && op.id === operation.id);
        if (pendingIdx !== -1) {
          const next = [...prev];
          next[pendingIdx] = operation;
          console.log(`[SyncQueue] Merged update for op ${operation.id} at pending index ${pendingIdx}`);
          return next;
        }
      }

      console.log(`[SyncQueue] Enqueued op ${operation.id}`);
      return [...prev, operation];
    });
  }, []);

  /**
   * Move a dead-letter item back into the active queue so it gets retried.
   * Resets its retry counter.
   */
  const retryDeadLetter = useCallback((operationId: number) => {
    setDeadLetterQueue(prev => {
      const item = prev.find(i => i.operation.id === operationId);
      if (!item) return prev;
      retryCounts.current.set(operationId, 0);
      backoffMs.current.delete(operationId);
      addToSyncQueue(item.operation);
      return prev.filter(i => i.operation.id !== operationId);
    });
  }, [addToSyncQueue]);

  /** Permanently discard a dead-letter item (user explicitly acknowledges the loss). */
  const discardDeadLetter = useCallback((operationId: number) => {
    setDeadLetterQueue(prev => prev.filter(i => i.operation.id !== operationId));
  }, []);

  const pushToGenericQueue = useCallback((url: string, method: string, payload: any) => {
    setGenericSyncQueue(prev => [
      ...prev,
      { id: Date.now().toString() + Math.random().toString(), timestamp: Date.now(), url, method, payload },
    ]);
    showToast('Ação registrada (sincronizando em background)', 'success');
  }, [showToast]);

  // ── Main sync processor ──
  useEffect(() => {
    if (syncQueue.length === 0) {
      setIsSyncing(false);
      return;
    }
    if (processingQueue.current) return;

    // Debounce: coalesce rapid successive changes before sending
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      if (syncQueueRef.current.length === 0 || processingQueue.current) return;

      processingQueue.current = true;
      setIsSyncing(true);

      const operationsToSync = [...syncQueueRef.current];

      // Track what happened this round
      const successfulIds = new Set<number>();
      const movedToDeadLetter: DeadLetterItem[] = [];
      // Operations that failed transiently (network) but haven't hit max retries yet
      const retryLater: { id: number; delayMs: number }[] = [];
      const serverFailed: { id: number; error: string }[] = [];

      for (const op of operationsToSync) {
        const retries = retryCounts.current.get(op.id) ?? 0;
        const opEvents: any[] = (op as any).events ?? [];

        const eventsOnly = requiresEventsOnlySync(op);
        const useFullSync = !eventsOnly && requiresFullSync(op);

        // ── IMPORTANTE: bulk-update NUNCA inclui eventos no payload. ──────────
        // O Azure WAF bloqueia requests com texto longo (descrições de eventos)
        // via 403 mediatypeblockedupload. Eventos sempre vão pelo endpoint
        // dedicado /sync-events que tem payloads menores e focados.
        let url: string;
        let body: string;

        if (eventsOnly) {
          url = `${apiBaseUrl}/api/operations/${op.id}/sync-events`;
          body = JSON.stringify(buildEventsPayload(op));
          console.log(`[SyncQueue] Op ${op.id} (attempt ${retries + 1}/${MAX_RETRIES_PER_OP}): events-only`);
        } else if (useFullSync) {
          // Envia bulk-update SEM eventos — strip do array para não triggerar o WAF
          url = `${apiBaseUrl}/api/operations/bulk-update`;
          body = JSON.stringify({ operations: [{ ...op, events: [] }] });
          console.log(`[SyncQueue] Op ${op.id} (attempt ${retries + 1}/${MAX_RETRIES_PER_OP}): full (events stripped)`);
        } else {
          url = `${apiBaseUrl}/api/operations/${op.id}/patch`;
          body = JSON.stringify(buildPatchPayload(op));
          console.log(`[SyncQueue] Op ${op.id} (attempt ${retries + 1}/${MAX_RETRIES_PER_OP}): patch`);
        }

        try {
          const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            credentials: 'include',
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => String(response.status));
            throw new Error(`HTTP ${response.status}: ${errText}`);
          }

          const result = await response.json();

          if (result.failed && result.failed.length > 0) {
            serverFailed.push(...result.failed);
          } else {
            // ── Se era um full-sync e a operação tem eventos, sincroniza-os agora ──
            // Os eventos foram intencionalmente excluídos do bulk-update para evitar
            // o bloqueio do WAF. Agora que o bulk-update teve sucesso, sincronizamos
            // os eventos separadamente via o endpoint dedicado.
            if (useFullSync && opEvents.length > 0) {
              // Salva o snapshot ANTES de chamar buildEventsPayload para que o delta
              // seja vazio (bulk-update já sincronizou tudo exceto eventos) e o
              // buildEventsPayload detecte apenas os novos/alterados eventos.
              // Em seguida enviamos TODOS os eventos atuais em batches pequenos
              // para garantir que o banco esteja completo após o primeiro sync.
              const BATCH_SIZE = 10; // eventos por request — ~10-30 KB por batch
              const batches: any[][] = [];
              for (let i = 0; i < opEvents.length; i += BATCH_SIZE) {
                batches.push(opEvents.slice(i, i + BATCH_SIZE));
              }
              let batchFailed = false;
              for (const batch of batches) {
                try {
                  const batchPayload = wrapWithEncoding(
                    {
                      responsibleAnalyst: op.responsibleAnalyst,
                      events: batch.map((e: any) => ({
                        ...e,
                        description:     encodeHtmlField(e.description),
                        nextSteps:       encodeHtmlField(e.nextSteps),
                        attentionPoints: encodeHtmlField(e.attentionPoints),
                      })),
                    },
                    []
                  );
                  await fetchWithTimeout(`${apiBaseUrl}/api/operations/${op.id}/sync-events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batchPayload),
                    credentials: 'include',
                  });
                } catch (evtErr) {
                  console.warn(`[SyncQueue] Op ${op.id}: batch de eventos falhou:`, evtErr);
                  batchFailed = true;
                  break;
                }
              }
              if (!batchFailed) {
                console.log(`[SyncQueue] Op ${op.id}: ${opEvents.length} eventos sincronizados pós full-sync em ${batches.length} batch(es).`);
              }
            }

            successfulIds.add(op.id);
            retryCounts.current.delete(op.id);
            backoffMs.current.delete(op.id);
            saveSnapshot(op);
          }

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[SyncQueue] Op ${op.id} failed (attempt ${retries + 1}): ${errorMsg}`);

          const nextRetry = retries + 1;
          retryCounts.current.set(op.id, nextRetry);

          if (nextRetry >= MAX_RETRIES_PER_OP) {
            console.warn(`[SyncQueue] Op ${op.id} esgotou ${MAX_RETRIES_PER_OP} tentativas → dead letter.`);
            movedToDeadLetter.push({
              operation: op,
              failedAt: new Date().toISOString(),
              lastError: errorMsg,
              retries: nextRetry,
            });
            retryCounts.current.delete(op.id);
            backoffMs.current.delete(op.id);
          } else {
            const delay = BACKOFF_BASE_MS * Math.pow(3, retries); // 5s, 15s, 45s
            backoffMs.current.set(op.id, delay);
            retryLater.push({ id: op.id, delayMs: delay });
            console.warn(`[SyncQueue] Op ${op.id} tentativa ${nextRetry}/${MAX_RETRIES_PER_OP}. Próxima em ${delay / 1000}s.`);
          }
        }
      }

      // ── Update queue: remove successes and dead-letters, keep failures ──
      const removeIds = new Set([...successfulIds, ...movedToDeadLetter.map(d => d.operation.id)]);
      setSyncQueue(prev => prev.filter(op => !removeIds.has(op.id)));

      // ── Move exhausted items to dead letter queue ──
      if (movedToDeadLetter.length > 0) {
        setDeadLetterQueue(prev => {
          const existingIds = new Set(prev.map(i => i.operation.id));
          const newItems = movedToDeadLetter.filter(i => !existingIds.has(i.operation.id));
          return [...prev, ...newItems];
        });
        showToast(
          `${movedToDeadLetter.length} operação(ões) não puderam ser salvas após ${MAX_RETRIES_PER_OP} tentativas. Verifique a fila de sincronização.`,
          'error'
        );
      }

      // ── Report server-side failures ──
      if (serverFailed.length > 0) {
        setFailedOperations(prev => [...prev, ...serverFailed]);
        showToast(`Erro do servidor em ${serverFailed.length} operações.`, 'error');
      }

      // ── Schedule retries for transient failures (one timer per op) ──
      if (retryLater.length > 0) {
        const longestDelay = Math.max(...retryLater.map(r => r.delayMs));
        if (nextRunTimer.current) clearTimeout(nextRunTimer.current);
        nextRunTimer.current = setTimeout(() => {
          processingQueue.current = false;
          setSyncTrigger(prev => prev + 1);
        }, longestDelay);
        // Don't release processingQueue yet — timer above will do it
        setIsSyncing(false);
        return;
      }

      // ── Success path ──
      if (successfulIds.size > 0 && movedToDeadLetter.length === 0 && serverFailed.length === 0) {
        showToast('Sincronização concluída com sucesso', 'success');
      }

      processingQueue.current = false;
      setIsSyncing(false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [syncQueue, syncTrigger, apiBaseUrl, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

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
          const response = await fetchWithTimeout(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
            credentials: 'include',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
          console.error('[SyncQueue] Generic item failed:', item.url, error);
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

  // ── Graceful shutdown: flush pending queues on tab hide / close ──
  useEffect(() => {
    const handleShutdown = () => {
      const queue = syncQueueRef.current;
      if (queue.length > 0) {
        const url = `${apiBaseUrl}/api/operations/sync-all`;
        const blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });
        if (!navigator.sendBeacon?.(url, blob)) {
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
          const blob = new Blob([JSON.stringify(item.payload)], { type: 'application/json' });
          if (!navigator.sendBeacon?.(item.url, blob)) {
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
    retryDeadLetter,
    discardDeadLetter,
    deadLetterQueue,
    genericSyncQueue,
    pushToGenericQueue,
    isSyncing,
    setIsSyncing,
    failedOperations,
  };
}
