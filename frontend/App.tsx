import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Operation, Task, TaskRule, Area } from './types';
import { Page } from './types';
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
import MinhasAprovacoesPage from './components/MinhasAprovacoesPage';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';
import AppHeader from './components/AppHeader';
import { useAuth } from './contexts/AuthContext';
import { fetchApi, autoCreateComiteReviewItem, API_BASE } from './utils/api';
import { useSyncQueue } from './hooks/useSyncQueue';
import { useNavigation } from './hooks/useNavigation';
import { buildReviewUpdate } from './utils/reviewLogic';
import type { ReviewSaveData } from './utils/reviewLogic';

const API_BASE_URL = API_BASE;

const App: React.FC = () => {
  const { isEntraIdEnabled, isMsalAuthenticated, isAuthenticating, isAdmin } = useAuth();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  // Campos pesados (arrays) são excluídos do cache slim para não estourar localStorage.
  // O carregamento inicial exibe os dados das listas instantaneamente; os detalhes
  // (eventos, tarefas, etc.) são buscados sob demanda via fetchOperationDetails.
  const SLIM_CACHE_KEY = 'operations_cache_slim_v1';
  const SLIM_EXCLUDED_FIELDS = new Set([
    'events', 'taskRules', 'ratingHistory', 'contacts', 'tasks',
    'risks', 'litigationComments', 'taskExceptions',
  ]);

  // Campos de array que são removidos na serialização slim.
  // Ao carregar, precisam ser restaurados como [] para evitar
  // TypeError nas páginas que fazem op.tasks.forEach(...) etc.
  const SLIM_ARRAY_DEFAULTS: Record<string, any[]> = {
    events: [], taskRules: [], ratingHistory: [], contacts: [],
    tasks: [], risks: [], litigationComments: [], taskExceptions: [],
  };

  const loadSlimCache = (): Operation[] => {
    try {
      const raw = localStorage.getItem(SLIM_CACHE_KEY);
      if (!raw) return [];
      const parsed: any[] = JSON.parse(raw);
      // Restaura os campos de array excluídos como [] para compatibilidade com componentes
      return parsed.map(op => ({ ...SLIM_ARRAY_DEFAULTS, ...op })) as Operation[];
    } catch { return []; }
  };

  const saveSlimCache = (ops: Operation[]) => {
    try {
      const slim = ops.map(op => {
        const entry: Record<string, any> = {};
        for (const [k, v] of Object.entries(op)) {
          if (!SLIM_EXCLUDED_FIELDS.has(k)) entry[k] = v;
        }
        return entry;
      });
      localStorage.setItem(SLIM_CACHE_KEY, JSON.stringify(slim));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('[App] localStorage quota excedida ao salvar slim cache — cache desativado.');
      }
    }
  };

  const [operations, setOperations] = useState<Operation[]>(() => loadSlimCache());

  const [selectedArea, setSelectedArea] = useState<Area | 'Mixed'>('Mixed');
  const [newTaskModalState, setNewTaskModalState] = useState<{ isOpen: boolean; operationId?: number; analystName?: string }>({ isOpen: false });
  const [reviewModalState, setReviewModalState] = useState<{ isOpen: boolean; task: Task | null }>({ isOpen: false, task: null });
  const [isLoading, setIsLoading] = useState(() => loadSlimCache().length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Stable toast callback (used as dep in hooks below) ──
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // ── Extracted subsystems ──
  const { currentPage, selectedOperationId, navigate: handleNavigate } = useNavigation();
  const {
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
  } = useSyncQueue(API_BASE_URL, showToast);

  // ── Dark mode ──
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // ── Limpa chaves legadas do localStorage e persiste slim cache ──
  useEffect(() => {
    // Remove o cache antigo (não-slim) que era o maior culpado pelo estouro de quota
    ['operations_cache'].forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.info(`[App] Chave legada '${key}' removida do localStorage.`);
      }
    });
  }, []);

  useEffect(() => {
    if (operations.length > 0) saveSlimCache(operations);
  }, [operations]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchOperations = useCallback(async () => {
    setOperations(prev => {
      if (prev.length === 0) setIsLoading(true);
      else setIsRefreshing(true);
      return prev;
    });
    setError(null);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations?summary=true`, { credentials: 'include' });
      if (!response.ok) throw new Error(`O servidor respondeu com o status: ${response.status}`);
      const data: Operation[] = await response.json();
      setOperations(prev => {
        if (prev.length === 0) return data;
        return data.map(summaryOp => {
          const existingOp = prev.find(op => op.id === summaryOp.id);
          if (existingOp) {
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
    } catch (err) {
      console.error('Error fetching operations:', err);
      setError(err instanceof Error ? err.message : 'Ocorreu um erro de rede desconhecido.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchOperationDetails = useCallback(async (operationId: number) => {
    setIsRefreshing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations/${operationId}`, { credentials: 'include' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Falha ao carregar detalhes da operação');
      const fullOperation = await response.json();
      setOperations(prev => prev.map(op => op.id === operationId ? fullOperation : op));
      return fullOperation;
    } catch (err) {
      console.error('Error fetching operation details:', err);
      showToast('Erro ao carregar detalhes da operação.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  // Fetch full operation details whenever the active detail page changes
  // (covers both programmatic navigation and browser back/forward)
  useEffect(() => {
    if (currentPage === Page.DETAIL && selectedOperationId) {
      fetchOperationDetails(selectedOperationId);
    }
  }, [currentPage, selectedOperationId, fetchOperationDetails]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeOperations = useMemo(() => operations.filter(op => op.status !== 'Legado'), [operations]);
  const legacyOperations = useMemo(() => operations.filter(op => op.status === 'Legado'), [operations]);
  const allTasks = useMemo(() => activeOperations.flatMap(op => op.tasks || []), [activeOperations]);

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

  const selectedOperation = useMemo(
    () => operations.find(op => op.id === selectedOperationId) || null,
    [operations, selectedOperationId]
  );

  // ── Sync rules ─────────────────────────────────────────────────────────────

  const handleSyncRules = async () => {
    setIsSyncing(true);
    let totalFixed = 0;
    try {
      while (true) {
        const response = await fetchApi(`${API_BASE_URL}/api/operations/sync-rules`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Falha ao sincronizar regras');
        const result = await response.json();
        const count = result.fixed_count;
        totalFixed += count;
        if (count === 0) break;
        showToast(`Sincronizando... ${totalFixed} operações processadas.`, 'success');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (totalFixed > 0) {
        showToast(`${totalFixed} operações normalizadas com sucesso!`, 'success');
        fetchOperations();
      } else {
        showToast('Todas as operações já estão sincronizadas.', 'success');
      }
    } catch (err) {
      console.error('Error syncing rules:', err);
      showToast('Erro ao sincronizar regras. Tente novamente.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── CRUD operations ────────────────────────────────────────────────────────

  const handleAddOperation = async (newOperationData: any) => {
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOperationData),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Falha ao salvar a operação');
      const savedOperation = await response.json();
      setOperations(prev => [...prev, savedOperation]);
      showToast('Operação adicionada com sucesso!', 'success');
      return savedOperation;
    } catch (err) {
      console.error('Error adding operation:', err);
      showToast('Erro ao adicionar operação.', 'error');
      throw err;
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
          ratingHistory: [],
        };
        const response = await fetchApi(`${API_BASE_URL}/api/operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOpData),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Falha ao criar operação geral');
        const savedOperation = await response.json();
        setOperations(prev => [...prev, savedOperation]);
        opId = savedOperation.id;
        op = savedOperation;
      }

      if (op) {
        const updatedOp = { ...op, taskRules: [...(op.taskRules || []), { ...rule, id: Date.now() }] };
        await handleUpdateOperation(updatedOp);
        showToast('Tarefa geral adicionada com sucesso!', 'success');
      }
    } catch (err) {
      console.error('Error adding general task:', err);
      showToast('Erro ao adicionar tarefa geral.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateOperation = async (updatedOperation: Operation, syncToBackend: boolean = true): Promise<void> => {
    const opWithTimestamp = { ...updatedOperation, lastUpdated: Date.now() };
    // 1. Optimistic UI update
    setOperations(prev => prev.map(op => op.id === updatedOperation.id ? opWithTimestamp : op));
    if (!syncToBackend) return;
    // 2. Enqueue for background sync (merge logic lives in useSyncQueue)
    addToSyncQueue(opWithTimestamp);
    showToast('Alteração salva localmente e enviando...', 'success');
  };

  const handleDeleteOperation = async (operationId: number) => {
    const originalOperations = [...operations];
    setOperations(prev => prev.filter(op => op.id !== operationId));
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${API_BASE_URL}/api/operations/${operationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Falha ao deletar a operação');
      if (selectedOperationId === operationId) handleNavigate(Page.OVERVIEW);
      showToast('Operação deletada com sucesso!', 'success');
    } catch (err) {
      console.error('Error deleting operation:', err);
      setOperations(originalOperations);
      showToast('Erro ao deletar a operação.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;
    await handleUpdateOperation({ ...op, taskExceptions: [...(op.taskExceptions || []), task.id] });
    showToast('Tarefa deletada com sucesso!', 'success');
  };

  const handleEditTask = async (task: Task, updates: { name: string; dueDate: string | null; notes?: string }) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;
    const isoDate = updates.dueDate
      ? (updates.dueDate.includes('T') ? updates.dueDate : new Date(updates.dueDate + 'T12:00:00').toISOString())
      : null;
    const newAdHocRule: TaskRule = {
      id: Date.now(),
      name: updates.name,
      frequency: updates.dueDate ? 'Pontual' : 'Sem Prazo',
      startDate: isoDate,
      endDate: isoDate,
      description: updates.notes || `Tarefa editada a partir da tarefa original: ${task.ruleName} (ID: ${task.id})`,
    };
    await handleUpdateOperation({
      ...op,
      taskExceptions: [...(op.taskExceptions || []), task.id],
      taskRules: [...op.taskRules, newAdHocRule],
    });
    showToast('Tarefa editada com sucesso!', 'success');
  };

  // ── Modals ─────────────────────────────────────────────────────────────────

  const openNewTaskModal = (operationId?: number, analystName?: string) => {
    setNewTaskModalState({ isOpen: true, operationId, analystName });
  };
  const closeNewTaskModal = () => setNewTaskModalState({ isOpen: false });

  const handleSaveReview = async (data: ReviewSaveData) => {
    const clickedTask = reviewModalState.task;
    if (!clickedTask) return;
    const operation = operations.find(op => op.id === clickedTask.operationId);
    if (!operation) return;

    const { updatedOperation, reviewTitle } = buildReviewUpdate(operation, clickedTask, data);
    try {
      await handleUpdateOperation(updatedOperation);
      setReviewModalState({ isOpen: false, task: null });
      autoCreateComiteReviewItem({
        operationId: operation.id,
        operationName: operation.name,
        operationArea: operation.area,
        reviewTitle,
        reviewDescription: data.event.description,
        analystName: operation.responsibleAnalyst,
        videoUrl: data.videoUrl || '',
        watchlist: operation.watchlist,
        ratingOperation: data.ratingOp,
        sentiment: data.sentiment,
      });
    } catch {
      // Error already surfaced by handleUpdateOperation's toast
    }
  };

  // ── Page renderer ──────────────────────────────────────────────────────────

  const renderContent = () => {
    if (error) return <BackendError errorMessage={error} onRetry={fetchOperations} />;

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
            <OverdueOperationsHighlight operations={filteredOperations} onNavigate={handleNavigate} />
            <OverviewDashboard
              operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
              onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
              onAddOperation={handleAddOperation}
              onOpenNewTaskModal={openNewTaskModal}
              onDeleteOperation={handleDeleteOperation}
              onUpdateOperation={handleUpdateOperation}
              apiUrl={API_BASE_URL}
              onNavigate={handleNavigate}
              selectedArea={selectedArea}
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
        return (
          <TasksPage
            operations={filteredOperations}
            allTasks={filteredAllTasks}
            onUpdateOperation={handleUpdateOperation}
            onOpenNewTaskModal={openNewTaskModal}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
          />
        );
      case Page.CREDIT_REVIEWS:
        return (
          <CreditReviewsPage
            operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
            onUpdateOperation={handleUpdateOperation}
            onCompleteReview={(task) => setReviewModalState({ isOpen: true, task })}
            onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            setIsSyncing={setIsSyncing}
            setIsRefreshing={setIsRefreshing}
          />
        );
      case Page.AUDIT_LOG:
        return <AuditLogPage apiUrl={API_BASE_URL} setIsRefreshing={setIsRefreshing} />;
      case Page.WATCHLIST:
        return (
          <WatchlistPage
            operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
            onUpdateOperation={handleUpdateOperation}
            apiUrl={API_BASE_URL}
            showToast={showToast}
          />
        );
      case Page.ANALYST_HUB:
        return (
          <AnalystHub
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
          />
        );
      case Page.CHANGE_LOG:
        return (
          <ChangeLogPage
            apiUrl={API_BASE_URL}
            showToast={showToast}
            setIsSyncing={setIsSyncing}
            setIsRefreshing={setIsRefreshing}
          />
        );
      case Page.LEGACY:
        return (
          <LegacyPage
            operations={legacyOperations}
            onNavigate={handleNavigate}
            onUpdateOperation={handleUpdateOperation}
          />
        );
      case Page.SYNC_QUEUE:
        return (
          <SyncQueuePage
            queue={syncQueue}
            genericQueue={genericSyncQueue}
            isSyncing={isSyncing}
            failedOperations={failedOperations}
            deadLetterQueue={deadLetterQueue}
            onRetryDeadLetter={retryDeadLetter}
            onDiscardDeadLetter={discardDeadLetter}
          />
        );
      case Page.MASTER_GROUPS:
        return <MasterGroupsPage onNavigate={handleNavigate} apiUrl={API_BASE_URL} showToast={showToast} />;
      case Page.MASTER_GROUP_DETAIL:
        if (!selectedOperationId) return <div>Selecione um Master Grupo</div>;
        return (
          <MasterGroupDetailsPage
            masterGroupId={selectedOperationId}
            onNavigate={handleNavigate}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
          />
        );
      case Page.ECONOMIC_GROUPS:
        return <EconomicGroupsPage onNavigate={handleNavigate} apiUrl={API_BASE_URL} showToast={showToast} />;
      case Page.ECONOMIC_GROUP_DETAIL:
        if (!selectedOperationId) return <div>Selecione um Grupo Econômico</div>;
        return (
          <EconomicGroupDetailsPage
            economicGroupId={selectedOperationId}
            onNavigate={handleNavigate}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
          />
        );
      case Page.ORIGINATION_PIPELINE:
        return (
          <OriginationPipelinePage
            onNavigate={handleNavigate}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
          />
        );
      case Page.STRUCTURING_OPERATION_DETAIL:
        if (!selectedOperationId) return <div>Selecione uma Operação em Estruturação</div>;
        return (
          <StructuringOperationDetailsPage
            operationId={selectedOperationId}
            onNavigate={handleNavigate}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
          />
        );
      case Page.CARTEIRA_COMPLETA:
        return (
          <CarteiraCompletaPage
            operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
            onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
            onAddOperation={handleAddOperation}
            onOpenNewTaskModal={openNewTaskModal}
            onDeleteOperation={handleDeleteOperation}
            onUpdateOperation={handleUpdateOperation}
            apiUrl={API_BASE_URL}
          />
        );
      case Page.COMITES:
        return (
          <ComitesPage
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
            onNavigate={handleNavigate}
          />
        );
      case Page.COMITE_DETAIL:
        return (
          <ComiteDetailPage
            comiteId={selectedOperationId || 0}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
            onNavigate={handleNavigate}
          />
        );
      case Page.COMITE_VIDEO:
        return (
          <ComiteVideoPage
            itemPautaId={selectedOperationId || 0}
            comiteId={0}
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
            onNavigate={handleNavigate}
          />
        );
      case Page.MINHAS_APROVACOES:
        return (
          <MinhasAprovacoesPage
            apiUrl={API_BASE_URL}
            showToast={showToast}
            pushToGenericQueue={pushToGenericQueue}
            onNavigate={handleNavigate}
          />
        );
      default:
        return (
          <OverviewDashboard
            operations={filteredOperations.filter(op => op.operationType !== 'Geral')}
            onSelectOperation={(id) => handleNavigate(Page.DETAIL, id)}
            onAddOperation={handleAddOperation}
            onOpenNewTaskModal={openNewTaskModal}
            onDeleteOperation={handleDeleteOperation}
            onUpdateOperation={handleUpdateOperation}
            apiUrl={API_BASE_URL}
            onNavigate={handleNavigate}
            selectedArea={selectedArea}
          />
        );
    }
  };

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (isEntraIdEnabled && !isMsalAuthenticated) {
    if (isAuthenticating) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            <p className="text-blue-200/60 text-sm">Autenticando...</p>
          </div>
        </div>
      );
    }
    return <LoginPage />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-[#F0F4F8] dark:bg-[#080b12] font-sans transition-colors duration-200 relative z-0">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />
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
        <AppHeader
          isSyncing={isSyncing}
          syncQueueCount={syncQueue.length + genericSyncQueue.length}
          isRefreshing={isRefreshing}
          hasOperations={operations.length > 0}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((prev: boolean) => !prev)}
          selectedArea={selectedArea}
          onAreaChange={setSelectedArea}
          currentPage={currentPage}
          onNavigate={handleNavigate}
          isAdmin={isAdmin}
          onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        />
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
