import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Operation, Task, Event, Rating, Sentiment, RatingHistoryEntry, Area, TaskRule } from '../types';
import { TaskStatus } from '../types';
import { autoCreateComiteReviewItem } from '../utils/api';
import EventForm from './EventForm';
import ReviewCompletionForm from './ReviewCompletionForm';
import { CheckCircleIcon, PlusCircleIcon, PencilIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, CalendarIcon, ViewListIcon, ViewBoardsIcon, FilterIcon } from './icons/Icons';
import Modal from './Modal';
import AdHocTaskForm from './AdHocTaskForm';

interface TasksPageProps {
  operations: Operation[];
  allTasks: Task[];
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  onOpenNewTaskModal: (operationId?: number) => void;
  onDeleteTask: (task: Task) => void;
  onEditTask: (task: Task, updates: { name: string, dueDate: string | null, notes?: string }) => void;
}

const getAnalystColor = (analystName: string) => {
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
    'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
    'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
  ];
  let hash = 0;
  for (let i = 0; i < analystName.length; i++) {
    hash = analystName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const TasksPage: React.FC<TasksPageProps> = ({ operations, allTasks, onUpdateOperation, onOpenNewTaskModal, onDeleteTask, onEditTask }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([]);
  const [analystSearchTerm, setAnalystSearchTerm] = useState('');
  const [isAnalystDropdownOpen, setIsAnalystDropdownOpen] = useState(false);

  const [selectedOperationIds, setSelectedOperationIds] = useState<number[]>([]);
  const [operationSearchTerm, setOperationSearchTerm] = useState('');
  const [isOperationDropdownOpen, setIsOperationDropdownOpen] = useState(false);

  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [areaSearchTerm, setAreaSearchTerm] = useState('');
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);

  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'completed'
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedRuleNames, setSelectedRuleNames] = useState<string[]>([]);
  const [ruleSearchTerm, setRuleSearchTerm] = useState('');
  const [isRuleDropdownOpen, setIsRuleDropdownOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<number | null>(null);

  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [reviewTaskToComplete, setReviewTaskToComplete] = useState<Task | null>(null);
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const ruleDropdownRef = useRef<HTMLDivElement>(null);
  const areaDropdownRef = useRef<HTMLDivElement>(null);
  const analystDropdownRef = useRef<HTMLDivElement>(null);
  const operationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (ruleDropdownRef.current && !ruleDropdownRef.current.contains(event.target as Node)) {
              setIsRuleDropdownOpen(false);
          }
          if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target as Node)) {
              setIsAreaDropdownOpen(false);
          }
          if (analystDropdownRef.current && !analystDropdownRef.current.contains(event.target as Node)) {
              setIsAnalystDropdownOpen(false);
          }
          if (operationDropdownRef.current && !operationDropdownRef.current.contains(event.target as Node)) {
              setIsOperationDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const analysts = useMemo(() => ['Todos', ...new Set(operations.map(op => op.responsibleAnalyst))], [operations]);
  const areas = useMemo(() => [...new Set(operations.map(op => op.area))], [operations]);
  const operationsById = useMemo(() => new Map(operations.map(op => [op.id, op])), [operations]);

  const availableRuleNames = useMemo(() => {
    const filteredByOthers = allTasks.filter(task => {
        const op = operationsById.get(task.operationId);
        if (!op) return false;
        if (selectedAreas.length > 0 && !selectedAreas.includes(op.area)) return false;
        if (selectedOperationIds.length > 0 && !selectedOperationIds.includes(task.operationId)) return false;
        if (selectedAnalysts.length > 0 && !selectedAnalysts.includes(op.responsibleAnalyst)) return false;
        return true;
    });
    return [...new Set(filteredByOthers.map(task => task.ruleName))].sort();
  }, [allTasks, operationsById, selectedAreas, selectedOperationIds, selectedAnalysts]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      const op = operationsById.get(task.operationId);
      if (!op) return false;
      if (selectedAreas.length > 0 && !selectedAreas.includes(op.area)) return false;
      if (selectedOperationIds.length > 0 && !selectedOperationIds.includes(task.operationId)) return false;
      if (selectedAnalysts.length > 0 && !selectedAnalysts.includes(op.responsibleAnalyst)) return false;
      if (selectedRuleNames.length > 0 && !selectedRuleNames.includes(task.ruleName)) return false;
      
      // Filter by month
      const isCompleted = task.status === TaskStatus.COMPLETED;
      
      let dateToCheck: Date;
      if (isCompleted) {
          const completionEvent = op.events.find(e => e.completedTaskId === task.id);
          dateToCheck = completionEvent ? new Date(completionEvent.date) : (task.dueDate ? new Date(task.dueDate) : new Date(0));
      } else {
          if (!task.dueDate) {
              // Evergreen tasks show up in the actual current month
              const today = new Date();
              return currentMonth.getFullYear() === today.getFullYear() && currentMonth.getMonth() === today.getMonth();
          }
          dateToCheck = new Date(task.dueDate);
      }
      
      if (dateToCheck.getFullYear() !== currentMonth.getFullYear() || dateToCheck.getMonth() !== currentMonth.getMonth()) {
          return false;
      }

      // Filter by selected day in mini-calendar
      if (selectedDateFilter !== null && dateToCheck.getDate() !== selectedDateFilter) {
          return false;
      }

      return true;
    });
  }, [allTasks, operationsById, selectedAreas, selectedOperationIds, selectedAnalysts, selectedRuleNames, currentMonth, selectedDateFilter]);

  const pendingTasks = useMemo(() => {
      const tasks = filteredTasks.filter(task => task.status !== TaskStatus.COMPLETED);
      tasks.sort((a, b) => {
          const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      });
      return tasks;
  }, [filteredTasks, sortDirection]);

  const completedTasks = useMemo(() => {
      const tasks = filteredTasks.filter(task => task.status === TaskStatus.COMPLETED);
      tasks.sort((a, b) => {
          const eventA = operationsById.get(a.operationId)?.events.find(e => e.completedTaskId === a.id);
          const eventB = operationsById.get(b.operationId)?.events.find(e => e.completedTaskId === b.id);
          const dateA = eventA ? new Date(eventA.date).getTime() : 0;
          const dateB = eventB ? new Date(eventB.date).getTime() : 0;
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      });
      return tasks;
  }, [filteredTasks, operationsById, sortDirection]);

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + offset);
      return newDate;
    });
    setSelectedDateFilter(null);
  };
  
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

  const handleConfirmDeleteTask = () => {
    if (taskToDelete) {
        onDeleteTask(taskToDelete);
        setTaskToDelete(null);
    }
  };

  const handleSaveEditedTask = (rule: Omit<TaskRule, 'id'>) => {
      if (taskToEdit) {
          onEditTask(taskToEdit, { name: rule.name, dueDate: rule.startDate, notes: rule.description });
          setTaskToEdit(null);
      }
  };

  // Mini Dashboard Stats
  const totalTasks = pendingTasks.length + completedTasks.length;
  const completedCount = completedTasks.length;
  const overdueCount = pendingTasks.filter(t => t.status === TaskStatus.OVERDUE).length;
  const progressPercent = totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);

  // Mini Calendar Logic
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const daysInMonth = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth.getDay(); i++) days.push(null);
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) days.push(day);
    return days;
  }, [firstDayOfMonth, lastDayOfMonth]);

  const taskCountsByDay = useMemo(() => {
      const counts = new Map<number, { pending: number, completed: number, overdue: number }>();
      
      // We need to calculate this BEFORE the selectedDateFilter is applied, so we use a separate filter
      const allMonthTasks = allTasks.filter(task => {
          const op = operationsById.get(task.operationId);
          if (!op) return false;
          if (selectedAreas.length > 0 && !selectedAreas.includes(op.area)) return false;
          if (selectedOperationIds.length > 0 && !selectedOperationIds.includes(task.operationId)) return false;
          if (selectedAnalysts.length > 0 && !selectedAnalysts.includes(op.responsibleAnalyst)) return false;
          if (selectedRuleNames.length > 0 && !selectedRuleNames.includes(task.ruleName)) return false;
          
          const dueDate = new Date(task.dueDate);
          const isCompleted = task.status === TaskStatus.COMPLETED;
          let dateToCheck = dueDate;
          if (isCompleted) {
              const completionEvent = op.events.find(e => e.completedTaskId === task.id);
              if (completionEvent) dateToCheck = new Date(completionEvent.date);
          }
          return dateToCheck.getFullYear() === currentMonth.getFullYear() && dateToCheck.getMonth() === currentMonth.getMonth();
      });

      allMonthTasks.forEach(task => {
          const op = operationsById.get(task.operationId);
          const isCompleted = task.status === TaskStatus.COMPLETED;
          let day = new Date(task.dueDate).getDate();
          if (isCompleted && op) {
              const completionEvent = op.events.find(e => e.completedTaskId === task.id);
              if (completionEvent) day = new Date(completionEvent.date).getDate();
          }

          if (!counts.has(day)) counts.set(day, { pending: 0, completed: 0, overdue: 0 });
          const current = counts.get(day)!;
          if (isCompleted) current.completed++;
          else if (task.status === TaskStatus.OVERDUE) current.overdue++;
          else current.pending++;
      });
      return counts;
  }, [allTasks, operationsById, selectedAreas, selectedOperationIds, selectedAnalysts, selectedRuleNames, currentMonth]);

  // Kanban Columns
  const kanbanColumns = useMemo(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const cols = {
          overdue: [] as Task[],
          today: [] as Task[],
          thisWeek: [] as Task[],
          later: [] as Task[],
          completed: completedTasks
      };

      pendingTasks.forEach(task => {
          const dueDate = new Date(task.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (task.status === TaskStatus.OVERDUE) {
              cols.overdue.push(task);
          } else if (diffDays === 0) {
              cols.today.push(task);
          } else if (diffDays > 0 && diffDays <= 7) {
              cols.thisWeek.push(task);
          } else {
              cols.later.push(task);
          }
      });
      return cols;
  }, [pendingTasks, completedTasks]);

  const renderTaskCard = (task: Task, isCompleted: boolean = false) => {
      const op = operationsById.get(task.operationId);
      const operationName = op?.name || 'N/A';
      const analyst = op?.responsibleAnalyst || 'N/A';
      const analystColor = getAnalystColor(analyst);
      const initials = getInitials(analyst);
      
      let statusColor = 'border-yellow-400 dark:border-yellow-500';
      let bgColor = 'bg-white dark:bg-gray-800';
      if (isCompleted) {
          statusColor = 'border-green-500 dark:border-green-600';
          bgColor = 'bg-green-50/30 dark:bg-green-900/20';
      } else if (task.status === TaskStatus.OVERDUE) {
          statusColor = 'border-red-500 dark:border-red-600';
          bgColor = 'bg-red-50/30 dark:bg-red-900/20';
      }

      let dateText = task.dueDate ? `Vencimento: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : 'Sem Prazo';
      if (isCompleted && op) {
          const completionEvent = op.events.find(e => e.completedTaskId === task.id);
          if (completionEvent) {
              dateText = `Concluída em: ${new Date(completionEvent.date).toLocaleDateString('pt-BR')}`;
          }
      }

      const rulePriority = task.priority || op?.taskRules?.find(r => r.id === task.ruleId)?.priority;

      let priorityColor = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      if (rulePriority === 'Urgente') priorityColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      if (rulePriority === 'Alta') priorityColor = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      if (rulePriority === 'Média') priorityColor = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      if (rulePriority === 'Baixa') priorityColor = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

      return (
          <div key={task.id} className={`p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 border-l-4 ${statusColor} ${bgColor} flex flex-col gap-3 transition-all hover:shadow-md`}>
              <div className="flex justify-between items-start gap-2">
                  <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded-md">
                              {operationName}
                          </span>
                          {rulePriority && (
                              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${priorityColor}`}>
                                  {rulePriority}
                              </span>
                          )}
                      </div>
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 leading-tight">{task.ruleName}</h4>
                      {task.notes && (
                          <div 
                            className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 prose prose-xs dark:prose-invert max-w-none break-words overflow-hidden" 
                            dangerouslySetInnerHTML={{ __html: task.notes }} 
                          />
                      )}
                  </div>
                  <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${analystColor}`}
                      title={`Analista: ${analyst}`}
                  >
                      {initials}
                  </div>
              </div>
              
              <div className="flex justify-between items-end mt-2">
                  <p className={`text-xs font-medium ${isCompleted ? 'text-green-700 dark:text-green-400' : task.status === TaskStatus.OVERDUE ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {dateText}
                  </p>
                  
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
  };

  return (
    <div className="space-y-6">
        {/* Modals */}
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
        {taskToEdit && (
            <Modal isOpen={true} onClose={() => setTaskToEdit(null)} title="Editar Tarefa">
                <AdHocTaskForm onClose={() => setTaskToEdit(null)} onSave={handleSaveEditedTask} initialTask={taskToEdit} />
            </Modal>
        )}
        {taskToDelete && (
            <Modal isOpen={true} onClose={() => setTaskToDelete(null)} title={`Deletar Tarefa: ${taskToDelete.ruleName}`}>
                <div className="text-center">
                    <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">Você tem certeza que deseja deletar esta tarefa? Esta ação não pode ser desfeita.</p>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => setTaskToDelete(null)} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
                        <button onClick={handleConfirmDeleteTask} className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Confirmar Deleção</button>
                    </div>
                </div>
            </Modal>
        )}

      {/* Header & Mini Dashboard */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Gerenciador de Tarefas</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Acompanhe e gerencie as pendências do mês.</p>
            </div>
             <div className="flex items-center gap-3">
                <button
                    onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isFiltersOpen ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                    <FilterIcon className="w-4 h-4" /> Filtros
                </button>
                <button
                    onClick={() => onOpenNewTaskModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors font-medium"
                >
                    <PlusCircleIcon className="w-5 h-5" /> Nova Tarefa
                </button>
            </div>
        </div>

        {/* Progress Bar & Stats */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-end mb-2">
                <div>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Progresso de {currentMonth.toLocaleString('pt-BR', { month: 'long' })}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({completedCount} de {totalTasks} concluídas)</span>
                </div>
                <span className="text-lg font-black text-blue-600 dark:text-blue-400">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4 overflow-hidden">
                <div className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className="flex gap-6">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{overdueCount} Atrasadas</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{pendingTasks.length - overdueCount} Pendentes</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{completedCount} Concluídas</span>
                </div>
            </div>
        </div>

        {/* Collapsible Filters */}
        {isFiltersOpen && (
            <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Área</label>
                        <div className="relative" ref={areaDropdownRef}>
                            <div 
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 px-3 py-2 text-left cursor-pointer text-sm text-gray-900 dark:text-gray-100"
                                onClick={() => setIsAreaDropdownOpen(!isAreaDropdownOpen)}
                            >
                                {selectedAreas.length === 0 ? 'Todas' : `${selectedAreas.length} selecionadas`}
                            </div>
                            {isAreaDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto">
                                    <div className="px-2 py-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                        <input 
                                            type="text" placeholder="Buscar área..." 
                                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
                                            value={areaSearchTerm} onChange={e => setAreaSearchTerm(e.target.value)} onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => setSelectedAreas([])}>
                                        <input type="checkbox" checked={selectedAreas.length === 0} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                        <span>Todas</span>
                                    </div>
                                    {areas.filter(name => name.toLowerCase().includes(areaSearchTerm.toLowerCase())).map(name => (
                                        <div key={name} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => {
                                            if (selectedAreas.length === 0) {
                                                setSelectedAreas(areas.filter(n => n !== name));
                                            } else {
                                                const newSelected = selectedAreas.includes(name) ? selectedAreas.filter(n => n !== name) : [...selectedAreas, name];
                                                setSelectedAreas(newSelected.length === areas.length ? [] : newSelected.length === 0 ? ['__NONE__'] : newSelected);
                                            }
                                        }}>
                                            <input type="checkbox" checked={selectedAreas.length === 0 || selectedAreas.includes(name)} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                            <span>{name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Analista</label>
                        <div className="relative" ref={analystDropdownRef}>
                            <div 
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 px-3 py-2 text-left cursor-pointer text-sm text-gray-900 dark:text-gray-100"
                                onClick={() => setIsAnalystDropdownOpen(!isAnalystDropdownOpen)}
                            >
                                {selectedAnalysts.length === 0 ? 'Todos' : `${selectedAnalysts.length} selecionados`}
                            </div>
                            {isAnalystDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto">
                                    <div className="px-2 py-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                        <input 
                                            type="text" placeholder="Buscar analista..." 
                                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
                                            value={analystSearchTerm} onChange={e => setAnalystSearchTerm(e.target.value)} onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => setSelectedAnalysts([])}>
                                        <input type="checkbox" checked={selectedAnalysts.length === 0} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                        <span>Todos</span>
                                    </div>
                                    {analysts.filter(name => name !== 'Todos' && name.toLowerCase().includes(analystSearchTerm.toLowerCase())).map(name => (
                                        <div key={name} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => {
                                            const availableAnalysts = analysts.filter(n => n !== 'Todos');
                                            if (selectedAnalysts.length === 0) {
                                                setSelectedAnalysts(availableAnalysts.filter(n => n !== name));
                                            } else {
                                                const newSelected = selectedAnalysts.includes(name) ? selectedAnalysts.filter(n => n !== name) : [...selectedAnalysts, name];
                                                setSelectedAnalysts(newSelected.length === availableAnalysts.length ? [] : newSelected.length === 0 ? ['__NONE__'] : newSelected);
                                            }
                                        }}>
                                            <input type="checkbox" checked={selectedAnalysts.length === 0 || selectedAnalysts.includes(name)} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                            <span>{name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Operação</label>
                        <div className="relative" ref={operationDropdownRef}>
                            <div 
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 px-3 py-2 text-left cursor-pointer text-sm text-gray-900 dark:text-gray-100"
                                onClick={() => setIsOperationDropdownOpen(!isOperationDropdownOpen)}
                            >
                                {selectedOperationIds.length === 0 ? 'Todas' : `${selectedOperationIds.length} selecionadas`}
                            </div>
                            {isOperationDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto">
                                    <div className="px-2 py-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                        <input 
                                            type="text" placeholder="Buscar operação..." 
                                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
                                            value={operationSearchTerm} onChange={e => setOperationSearchTerm(e.target.value)} onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => setSelectedOperationIds([])}>
                                        <input type="checkbox" checked={selectedOperationIds.length === 0} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                        <span>Todas</span>
                                    </div>
                                    {operations
                                        .filter(op => selectedAnalysts.length === 0 || selectedAnalysts.includes(op.responsibleAnalyst))
                                        .filter(op => op.name.toLowerCase().includes(operationSearchTerm.toLowerCase()))
                                        .map(op => (
                                        <div key={op.id} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => {
                                            const availableOps = operations.filter(o => selectedAnalysts.length === 0 || selectedAnalysts.includes(o.responsibleAnalyst));
                                            if (selectedOperationIds.length === 0) {
                                                setSelectedOperationIds(availableOps.filter(o => o.id !== op.id).map(o => o.id));
                                            } else {
                                                const newSelected = selectedOperationIds.includes(op.id) ? selectedOperationIds.filter(id => id !== op.id) : [...selectedOperationIds, op.id];
                                                setSelectedOperationIds(newSelected.length === availableOps.length ? [] : newSelected.length === 0 ? [-1] : newSelected);
                                            }
                                        }}>
                                            <input type="checkbox" checked={selectedOperationIds.length === 0 || selectedOperationIds.includes(op.id)} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                            <span>{op.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tipo de Tarefa</label>
                        <div className="relative" ref={ruleDropdownRef}>
                            <div 
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 px-3 py-2 text-left cursor-pointer text-sm text-gray-900 dark:text-gray-100"
                                onClick={() => setIsRuleDropdownOpen(!isRuleDropdownOpen)}
                            >
                                {selectedRuleNames.length === 0 ? 'Todos' : `${selectedRuleNames.length} selecionados`}
                            </div>
                            {isRuleDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto">
                                    <div className="px-2 py-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                        <input 
                                            type="text" placeholder="Buscar tipo..." 
                                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
                                            value={ruleSearchTerm} onChange={e => setRuleSearchTerm(e.target.value)} onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => setSelectedRuleNames([])}>
                                        <input type="checkbox" checked={selectedRuleNames.length === 0} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                        <span>Todos</span>
                                    </div>
                                    {availableRuleNames.filter(name => name.toLowerCase().includes(ruleSearchTerm.toLowerCase())).map(name => (
                                        <div key={name} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-900 dark:text-gray-100" onClick={() => {
                                            if (selectedRuleNames.length === 0) {
                                                setSelectedRuleNames(availableRuleNames.filter(n => n !== name));
                                            } else {
                                                const newSelected = selectedRuleNames.includes(name) ? selectedRuleNames.filter(n => n !== name) : [...selectedRuleNames, name];
                                                setSelectedRuleNames(newSelected.length === availableRuleNames.length ? [] : newSelected.length === 0 ? ['__NONE__'] : newSelected);
                                            }
                                        }}>
                                            <input type="checkbox" checked={selectedRuleNames.length === 0 || selectedRuleNames.includes(name)} readOnly className="rounded border-gray-300 dark:border-gray-600 text-blue-600" />
                                            <span>{name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Main Layout: Sidebar Calendar + Content */}
      <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Sidebar Mini Calendar */}
          <div className="w-full lg:w-64 flex-shrink-0">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-4">
                  <div className="flex justify-between items-center mb-4">
                      <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400">&larr;</button>
                      <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm capitalize">{currentMonth.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}</h3>
                      <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400">&rarr;</button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['D','S','T','Q','Q','S','S'].map((d, i) => (
                          <div key={i} className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{d}</div>
                      ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                      {daysInMonth.map((day, i) => {
                          if (!day) return <div key={i} className="h-8"></div>;
                          
                          const counts = taskCountsByDay.get(day);
                          const hasTasks = counts && (counts.pending > 0 || counts.completed > 0 || counts.overdue > 0);
                          const isSelected = selectedDateFilter === day;
                          
                          let dotColor = '';
                          if (counts) {
                              if (counts.overdue > 0) dotColor = 'bg-red-500';
                              else if (counts.pending > 0) dotColor = 'bg-yellow-400';
                              else if (counts.completed > 0) dotColor = 'bg-green-500';
                          }

                          return (
                              <button 
                                  key={i}
                                  onClick={() => setSelectedDateFilter(isSelected ? null : day)}
                                  className={`h-8 flex flex-col items-center justify-center rounded-md text-xs transition-all relative
                                      ${isSelected ? 'bg-blue-600 text-white font-bold shadow-md' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}
                                      ${hasTasks && !isSelected ? 'font-semibold' : ''}
                                  `}
                              >
                                  {day}
                                  {hasTasks && !isSelected && (
                                      <div className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${dotColor}`}></div>
                                  )}
                              </button>
                          );
                      })}
                  </div>
                  {selectedDateFilter && (
                      <button 
                        onClick={() => setSelectedDateFilter(null)}
                        className="w-full mt-4 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                          Limpar filtro de dia
                      </button>
                  )}
              </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-4 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                  {viewMode === 'list' ? (
                      <div className="flex space-x-2">
                          <button
                              onClick={() => setActiveTab('pending')}
                              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                          >
                              Pendentes ({pendingTasks.length})
                          </button>
                          <button
                              onClick={() => setActiveTab('completed')}
                              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'completed' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                          >
                              Concluídas ({completedTasks.length})
                          </button>
                      </div>
                  ) : (
                      <div className="text-sm font-bold text-gray-700 dark:text-gray-300 px-4">Quadro Kanban</div>
                  )}

                  <div className="flex items-center gap-2 pr-2">
                      {viewMode === 'list' && (
                          <button 
                            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center gap-1 mr-2"
                            title="Ordenar por Data"
                          >
                              {sortDirection === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                          </button>
                      )}
                      <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                          <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            title="Visualização em Lista"
                          >
                              <ViewListIcon className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setViewMode('kanban')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            title="Visualização em Quadro"
                          >
                              <ViewBoardsIcon className="w-4 h-4" />
                          </button>
                      </div>
                  </div>
              </div>

              {/* List View */}
              {viewMode === 'list' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {activeTab === 'pending' ? (
                          pendingTasks.length > 0 ? pendingTasks.map(t => renderTaskCard(t, false)) : (
                              <div className="col-span-full py-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                                  <CheckCircleIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Tudo limpo por aqui!</h3>
                                  <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma tarefa pendente para os filtros selecionados.</p>
                              </div>
                          )
                      ) : (
                          completedTasks.length > 0 ? completedTasks.map(t => renderTaskCard(t, true)) : (
                              <div className="col-span-full py-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                                  <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma tarefa concluída encontrada.</p>
                              </div>
                          )
                      )}
                  </div>
              )}

              {/* Kanban View */}
              {viewMode === 'kanban' && (
                  <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar items-start">
                      {/* Column: Atrasadas */}
                      <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[800px]">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-red-50/50 dark:bg-red-900/20 rounded-t-xl">
                              <h3 className="font-bold text-red-800 dark:text-red-400 text-sm flex justify-between items-center">
                                  Atrasadas <span className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.overdue.length}</span>
                              </h3>
                          </div>
                          <div className="p-3 overflow-y-auto flex-1 space-y-3">
                              {kanbanColumns.overdue.map(t => renderTaskCard(t, false))}
                              {kanbanColumns.overdue.length === 0 && <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">Nenhuma tarefa</p>}
                          </div>
                      </div>

                      {/* Column: Hoje */}
                      <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[800px]">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/20 rounded-t-xl">
                              <h3 className="font-bold text-blue-800 dark:text-blue-400 text-sm flex justify-between items-center">
                                  Para Hoje <span className="bg-blue-200 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.today.length}</span>
                              </h3>
                          </div>
                          <div className="p-3 overflow-y-auto flex-1 space-y-3">
                              {kanbanColumns.today.map(t => renderTaskCard(t, false))}
                              {kanbanColumns.today.length === 0 && <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">Nenhuma tarefa</p>}
                          </div>
                      </div>

                      {/* Column: Próximos 7 dias */}
                      <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[800px]">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-yellow-50/50 dark:bg-yellow-900/20 rounded-t-xl">
                              <h3 className="font-bold text-yellow-800 dark:text-yellow-400 text-sm flex justify-between items-center">
                                  Próximos 7 dias <span className="bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.thisWeek.length}</span>
                              </h3>
                          </div>
                          <div className="p-3 overflow-y-auto flex-1 space-y-3">
                              {kanbanColumns.thisWeek.map(t => renderTaskCard(t, false))}
                              {kanbanColumns.thisWeek.length === 0 && <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">Nenhuma tarefa</p>}
                          </div>
                      </div>

                      {/* Column: Futuras */}
                      <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[800px]">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-700/50 rounded-t-xl">
                              <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm flex justify-between items-center">
                                  Futuras <span className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.later.length}</span>
                              </h3>
                          </div>
                          <div className="p-3 overflow-y-auto flex-1 space-y-3">
                              {kanbanColumns.later.map(t => renderTaskCard(t, false))}
                              {kanbanColumns.later.length === 0 && <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">Nenhuma tarefa</p>}
                          </div>
                      </div>
                      
                      {/* Column: Concluídas */}
                      <div className="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[800px] opacity-70 hover:opacity-100 transition-opacity">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-green-50/50 dark:bg-green-900/20 rounded-t-xl">
                              <h3 className="font-bold text-green-800 dark:text-green-400 text-sm flex justify-between items-center">
                                  Concluídas <span className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full text-xs">{kanbanColumns.completed.length}</span>
                              </h3>
                          </div>
                          <div className="p-3 overflow-y-auto flex-1 space-y-3">
                              {kanbanColumns.completed.map(t => renderTaskCard(t, true))}
                              {kanbanColumns.completed.length === 0 && <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">Nenhuma tarefa</p>}
                          </div>
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default TasksPage;
