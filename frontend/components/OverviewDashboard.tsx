
import React, { useState, useMemo } from 'react';
import type { Operation, Area, Task, Event, Rating, Sentiment, RatingHistoryEntry } from '../types';
import { WatchlistStatus, TaskStatus } from '../types';
import OperationForm from './OperationForm';
import AnalystCalendar from './AnalystCalendar';
import EventForm from './EventForm';
import ReviewCompletionForm from './ReviewCompletionForm';
import { PlusCircleIcon, EyeIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from './icons/Icons';
import Modal from './Modal';

interface OverviewDashboardProps {
  operations: Operation[];
  onSelectOperation: (id: number) => void;
  onAddOperation: (newOperationData: any) => void;
  onOpenNewTaskModal: (operationId?: number) => void;
  onDeleteOperation: (id: number) => void;
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  apiUrl: string;
}

type SortField = 'name' | 'maturityDate' | 'nextReviewGerencial' | 'nextReviewPolitica';
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
        console.error("Erro ao formatar data:", dateString, e);
        return 'Erro na Data';
    }
};


const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ operations, onSelectOperation, onAddOperation, onOpenNewTaskModal, onDeleteOperation, onUpdateOperation, apiUrl }) => {
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [operationToDelete, setOperationToDelete] = useState<Operation | null>(null);
  const [areaFilter, setAreaFilter] = useState<'All' | Area>('All');
  const [masterGroupFilter, setMasterGroupFilter] = useState<string>('All');
  const [economicGroupFilter, setEconomicGroupFilter] = useState<string>('All');
  
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

    result.sort((a, b) => {
        let valA: any = a[sortConfig.field as keyof Operation];
        let valB: any = b[sortConfig.field as keyof Operation];

        // Normalização para datas
        if (['maturityDate', 'nextReviewGerencial', 'nextReviewPolitica'].includes(sortConfig.field)) {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else {
            valA = (valA || "").toString().toLowerCase();
            valB = (valB || "").toString().toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
  }, [operations, areaFilter, masterGroupFilter, economicGroupFilter, sortConfig]);

  const areasOpts = useMemo(() => {
    const filtered = operations.filter(op => 
      (masterGroupFilter === 'All' || (op.masterGroupName || 'Sem Master Group') === masterGroupFilter) &&
      (economicGroupFilter === 'All' || (op.economicGroupName || 'Sem Grupo Econômico') === economicGroupFilter)
    );
    const areas = filtered.map(op => op.area).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(areas)).sort()];
  }, [operations, masterGroupFilter, economicGroupFilter]);

  const masterGroupsOpts = useMemo(() => {
    const filtered = operations.filter(op => 
      (areaFilter === 'All' || op.area === areaFilter) && 
      (economicGroupFilter === 'All' || (op.economicGroupName || 'Sem Grupo Econômico') === economicGroupFilter)
    );
    const mgs = filtered.map(op => op.masterGroupName || 'Sem Master Group');
    return ['All', ...Array.from(new Set(mgs)).sort()];
  }, [operations, areaFilter, economicGroupFilter]);

  const economicGroupsOpts = useMemo(() => {
    const filtered = operations.filter(op => 
      (areaFilter === 'All' || op.area === areaFilter) && 
      (masterGroupFilter === 'All' || (op.masterGroupName || 'Sem Master Group') === masterGroupFilter)
    );
    const egs = filtered.map(op => op.economicGroupName || 'Sem Grupo Econômico');
    return ['All', ...Array.from(new Set(egs)).sort()];
  }, [operations, areaFilter, masterGroupFilter]);

  React.useEffect(() => {
    if (areaFilter !== 'All' && !areasOpts.includes(areaFilter)) {
      setAreaFilter('All');
    }
  }, [areasOpts, areaFilter]);

  React.useEffect(() => {
    if (masterGroupFilter !== 'All' && !masterGroupsOpts.includes(masterGroupFilter)) {
      setMasterGroupFilter('All');
    }
  }, [masterGroupsOpts, masterGroupFilter]);

  React.useEffect(() => {
    if (economicGroupFilter !== 'All' && !economicGroupsOpts.includes(economicGroupFilter)) {
      setEconomicGroupFilter('All');
    }
  }, [economicGroupsOpts, economicGroupFilter]);

  const allTasks = React.useMemo(() => {
      return operations.flatMap(op => op.tasks || []);
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
        const eventToSave: Partial<Event> = {
            ...newEvent,
            completedTaskId: taskToComplete.id,
        };
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
    const eventToSave: Event = {
        ...data.event,
        id: newEventId,
        completedTaskId: reviewTaskToComplete?.id
    };

    const newHistoryEntry: RatingHistoryEntry = {
        id: Date.now() + 1,
        date: eventToSave.date,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        ratingMasterGroup: data.ratingMasterGroup,
        watchlist: operationToUpdate.watchlist,
        sentiment: data.sentiment,
        eventId: newEventId,
    };

    const updatedTasks = operationToUpdate.tasks.map(t => t.id === reviewTaskToComplete.id ? {...t, status: TaskStatus.COMPLETED} : t);

    const updatedOperation: Operation = {
        ...operationToUpdate,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        ratingMasterGroup: data.ratingMasterGroup,
        events: [...operationToUpdate.events, eventToSave],
        ratingHistory: [...operationToUpdate.ratingHistory, newHistoryEntry],
        tasks: updatedTasks
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

  return (
    <div className="space-y-8">
      {isEventFormOpen && taskToComplete && (
        <EventForm 
            onClose={() => { setIsEventFormOpen(false); setTaskToComplete(null); }} 
            onSave={handleAddEvent}
            analystName={operationsById.get(taskToComplete.operationId)?.responsibleAnalyst || ''}
            prefilledTitle={`Conclusão: ${taskToComplete.ruleName}`}
        />
      )}
      {isReviewFormOpen && reviewTaskToComplete && (
        <ReviewCompletionForm
            task={reviewTaskToComplete}
            operation={operationsById.get(reviewTaskToComplete.operationId)!}
            onClose={() => { setIsReviewFormOpen(false); setReviewTaskToComplete(null); }}
            onSave={handleSaveReview}
        />
      )}
      {isFormOpen && (
        <OperationForm 
            onClose={() => setIsFormOpen(false)} 
            onSave={onAddOperation} 
            apiUrl={apiUrl}
        />
      )}

      {operationToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setOperationToDelete(null)}
          title={`Deletar Operação: ${operationToDelete.name}`}
        >
          <div className="text-center">
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
              Você tem certeza que deseja deletar esta operação?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-6">
              Todos os eventos, tarefas e históricos associados serão permanentemente removidos. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setOperationToDelete(null)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Confirmar Deleção
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition-colors duration-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">Resumo de Operações</h2>
          <div className="flex items-center gap-4">
             <div>
                <label htmlFor="area-filter" className="sr-only">Filtrar por Área</label>
                <select 
                  id="area-filter"
                  value={areaFilter}
                  onChange={e => setAreaFilter(e.target.value as 'All' | Area)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md transition-colors duration-200"
                >
                    {areasOpts.map(area => <option key={area} value={area}>{area === 'All' ? 'Todas as Áreas' : area}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="mg-filter" className="sr-only">Master Group</label>
                <select 
                  id="mg-filter"
                  value={masterGroupFilter}
                  onChange={e => setMasterGroupFilter(e.target.value)}
                  className="block w-full pl-3 pr-8 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md transition-colors duration-200"
                >
                    {masterGroupsOpts.map(mg => <option key={mg} value={mg}>{mg === 'All' ? 'Todos os Master Groups' : mg}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="eg-filter" className="sr-only">Grupo Econômico</label>
                <select 
                  id="eg-filter"
                  value={economicGroupFilter}
                  onChange={e => setEconomicGroupFilter(e.target.value)}
                  className="block w-full pl-3 pr-8 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md transition-colors duration-200"
                >
                    {economicGroupsOpts.map(eg => <option key={eg} value={eg}>{eg === 'All' ? 'Todos os Grupos Econômicos' : eg}</option>)}
                </select>
            </div>
            <button
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300"
            >
              <PlusCircleIcon className="w-5 h-5" />
              <span>Adicionar Operação</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  Nome da Operação <SortIcon field="name" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('maturityDate')}
                >
                  Vencimento <SortIcon field="maturityDate" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rating Op.</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Watchlist</th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('nextReviewGerencial')}
                >
                  Próx. Rev. Gerencial <SortIcon field="nextReviewGerencial" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('nextReviewPolitica')}
                >
                  Próx. Rev. Política <SortIcon field="nextReviewPolitica" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Tarefas Atrasadas</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
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
                    <td 
                      className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                      onClick={() => onSelectOperation(op.id)}
                    >
                      {op.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-700 dark:text-blue-300">{formatDate(op.maturityDate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{op.ratingOperation}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"><WatchlistBadge status={currentStatus} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(op.nextReviewGerencial)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(op.nextReviewPolitica)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className={op.overdueCount > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-full font-bold' : 'text-green-600 dark:text-green-400'}>
                        {op.overdueCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center justify-center gap-4">
                          <button onClick={() => onOpenNewTaskModal(op.id)} className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-semibold text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded transition-colors">
                              + Tarefa
                          </button>
                          <button onClick={() => onSelectOperation(op.id)} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 font-semibold transition-colors">
                              <EyeIcon className="w-5 h-5" /> Detalhes
                          </button>
                          <button
                              onClick={() => setOperationToDelete(op)}
                              className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
                              title="Deletar Operação"
                          >
                              <TrashIcon className="w-5 h-5" />
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
                    Nenhuma operação cadastrada para os filtros selecionados.
                </div>
            )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition-colors duration-200">
        <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4">Calendário do Analista (Mês Atual)</h2>
        <AnalystCalendar tasks={allTasks} operations={operations} onCompleteTask={handleCompleteTaskClick} onOpenNewTaskModal={onOpenNewTaskModal} />
      </div>
    </div>
  );
};

export default OverviewDashboard;
