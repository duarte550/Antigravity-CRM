
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
// FIX: Import Event to resolve name collision with DOM Event type, and TaskStatus for enum usage.
import type { Operation, Task, TaskRule, Rating, Sentiment, Event, Area } from './types';
import { Page, TaskStatus } from './types';
import OverviewDashboard from './components/OverviewDashboard';
import OperationDetail from './components/OperationDetail';
import TasksPage from './components/TasksPage';
import Sidebar from './components/Sidebar';
import OverdueOperationsHighlight from './components/OverdueOperationsHighlight';
import NewTaskModal from './components/NewTaskModal';
import BackendError from './components/BackendError';
import AuditLogPage from './components/AuditLogPage';
import WatchlistPage from './components/WatchlistPage';
import CreditReviewsPage from './components/CreditReviewsPage';
import ReviewCompletionForm from './components/ReviewCompletionForm';
import Toast from './components/Toast';
import AnalystHub from './components/AnalystHub';
import ChangeLogPage from './components/ChangeLogPage';
import LegacyPage from './components/LegacyPage';
import SyncQueuePage from './components/SyncQueuePage';
import MasterGroupsPage from './components/MasterGroupsPage';
import MasterGroupDetailsPage from './components/MasterGroupDetailsPage';
import EconomicGroupsPage from './components/EconomicGroupsPage';
import EconomicGroupDetailsPage from './components/EconomicGroupDetailsPage';
import OriginationPipelinePage from './components/OriginationPipelinePage';
import StructuringOperationDetailsPage from './components/StructuringOperationDetailsPage';
import CarteiraCompletaPage from './components/CarteiraCompletaPage';
import ComitesPage from './components/ComitesPage';
import ComiteDetailPage from './components/ComiteDetailPage';
import ComiteVideoPage from './components/ComiteVideoPage';
import { BGPattern } from './components/ui/bg-pattern';
import { fetchApi } from './utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://antigravity-crm-two.vercel.app';

const App: React.FC = () => {
  const [operations, setOperations] = useState<Operation[]>(() => {
    const cached = localStorage.getItem('operations_cache');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error("Failed to parse operations cache", e);
      }
    }
    return [];
  });
  const [currentPage, setCurrentPage] = useState<Page>(Page.OVERVIEW);
  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | 'Mixed'>('Mixed');
  const [newTaskModalState, setNewTaskModalState] = useState<{ isOpen: boolean; operationId?: number; analystName?: string }>({ isOpen: false });
  const [reviewModalState, setReviewModalState] = useState<{ isOpen: boolean; task: Task | null }>({ isOpen: false, task: null });
  const [isLoading, setIsLoading] = useState(() => {
    return localStorage.getItem('operations_cache') ? false : true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [failedOperations, setFailedOperations] = useState<{ id: number, error: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [syncQueue, setSyncQueue] = useState<Operation[]>(() => {
    const saved = localStorage.getItem('sync_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const syncQueueRef = useRef<Operation[]>([]);
  useEffect(() => {
    syncQueueRef.current = syncQueue;
  }, [syncQueue]);
  const processingQueue = useRef<boolean>(false);

  // Fila Genérica para as novas Abas
  const [genericSyncQueue, setGenericSyncQueue] = useState<{ id: string, url: string, method: string, payload: any, timestamp: number }[]>(() => {
    const saved = localStorage.getItem('generic_sync_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const genericSyncQueueRef = useRef(genericSyncQueue);
  const processingGenericQueue = useRef<boolean>(false);

  useEffect(() => {
    genericSyncQueueRef.current = genericSyncQueue;
    localStorage.setItem('generic_sync_queue', JSON.stringify(genericSyncQueue));
  }, [genericSyncQueue]);

  const pushToGenericQueue = useCallback((url: string, method: string, payload: any) => {
    setGenericSyncQueue(prev => [...prev, { id: Date.now().toString() + Math.random().toString(), timestamp: Date.now(), url, method, payload }]);
    showToast('Ação registrada (sincronizando em background)', 'success');
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    if (operations.length > 0) {
      try {
        localStorage.setItem('operations_cache', JSON.stringify(operations));
      } catch (e) {
        console.warn("Could not save operations to cache. Storage might be full.", e);
      }
    }
  }, [operations]);

  // Persist sync queue
  useEffect(() => {
    localStorage.setItem('sync_queue', JSON.stringify(syncQueue));
  }, [syncQueue]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  // Sync Queue Processing
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
        const response = await fetchApi(`${API_BASE_URL}/api/operations/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations: operationsToSync }),
          credentials: 'include'
        });

        if (!response.ok) throw new Error('Falha na sincronização em lote');

        const result = await response.json();
        const { success, failed } = result;

        // Remove all items from the queue
        setSyncQueue([]);
        setFailedOperations(failed);

        if (failed.length > 0) {
          showToast(`Falha em ${failed.length} operações: ${failed.map(f => f.id).join(', ')}`, 'error');
        } else {
          showToast('Sincronização concluída com sucesso', 'success');
        }

      } catch (error) {
        console.error("Sync error", error);
        // On error, wait and retry later
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
  }, [syncQueue, syncTrigger]);

  // Generic Sync Queue Processor
  useEffect(() => {
    if (genericSyncQueue.length === 0) return;

    const processGenericQueue = async () => {
      if (processingGenericQueue.current) return;
      processingGenericQueue.current = true;
      setIsSyncing(true);

      const itemsToProcess = [...genericSyncQueue];
      const itemsFailed: typeof genericSyncQueue = [];

      for (const item of itemsToProcess) {
        try {
          const response = await fetchApi(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
            credentials: 'include'
          });
          if (!response.ok) throw new Error('Falha na request genérica');
        } catch (error) {
          console.error("Generic Sync Error on", item.url, error);
          itemsFailed.push(item);
        }
      }

      setGenericSyncQueue(itemsFailed);
      processingGenericQueue.current = false;
      setIsSyncing(false);
    };

    const flushTimeout = setTimeout(() => {
      processGenericQueue();
    }, 2000);

    return () => clearTimeout(flushTimeout);
  }, [genericSyncQueue]);

  // Graceful shutdown — envia filas pendentes quando a aba fecha ou perde foco
  useEffect(() => {
    const handleShutdown = () => {
      // --- Fila principal de operações ---
      const queue = syncQueueRef.current;
      if (queue.length > 0) {
        const url = `${API_BASE_URL}/api/operations/sync-all`;
        // FIX: Usar Blob com type 'application/json' para que o Flask aceite o Content-Type.
        // sendBeacon com string pura envia como text/plain, causando erro 415.
        const blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });

        const sent = navigator.sendBeacon?.(url, blob);
        if (!sent) {
          // Fallback com fetch keepalive se sendBeacon falhar ou não existir
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queue),
            keepalive: true,
            credentials: 'include'
          }).catch(() => { });
        }
      }

      // --- Fila genérica (master groups, structuring ops, etc.) ---
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
              credentials: 'include'
            }).catch(() => { });
          }
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleShutdown();
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', handleShutdown);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', handleShutdown);
    };
  }, [syncQueue]);

  const fetchOperations = useCallback(async () => {
    setOperations(prev => {
      if (prev.length === 0) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      return prev;
    });
    setError(null);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations?summary=true`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`O servidor respondeu com o status: ${response.status}`);
      }
      const data: Operation[] = await response.json();

      setOperations(prev => {
        if (prev.length === 0) return data;

        return data.map(summaryOp => {
          const existingOp = prev.find(op => op.id === summaryOp.id);
          if (existingOp) {
            // Preservar riscos e notas se não vierem no resumo
            return {
              ...existingOp,
              ...summaryOp,
              risks: summaryOp.risks !== undefined ? summaryOp.risks : existingOp.risks,
              notes: summaryOp.notes !== undefined ? summaryOp.notes : existingOp.notes,
            };
          }
          return summaryOp;
        });
      });
    } catch (error) {
      console.error("Error fetching operations:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Ocorreu um erro de rede desconhecido.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchOperationDetails = async (operationId: number) => {
    setIsRefreshing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations/${operationId}`, { credentials: 'include' });
      if (response.status === 404) return null; // Operation might be new/not yet in DB
      if (!response.ok) throw new Error('Falha ao carregar detalhes da operação');
      const fullOperation = await response.json();

      setOperations(prev => prev.map(op => op.id === operationId ? fullOperation : op));
      return fullOperation;
    } catch (error) {
      console.error("Error fetching operation details:", error);
      showToast('Erro ao carregar detalhes da operação.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const activeOperations = useMemo(() => {
    return operations.filter(op => op.status !== 'Legado');
  }, [operations]);

  const legacyOperations = useMemo(() => {
    return operations.filter(op => op.status === 'Legado');
  }, [operations]);

  const allTasks = useMemo(() => {
    return activeOperations.flatMap(op => op.tasks || []);
  }, [activeOperations]);

  const filteredOperations = useMemo(() => {
    if (selectedArea === 'Mixed') return activeOperations;
    return activeOperations.filter(op => op.area === selectedArea);
  }, [activeOperations, selectedArea]);

  const filteredAllTasks = useMemo(() => {
    if (selectedArea === 'Mixed') return allTasks;
    return allTasks.filter(task => {
      const op = activeOperations.find(o => o.id === task.operationId);
      return op?.area === selectedArea;
    });
  }, [allTasks, activeOperations, selectedArea]);

  const handleSyncRules = async () => {
    setIsSyncing(true);
    let totalFixed = 0;
    try {
      while (true) {
        const response = await fetchApi(`${API_BASE_URL}/api/operations/sync-rules`, {
          method: 'POST',
          credentials: 'include'
        });

        if (!response.ok) throw new Error('Falha ao sincronizar regras');

        const result = await response.json();
        const count = result.fixed_count;
        totalFixed += count;

        if (count === 0) break;

        // Optional: Update UI with progress if needed, e.g., via a toast that updates
        showToast(`Sincronizando... ${totalFixed} operações processadas.`, 'success');

        // Small delay to be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (totalFixed > 0) {
        showToast(`${totalFixed} operações normalizadas com sucesso!`, 'success');
        fetchOperations();
      } else {
        showToast('Todas as operações já estão sincronizadas.', 'success');
      }
    } catch (error) {
      console.error("Error syncing rules:", error);
      showToast('Erro ao sincronizar regras. Tente novamente.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNavigate = async (page: Page, operationId?: number) => {
    setCurrentPage(page);
    setSelectedOperationId(operationId ?? null);

    if (page === Page.DETAIL && operationId) {
      await fetchOperationDetails(operationId);
    }
  };

  const handleAddOperation = async (newOperationData: any) => {
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOperationData),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Falha ao salvar a operação');
      const savedOperation = await response.json();
      setOperations(prev => [...prev, savedOperation]);
      showToast('Operação adicionada com sucesso!', 'success');
      return savedOperation;
    } catch (error) {
      console.error("Error adding operation:", error);
      showToast('Erro ao adicionar operação.', 'error');
      throw error;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddGeneralTask = async (analystName: string, rule: any) => {
    setIsSyncing(true);
    try {
      let op = operations.find(o => o.name === `Geral - ${analystName}` && o.operationType === 'Geral');
      let opId = op?.id;

      if (!opId) {
        const newOpData = {
          name: `Geral - ${analystName}`,
          area: 'Geral',
          operationType: 'Geral',
          maturityDate: new Date().toISOString(),
          responsibleAnalyst: analystName,
          reviewFrequency: 'Anual',
          callFrequency: 'Anual',
          dfFrequency: 'Anual',
          ratingOperation: 'A4',
          ratingGroup: 'A4',
          watchlist: 'Verde',
          segmento: 'Geral',
          covenants: {},
          defaultMonitoring: {},
          projects: [],
          guarantees: [],
          taskRules: [],
          events: [],
          ratingHistory: []
        };
        const response = await fetchApi(`${API_BASE_URL}/api/operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOpData),
          credentials: 'include'
        });
        if (!response.ok) throw new Error('Falha ao criar operação geral');
        const savedOperation = await response.json();
        setOperations(prev => [...prev, savedOperation]);
        opId = savedOperation.id;
        op = savedOperation;
      }

      if (op) {
        const updatedOp = {
          ...op,
          taskRules: [...(op.taskRules || []), { ...rule, id: Date.now() }]
        };
        await handleUpdateOperation(updatedOp);
        showToast('Tarefa geral adicionada com sucesso!', 'success');
      }

    } catch (error) {
      console.error("Error adding general task:", error);
      showToast('Erro ao adicionar tarefa geral.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateOperation = async (updatedOperation: Operation, syncToBackend: boolean = true): Promise<void> => {
    // 1. Optimistic UI update
    const now = Date.now();
    const opWithTimestamp = { ...updatedOperation, lastUpdated: now };

    setOperations(prev =>
      prev.map(op => op.id === updatedOperation.id ? opWithTimestamp : op)
    );

    if (!syncToBackend) return;

    // 2. Add to sync queue with merge logic
    setSyncQueue(prev => {
      // Find if this operation is already in the queue
      const existingIndex = prev.findIndex(op => op.id === updatedOperation.id);

      // If it's in the queue and NOT the one currently being processed (index > 0)
      // OR if it's at index 0 but we are NOT currently processing anything
      if (existingIndex !== -1 && (existingIndex > 0 || !processingQueue.current)) {
        const newQueue = [...prev];
        newQueue[existingIndex] = opWithTimestamp;
        console.log(`[SyncQueue] Merged update for operation ${updatedOperation.id} at position ${existingIndex}`);
        return newQueue;
      }

      // If it's at index 0 and IS being processed, we check if there's already a SECOND entry for it
      if (existingIndex === 0 && processingQueue.current) {
        const secondEntryIndex = prev.findIndex((op, i) => i > 0 && op.id === updatedOperation.id);
        if (secondEntryIndex !== -1) {
          const newQueue = [...prev];
          newQueue[secondEntryIndex] = opWithTimestamp;
          console.log(`[SyncQueue] Merged update for operation ${updatedOperation.id} at pending position ${secondEntryIndex}`);
          return newQueue;
        }
      }

      // Otherwise, append to the end
      console.log(`[SyncQueue] Added new update for operation ${updatedOperation.id} to queue`);
      return [...prev, opWithTimestamp];
    });

    showToast('Alteração salva localmente e enviando...', 'success');
  };

  const handleDeleteOperation = async (operationId: number) => {
    const originalOperations = [...operations];
    setOperations(prev => prev.filter(op => op.id !== operationId));
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations/${operationId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Falha ao deletar a operação');
      }

      if (selectedOperationId === operationId) {
        handleNavigate(Page.OVERVIEW);
      }
      showToast('Operação deletada com sucesso!', 'success');
    } catch (error) {
      console.error("Error deleting operation:", error);
      setOperations(originalOperations);
      showToast('Erro ao deletar a operação.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;

    const updatedOp: Operation = {
      ...op,
      taskExceptions: [...(op.taskExceptions || []), task.id]
    };

    await handleUpdateOperation(updatedOp);
    showToast('Tarefa deletada com sucesso!', 'success');
  };

  const handleEditTask = async (task: Task, updates: { name: string, dueDate: string | null, notes?: string }) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;

    const isoDate = updates.dueDate ? (updates.dueDate.includes('T') ? updates.dueDate : new Date(updates.dueDate + 'T12:00:00').toISOString()) : null;
    const newAdHocRule: TaskRule = {
      id: Date.now(),
      name: updates.name,
      frequency: updates.dueDate ? 'Pontual' : 'Sem Prazo',
      startDate: isoDate,
      endDate: isoDate,
      description: updates.notes || `Tarefa editada a partir da tarefa original: ${task.ruleName} (ID: ${task.id})`,
    };

    const updatedOp: Operation = {
      ...op,
      taskExceptions: [...(op.taskExceptions || []), task.id],
      taskRules: [...op.taskRules, newAdHocRule]
    };

    await handleUpdateOperation(updatedOp);
    showToast('Tarefa editada com sucesso!', 'success');
  };

  const selectedOperation = useMemo(() => {
    return operations.find(op => op.id === selectedOperationId) || null;
  }, [operations, selectedOperationId]);

  const openNewTaskModal = (operationId?: number, analystName?: string) => {
    setNewTaskModalState({ isOpen: true, operationId, analystName });
  };
  const closeNewTaskModal = () => {
    setNewTaskModalState({ isOpen: false });
  };

  const handleSaveReview = async (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, sentiment: Sentiment }) => {
    const clickedTask = reviewModalState.task;
    if (!clickedTask) return;

    const operation = operations.find(op => op.id === clickedTask.operationId);
    if (!operation) return;

    const actualCompletionDate = data.event.date; // Data da conclusão REAL
    const originalTaskDate = new Date(clickedTask.dueDate); // Data original (referência)

    // Mês/Ano original para o título (ex: mar/25)
    const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const formattedOriginalDate = clickedTask.dueDate
      ? `${monthNames[new Date(clickedTask.dueDate).getUTCMonth()]}/${new Date(clickedTask.dueDate).getUTCFullYear().toString().slice(-2)}`
      : 'Sem Prazo';

    const baseEventData = {
      date: actualCompletionDate,
      type: 'Revisão Periódica',
      description: data.event.description,
      registeredBy: data.event.registeredBy,
      nextSteps: data.event.nextSteps,
      attentionPoints: data.event.attentionPoints,
    };

    const reviewTaskNames = ['Revisão Gerencial', 'Revisão Política'];

    const calculateNextDate = (currentDate: string, frequency: string): string => {
      const date = new Date(currentDate);
      switch (frequency) {
        case 'Diário': date.setDate(date.getDate() + 1); break;
        case 'Semanal': date.setDate(date.getDate() + 7); break;
        case 'Quinzenal': date.setDate(date.getDate() + 15); break;
        case 'Mensal': date.setMonth(date.getMonth() + 1); break;
        case 'Trimestral': date.setMonth(date.getMonth() + 3); break;
        case 'Semestral': date.setMonth(date.getMonth() + 6); break;
        case 'Anual': date.setFullYear(date.getFullYear() + 1); break;
        default: break;
      }
      return date.toISOString();
    };

    let nextEstimatedDate = operation.estimatedDate;
    const updatedRules = operation.taskRules.map(rule => {
      if (reviewTaskNames.includes(rule.name)) {
        if (rule.id === clickedTask.ruleId) {
          nextEstimatedDate = calculateNextDate(actualCompletionDate, rule.frequency);
        }
        return { ...rule, startDate: actualCompletionDate };
      }
      return rule;
    });

    const eventToAdd: Event = {
      ...baseEventData,
      id: Date.now() + Math.random(),
      // PONTO 1: Título seguindo o padrão solicitado
      title: `Conclusão: Revisão de crédito - ${operation.name} - ${formattedOriginalDate}`,
      completedTaskId: clickedTask.id,
    };

    const newHistoryEntry = {
      id: Date.now() + 1,
      date: actualCompletionDate,
      ratingOperation: data.ratingOp,
      ratingGroup: data.ratingGroup,
      watchlist: operation.watchlist,
      sentiment: data.sentiment,
      eventId: eventToAdd.id,
    };

    const updatedOperation = {
      ...operation,
      ratingOperation: data.ratingOp,
      ratingGroup: data.ratingGroup,
      events: [...operation.events, eventToAdd],
      ratingHistory: [...operation.ratingHistory, newHistoryEntry],
      taskRules: updatedRules,
      tasks: operation.tasks.filter(t => !reviewTaskNames.includes(t.ruleName) || t.status === TaskStatus.COMPLETED),
      estimatedDate: nextEstimatedDate
    };

    // PONTO 2: O modal só fecha após o sucesso do handleUpdateOperation (que é await-ado no child)
    try {
      await handleUpdateOperation(updatedOperation);
      setReviewModalState({ isOpen: false, task: null });
    } catch (e) {
      // Erro já tratado pelo toast do handleUpdateOperation
    }
  };

  const renderContent = () => {
    if (error) {
      return <BackendError errorMessage={error} onRetry={fetchOperations} />;
    }

    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-full">
          <p className="text-xl text-gray-500 animate-pulse">Carregando dados do Databricks...</p>
        </div>
      );
    }

    switch (currentPage) {
      case Page.OVERVIEW:
        return (
          <>
            <OverdueOperationsHighlight
              operations={filteredOperations}
              onNavigate={handleNavigate}
            />
            <OverviewDashboard
              operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
              onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
              onAddOperation={handleAddOperation}
              onOpenNewTaskModal={openNewTaskModal}
              onDeleteOperation={handleDeleteOperation}
              onUpdateOperation={handleUpdateOperation}
              apiUrl={API_BASE_URL}
            />
          </>
        );
      case Page.DETAIL:
        return selectedOperation ? (
          <OperationDetail
            operation={selectedOperation}
            onUpdateOperation={handleUpdateOperation}
            onOpenNewTaskModal={openNewTaskModal}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
            onDeleteOperation={handleDeleteOperation}
            apiUrl={API_BASE_URL}
            setIsSyncing={setIsSyncing}
            setIsRefreshing={setIsRefreshing}
            showToast={showToast}
          />
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Operação não encontrada</h2>
            <p>Por favor, selecione uma operação válida na barra lateral.</p>
          </div>
        );
      case Page.TASKS:
        return <TasksPage
          operations={filteredOperations}
          allTasks={filteredAllTasks}
          onUpdateOperation={handleUpdateOperation}
          onOpenNewTaskModal={openNewTaskModal}
          onDeleteTask={handleDeleteTask}
          onEditTask={handleEditTask}
        />;
      case Page.CREDIT_REVIEWS:
        return <CreditReviewsPage
          operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
          onUpdateOperation={handleUpdateOperation}
          onCompleteReview={(task) => setReviewModalState({ isOpen: true, task })}
          onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          setIsSyncing={setIsSyncing}
          setIsRefreshing={setIsRefreshing}
        />;
      case Page.AUDIT_LOG:
        return <AuditLogPage apiUrl={API_BASE_URL} setIsRefreshing={setIsRefreshing} />;
      case Page.WATCHLIST:
        return <WatchlistPage
          operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
          onUpdateOperation={handleUpdateOperation}
        />;
      case Page.ANALYST_HUB:
        return <AnalystHub
          operations={filteredOperations}
          allTasks={filteredAllTasks}
          onUpdateOperation={handleUpdateOperation}
          onNavigate={handleNavigate}
          onOpenNewTaskModal={openNewTaskModal}
          onDeleteTask={handleDeleteTask}
          onEditTask={handleEditTask}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          setIsSyncing={setIsSyncing}
          setIsRefreshing={setIsRefreshing}
        />;
      case Page.CHANGE_LOG:
        return <ChangeLogPage
          apiUrl={API_BASE_URL}
          showToast={showToast}
          setIsSyncing={setIsSyncing}
          setIsRefreshing={setIsRefreshing}
        />;
      case Page.LEGACY:
        return <LegacyPage
          operations={legacyOperations}
          onNavigate={handleNavigate}
          onUpdateOperation={handleUpdateOperation}
        />;
      case Page.SYNC_QUEUE:
        return <SyncQueuePage queue={syncQueue} genericQueue={genericSyncQueue} isSyncing={isSyncing} failedOperations={failedOperations} />;
      case Page.MASTER_GROUPS:
        return <MasterGroupsPage
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
        />;
      case Page.MASTER_GROUP_DETAIL:
        if (!selectedOperationId) return <div>Selecione um Master Grupo</div>;
        return <MasterGroupDetailsPage
          masterGroupId={selectedOperationId}
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
        />;
      case Page.ECONOMIC_GROUPS:
        return <EconomicGroupsPage
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
        />;
      case Page.ECONOMIC_GROUP_DETAIL:
        if (!selectedOperationId) return <div>Selecione um Grupo Econômico</div>;
        return <EconomicGroupDetailsPage
          economicGroupId={selectedOperationId}
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
        />;
      case Page.ORIGINATION_PIPELINE:
        return <OriginationPipelinePage
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
        />;
      case Page.STRUCTURING_OPERATION_DETAIL:
        if (!selectedOperationId) return <div>Selecione uma Operação em Estruturação</div>;
        return <StructuringOperationDetailsPage
          operationId={selectedOperationId}
          onNavigate={handleNavigate}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
        />;
      case Page.CARTEIRA_COMPLETA:
        return <CarteiraCompletaPage
          operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
          onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
          onAddOperation={handleAddOperation}
          onOpenNewTaskModal={openNewTaskModal}
          onDeleteOperation={handleDeleteOperation}
          onUpdateOperation={handleUpdateOperation}
          apiUrl={API_BASE_URL}
        />;
      case Page.COMITES:
        return <ComitesPage
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
          onNavigate={handleNavigate}
        />;
      case Page.COMITE_DETAIL:
        return <ComiteDetailPage
          comiteId={selectedOperationId || 0}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          pushToGenericQueue={pushToGenericQueue}
          onNavigate={handleNavigate}
        />;
      case Page.COMITE_VIDEO:
        return <ComiteVideoPage
          itemPautaId={selectedOperationId || 0}
          apiUrl={API_BASE_URL}
          showToast={showToast}
          onNavigate={handleNavigate}
        />;
      default:
        return <OverviewDashboard
          operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
          onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
          onAddOperation={handleAddOperation}
          onOpenNewTaskModal={openNewTaskModal}
          onDeleteOperation={handleDeleteOperation}
          onUpdateOperation={handleUpdateOperation}
          apiUrl={API_BASE_URL}
        />;
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#080b12] font-sans transition-colors duration-200 relative z-0">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <BGPattern variant="dots" fill="currentColor" className="text-blue-900/15 dark:text-white/15" mask="fade-y" size={32} />
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <NewTaskModal
        isOpen={newTaskModalState.isOpen}
        onClose={closeNewTaskModal}
        operations={operations}
        onUpdateOperation={handleUpdateOperation}
        onAddGeneralTask={handleAddGeneralTask}
        preselectedOperationId={newTaskModalState.operationId}
        preselectedAnalyst={newTaskModalState.analystName}
      />
      {reviewModalState.isOpen && reviewModalState.task && (
        <ReviewCompletionForm
          task={reviewModalState.task}
          operation={operations.find(op => op.id === reviewModalState.task!.operationId)!}
          onClose={() => setReviewModalState({ isOpen: false, task: null })}
          onSave={handleSaveReview}
        />
      )}
      <Sidebar
        operations={operations}
        currentPage={currentPage}
        selectedOperationId={selectedOperationId}
        onNavigate={handleNavigate}
        onSyncRules={handleSyncRules}
        selectedArea={selectedArea}
        syncQueueCount={syncQueue.length + genericSyncQueue.length}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="relative shadow-md z-10 overflow-hidden">
          {/* Background Image with Blue Filter */}
          <div
            className="absolute inset-0 z-0 bg-gray-200 dark:bg-gray-800"
            style={{
              backgroundImage: `url('/header-bg.jpg')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 75%',
            }}
          >
            {/* Simple Overlay - Instead of multiply, a clean gradient is safer */}
            <div className="absolute inset-0 bg-blue-900/40 dark:bg-blue-900/60"></div>
            {/* Darker left edge for text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-900/30 to-transparent dark:from-gray-900/90 dark:via-gray-900/50 dark:to-transparent"></div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 h-full">
            <div className="flex items-center justify-between h-24">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-white drop-shadow-md">
                  CRM de Crédito Estruturado
                </h1>
                {(isSyncing || syncQueue.length > 0 || genericSyncQueue.length > 0) && (
                  <span className="flex items-center gap-2 text-xs font-semibold text-white/90 bg-white/20 px-2 py-1 rounded-full animate-pulse border border-white/30 shadow-sm backdrop-blur-md">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    Sincronizando Databricks... {(syncQueue.length + genericSyncQueue.length) > 0 ? `(${syncQueue.length + genericSyncQueue.length} pendentes)` : ''}
                  </span>
                )}
                {isRefreshing && operations.length > 0 && (
                  <span className="flex items-center gap-2 text-xs font-semibold text-white/90 bg-white/20 px-2 py-1 rounded-full animate-pulse border border-white/30 shadow-sm backdrop-blur-md" title="Atualizando dados em tempo real... Alguns itens podem estar desatualizados.">
                    <div className="w-2 h-2 rounded-full animate-spin border-2 border-white border-t-transparent"></div>
                    Atualizando...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-all backdrop-blur-sm shadow-sm"
                  title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
                >
                  {isDarkMode ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>

                <div className="flex items-center bg-black/20 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-inner">
                  <button
                    onClick={() => setSelectedArea('CRI')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${selectedArea === 'CRI'
                      ? 'bg-white text-blue-900 shadow-md scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    CRI
                  </button>
                  <button
                    onClick={() => setSelectedArea('Capital Solutions')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${selectedArea === 'Capital Solutions'
                      ? 'bg-white text-blue-900 shadow-md scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    Capital Solutions
                  </button>
                  <button
                    onClick={() => setSelectedArea('Mixed')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${selectedArea === 'Mixed'
                      ? 'bg-white text-blue-900 shadow-md scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    Mixed
                  </button>
                </div>

                <button
                  onClick={() => handleNavigate(Page.ORIGINATION_PIPELINE)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border backdrop-blur-sm ${currentPage === Page.ORIGINATION_PIPELINE
                    ? 'bg-white text-blue-900 border-white shadow-md font-bold'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40 shadow-sm'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  Originação
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent transition-colors duration-200">
          <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
