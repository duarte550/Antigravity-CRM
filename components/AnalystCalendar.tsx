
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Task, Operation, Event } from '../types';
import { TaskStatus } from '../types';
import { CheckCircleIcon, PlusCircleIcon } from './icons/Icons';
import Modal from './Modal';

interface AnalystCalendarProps {
  tasks: Task[];
  operations: Operation[];
  onCompleteTask?: (task: Task) => void;
  onOpenNewTaskModal?: (operationId?: number) => void;
}

const getAnalystColor = (analystName: string) => {
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
    'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  ];
  let hash = 0;
  for (let i = 0; i < analystName.length; i++) {
    hash = analystName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const AnalystCalendar: React.FC<AnalystCalendarProps> = ({ tasks, operations, onCompleteTask, onOpenNewTaskModal }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>('Todos');
  const [showCompleted, setShowCompleted] = useState(false);
  const [popoverTask, setPopoverTask] = useState<{ task: Task, operationName: string, analyst: string } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const analysts = useMemo(() => {
    const names = new Set(operations.map(op => op.responsibleAnalyst));
    return ['Todos', ...Array.from(names)];
  }, [operations]);

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopoverTask(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = useMemo(() => {
    const days = [];
    const firstDay = firstDayOfMonth.getDay();
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    }
    
    // Fill the rest of the last week to ensure the grid is complete and has consistent borders
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 0; i < remaining; i++) {
        days.push(null);
      }
    }
    
    return days;
  }, [currentDate, firstDayOfMonth, lastDayOfMonth]);

  const tasksByDay = useMemo(() => {
    const map = new Map<number, { task: Task; operationName: string; analyst: string }[]>();
    tasks.forEach(task => {
      if (!showCompleted && task.status === TaskStatus.COMPLETED) return;
      
      const operation = operations.find(op => op.id === task.operationId);
      if (!operation) return;
      if (selectedAnalyst !== 'Todos' && operation.responsibleAnalyst !== selectedAnalyst) return;

      if (!task.dueDate) return;
      const dueDate = new Date(task.dueDate);
      if (dueDate.getMonth() === currentDate.getMonth() && dueDate.getFullYear() === currentDate.getFullYear()) {
        const day = dueDate.getDate();
        if (!map.has(day)) {
          map.set(day, []);
        }
        map.get(day)?.push({ task, operationName: operation.name, analyst: operation.responsibleAnalyst });
      }
    });
    return map;
  }, [tasks, currentDate, operations, selectedAnalyst, showCompleted]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, { event: Event; operationName: string; analyst: string }[]>();
    operations.forEach(operation => {
      if (selectedAnalyst !== 'Todos' && operation.responsibleAnalyst !== selectedAnalyst) return;
      
      operation.events.forEach(event => {
        const eventDate = new Date(event.date);
        if (eventDate.getMonth() === currentDate.getMonth() && eventDate.getFullYear() === currentDate.getFullYear()) {
          const day = eventDate.getDate();
          if (!map.has(day)) {
            map.set(day, []);
          }
          map.get(day)?.push({ event, operationName: operation.name, analyst: operation.responsibleAnalyst });
        }
      });
    });
    return map;
  }, [operations, currentDate, selectedAnalyst]);

  const changeMonth = (offset: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + offset);
      return newDate;
    });
    setPopoverTask(null);
    setSelectedDay(null);
  };

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="relative h-full bg-white dark:bg-gray-900">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => changeMonth(-1)} className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm border border-gray-200 dark:border-gray-700">&larr;</button>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 min-w-[150px] text-center capitalize">
            {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={() => changeMonth(1)} className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm border border-gray-200 dark:border-gray-700">&rarr;</button>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showCompleted} 
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Mostrar Concluídas</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Analista:</label>
            <select 
              value={selectedAnalyst} 
              onChange={e => setSelectedAnalyst(e.target.value)}
              className="text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-3 pr-8"
            >
              {analysts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        {weekDays.map(day => (
          <div key={day} className="text-center font-bold text-gray-500 dark:text-gray-400 text-xs py-3 bg-gray-50 dark:bg-gray-800 uppercase tracking-wider">
            {day}
          </div>
        ))}
        {daysInMonth.map((day, index) => {
          const isToday = isCurrentMonth && day?.getDate() === today.getDate();
          const dayTasks = day ? (tasksByDay.get(day.getDate()) || []) : [];
          const dayEvents = day ? (eventsByDay.get(day.getDate()) || []) : [];
          
          const allItems = [
            ...dayTasks.map(t => ({ ...t, type: 'task' as const })),
            ...dayEvents.map(e => ({ ...e, type: 'event' as const }))
          ];
          
          const displayItems = allItems.slice(0, 2);
          const hiddenCount = allItems.length - 2;

          return (
            <div 
              key={index} 
              onClick={() => day && setSelectedDay(day)}
              className={`min-h-[120px] p-2 bg-white dark:bg-gray-800 transition-colors ${!day ? 'bg-gray-50/50 dark:bg-gray-900/20' : 'hover:bg-blue-50/30 dark:hover:bg-gray-700 cursor-pointer'}`}
            >
              {day && (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 dark:text-gray-300'}`}>
                      {day.getDate()}
                    </span>
                  </div>
                  
                  <div className="flex-1 space-y-1.5 relative">
                    {displayItems.map((item, i) => {
                      if (item.type === 'task') {
                        const { task, operationName, analyst } = item;
                        const isCompleted = task.status === TaskStatus.COMPLETED;
                        const isOverdue = task.status === TaskStatus.OVERDUE;
                        const operation = operations.find(op => op.id === task.operationId);
                        const rulePriority = task.priority || operation?.taskRules?.find(r => r.id === task.ruleId)?.priority;
                        
                        const colorClass = isCompleted ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600' : getAnalystColor(analyst);
                        
                        let priorityColor = '';
                        if (rulePriority === 'Urgente') priorityColor = 'border-l-4 border-l-purple-500';
                        else if (rulePriority === 'Alta') priorityColor = 'border-l-4 border-l-red-500';
                        else if (rulePriority === 'Média') priorityColor = 'border-l-4 border-l-yellow-500';
                        else if (rulePriority === 'Baixa') priorityColor = 'border-l-4 border-l-green-500';

                        return (
                          <div 
                            key={`task-${task.id}`} 
                            onClick={(e) => { e.stopPropagation(); setPopoverTask({task, operationName, analyst}); }}
                            className={`px-2 py-1.5 rounded-md text-xs font-medium cursor-pointer border shadow-sm transition-transform hover:scale-[1.02] ${isOverdue ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : colorClass} ${isCompleted ? 'opacity-70' : ''} ${priorityColor}`}
                          >
                            <div className={`truncate font-bold ${isCompleted ? 'line-through' : ''}`}>{task.ruleName}</div>
                            <div className="truncate opacity-80 text-[10px]">{operationName}</div>
                          </div>
                        );
                      } else {
                        const { event, operationName } = item;
                        return (
                          <div 
                            key={`event-${event.id}`} 
                            className="px-2 py-1.5 rounded-md text-xs font-medium border shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
                          >
                            <div className="truncate font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                              {event.title}
                            </div>
                            <div className="truncate opacity-80 text-[10px]">{operationName}</div>
                          </div>
                        );
                      }
                    })}
                    
                    {hiddenCount > 0 && (
                      <div className="w-full text-left text-xs text-gray-500 dark:text-gray-400 font-medium py-1 pl-1">
                        + {hiddenCount} itens
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal for Selected Day */}
      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={`Atividades: ${selectedDay?.toLocaleDateString('pt-BR')}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6">
          <div className="flex justify-end">
            {onOpenNewTaskModal && (
              <button
                onClick={() => {
                  onOpenNewTaskModal();
                  setSelectedDay(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 text-sm font-medium"
              >
                <PlusCircleIcon className="w-4 h-4" />
                Nova Tarefa
              </button>
            )}
          </div>
          
          {selectedDay && (
            <>
              {/* Tarefas */}
              {(tasksByDay.get(selectedDay.getDate()) || []).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 border-b dark:border-gray-700 pb-2">Tarefas</h3>
                  <div className="grid gap-3">
                    {(tasksByDay.get(selectedDay.getDate()) || []).map(({ task, operationName, analyst }) => {
                      const isCompleted = task.status === TaskStatus.COMPLETED;
                      const isOverdue = task.status === TaskStatus.OVERDUE;
                      const operation = operations.find(op => op.id === task.operationId);
                      const rulePriority = task.priority || operation?.taskRules?.find(r => r.id === task.ruleId)?.priority;
                      
                      const colorClass = isCompleted ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600' : getAnalystColor(analyst);

                      return (
                        <div key={task.id} className={`flex items-center justify-between p-4 rounded-lg border shadow-sm ${isOverdue ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' : colorClass} ${isCompleted ? 'opacity-70' : ''}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`font-bold text-sm ${isCompleted ? 'line-through' : ''}`}>{task.ruleName}</h4>
                              {rulePriority && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                  rulePriority === 'Urgente' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                                  rulePriority === 'Alta' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                  rulePriority === 'Média' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                }`}>
                                  {rulePriority}
                                </span>
                              )}
                            </div>
                            <p className="text-xs opacity-80 mt-1">{operationName}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs font-medium opacity-80">
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${getAnalystColor(analyst).split(' ')[0]}`}></span>
                                {analyst}
                              </span>
                              <span>Status: {task.status}</span>
                            </div>
                          </div>
                          
                          {!isCompleted && onCompleteTask && (
                            <button 
                              onClick={() => { onCompleteTask(task); setSelectedDay(null); }}
                              className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium shadow-sm"
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                              Concluir
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Eventos */}
              {(eventsByDay.get(selectedDay.getDate()) || []).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 border-b dark:border-gray-700 pb-2">Eventos</h3>
                  <div className="grid gap-3">
                    {(eventsByDay.get(selectedDay.getDate()) || []).map(({ event, operationName, analyst }) => (
                      <div key={event.id} className="flex items-center justify-between p-4 rounded-lg border shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                        <div className="flex-1">
                          <h4 className="font-bold text-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                            {event.title}
                          </h4>
                          <p className="text-xs opacity-80 mt-1">{operationName}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs font-medium opacity-80">
                            <span className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${getAnalystColor(analyst).split(' ')[0]}`}></span>
                              {analyst}
                            </span>
                            <span>Tipo: {event.type}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(tasksByDay.get(selectedDay.getDate()) || []).length === 0 && (eventsByDay.get(selectedDay.getDate()) || []).length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Nenhuma atividade para este dia.
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* Popover for Task Details */}
      {popoverTask && !selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm p-4">
          <div ref={popoverRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-4 py-3 border-b ${popoverTask.task.status === TaskStatus.OVERDUE ? 'bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800' : popoverTask.task.status === TaskStatus.COMPLETED ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className={`font-bold text-gray-900 dark:text-gray-100 text-lg pr-4 ${popoverTask.task.status === TaskStatus.COMPLETED ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>{popoverTask.task.ruleName}</h4>
                  {(() => {
                    const op = operations.find(o => o.id === popoverTask.task.operationId);
                    const priority = popoverTask.task.priority || op?.taskRules?.find(r => r.id === popoverTask.task.ruleId)?.priority;
                    if (!priority) return null;
                    return (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mt-1 inline-block ${
                        priority === 'Urgente' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                        priority === 'Alta' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        priority === 'Média' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}>
                        {priority}
                      </span>
                    );
                  })()}
                </div>
                <button onClick={() => setPopoverTask(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">&times;</button>
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">{popoverTask.operationName}</p>
            </div>
            
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">Vencimento:</span>
                <span className={`font-semibold ${popoverTask.task.status === TaskStatus.OVERDUE ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {popoverTask.task.dueDate ? new Date(popoverTask.task.dueDate).toLocaleDateString('pt-BR') : 'Sem Prazo'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <span className={`font-semibold ${popoverTask.task.status === TaskStatus.OVERDUE ? 'text-red-600 dark:text-red-400' : popoverTask.task.status === TaskStatus.COMPLETED ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {popoverTask.task.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">Analista:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getAnalystColor(popoverTask.analyst)}`}></span>
                  {popoverTask.analyst}
                </span>
              </div>
              
              {onCompleteTask && popoverTask.task.status !== TaskStatus.COMPLETED && (
                <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700">
                  <button 
                    onClick={() => { onCompleteTask(popoverTask.task); setPopoverTask(null); }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
                  >
                    <CheckCircleIcon className="w-5 h-5" />
                    Concluir Tarefa
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalystCalendar;

