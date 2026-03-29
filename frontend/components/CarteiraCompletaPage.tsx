
import React, { useState, useMemo } from 'react';
import type { Operation, Area, Task, Event, Rating, Sentiment, RatingHistoryEntry } from '../types';
import { WatchlistStatus, TaskStatus, Page } from '../types';
import OperationForm from './OperationForm';
import EventForm from './EventForm';
import ReviewCompletionForm from './ReviewCompletionForm';
import { PlusCircleIcon, EyeIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from './icons/Icons';
import Modal from './Modal';

interface CarteiraCompletaPageProps {
  operations: Operation[];
  onSelectOperation: (id: number) => void;
  onAddOperation: (newOperationData: any) => void;
  onOpenNewTaskModal: (operationId?: number) => void;
  onDeleteOperation: (id: number) => void;
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  apiUrl: string;
}

type SortField = 'name' | 'maturityDate' | 'nextReviewGerencial' | 'nextReviewPolitica' | 'responsibleAnalyst' | 'overdueCount';
type SortDirection = 'asc' | 'desc';

const WatchlistBadge: React.FC<{ status: WatchlistStatus }> = ({ status }) => {
  const colorClasses = {
    [WatchlistStatus.VERDE]: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    [WatchlistStatus.AMARELO]: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
    [WatchlistStatus.ROSA]: 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400',
    [WatchlistStatus.VERMELHO]: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[status]}`}>
      {status}
    </span>
  );
};

const formatDate = (dateString: string | null | undefined) => {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
        const datePart = dateString.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length !== 3) return 'Data Inválida';
        const [year, month, day] = parts.map(Number);
        const date = new Date(year, month - 1, day);
        if (isNaN(date.getTime())) return 'Data Inválida';
        const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        return `${monthNames[date.getMonth()]}/${date.getFullYear().toString().slice(-2)}`;
    } catch (e) {
        return 'Erro na Data';
    }
};

const getReviewFreqMultiplier = (freq: string): number => {
  switch (freq) {
    case 'Mensal': return 12;
    case 'Trimestral': return 4;
    case 'Semestral': return 2;
    case 'Anual': return 1;
    case 'Quinzenal': return 24;
    default: return 0;
  }
};

const CarteiraCompletaPage: React.FC<CarteiraCompletaPageProps> = ({ operations, onSelectOperation, onAddOperation, onOpenNewTaskModal, onDeleteOperation, onUpdateOperation, apiUrl }) => {
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [operationToDelete, setOperationToDelete] = useState<Operation | null>(null);
  const [areaFilter, setAreaFilter] = useState<'All' | Area>('All');
  const [masterGroupFilter, setMasterGroupFilter] = useState<string>('All');
  const [economicGroupFilter, setEconomicGroupFilter] = useState<string>('All');
  const [analystFilter, setAnalystFilter] = useState<string>('All');
  
  // Task Completion State
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [reviewTaskToComplete, setReviewTaskToComplete] = useState<Task | null>(null);
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{field: SortField, direction: SortDirection}>({
      field: 'name',
      direction: 'asc'
  });

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredOperations = useMemo(() => {
    let result = [...operations];
    
    if (areaFilter !== 'All') {
      result = result.filter(op => op.area === areaFilter);
    }
    if (masterGroupFilter !== 'All') {
      result = result.filter(op => (op.masterGroupName || 'Sem Master Group') === masterGroupFilter);
    }
    if (economicGroupFilter !== 'All') {
      result = result.filter(op => (op.economicGroupName || 'Sem Grupo Econômico') === economicGroupFilter);
    }
    if (analystFilter !== 'All') {
      result = result.filter(op => op.responsibleAnalyst === analystFilter);
    }

    result.sort((a, b) => {
        let valA: any = a[sortConfig.field as keyof Operation];
        let valB: any = b[sortConfig.field as keyof Operation];

        if (['maturityDate', 'nextReviewGerencial', 'nextReviewPolitica'].includes(sortConfig.field)) {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else if (sortConfig.field === 'overdueCount') {
            valA = valA || 0;
            valB = valB || 0;
        } else {
            valA = (valA || "").toString().toLowerCase();
            valB = (valB || "").toString().toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
  }, [operations, areaFilter, masterGroupFilter, economicGroupFilter, analystFilter, sortConfig]);

  // KPIs — dynamic, computed from filteredOperations
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Volume by analyst
    const volumeByAnalyst: Record<string, number> = {};
    filteredOperations.forEach(op => {
      const analyst = op.responsibleAnalyst || 'N/D';
      volumeByAnalyst[analyst] = (volumeByAnalyst[analyst] || 0) + 1;
    });

    // Total operations
    const totalOperations = filteredOperations.length;

    // Reviews per year (based on review frequency of each operation)
    const reviewsPerYear = filteredOperations.reduce((acc, op) => {
      return acc + getReviewFreqMultiplier(op.reviewFrequency || '');
    }, 0);

    // Watchlist count (only Rosa and Vermelho)
    const watchlistCount = filteredOperations.filter(op => op.watchlist === WatchlistStatus.ROSA || op.watchlist === WatchlistStatus.VERMELHO).length;

    // Overdue reviews
    const allTasks = filteredOperations.flatMap(op => op.tasks || []);
    const overdueReviews = allTasks.filter(t => 
      t.status === TaskStatus.OVERDUE && 
      (t.ruleName === 'Revisão Gerencial' || t.ruleName === 'Revisão Política')
    ).length;

    // Reviews for current month
    const reviewsThisMonth = allTasks.filter(t => {
      if (t.status === TaskStatus.COMPLETED) return false;
      if (!t.dueDate) return false;
      if (t.ruleName !== 'Revisão Gerencial' && t.ruleName !== 'Revisão Política') return false;
      const due = new Date(t.dueDate);
      return due.getMonth() === currentMonth && due.getFullYear() === currentYear;
    }).length;

    return { volumeByAnalyst, totalOperations, reviewsPerYear, watchlistCount, overdueReviews, reviewsThisMonth };
  }, [filteredOperations]);

  const areasOpts = useMemo(() => {
    const areas = operations.map(op => op.area).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(areas)).sort()];
  }, [operations]);

  const masterGroupsOpts = useMemo(() => {
    const mgs = operations.map(op => op.masterGroupName || 'Sem Master Group');
    return ['All', ...Array.from(new Set(mgs)).sort()];
  }, [operations]);

  const economicGroupsOpts = useMemo(() => {
    const egs = operations.map(op => op.economicGroupName || 'Sem Grupo Econômico');
    return ['All', ...Array.from(new Set(egs)).sort()];
  }, [operations]);

  const analystOpts = useMemo(() => {
    const analysts = operations.map(op => op.responsibleAnalyst).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(analysts)).sort()];
  }, [operations]);

  const operationsById = useMemo(() => new Map(operations.map(op => [op.id, op])), [operations]);

  const handleCompleteTaskClick = (task: Task) => {
    if (task.ruleName === 'Revisão Gerencial' || task.ruleName === 'Revisão Política') {
        setReviewTaskToComplete(task);
        setIsReviewFormOpen(true);
    } else {
        setTaskToComplete(task);
        setIsEventFormOpen(true);
    }
  };

  const handleAddEvent = (newEvent: Omit<Event, 'id'>) => {
      if (!taskToComplete) return;
      const operationToUpdate = operationsById.get(taskToComplete.operationId);
      if (operationToUpdate) {
        const eventToSave: Partial<Event> = { ...newEvent, completedTaskId: taskToComplete.id };
        const updatedTasks = operationToUpdate.tasks.map(t => t.id === taskToComplete.id ? {...t, status: TaskStatus.COMPLETED} : t);
        const updatedOperation = {
            ...operationToUpdate,
            events: [...operationToUpdate.events, { ...eventToSave, id: Date.now() } as Event],
            tasks: updatedTasks,
        };
        onUpdateOperation(updatedOperation);
      }
      setTaskToComplete(null);
      setIsEventFormOpen(false);
  };

  const handleSaveReview = async (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: Sentiment }) => {
    if (!reviewTaskToComplete) return;
    const operationToUpdate = operationsById.get(reviewTaskToComplete.operationId);
    if (!operationToUpdate) return;

    const newEventId = Date.now();
    const eventToSave: Event = { ...data.event, id: newEventId, completedTaskId: reviewTaskToComplete?.id };
    const newHistoryEntry: RatingHistoryEntry = {
        id: Date.now() + 1, date: eventToSave.date,
        ratingOperation: data.ratingOp, ratingGroup: data.ratingGroup, ratingMasterGroup: data.ratingMasterGroup,
        watchlist: operationToUpdate.watchlist, sentiment: data.sentiment, eventId: newEventId,
    };
    const updatedTasks = operationToUpdate.tasks.map(t => t.id === reviewTaskToComplete.id ? {...t, status: TaskStatus.COMPLETED} : t);
    const updatedOperation: Operation = {
        ...operationToUpdate, ratingOperation: data.ratingOp, ratingGroup: data.ratingGroup, ratingMasterGroup: data.ratingMasterGroup,
        events: [...operationToUpdate.events, eventToSave], ratingHistory: [...operationToUpdate.ratingHistory, newHistoryEntry], tasks: updatedTasks
    };
    onUpdateOperation(updatedOperation);
    setReviewTaskToComplete(null);
    setIsReviewFormOpen(false);
  };

  const confirmDelete = () => {
    if (operationToDelete) {
      onDeleteOperation(operationToDelete.id);
      setOperationToDelete(null); 
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
      if (sortConfig.field !== field) return <div className="w-4 h-4 text-gray-300 ml-1 inline-block opacity-20"><ArrowUpIcon /></div>;
      return sortConfig.direction === 'asc' 
          ? <ArrowUpIcon className="w-4 h-4 text-blue-600 ml-1 inline-block" /> 
          : <ArrowDownIcon className="w-4 h-4 text-blue-600 ml-1 inline-block" />;
  };

  const topAnalysts = Object.entries(kpis.volumeByAnalyst).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {isEventFormOpen && taskToComplete && (
        <EventForm onClose={() => { setIsEventFormOpen(false); setTaskToComplete(null); }} onSave={handleAddEvent}
            analystName={operationsById.get(taskToComplete.operationId)?.responsibleAnalyst || ''} prefilledTitle={`Conclusão: ${taskToComplete.ruleName}`}
        />
      )}
      {isReviewFormOpen && reviewTaskToComplete && (
        <ReviewCompletionForm task={reviewTaskToComplete} operation={operationsById.get(reviewTaskToComplete.operationId)!}
            onClose={() => { setIsReviewFormOpen(false); setReviewTaskToComplete(null); }} onSave={handleSaveReview}
        />
      )}
      {isFormOpen && <OperationForm onClose={() => setIsFormOpen(false)} onSave={onAddOperation} apiUrl={apiUrl} />}

      {operationToDelete && (
        <Modal isOpen={true} onClose={() => setOperationToDelete(null)} title={`Deletar Operação: ${operationToDelete.name}`}>
          <div className="text-center">
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">Você tem certeza que deseja deletar esta operação?</p>
            <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setOperationToDelete(null)} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Confirmar Deleção</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Carteira Completa</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Visão detalhada de todas as {operations.length} operações ativas</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 shadow-sm">
          <PlusCircleIcon className="w-5 h-5" /><span>Adicionar Operação</span>
        </button>
      </div>

      {/* Operations Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200">Operações</h2>
          <div className="flex items-center gap-3 flex-wrap">
             <select id="area-filter-carteira" value={areaFilter} onChange={e => setAreaFilter(e.target.value as 'All' | Area)}
               className="block pl-3 pr-8 py-1.5 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 shadow-sm"
             >
                 {areasOpts.map(area => <option key={area} value={area}>{area === 'All' ? 'Área: Todas' : area}</option>)}
             </select>
             <select value={masterGroupFilter} onChange={e => setMasterGroupFilter(e.target.value)}
               className="block pl-3 pr-8 py-1.5 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 shadow-sm"
             >
                 {masterGroupsOpts.map(mg => <option key={mg} value={mg}>{mg === 'All' ? 'Master Group: Todos' : mg}</option>)}
             </select>
             <select value={economicGroupFilter} onChange={e => setEconomicGroupFilter(e.target.value)}
               className="block pl-3 pr-8 py-1.5 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 shadow-sm"
             >
                 {economicGroupsOpts.map(eg => <option key={eg} value={eg}>{eg === 'All' ? 'Grupo Econômico: Todos' : eg}</option>)}
             </select>
             <select value={analystFilter} onChange={e => setAnalystFilter(e.target.value)}
               className="block pl-3 pr-8 py-1.5 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 shadow-sm"
             >
                 {analystOpts.map(a => <option key={a} value={a}>{a === 'All' ? 'Analista: Todos' : a}</option>)}
             </select>
          </div>
        </div>

        {/* KPI Cards — dynamic, after filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30">
          {/* Volume por analista (mini-breakdown) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Vol. por Analista</p>
            <div className="space-y-1.5">
              {topAnalysts.slice(0, 4).map(([analyst, count]) => (
                <div key={analyst} className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate mr-2">{analyst}</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{count}</span>
                </div>
              ))}
              {topAnalysts.length > 4 && <p className="text-[10px] text-gray-400 text-center">+{topAnalysts.length - 4} outros</p>}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total Operações</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{kpis.totalOperations}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Revisões / Ano</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{kpis.reviewsPerYear}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Watchlist (Rosa/Vermelho)</p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{kpis.watchlistCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Revisões em Atraso</p>
            <p className={`text-3xl font-bold mt-1 ${kpis.overdueReviews > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{kpis.overdueReviews}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Revisões do Mês</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{kpis.reviewsThisMonth}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('name')}>
                  Nome <SortIcon field="name" />
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('responsibleAnalyst')}>
                  Analista <SortIcon field="responsibleAnalyst" />
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('maturityDate')}>
                  Vencimento <SortIcon field="maturityDate" />
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rating Op.</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Watchlist</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('nextReviewGerencial')}>
                  Próx. Rev. Gerencial <SortIcon field="nextReviewGerencial" />
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('nextReviewPolitica')}>
                  Próx. Rev. Política <SortIcon field="nextReviewPolitica" />
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => handleSort('overdueCount')}>
                  Atrasadas <SortIcon field="overdueCount" />
                </th>
                <th scope="col" className="px-5 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredOperations.map((op) => {
                const latestHistoryEntry = op.ratingHistory.length > 0
                  ? [...op.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                  : null;
                const currentStatus = latestHistoryEntry?.watchlist ?? op.watchlist;

                return (
                  <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer" onClick={() => onSelectOperation(op.id)}>
                      {op.name}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{op.responsibleAnalyst}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm font-semibold text-blue-700 dark:text-blue-300">{formatDate(op.maturityDate)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{op.ratingOperation}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm"><WatchlistBadge status={currentStatus} /></td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(op.nextReviewGerencial)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(op.nextReviewPolitica)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-center">
                      <span className={op.overdueCount > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-full font-bold' : 'text-green-600 dark:text-green-400'}>
                        {op.overdueCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center justify-center gap-3">
                          <button onClick={() => onOpenNewTaskModal(op.id)} className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-semibold text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded transition-colors">
                              + Tarefa
                          </button>
                          <button onClick={() => onSelectOperation(op.id)} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 font-semibold transition-colors">
                              <EyeIcon className="w-4 h-4" /> Detalhes
                          </button>
                          <button onClick={() => setOperationToDelete(op)} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Deletar">
                              <TrashIcon className="w-4 h-4" />
                          </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            {filteredOperations.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Nenhuma operação encontrada para os filtros selecionados.
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CarteiraCompletaPage;
