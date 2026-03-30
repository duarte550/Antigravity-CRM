import React, { useState, useMemo, useCallback } from 'react';
import type { Operation, Task, Event, TaskChecklistItem } from '../types';
import { Page, TaskStatus, TaskPriority } from '../types';
import { CheckCircleIcon, WarningIcon, CalendarIcon, PencilIcon, TrashIcon, PlusCircleIcon, ViewListIcon, ViewBoardsIcon } from './icons/Icons';
import EventForm from './EventForm';
import WatchlistChangeForm from './WatchlistChangeForm';
import AdHocTaskForm from './AdHocTaskForm';
import Modal from './Modal';
import ReviewCompletionForm from './ReviewCompletionForm';
import AnalystCalendar from './AnalystCalendar';
import type { WatchlistStatus, Rating, Sentiment } from '../types';
import { fetchApi, autoCreateComiteReviewItem } from '../utils/api';

interface AnalystHubProps {
  operations: Operation[];
  allTasks: Task[];
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  onNavigate: (page: Page, operationId?: number) => void;
  onOpenNewTaskModal: (operationId?: number, analystName?: string) => void;
  onDeleteTask: (task: Task) => void;
  onEditTask: (task: Task, updates: { name: string, dueDate: string | null, notes?: string }) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
}

const AnalystHub: React.FC<AnalystHubProps> = ({
  operations,
  allTasks,
  onUpdateOperation,
  onNavigate,
  onOpenNewTaskModal,
  onDeleteTask,
  onEditTask,
  apiUrl,
  showToast,
  setIsSyncing,
  setIsRefreshing
}) => {
  // Get unique analysts
  const analysts = useMemo(() => {
    const set = new Set<string>();
    operations.forEach(op => {
      if (op.responsibleAnalyst) set.add(op.responsibleAnalyst);
    });
    return Array.from(set).sort();
  }, [operations]);

  const [selectedAnalyst, setSelectedAnalyst] = useState<string>(() => {
    const saved = localStorage.getItem('crm_selected_analyst');
    if (saved && analysts.includes(saved)) return saved;
    return analysts[0] || '';
  });

  React.useEffect(() => {
    if (selectedAnalyst) {
      localStorage.setItem('crm_selected_analyst', selectedAnalyst);
    }
  }, [selectedAnalyst]);
  const [analystNotes, setAnalystNotes] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Fetch analyst notes
  React.useEffect(() => {
    if (!selectedAnalyst) return;
    const fetchNotes = async () => {
      setIsRefreshing(true);
      try {
        const response = await fetchApi(`${apiUrl}/api/analyst-notes/${encodeURIComponent(selectedAnalyst)}`);
        if (response.ok) {
          const data = await response.json();
          setAnalystNotes(data.notes || '');
        }
      } catch (error) {
        console.error('Error fetching analyst notes:', error);
      } finally {
        setIsRefreshing(false);
      }
    };
    fetchNotes();
  }, [selectedAnalyst, apiUrl]);

  const handleSaveNotes = async () => {
    if (!selectedAnalyst) return;
    setIsSavingNotes(true);
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${apiUrl}/api/analyst-notes/${encodeURIComponent(selectedAnalyst)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: analystNotes })
      });
      if (response.ok) {
        showToast('Notas salvas!', 'success');
      } else {
        throw new Error('Failed to save notes');
      }
    } catch (error) {
      console.error('Error saving analyst notes:', error);
      showToast('Erro ao salvar notas.', 'error');
    } finally {
      setIsSavingNotes(false);
      setIsSyncing(false);
    }
  };
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [isWatchlistFormOpen, setIsWatchlistFormOpen] = useState(false);
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
  const [selectedOperationForAction, setSelectedOperationForAction] = useState<Operation | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [reviewTaskToComplete, setReviewTaskToComplete] = useState<Task | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<(Event & { operationName: string, operationId: number }) | null>(null);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);

  const handleOpenEventForm = (operation: Operation) => {
    setSelectedOperationForAction(operation);
    setIsEventFormOpen(true);
  };

  const handleOpenWatchlistForm = (operation: Operation) => {
    setSelectedOperationForAction(operation);
    setIsWatchlistFormOpen(true);
  };

  const handleSaveEvent = async (eventData: Omit<Event, 'id'>, eventId?: number) => {
    if (!selectedOperationForAction) return;
    try {
      let updatedTasks = selectedOperationForAction.tasks;
      let eventToSave = { ...eventData, id: eventId || Date.now() } as Event;

      if (eventId) {
          const updatedOperation = {
            ...selectedOperationForAction,
            events: selectedOperationForAction.events.map(e => e.id === eventId ? eventToSave : e)
          };
          await onUpdateOperation(updatedOperation);
          showToast('Evento atualizado com sucesso!', 'success');
      } else {
          if (taskToComplete) {
            eventToSave.completedTaskId = taskToComplete.id;
            updatedTasks = updatedTasks.map(t => 
              t.id === taskToComplete.id ? { ...t, status: TaskStatus.COMPLETED } : t
            );
          }

          const updatedOperation = {
            ...selectedOperationForAction,
            tasks: updatedTasks,
            events: [...selectedOperationForAction.events, eventToSave]
          };
          await onUpdateOperation(updatedOperation);
          showToast('Evento registrado com sucesso!', 'success');
      }
      setIsEventFormOpen(false);
      setSelectedOperationForAction(null);
      setTaskToComplete(null);
      setEventToEdit(null);
    } catch (error) {
      console.error(error);
      showToast('Erro ao registrar evento.', 'error');
    }
  };

  const handleSaveWatchlistChange = async (data: { watchlist: WatchlistStatus, ratingOp: Rating, ratingGroup: Rating, sentiment: Sentiment, event: Omit<Event, 'id'>}) => {
    if (!selectedOperationForAction) return;
    try {
      const newEventId = Date.now();
      const eventToSave: Event = { ...data.event, id: newEventId };

      const newHistoryEntry = {
        id: Date.now() + 1,
        date: eventToSave.date,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        watchlist: data.watchlist,
        sentiment: data.sentiment,
        eventId: newEventId,
      };

      const updatedOperation = {
        ...selectedOperationForAction,
        watchlist: data.watchlist,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        events: [...selectedOperationForAction.events, eventToSave],
        ratingHistory: [...selectedOperationForAction.ratingHistory, newHistoryEntry],
      };

      await onUpdateOperation(updatedOperation);
      showToast('Watchlist atualizada com sucesso!', 'success');
      setIsWatchlistFormOpen(false);
      setSelectedOperationForAction(null);
    } catch (error) {
      console.error(error);
      showToast('Erro ao atualizar watchlist.', 'error');
    }
  };

  const [portfolioFilter, setPortfolioFilter] = useState('');
  const [riskRadarWatchlistFilter, setRiskRadarWatchlistFilter] = useState<string>('Todos');
  const [portfolioWatchlistFilter, setPortfolioWatchlistFilter] = useState<string>('Todos');
  const [sortColumn, setSortColumn] = useState<keyof Operation>('watchlist');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSaveEditedTask = (rule: any) => {
    if (taskToEdit) {
      onEditTask(taskToEdit, { name: rule.name, dueDate: rule.startDate, notes: rule.description });
      setTaskToEdit(null);
    }
  };

  const handleCompleteTaskClick = (task: Task) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;
    setSelectedOperationForAction(op);
    if (task.ruleName === 'Revisão Gerencial' || task.ruleName === 'Revisão Política') {
      setReviewTaskToComplete(task);
      setIsReviewFormOpen(true);
    } else {
      setTaskToComplete(task);
      setIsEventFormOpen(true);
    }
  };

  const handleSaveReviewCompletion = async (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: Sentiment, videoUrl: string }) => {
    if (!selectedOperationForAction || !reviewTaskToComplete) return;
    try {
      const newEventId = Date.now();
      const eventToSave: Event = { ...data.event, id: newEventId, completedTaskId: reviewTaskToComplete.id };

      const newHistoryEntry = {
        id: Date.now() + 1,
        date: eventToSave.date,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        watchlist: selectedOperationForAction.watchlist,
        sentiment: data.sentiment,
        eventId: newEventId,
      };

      const updatedTasks = selectedOperationForAction.tasks.map(t => 
        t.id === reviewTaskToComplete.id ? { ...t, status: TaskStatus.COMPLETED } : t
      );

      const updatedOperation = {
        ...selectedOperationForAction,
        ratingOperation: data.ratingOp,
        ratingGroup: data.ratingGroup,
        tasks: updatedTasks,
        events: [...selectedOperationForAction.events, eventToSave],
        ratingHistory: [...selectedOperationForAction.ratingHistory, newHistoryEntry],
      };

      await onUpdateOperation(updatedOperation);

      // Auto-criar item de revisão no próximo comitê de investimento
      autoCreateComiteReviewItem({
        operationId: selectedOperationForAction.id,
        operationName: selectedOperationForAction.name,
        operationArea: selectedOperationForAction.area,
        reviewTitle: eventToSave.title || `Revisão de crédito - ${selectedOperationForAction.name}`,
        reviewDescription: data.event.description,
        analystName: selectedOperationForAction.responsibleAnalyst,
        videoUrl: data.videoUrl || '',
        watchlist: selectedOperationForAction.watchlist,
        ratingOperation: data.ratingOp,
        sentiment: data.sentiment,
      });

      showToast('Revisão concluída com sucesso!', 'success');
      setIsReviewFormOpen(false);
      setReviewTaskToComplete(null);
      setSelectedOperationForAction(null);
    } catch (error) {
      console.error(error);
      showToast('Erro ao concluir revisão.', 'error');
    }
  };

  const handleConfirmDeleteTask = () => {
    if (taskToDelete) {
      onDeleteTask(taskToDelete);
      setTaskToDelete(null);
    }
  };

  // Filter operations and tasks for the selected analyst
  const analystOperations = useMemo(() => {
    return operations.filter(op => op.responsibleAnalyst === selectedAnalyst && op.operationType !== 'Geral');
  }, [operations, selectedAnalyst]);

  const filteredAndSortedOperations = useMemo(() => {
    let result = [...analystOperations];
    if (portfolioFilter) {
      const lowerFilter = portfolioFilter.toLowerCase();
      result = result.filter(op => 
        op.name.toLowerCase().includes(lowerFilter) || 
        op.segmento.toLowerCase().includes(lowerFilter) ||
        op.ratingOperation.toLowerCase().includes(lowerFilter)
      );
    }
    
    if (portfolioWatchlistFilter !== 'Todos') {
      result = result.filter(op => op.watchlist === portfolioWatchlistFilter);
    }
    
    return result.sort((a, b) => {
      if (sortColumn === 'watchlist') {
        const order = { 'Vermelho': 1, 'Rosa': 2, 'Amarelo': 3, 'Verde': 4 };
        const aVal = order[a.watchlist as keyof typeof order] || 5;
        const bVal = order[b.watchlist as keyof typeof order] || 5;
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }

      let aVal: any = a[sortColumn];
      let bVal: any = b[sortColumn];
      
      if (sortColumn === 'maturityDate') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [analystOperations, portfolioFilter, portfolioWatchlistFilter, sortColumn, sortDirection]);

  const handleSort = (column: keyof Operation) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const analystTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoMonthsFromNow = new Date(today);
    twoMonthsFromNow.setMonth(today.getMonth() + 2);

    return allTasks.filter(task => {
      const op = operations.find(o => o.id === task.operationId);
      // Check if this task belongs to the analyst via operation's responsibleAnalyst
      const isResponsibleAnalyst = op?.responsibleAnalyst === selectedAnalyst;
      // Check if this task is assigned to the analyst via task assignees
      const isAssignedViaTask = task.assignees && task.assignees.includes(selectedAnalyst);
      
      if (!isResponsibleAnalyst && !isAssignedViaTask) return false;
      
      // Always show overdue tasks
      if (task.status === TaskStatus.OVERDUE) return true;
      
      if (task.status === TaskStatus.COMPLETED) {
        // Show completed tasks from the last 30 days for context
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return dueDate >= thirtyDaysAgo;
      }

      // For pending tasks:
      if (!task.dueDate) return true; // Tasks without deadline are always "foco"
      
      const dueDate = new Date(task.dueDate);
      return dueDate <= twoMonthsFromNow;
    });
  }, [allTasks, operations, selectedAnalyst]);

  // Metrics
  const overdueTasks = useMemo(() => analystTasks.filter(t => t.status === 'Atrasada'), [analystTasks]);
  
  const tasksOfTheWeek = useMemo(() => {
    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    return analystTasks.filter(t => {
      if (!t.dueDate) return t.status !== 'Concluída';
      const dueDate = new Date(t.dueDate);
      return dueDate >= today && dueDate <= endOfWeek && t.status !== 'Concluída';
    });
  }, [analystTasks]);

  const taskProgress = useMemo(() => {
    const total = analystTasks.length;
    const completed = analystTasks.filter(t => t.status === 'Concluída').length;
    const overdue = analystTasks.filter(t => t.status === 'Atrasada').length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, overdue, percent };
  }, [analystTasks]);

  const watchlistAlerts = useMemo(() => {
    let alerts = analystOperations.filter(op => op.watchlist === 'Vermelho' || op.watchlist === 'Rosa');
    if (riskRadarWatchlistFilter !== 'Todos') {
      alerts = alerts.filter(op => op.watchlist === riskRadarWatchlistFilter);
    }
    return alerts.sort((a, b) => {
      const order = { 'Vermelho': 1, 'Rosa': 2, 'Amarelo': 3, 'Verde': 4 };
      const aVal = order[a.watchlist as keyof typeof order] || 5;
      const bVal = order[b.watchlist as keyof typeof order] || 5;
      return aVal - bVal;
    });
  }, [analystOperations, riskRadarWatchlistFilter]);

  // Recent Activity
  const recentEvents = useMemo(() => {
    let events: (Event & { operationName: string, operationId: number })[] = [];
    analystOperations.forEach(op => {
      if (op.events) {
        events = [...events, ...op.events.map(e => ({ ...e, operationName: op.name, operationId: op.id }))];
      }
    });
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [analystOperations]);

  // ── Weekly Summary Boards ──
  const weeklyCompletedTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    return analystTasks.filter(t => {
      if (t.status !== TaskStatus.COMPLETED) return false;
      // Find the completion event to get the actual completion date
      const op = operations.find(o => o.id === t.operationId);
      const completionEvent = op?.events?.find(e => e.completedTaskId === t.id);
      if (completionEvent) {
        const completedDate = new Date(completionEvent.date);
        completedDate.setHours(0, 0, 0, 0);
        return completedDate >= startOfWeek && completedDate <= today;
      }
      // Fallback: use dueDate
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= startOfWeek && dueDate <= today;
    });
  }, [analystTasks, operations]);

  const nextWeekTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + (7 - today.getDay()) + 1);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    return analystTasks.filter(t => {
      if (t.status === TaskStatus.COMPLETED) return false;
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= nextMonday && dueDate <= nextSunday;
    }).sort((a, b) => {
      return new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
    });
  }, [analystTasks]);

  // Task Filters
  const [taskFilter, setTaskFilter] = useState<'Todas' | 'Pendentes' | 'Concluídas' | 'Atrasadas'>('Pendentes');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');

  const filteredTasks = useMemo(() => {
    let filtered = analystTasks;
    if (taskFilter === 'Pendentes') filtered = filtered.filter(t => t.status === 'Pendente');
    if (taskFilter === 'Concluídas') filtered = filtered.filter(t => t.status === 'Concluída');
    if (taskFilter === 'Atrasadas') filtered = filtered.filter(t => t.status === 'Atrasada');
    return filtered.sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [analystTasks, taskFilter]);

  const kanbanColumns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cols = {
        overdue: [] as Task[],
        today: [] as Task[],
        next7Days: [] as Task[],
        future: [] as Task[],
        completedRecent: [] as Task[]
    };

    analystTasks.forEach(task => {
        let diffDays = 0;
        let hasDueDate = !!task.dueDate;

        if (hasDueDate) {
            const dueDate = new Date(task.dueDate!);
            dueDate.setHours(0, 0, 0, 0);
            const diffTime = dueDate.getTime() - today.getTime();
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        if (task.status === TaskStatus.COMPLETED) {
            // Find completion event
            const op = operations.find(o => o.id === task.operationId);
            const completionEvent = op?.events?.find(e => e.completedTaskId === task.id);
            if (completionEvent) {
                const completedDate = new Date(completionEvent.date);
                completedDate.setHours(0, 0, 0, 0);
                const diffCompleted = today.getTime() - completedDate.getTime();
                const diffCompletedDays = Math.ceil(diffCompleted / (1000 * 60 * 60 * 24));
                if (diffCompletedDays <= 7) {
                    cols.completedRecent.push(task);
                }
            } else {
                // Fallback to due date if no event found
                if (hasDueDate && diffDays >= -7 && diffDays <= 0) {
                    cols.completedRecent.push(task);
                } else if (!hasDueDate) {
                    // If no deadline, we don't know when it was completed without event, 
                    // but let's assume it's recent if it's in the list (usually filtered by month elsewhere but here it's analystTasks)
                    cols.completedRecent.push(task);
                }
            }
        } else if (task.status === TaskStatus.OVERDUE) {
            cols.overdue.push(task);
        } else if (!hasDueDate || diffDays === 0) {
            // "Sem Prazo" tasks go to "Hoje" to stay visible
            cols.today.push(task);
        } else if (diffDays > 0 && diffDays <= 7) {
            cols.next7Days.push(task);
        } else if (diffDays > 7) {
            cols.future.push(task);
        }
    });

    return cols;
  }, [analystTasks, operations]);

  const getPriorityColor = (priority?: TaskPriority) => {
    switch (priority) {
      case 'Urgente': return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
      case 'Alta': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 'Média': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'Baixa': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  const [expandedTaskChecklist, setExpandedTaskChecklist] = useState<string | null>(null);

  const handleToggleChecklistItem = useCallback(async (task: Task, itemIndex: number) => {
    const op = operations.find(o => o.id === task.operationId);
    if (!op) return;
    
    const rule = op.taskRules.find(r => r.id === task.ruleId);
    if (!rule) return;
    
    const updatedChecklistItems = [...(rule.checklistItems || [])].map((item, idx) => {
      if (idx === itemIndex) {
        const newCompleted = !item.isCompleted;
        return {
          ...item,
          isCompleted: newCompleted,
          completedBy: newCompleted ? selectedAnalyst : undefined,
          completedAt: newCompleted ? new Date().toISOString() : undefined
        };
      }
      return item;
    });
    
    const updatedRules = op.taskRules.map(r => 
      r.id === rule.id ? { ...r, checklistItems: updatedChecklistItems } : r
    );
    
    const updatedOp = { ...op, taskRules: updatedRules };
    await onUpdateOperation(updatedOp);
  }, [operations, selectedAnalyst, onUpdateOperation]);

  const renderTaskCard = (task: Task, isKanban: boolean = false) => {
    const op = operations.find(o => o.id === task.operationId);
    const isCompleted = task.status === TaskStatus.COMPLETED;
    const rulePriority = task.priority || op?.taskRules?.find(r => r.id === task.ruleId)?.priority;
    
    if (isKanban) {
      let statusColor = 'border-gray-200 dark:border-gray-700';
      let bgColor = 'bg-white dark:bg-gray-800';
      if (task.status === TaskStatus.OVERDUE) {
          statusColor = 'border-red-300 dark:border-red-800';
          bgColor = 'bg-red-50/30 dark:bg-red-900/10';
      } else if (task.status === TaskStatus.COMPLETED) {
          statusColor = 'border-green-300 dark:border-green-800';
          bgColor = 'bg-green-50/30 dark:bg-green-900/10';
      }

      let priorityColor = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
      if (rulePriority === 'Urgente') priorityColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      if (rulePriority === 'Alta') priorityColor = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      if (rulePriority === 'Média') priorityColor = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      if (rulePriority === 'Baixa') priorityColor = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

      return (
          <div key={task.id} className={`p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 border-l-4 ${statusColor} ${bgColor} flex flex-col gap-3 transition-all hover:shadow-md`}>
              <div className="flex justify-between items-start gap-2">
                  <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                              {op?.name}
                          </span>
                          {rulePriority && (
                              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${priorityColor}`}>
                                  {rulePriority}
                              </span>
                          )}
                      </div>
                      <h4 className={`font-semibold text-sm ${isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                          {task.ruleName}
                      </h4>
                      {task.notes && (
                          <div 
                            className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 prose prose-xs dark:prose-invert max-w-none" 
                            dangerouslySetInnerHTML={{ __html: task.notes }} 
                          />
                      )}
                      {/* Assignees badges */}
                      {task.assignees && task.assignees.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          {task.assignees.map(a => (
                            <span key={a} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              a === selectedAnalyst 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                            }`}>{a.split(' ')[0]}</span>
                          ))}
                        </div>
                      )}
                  </div>
              </div>
              
              {/* Checklist Items */}
              {task.checklistItems && task.checklistItems.length > 0 && (
                <div className="border-t border-gray-100/50 dark:border-gray-700/50 pt-2">
                  <button 
                    onClick={() => setExpandedTaskChecklist(expandedTaskChecklist === task.id ? null : task.id)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full"
                  >
                    <svg className={`w-3 h-3 transition-transform ${expandedTaskChecklist === task.id ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    Checklist ({task.checklistItems.filter(ci => ci.isCompleted).length}/{task.checklistItems.length})
                    <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ml-2">
                      <div 
                        className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all duration-300" 
                        style={{ width: `${(task.checklistItems.filter(ci => ci.isCompleted).length / task.checklistItems.length) * 100}%` }}
                      />
                    </div>
                  </button>
                  {expandedTaskChecklist === task.id && (
                    <div className="mt-2 space-y-1">
                      {task.checklistItems.map((item, idx) => (
                        <div key={item.id || idx} className="flex items-center gap-2 group/item">
                          <button
                            onClick={() => handleToggleChecklistItem(task, idx)}
                            className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                              item.isCompleted 
                                ? 'bg-green-500 border-green-500 text-white' 
                                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                            }`}
                          >
                            {item.isCompleted && <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                          </button>
                          <span className={`text-xs flex-1 ${item.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                            {item.title}
                          </span>
                          {item.isCompleted && item.completedBy && (
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 italic">{item.completedBy.split(' ')[0]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-2 pt-3 border-t border-gray-100/50 dark:border-gray-700/50">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span className={task.status === TaskStatus.OVERDUE ? 'text-red-600 dark:text-red-400' : ''}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : 'Sem Prazo'}
                      </span>
                  </div>
                  
                  {!isCompleted && (
                      <div className="flex items-center gap-1">
                          <button onClick={() => setTaskToEdit(task)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Editar Tarefa">
                              <PencilIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setTaskToDelete(task)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Deletar Tarefa">
                              <TrashIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleCompleteTaskClick(task)} className="ml-1 flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium shadow-sm transition-colors">
                              <CheckCircleIcon className="w-3.5 h-3.5" /> Concluir
                          </button>
                      </div>
                  )}
              </div>
          </div>
      );
    }

    return (
      <div key={task.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex flex-col group">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button 
              onClick={() => handleCompleteTask(task)}
              className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${task.status === 'Concluída' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'}`}
            >
              {task.status === 'Concluída' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </button>
            <div>
              <p className={`font-medium ${task.status === 'Concluída' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{task.ruleName}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => onNavigate(Page.DETAIL, op?.id)}>{op?.name}</span>
                <span>•</span>
                <span className={task.status === 'Atrasada' ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                  {task.dueDate ? `Vence: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : 'Sem Prazo'}
                </span>
                {rulePriority && (
                  <>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPriorityColor(rulePriority)}`}>{rulePriority}</span>
                  </>
                )}
              </div>
              {/* Assignees in list view */}
              {task.assignees && task.assignees.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  {task.assignees.map(a => (
                    <span key={a} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      a === selectedAnalyst 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>{a.split(' ')[0]}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isCompleted && (
              <button onClick={() => handleCompleteTaskClick(task)} className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400" title="Concluir">
                <CheckCircleIcon className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setTaskToEdit(task)} className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" title="Editar">
              <PencilIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setTaskToDelete(task)} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400" title="Excluir">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Inline Checklist for list view */}
        {task.checklistItems && task.checklistItems.length > 0 && (
          <div className="ml-8 mt-2">
            <button 
              onClick={() => setExpandedTaskChecklist(expandedTaskChecklist === task.id ? null : task.id)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${expandedTaskChecklist === task.id ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              Checklist ({task.checklistItems.filter(ci => ci.isCompleted).length}/{task.checklistItems.length})
              <div className="h-1 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ml-1">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all" 
                  style={{ width: `${(task.checklistItems.filter(ci => ci.isCompleted).length / task.checklistItems.length) * 100}%` }}
                />
              </div>
            </button>
            {expandedTaskChecklist === task.id && (
              <div className="mt-1.5 space-y-1">
                {task.checklistItems.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleChecklistItem(task, idx)}
                      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        item.isCompleted 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                    >
                      {item.isCompleted && <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </button>
                    <span className={`text-xs ${item.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {item.title}
                    </span>
                    {item.isCompleted && item.completedBy && (
                      <span className="text-[9px] text-gray-400 dark:text-gray-500 italic">— {item.completedBy.split(' ')[0]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const getWatchlistColor = (status: string) => {
    switch (status) {
      case 'Verde': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'Amarelo': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      case 'Vermelho': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'Rosa': return 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    }
  };

  const handleCompleteTask = async (task: Task) => {
    if (task.status === 'Concluída') return;
    setIsSyncing(true);
    try {
      const response = await fetchApi(`${apiUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: task.operationId,
          date: new Date().toISOString(),
          type: 'Tarefa Concluída',
          title: `Tarefa Concluída: ${task.ruleName}`,
          description: `A tarefa "${task.ruleName}" foi marcada como concluída.`,
          registeredBy: selectedAnalyst,
          completedTaskId: task.id
        })
      });
      if (!response.ok) throw new Error('Falha ao concluir tarefa');
      const updatedOp = await response.json();
      await onUpdateOperation(updatedOp, false);
      showToast('Tarefa concluída com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao concluir tarefa.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Hub do Analista</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Visão consolidada e foco do dia</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Analista:</label>
          <select
            value={selectedAnalyst}
            onChange={(e) => setSelectedAnalyst(e.target.value)}
            className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-2 px-3"
          >
            {analysts.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
            <WarningIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tarefas Atrasadas</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overdueTasks.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tarefas da Semana</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tasksOfTheWeek.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
          <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-lg">
            <WarningIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Alertas Watchlist</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{watchlistAlerts.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Operações</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{analystOperations.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Full Width: Tasks */}
        <div className="space-y-8">
          
          {/* My Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-500" />
                Foco do Dia (Minhas Tarefas)
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => onOpenNewTaskModal(undefined, selectedAnalyst)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 flex items-center gap-1">
                  <PlusCircleIcon className="w-4 h-4" /> Nova Tarefa
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Progresso Geral</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({taskProgress.completed} de {taskProgress.total} concluídas)</span>
                </div>
                <span className="text-lg font-black text-blue-600 dark:text-blue-400">{taskProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                <div 
                  className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${taskProgress.percent}%` }}
                ></div>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">{taskProgress.overdue} Atrasadas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">{taskProgress.total - taskProgress.completed - taskProgress.overdue} Pendentes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">{taskProgress.completed} Concluídas</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex gap-2">
                {['Todas', 'Pendentes', 'Concluídas', 'Atrasadas'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setTaskFilter(filter as any)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${taskFilter === filter ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                <button 
                  onClick={() => setTaskViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${taskViewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  title="Visualização em Lista"
                >
                  <ViewListIcon className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setTaskViewMode('kanban')}
                  className={`p-1.5 rounded-md transition-colors ${taskViewMode === 'kanban' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  title="Visualização em Quadro"
                >
                  <ViewBoardsIcon className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setTaskViewMode('calendar')}
                  className={`p-1.5 rounded-md transition-colors ${taskViewMode === 'calendar' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  title="Visualização em Calendário"
                >
                  <CalendarIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="p-4">
              {taskViewMode === 'list' && (
                <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[600px] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-xl">
                  {filteredTasks.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">Nenhuma tarefa encontrada.</div>
                  ) : (
                    filteredTasks.map(task => renderTaskCard(task, false))
                  )}
                </div>
              )}

              {taskViewMode === 'kanban' && (
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar items-start">
                  <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-red-50/50 dark:bg-red-900/20 rounded-t-xl">
                          <h3 className="font-bold text-red-800 dark:text-red-400 text-sm flex justify-between items-center">
                              Atrasadas <span className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.overdue.length}</span>
                          </h3>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                          {kanbanColumns.overdue.map(t => renderTaskCard(t, true))}
                      </div>
                  </div>

                  <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/20 rounded-t-xl">
                          <h3 className="font-bold text-blue-800 dark:text-blue-400 text-sm flex justify-between items-center">
                              Para Hoje <span className="bg-blue-200 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.today.length}</span>
                          </h3>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                          {kanbanColumns.today.map(t => renderTaskCard(t, true))}
                      </div>
                  </div>

                  <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-yellow-50/50 dark:bg-yellow-900/20 rounded-t-xl">
                          <h3 className="font-bold text-yellow-800 dark:text-yellow-400 text-sm flex justify-between items-center">
                              Próximos 7 Dias <span className="bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.next7Days.length}</span>
                          </h3>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                          {kanbanColumns.next7Days.map(t => renderTaskCard(t, true))}
                      </div>
                  </div>

                  <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-purple-50/50 dark:bg-purple-900/20 rounded-t-xl">
                          <h3 className="font-bold text-purple-800 dark:text-purple-400 text-sm flex justify-between items-center">
                              Futuras <span className="bg-purple-200 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.future.length}</span>
                          </h3>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                          {kanbanColumns.future.map(t => renderTaskCard(t, true))}
                      </div>
                  </div>

                  <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-green-50/50 dark:bg-green-900/20 rounded-t-xl">
                          <h3 className="font-bold text-green-800 dark:text-green-400 text-sm flex justify-between items-center">
                              Concluídas (7 dias) <span className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.completedRecent.length}</span>
                          </h3>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                          {kanbanColumns.completedRecent.map(t => renderTaskCard(t, true))}
                      </div>
                  </div>
                </div>
              )}

              {taskViewMode === 'calendar' && (
                <div className="min-h-[600px] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <AnalystCalendar 
                    tasks={analystTasks} 
                    operations={operations} 
                    onCompleteTask={handleCompleteTaskClick}
                    onOpenNewTaskModal={onOpenNewTaskModal}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Risk Radar & Recent Activity & Post-it */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Risk Radar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <WarningIcon className="w-5 h-5 text-red-500" />
                  Radar de Risco
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={riskRadarWatchlistFilter}
                    onChange={(e) => setRiskRadarWatchlistFilter(e.target.value)}
                    className="text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-blue-500 focus:border-blue-500 w-full"
                  >
                    <option value="Todos">Todos os Alertas</option>
                    <option value="Vermelho">Vermelho</option>
                    <option value="Rosa">Rosa</option>
                  </select>
                </div>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto max-h-[500px] custom-scrollbar">
                {watchlistAlerts.length === 0 ? (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma operação em alerta.</div>
                ) : (
                  watchlistAlerts.map(op => (
                    <div key={op.id} className={`border rounded-lg p-4 ${getWatchlistColor(op.watchlist)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold cursor-pointer hover:underline text-sm" onClick={() => onNavigate(Page.DETAIL, op.id)}>{op.name}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/50">{op.ratingOperation}</span>
                      </div>
                      <p className="text-xs mb-3 opacity-80">Último evento: {op.events?.[0]?.title || 'Nenhum'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => onNavigate(Page.DETAIL, op.id)} className="text-[10px] bg-white/50 hover:bg-white/80 px-2 py-1 rounded font-bold transition-colors uppercase tracking-wider">Detalhes</button>
                        <button onClick={() => handleOpenEventForm(op)} className="text-[10px] bg-white/50 hover:bg-white/80 px-2 py-1 rounded font-bold transition-colors uppercase tracking-wider">Evento</button>
                        <button onClick={() => handleOpenWatchlistForm(op)} className="text-[10px] bg-white/50 hover:bg-white/80 px-2 py-1 rounded font-bold transition-colors uppercase tracking-wider">Status</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  Atividade Recente
                </h2>
              </div>
              <div className="p-6 overflow-y-auto max-h-[500px] custom-scrollbar">
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
                  {recentEvents.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400">Nenhuma atividade recente.</div>
                  ) : (
                    recentEvents.map((event, idx) => (
                      <div key={event.id || idx} className="relative pl-8 group">
                        <div className="absolute left-0 top-1.5 flex items-center justify-center w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 shadow-sm z-10 transition-transform group-hover:scale-110">
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
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1.5 hover:underline uppercase tracking-wider inline-block" onClick={(e) => { e.stopPropagation(); onNavigate(Page.DETAIL, event.operationId); }}>{event.operationName}</p>
                          <div 
                            className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-0 prose-li:my-0"
                            dangerouslySetInnerHTML={{ __html: event.description }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Post-it Notes */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex justify-between items-center">
                <h2 className="text-lg font-bold text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                  Observações Gerais
                </h2>
                <button 
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-md transition-all ${isSavingNotes ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-yellow-200 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-300 dark:hover:bg-yellow-900/60'}`}
                >
                  {isSavingNotes ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              <div className="p-4 flex-1 bg-yellow-50/30 dark:bg-yellow-900/10">
                <textarea
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
                  placeholder="Escreva aqui suas observações, lembretes ou insights gerais..."
                  className="w-full h-full min-h-[300px] bg-transparent border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-300 placeholder-yellow-600/40 dark:placeholder-yellow-400/20 resize-none font-medium leading-relaxed"
                />
              </div>
              <div className="p-3 bg-yellow-50/50 dark:bg-yellow-900/20 border-t border-yellow-100 dark:border-yellow-900/30 flex justify-end">
                <span className="text-[10px] text-yellow-700/60 dark:text-yellow-400/40 font-medium italic">As notas são salvas por analista</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My Portfolio Table */}
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Meu Portfólio
          </h2>
          <div className="flex items-center gap-4">
            <select
              value={portfolioWatchlistFilter}
              onChange={(e) => setPortfolioWatchlistFilter(e.target.value)}
              className="text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="Todos">Todos os Faróis</option>
              <option value="Verde">Verde</option>
              <option value="Amarelo">Amarelo</option>
              <option value="Rosa">Rosa</option>
              <option value="Vermelho">Vermelho</option>
            </select>
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar operações..."
                value={portfolioFilter}
                onChange={(e) => setPortfolioFilter(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('name')}>
                  Operação {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('segmento')}>
                  Setor {sortColumn === 'segmento' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('ratingOperation')}>
                  Rating {sortColumn === 'ratingOperation' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('maturityDate')}>
                  Vencimento {sortColumn === 'maturityDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAndSortedOperations.map(op => (
                <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${op.watchlist === 'Verde' ? 'bg-green-500' : op.watchlist === 'Amarelo' ? 'bg-yellow-500' : op.watchlist === 'Vermelho' ? 'bg-red-500' : 'bg-pink-500'}`}></div>
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => onNavigate(Page.DETAIL, op.id)}>{op.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{op.segmento}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      {op.ratingOperation}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(op.maturityDate).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => onOpenNewTaskModal(op.id, selectedAnalyst)} className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-3" title="Nova Tarefa">
                      <PlusCircleIcon className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => handleOpenEventForm(op)} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 mr-3" title="Novo Evento">
                      <CalendarIcon className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => handleOpenWatchlistForm(op)} className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300 mr-3" title="Alterar Watchlist/Rating">
                      <WarningIcon className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => onNavigate(Page.DETAIL, op.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200" title="Ver Detalhes">
                      <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Summary Boards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Concluídas esta semana */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
            <h3 className="font-bold text-green-800 dark:text-green-400 text-sm flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              Resumo da Semana — Concluídas
              <span className="ml-auto bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full text-xs font-bold">{weeklyCompletedTasks.length}</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
            {weeklyCompletedTasks.length === 0 ? (
              <div className="p-6 text-center text-gray-400 dark:text-gray-500 text-sm">
                <span className="text-2xl block mb-1">📋</span>
                Nenhuma tarefa concluída esta semana ainda.
              </div>
            ) : (
              weeklyCompletedTasks.map(task => {
                const op = operations.find(o => o.id === task.operationId);
                return (
                  <div key={task.id} className="px-4 py-3 flex items-start gap-3 hover:bg-green-50/30 dark:hover:bg-green-900/10 transition-colors">
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 line-through opacity-70">{task.ruleName}</p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" onClick={() => onNavigate(Page.DETAIL, op?.id)}>{op?.name}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* A Vir — Próxima Semana */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <h3 className="font-bold text-blue-800 dark:text-blue-400 text-sm flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Resumo da Semana — A Vir (Próxima Semana)
              <span className="ml-auto bg-blue-200 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-bold">{nextWeekTasks.length}</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
            {nextWeekTasks.length === 0 ? (
              <div className="p-6 text-center text-gray-400 dark:text-gray-500 text-sm">
                <span className="text-2xl block mb-1">🌟</span>
                Nenhuma tarefa agendada para a próxima semana.
              </div>
            ) : (
              nextWeekTasks.map(task => {
                const op = operations.find(o => o.id === task.operationId);
                const rulePriority = task.priority || op?.taskRules?.find(r => r.id === task.ruleId)?.priority;
                return (
                  <div key={task.id} className="px-4 py-3 flex items-start gap-3 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-blue-400 dark:border-blue-600 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-blue-400 dark:bg-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{task.ruleName}</p>
                        {rulePriority && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${getPriorityColor(rulePriority)}`}>{rulePriority}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" onClick={() => onNavigate(Page.DETAIL, op?.id)}>{op?.name}</p>
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem prazo'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isEventFormOpen && selectedOperationForAction && (
        <EventForm
          onClose={() => {
            setIsEventFormOpen(false);
            setSelectedOperationForAction(null);
            setTaskToComplete(null);
            setEventToEdit(null);
          }}
          onSave={handleSaveEvent}
          analystName={selectedAnalyst}
          prefilledTitle={taskToComplete ? `Conclusão: ${taskToComplete.ruleName}` : undefined}
          initialData={eventToEdit}
        />
      )}
      {isReviewFormOpen && selectedOperationForAction && reviewTaskToComplete && (
        <ReviewCompletionForm
          task={reviewTaskToComplete}
          operation={selectedOperationForAction}
          onClose={() => {
            setIsReviewFormOpen(false);
            setReviewTaskToComplete(null);
            setSelectedOperationForAction(null);
          }}
          onSave={handleSaveReviewCompletion}
        />
      )}
      {isWatchlistFormOpen && selectedOperationForAction && (
        <WatchlistChangeForm
          operation={selectedOperationForAction}
          onClose={() => {
            setIsWatchlistFormOpen(false);
            setSelectedOperationForAction(null);
          }}
          onSave={handleSaveWatchlistChange}
        />
      )}
      {taskToEdit && (
        <Modal isOpen={true} onClose={() => setTaskToEdit(null)} title="Editar Tarefa">
          <AdHocTaskForm
            onClose={() => setTaskToEdit(null)}
            onSave={handleSaveEditedTask}
            initialTask={taskToEdit}
            analysts={analysts}
            defaultAnalyst={operations.find(o => o.id === taskToEdit.operationId)?.responsibleAnalyst}
          />
        </Modal>
      )}
      {taskToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setTaskToDelete(null)}
          title={`Deletar Tarefa: ${taskToDelete.ruleName}`}
        >
          <div className="text-center">
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
              Você tem certeza que deseja deletar esta tarefa? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteTask}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Deletar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {selectedEventForDetails && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedEventForDetails(null)}
          title={selectedEventForDetails.title}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 pb-2">
              <span className="font-medium text-blue-600 dark:text-blue-400">{selectedEventForDetails.operationName}</span>
              <span>{new Date(selectedEventForDetails.date).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.description }} />
            {selectedEventForDetails.nextSteps && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-1">Próximos Passos</h4>
                <div className="text-sm text-blue-900 dark:text-blue-200 prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.nextSteps }} />
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
              <div className="flex gap-2">
                  <button onClick={() => {
                        const op = operations.find(o => o.id === selectedEventForDetails.operationId);
                        if (op) {
                            setSelectedOperationForAction(op);
                            setEventToEdit(selectedEventForDetails);
                            setIsEventFormOpen(true);
                            setSelectedEventForDetails(null);
                        }
                  }} className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Editar Evento">
                      <PencilIcon className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                      if (window.confirm('Tem certeza que deseja deletar este evento?')) {
                          const op = operations.find(o => o.id === selectedEventForDetails.operationId);
                          if (op) {
                              const updatedOp = { ...op, events: op.events.filter(e => e.id !== selectedEventForDetails.id) };
                              onUpdateOperation(updatedOp);
                              showToast('Evento deletado com sucesso!', 'success');
                              setSelectedEventForDetails(null);
                          }
                      }
                  }} className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Deletar Evento">
                      <TrashIcon className="w-5 h-5" />
                  </button>
              </div>
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

export default AnalystHub;
