
import React, { useState, useMemo, useEffect } from 'react';
import type { Operation, Area, Task, Event, Rating, Sentiment, RatingHistoryEntry } from '../types';
import { WatchlistStatus, TaskStatus, Page } from '../types';
import { autoCreateComiteReviewItem } from '../utils/api';
import OperationForm from './OperationForm';
import AnalystCalendar from './AnalystCalendar';
import EventForm from './EventForm';
import ReviewCompletionForm from './ReviewCompletionForm';
import { PlusCircleIcon, EyeIcon, TrashIcon } from './icons/Icons';
import Modal from './Modal';

interface ComiteListItemDash {
  id: number;
  data: string;
  status: string;
  tipo?: string;
  area?: string;
  horario?: string;
  itens_count: number;
  itens_titulos?: string[];
}

interface OverviewDashboardProps {
  operations: Operation[];
  onSelectOperation: (id: number) => void;
  onAddOperation: (newOperationData: any) => void;
  onOpenNewTaskModal: (operationId?: number) => void;
  onDeleteOperation: (id: number) => void;
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  apiUrl: string;
  onNavigate?: (page: Page, id?: number) => void;
  selectedArea?: Area | 'Mixed';
}

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

const getWatchlistColorDot = (status: WatchlistStatus) => {
  switch (status) {
    case WatchlistStatus.VERDE: return '#22c55e';
    case WatchlistStatus.AMARELO: return '#eab308';
    case WatchlistStatus.ROSA: return '#ec4899';
    case WatchlistStatus.VERMELHO: return '#ef4444';
  }
};

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ operations, onSelectOperation, onAddOperation, onOpenNewTaskModal, onDeleteOperation, onUpdateOperation, apiUrl, onNavigate, selectedArea }) => {
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [operationToDelete, setOperationToDelete] = useState<Operation | null>(null);
  const [comites, setComites] = useState<ComiteListItemDash[]>([]);
  
  // Task Completion State
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [reviewTaskToComplete, setReviewTaskToComplete] = useState<Task | null>(null);
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);

  const allTasks = React.useMemo(() => {
      return operations.flatMap(op => op.tasks || []);
  }, [operations]);

  const operationsById = useMemo(() => new Map(operations.map(op => [op.id, op])), [operations]);

  // ── Atividades Recentes: all events from operations (already filtered by area) ──
  const recentEvents = useMemo(() => {
    let events: (Event & { operationName: string, operationId: number })[] = [];
    operations.forEach(op => {
      if (op.events) {
        events = [...events, ...op.events.map(e => ({ ...e, operationName: op.name, operationId: op.id }))];
      }
    });
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);
  }, [operations]);

  // State for event detail modal
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<(Event & { operationName: string, operationId: number }) | null>(null);

  // ── Fetch comitê data ──
  useEffect(() => {
    const fetchComites = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/comite/comites`);
        if (res.ok) setComites(await res.json());
      } catch (e) {
        console.error('Error fetching comites for dashboard:', e);
      }
    };
    fetchComites();
  }, [apiUrl]);

  // ── Watchlist: Recent changes (flattened from rating history) ──
  const watchlistChanges = useMemo(() => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const changes: { opId: number; opName: string; date: string; prevWatchlist: WatchlistStatus; newWatchlist: WatchlistStatus; prevRating: Rating; newRating: Rating }[] = [];

    operations.forEach(op => {
      if (!op.ratingHistory || op.ratingHistory.length < 2) return;
      const sorted = [...op.ratingHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (new Date(curr.date) < ninetyDaysAgo) continue;
        if (curr.watchlist !== prev.watchlist || curr.ratingOperation !== prev.ratingOperation) {
          changes.push({
            opId: op.id,
            opName: op.name,
            date: curr.date,
            prevWatchlist: prev.watchlist,
            newWatchlist: curr.watchlist,
            prevRating: prev.ratingOperation,
            newRating: curr.ratingOperation,
          });
        }
      }
    });
    return changes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  }, [operations]);

  // ── Comitê: Próximos agendados & último concluído (filtered by area) ──
  const upcomingComites = useMemo(() => {
    const now = new Date();
    return comites
      .filter(c => c.status === 'agendado' && new Date(c.data) >= now)
      .filter(c => !selectedArea || selectedArea === 'Mixed' || c.area === selectedArea)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .slice(0, 4);
  }, [comites, selectedArea]);

  const lastCompletedComite = useMemo(() => {
    return comites
      .filter(c => c.status === 'concluido')
      .filter(c => !selectedArea || selectedArea === 'Mixed' || c.area === selectedArea)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0] || null;
  }, [comites, selectedArea]);

  // ── Tasks: important/urgent this week ──
  const urgentTasksThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

    return allTasks.filter(t => {
      if (t.status === TaskStatus.COMPLETED) return false;
      const rule = operations.find(op => op.id === t.operationId)?.taskRules?.find(r => r.id === t.ruleId);
      const isUrgentOrHigh = t.priority === 'Urgente' || t.priority === 'Alta' || rule?.priority === 'Urgente' || rule?.priority === 'Alta';
      const isOverdue = t.status === TaskStatus.OVERDUE;
      if (!isUrgentOrHigh && !isOverdue) return false;
      if (!t.dueDate) return isOverdue || isUrgentOrHigh;
      const due = new Date(t.dueDate);
      return due <= endOfWeek || isOverdue;
    }).sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return dateA - dateB;
    }).slice(0, 8);
  }, [allTasks, operations]);

  // ── New risks (recent 7 days) ──
  const newRisks = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return operations.flatMap(op => 
      (op.risks || []).filter(r => new Date(r.createdAt) > sevenDaysAgo).map(r => ({ ...r, operationName: op.name, operationId: op.id }))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  }, [operations]);

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

  const handleSaveReview = async (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: Sentiment, videoUrl: string }) => {
    if (!reviewTaskToComplete) return;
    const operationToUpdate = operationsById.get(reviewTaskToComplete.operationId);
    if (!operationToUpdate) return;

    const newEventId = Date.now();
    const eventToSave: Event = { ...data.event, id: newEventId, completedTaskId: reviewTaskToComplete?.id };

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

    // Auto-criar item de revisão no próximo comitê de investimento
    autoCreateComiteReviewItem({
      operationId: operationToUpdate.id,
      operationName: operationToUpdate.name,
      operationArea: operationToUpdate.area,
      reviewTitle: eventToSave.title || `Revisão de crédito - ${operationToUpdate.name}`,
      reviewDescription: data.event.description,
      analystName: operationToUpdate.responsibleAnalyst,
      videoUrl: data.videoUrl || '',
      watchlist: operationToUpdate.watchlist,
      ratingOperation: data.ratingOp,
      sentiment: data.sentiment,
    });

    setReviewTaskToComplete(null);
    setIsReviewFormOpen(false);
  };

  const confirmDelete = () => {
    if (operationToDelete) {
      onDeleteOperation(operationToDelete.id);
      setOperationToDelete(null); 
    }
  };

  const getEventTypeColor = (type: string) => {
    if (type.includes('Concluída') || type.includes('Revisão')) return 'bg-green-100 dark:bg-green-900/30 text-green-500 dark:text-green-400';
    if (type.includes('Comitê') || type.includes('Reunião')) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400';
    if (type.includes('Visita')) return 'bg-purple-100 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400';
    if (type.includes('Call')) return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400';
    return 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
  };

  const formatDateShort = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch { return ''; }
  };

  return (
    <div className="space-y-6">
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
        <Modal isOpen={true} onClose={() => setOperationToDelete(null)} title={`Deletar Operação: ${operationToDelete.name}`}>
          <div className="text-center">
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">Você tem certeza que deseja deletar esta operação?</p>
            <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-6">Todos os eventos, tarefas e históricos associados serão permanentemente removidos.</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setOperationToDelete(null)} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Confirmar Deleção</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Action Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Resumo Geral</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Visão consolidada de movimentações recentes</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 shadow-sm"
        >
          <PlusCircleIcon className="w-5 h-5" />
          <span>Adicionar Operação</span>
        </button>
      </div>

      {/* Row 1: Comitês (placeholder) + Atividades Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comitês — Próximos agendados + último concluído */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-violet-50/50 to-indigo-50/50 dark:from-violet-900/10 dark:to-indigo-900/10">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              Comitês
              {onNavigate && (
                <button onClick={() => onNavigate(Page.COMITES)} className="ml-auto text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase hover:text-violet-700 dark:hover:text-violet-300 transition-colors">Ver Todos →</button>
              )}
            </h3>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {upcomingComites.length === 0 && !lastCompletedComite ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-violet-400 dark:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Nenhum comitê agendado</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Próximos comitês */}
                {upcomingComites.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Próximos Agendados</p>
                    <div className="space-y-2">
                      {upcomingComites.map(c => {
                        const daysUntil = Math.ceil((new Date(c.data).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100/70 dark:hover:bg-blue-900/25 transition-all cursor-pointer group"
                            onClick={() => onNavigate?.(Page.COMITE_DETAIL, c.id)}
                          >
                            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                                {c.tipo} — {c.area}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {new Date(c.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {c.horario ? ` às ${c.horario}` : ''}
                                {' · '}{c.itens_count} {c.itens_count === 1 ? 'item' : 'itens'}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                daysUntil <= 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 animate-pulse'
                                  : daysUntil <= 3 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              }`}>
                                {daysUntil <= 0 ? 'HOJE' : daysUntil === 1 ? 'AMANHÃ' : `${daysUntil}d`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Último concluído */}
                {lastCompletedComite && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 mt-3">Último Concluído</p>
                    <div
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/25 transition-all cursor-pointer group"
                      onClick={() => onNavigate?.(Page.COMITE_DETAIL, lastCompletedComite.id)}
                    >
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                          {lastCompletedComite.tipo} — {lastCompletedComite.area}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {new Date(lastCompletedComite.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}{lastCompletedComite.itens_count} {lastCompletedComite.itens_count === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">CONCLUÍDO</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Atividades Recentes — Timeline de eventos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Atividades Recentes
            </h3>
          </div>
          <div className="p-4 overflow-y-auto max-h-80">
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
              {recentEvents.length === 0 ? (
                <div className="text-center text-gray-400 dark:text-gray-500 py-4 text-sm">Nenhuma atividade recente registrada.</div>
              ) : (
                recentEvents.map((event, idx) => (
                  <div key={event.id || idx} className="relative pl-8 group">
                    <div className={`absolute left-0 top-1.5 flex items-center justify-center w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 shadow-sm z-10 transition-transform group-hover:scale-110 ${getEventTypeColor(event.type)}`}>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                    </div>
                    <div 
                      className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 group-hover:border-blue-100 dark:group-hover:border-blue-900 group-hover:bg-blue-50/30 dark:group-hover:bg-blue-900/10 transition-all cursor-pointer"
                      onClick={() => setSelectedEventForDetails(event)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-900 dark:text-gray-100 text-xs line-clamp-1">{event.title}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">{new Date(event.date).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1.5 hover:underline uppercase tracking-wider inline-block" onClick={(e) => { e.stopPropagation(); onSelectOperation(event.operationId); }}>{event.operationName}</p>
                      <div 
                        className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-0 prose-li:my-0"
                        dangerouslySetInnerHTML={{ __html: event.description }}
                      />
                      {event.registeredBy && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700/50">Registrado por: {event.registeredBy}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Watchlist + Novos Riscos + Tarefas Urgentes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Watchlist — Alterações Recentes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Watchlist
              <span className="ml-auto text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">90 dias</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
            {watchlistChanges.length === 0 ? (
              <div className="p-6 text-center text-gray-400 dark:text-gray-500 text-sm">
                <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Sem alterações recentes de watchlist
              </div>
            ) : (
              watchlistChanges.map((change, idx) => (
                <div
                  key={`${change.opId}-${idx}`}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                  onClick={() => onSelectOperation(change.opId)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">{change.opName}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">{formatDateShort(change.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    {/* Watchlist change */}
                    {change.prevWatchlist !== change.newWatchlist && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getWatchlistColorDot(change.prevWatchlist) }} />
                        <span className="text-gray-400">→</span>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getWatchlistColorDot(change.newWatchlist) }} />
                        <span className="font-medium text-gray-600 dark:text-gray-400">{change.newWatchlist}</span>
                      </div>
                    )}
                    {/* Rating change */}
                    {change.prevRating !== change.newRating && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 dark:text-gray-500">Rating:</span>
                        <span className="font-medium text-gray-500 dark:text-gray-400 line-through">{change.prevRating}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-bold text-gray-700 dark:text-gray-300">{change.newRating}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {watchlistChanges.length > 0 && (
            <div className="flex items-center gap-3 p-3 pt-2 border-t border-gray-100 dark:border-gray-700 justify-center flex-wrap">
              {[WatchlistStatus.VERDE, WatchlistStatus.AMARELO, WatchlistStatus.ROSA, WatchlistStatus.VERMELHO].map(s => (
                <div key={s} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getWatchlistColorDot(s) }} />
                  <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Novos Riscos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-orange-50/50 to-red-50/50 dark:from-orange-900/10 dark:to-red-900/10">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Novos Riscos Levantados
              <span className="ml-auto text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">7 dias</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
            {newRisks.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <span className="text-2xl block mb-1">🛡️</span>
                Nenhum risco novo registrado
              </div>
            ) : (
              newRisks.map(risk => {
                const severityColors: Record<string, string> = {
                  'Alta': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                  'Média': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                  'Baixa': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                };
                return (
                  <div key={risk.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => onSelectOperation(risk.operationId)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${severityColors[risk.severity] || ''}`}>{risk.severity}</span>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{risk.title}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {risk.operationName} • {new Date(risk.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tarefas Urgentes / Importantes da Semana */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-red-50/50 to-amber-50/50 dark:from-red-900/10 dark:to-amber-900/10">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.193 2.5 1.732 2.5z" /></svg>
              Tarefas Urgentes/Importantes
              <span className="ml-auto text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Semana</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
            {urgentTasksThisWeek.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <span className="text-2xl block mb-1">✅</span>
                Nenhuma tarefa urgente pendente
              </div>
            ) : (
              urgentTasksThisWeek.map(task => {
                const op = operationsById.get(task.operationId);
                const isOverdue = task.status === TaskStatus.OVERDUE;
                return (
                  <div key={task.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{task.ruleName}</span>
                      {(task.priority === 'Urgente' || task.priority === 'Alta') && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${task.priority === 'Urgente' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                      <span className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" onClick={() => onSelectOperation(op?.id || 0)}>{op?.name}</span>
                      <span>•</span>
                      <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Calendário do Analista */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Calendário do Analista (Mês Atual)
        </h2>
        <AnalystCalendar tasks={allTasks} operations={operations} onCompleteTask={handleCompleteTaskClick} onOpenNewTaskModal={onOpenNewTaskModal} />
      </div>
      {/* Event Detail Modal */}
      {selectedEventForDetails && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedEventForDetails(null)}
          title={selectedEventForDetails.title}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 pb-2">
              <span className="font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => { onSelectOperation(selectedEventForDetails.operationId); setSelectedEventForDetails(null); }}>{selectedEventForDetails.operationName}</span>
              <span>{new Date(selectedEventForDetails.date).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.description }} />
            {selectedEventForDetails.nextSteps && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-1">Próximos Passos</h4>
                <div className="text-sm text-blue-900 dark:text-blue-200 prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.nextSteps }} />
              </div>
            )}
            {selectedEventForDetails.registeredBy && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Registrado por: <strong>{selectedEventForDetails.registeredBy}</strong></p>
            )}
            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
              <button
                onClick={() => setSelectedEventForDetails(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default OverviewDashboard;
