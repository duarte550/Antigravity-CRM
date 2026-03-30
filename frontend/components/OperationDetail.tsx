
import React, { useState, useMemo, useRef } from 'react';
import type { Operation, Event, Task, RatingHistoryEntry, Rating, Sentiment, TaskRule, OperationRisk, Contact } from '../types';
import { TaskStatus, ratingOptions, WatchlistStatus, Sentiment as SentimentEnum } from '../types';
import { PlusCircleIcon, CheckCircleIcon, EyeIcon, ArrowUpIcon, ArrowRightIcon, ArrowDownIcon, BellIcon, PencilIcon, TrashIcon, DownloadIcon, FileTextIcon, ArchiveIcon } from './icons/Icons';
import EventForm from './EventForm';
import WatchlistChangeForm from './WatchlistChangeForm';
import ReviewCompletionForm from './ReviewCompletionForm';
import TaskRuleForm from './TaskRuleForm';
import Modal from './Modal';
import AdHocTaskForm from './AdHocTaskForm';
import RatingHistoryChart from './RatingHistoryChart';
import EventHistory from './EventHistory';
import OperationForm from './OperationForm';
import ContactForm from './ContactForm';
import LitigationCommentsSection from './LitigationCommentsSection';

import RiskForm from './RiskForm';
import { X, Edit2, Plus, Trash2, AlertTriangle, Users } from 'lucide-react';
import RichTextEditor from './RichTextEditor';
import { fetchApi, autoCreateComiteReviewItem } from '../utils/api';

interface OperationDetailProps {
  operation: Operation;
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
  onOpenNewTaskModal: (operationId?: number) => void;
  onDeleteTask: (task: Task) => void;
  onEditTask: (task: Task, updates: { name: string, dueDate: string | null, notes?: string }) => void;
  onDeleteOperation: (operationId: number) => void;
  apiUrl: string;
  setIsSyncing: (isSyncing: boolean) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const InfoCard: React.FC<{ title: string; children: React.ReactNode; highlight?: boolean }> = ({ title, children, highlight = false }) => (
    <div className={`${highlight ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent dark:border-gray-700'} p-3 rounded-md`}>
        <h4 className={`text-xs ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} font-semibold uppercase`}>{title}</h4>
        <p className={`${highlight ? 'text-blue-900 dark:text-blue-100 font-bold text-lg' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>{children}</p>
    </div>
);

const getRatingChange = (currentRating: Rating, previousRating: Rating | undefined): 'up' | 'down' | 'neutral' => {
    if (!previousRating || currentRating === previousRating) {
        return 'neutral';
    }
    const currentIndex = ratingOptions.indexOf(currentRating);
    const previousIndex = ratingOptions.indexOf(previousRating);

    if (currentIndex < 0 || previousIndex < 0) return 'neutral';

    if (currentIndex < previousIndex) return 'up'; // Better rating
    if (currentIndex > previousIndex) return 'down'; // Worse rating
    return 'neutral';
};

const RatingChangeIndicator: React.FC<{ change: 'up' | 'down' | 'neutral' }> = ({ change }) => {
    if (change === 'up') {
        return <ArrowUpIcon className="w-4 h-4 text-green-600" title="Upgrade" />;
    }
    if (change === 'down') {
        return <ArrowDownIcon className="w-4 h-4 text-red-600" title="Downgrade" />;
    }
    return <ArrowRightIcon className="w-4 h-4 text-gray-400" title="Sem alteração" />;
};


const OperationDetail: React.FC<OperationDetailProps> = ({ operation, onUpdateOperation, onOpenNewTaskModal, onDeleteTask, onEditTask, onDeleteOperation, apiUrl, setIsSyncing, setIsRefreshing, showToast }) => {
    const [isEventFormOpen, setIsEventFormOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
    const [isWatchlistFormOpen, setIsWatchlistFormOpen] = useState(false);
    const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
    const [isEditOperationFormOpen, setIsEditOperationFormOpen] = useState(false);
    const [isDeleteOperationModalOpen, setIsDeleteOperationModalOpen] = useState(false);
    
    const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
    const [reviewTaskToComplete, setReviewTaskToComplete] = useState<Task | null>(null);
    const [selectedEventForDetails, setSelectedEventForDetails] = useState<Event | null>(null);
    
    const eventRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // New state for description and risks
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [description, setDescription] = useState(operation.description || '');
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notes, setNotes] = useState(operation.notes || '');
    const [isAddingRisk, setIsAddingRisk] = useState(false);
    const [editingRisk, setEditingRisk] = useState<OperationRisk | null>(null);
    const [isSavingDescription, setIsSavingDescription] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isSavingRisk, setIsSavingRisk] = useState(false);


    const handleSaveDescription = async () => {
        setIsSavingDescription(true);
        try {
            await onUpdateOperation({ ...operation, description });
            setIsEditingDescription(false);
        } catch (error) {
            console.error('Error saving description:', error);
        } finally {
            setIsSavingDescription(false);
        }
    };

    const handleSaveNotes = async () => {
        setIsSavingNotes(true);
        try {
            await onUpdateOperation({ ...operation, notes });
            setIsEditingNotes(false);
        } catch (error) {
            console.error('Error saving notes:', error);
        } finally {
            setIsSavingNotes(false);
        }
    };



    const handleAddRisk = async (riskData: Omit<OperationRisk, 'id' | 'createdAt' | 'updatedAt'>) => {
        setIsSavingRisk(true);
        setIsSyncing(true);
        try {
            const response = await fetchApi(`${apiUrl}/api/operations/${operation.id}/risks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...riskData, userName: 'Analista' }),
            });
            if (response.ok) {
                const updatedOp = await response.json();
                onUpdateOperation(updatedOp, false);
                setIsAddingRisk(false);
                showToast('Risco adicionado com sucesso!', 'success');
            } else {
                showToast('Erro ao adicionar risco.', 'error');
            }
        } catch (error) {
            console.error('Error adding risk:', error);
            showToast('Erro ao adicionar risco.', 'error');
        } finally {
            setIsSavingRisk(false);
            setIsSyncing(false);
        }
    };

    const handleUpdateRisk = async (riskData: Omit<OperationRisk, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!editingRisk) return;
        setIsSavingRisk(true);
        setIsSyncing(true);
        try {
            const response = await fetchApi(`${apiUrl}/api/operations/${operation.id}/risks/${editingRisk.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...riskData, userName: 'Analista' }),
            });
            if (response.ok) {
                const updatedOp = await response.json();
                onUpdateOperation(updatedOp, false);
                setEditingRisk(null);
                showToast('Risco atualizado com sucesso!', 'success');
            } else {
                showToast('Erro ao atualizar risco.', 'error');
            }
        } catch (error) {
            console.error('Error updating risk:', error);
            showToast('Erro ao atualizar risco.', 'error');
        } finally {
            setIsSavingRisk(false);
            setIsSyncing(false);
        }
    };

    const handleDeleteRisk = async (riskId: number) => {
        if (!window.confirm('Tem certeza que deseja remover este risco?')) return;
        setIsSyncing(true);
        try {
            const response = await fetchApi(`${apiUrl}/api/operations/${operation.id}/risks/${riskId}?userName=Analista`, {
                method: 'DELETE',
            });
            if (response.ok) {
                const updatedOp = await response.json();
                onUpdateOperation(updatedOp, false);
                showToast('Risco removido com sucesso!', 'success');
            } else {
                showToast('Erro ao remover risco.', 'error');
            }
        } catch (error) {
            console.error('Error deleting risk:', error);
            showToast('Erro ao remover risco.', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const [isConfirmingLegacy, setIsConfirmingLegacy] = useState(false);

    const handleToggleLegacy = async () => {
        const isLegacy = operation.status === 'Legado';
        try {
            const updatedOperation: Operation = { 
                ...operation, 
                status: isLegacy ? 'Ativa' : 'Legado',
                movedToLegacyDate: isLegacy ? undefined : new Date().toISOString()
            };
            await onUpdateOperation(updatedOperation);
            setIsConfirmingLegacy(false);
        } catch (error) {
            console.error(`Error ${isLegacy ? 'reactivating' : 'archiving'} operation:`, error);
        }
    };

    // State for filtering events
    const [eventDateFilter, setEventDateFilter] = useState({ start: '', end: '' });
    const [eventTypeFilter, setEventTypeFilter] = useState('Todos');
    const [eventPersonFilter, setEventPersonFilter] = useState('Todos');

    // State for filtering tasks
    const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'pending' | 'overdue'>('all');
    const [taskSortOrder, setTaskSortOrder] = useState<'asc' | 'desc'>('asc');
    const [taskDateFilter, setTaskDateFilter] = useState({ start: '', end: '' });

    // State for managing task rules
    const [ruleToEdit, setRuleToEdit] = useState<TaskRule | null>(null);
    const [ruleToDelete, setRuleToDelete] = useState<TaskRule | null>(null);
    
    // State for managing individual tasks
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);


    // State for managing contacts
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    const handleSaveContact = async (contactData: Omit<Contact, 'id' | 'masterGroupId'>) => {
        setIsSyncing(true);
        try {
            let updatedContacts = [...(operation.contacts || [])];
            if (editingContact) {
                updatedContacts = updatedContacts.map(c => 
                    c.id === editingContact.id ? { ...c, ...contactData } : c
                );
            } else {
                updatedContacts.push({ ...contactData, id: Date.now() } as Contact);
            }
            const updatedOperation = { ...operation, contacts: updatedContacts };
            await onUpdateOperation(updatedOperation);
            setIsAddingContact(false);
            setEditingContact(null);
        } catch (error) {
            console.error('Error saving contact:', error);
            showToast('Erro ao salvar contato', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteContact = async (contactId: number) => {
        setIsSyncing(true);
        try {
            const updatedContacts = (operation.contacts || []).filter(c => c.id !== contactId);
            const updatedOperation = { ...operation, contacts: updatedContacts };
            await onUpdateOperation(updatedOperation);
        } catch (error) {
            console.error('Error deleting contact:', error);
            showToast('Erro ao remover contato', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const tasks = operation.tasks || [];

    const sortedHistory = useMemo(() => {
        return [...operation.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [operation.ratingHistory]);

    const currentWatchlistStatus = useMemo(() => {
        return sortedHistory[0]?.watchlist ?? operation.watchlist;
    }, [sortedHistory, operation.watchlist]);
    
    const activeTasks = useMemo(() => {
        let filtered = tasks.filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.OVERDUE);
        
        if (taskStatusFilter === 'pending') {
            filtered = filtered.filter(t => t.status === TaskStatus.PENDING);
        } else if (taskStatusFilter === 'overdue') {
            filtered = filtered.filter(t => t.status === TaskStatus.OVERDUE);
        }

        // Group by ruleId and pick the one with the earliest dueDate
        // If ruleId is missing or 0, treat as unique (AdHoc)
        const ruleGroups: { [key: number]: Task } = {};
        const standaloneTasks: Task[] = [];
        
        filtered.forEach(task => {
            if (task.ruleId && task.ruleId > 0) {
                const existing = ruleGroups[task.ruleId];
                if (!existing) {
                    ruleGroups[task.ruleId] = task;
                } else {
                    const existingDate = existing.dueDate ? new Date(existing.dueDate).getTime() : Infinity;
                    const taskDate = task.dueDate ? new Date(task.dueDate).getTime() : Infinity;
                    if (taskDate < existingDate) {
                        ruleGroups[task.ruleId] = task;
                    }
                }
            } else {
                standaloneTasks.push(task);
            }
        });

        const finalTasks = [...standaloneTasks, ...Object.values(ruleGroups)];

        return finalTasks.sort((a, b) => {
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return taskSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [tasks, taskStatusFilter, taskSortOrder]);

    const completedTasks = useMemo(() => {
        return tasks.filter(t => t.status === TaskStatus.COMPLETED)
            .sort((a, b) => {
                const eventA = operation.events.find(e => e.completedTaskId === a.id);
                const eventB = operation.events.find(e => e.completedTaskId === b.id);
                return (eventB ? new Date(eventB.date).getTime() : 0) - (eventA ? new Date(eventA.date).getTime() : 0);
            });
    }, [tasks, operation.events]);
    
    const uniqueEventTypes = useMemo(() => ['Todos', ...new Set(operation.events.map(e => e.type))], [operation.events]);
    const uniqueRegisteredBy = useMemo(() => ['Todos', ...new Set(operation.events.map(e => e.registeredBy))], [operation.events]);

    const lastReviewWithAttentionPoints = useMemo(() => {
        return [...operation.events]
            .filter(e => (e.type === 'Revisão Periódica') && e.attentionPoints && e.attentionPoints.trim() !== '' && e.attentionPoints !== '<p></p>')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    }, [operation.events]);

    const filteredEvents = useMemo(() => {
        return [...operation.events]
            .filter(event => {
                if (!eventDateFilter.start && !eventDateFilter.end) return true;
                const eventDate = new Date(event.date);
                eventDate.setHours(0,0,0,0);
                const startDate = eventDateFilter.start ? new Date(eventDateFilter.start) : null;
                const endDate = eventDateFilter.end ? new Date(eventDateFilter.end) : null;
                if(startDate) startDate.setHours(0,0,0,0);
                if(endDate) endDate.setHours(0,0,0,0);
                if (startDate && eventDate < startDate) return false;
                if (endDate && eventDate > endDate) return false;
                return true;
            })
            .filter(event => eventTypeFilter === 'Todos' || event.type === eventTypeFilter)
            .filter(event => eventPersonFilter === 'Todos' || event.registeredBy === eventPersonFilter)
            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [operation.events, eventDateFilter, eventTypeFilter, eventPersonFilter]);

    const handleSaveEvent = (eventData: Omit<Event, 'id'>, id?: number) => {
        let updatedOperation;
        if (id) {
            const updatedEvents = operation.events.map(e => 
                e.id === id ? { ...e, ...eventData } : e
            );
            updatedOperation = { ...operation, events: updatedEvents };
        } else {
            const eventToSave: Partial<Event> = { ...eventData };
            if (taskToComplete) {
                eventToSave.completedTaskId = taskToComplete.id;
            }
            
            const updatedTasks = taskToComplete
                ? operation.tasks.map(t => t.id === taskToComplete.id ? { ...t, status: TaskStatus.COMPLETED } : t)
                : operation.tasks;

            updatedOperation = {
                ...operation,
                events: [...operation.events, { ...eventToSave, id: Date.now() } as Event],
                tasks: updatedTasks
            };
        }
        onUpdateOperation(updatedOperation);
        setTaskToComplete(null);
        setIsEventFormOpen(false);
        setEventToEdit(null);
    };

    const handleOpenEditEventModal = (event: Event) => {
        setEventToEdit(event);
        setIsEventFormOpen(true);
    };
    
    const handleDownloadEvent = (event: Event) => {
        const stripHtml = (html: string) => {
            const tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        };

        const content = `
Título: ${event.title}
Data: ${new Date(event.date).toLocaleDateString('pt-BR')}
Tipo: ${event.type}
Registrado por: ${event.registeredBy}

${event.ourAttendees ? `Presentes (Nossa Empresa): ${event.ourAttendees}\n` : ''}${event.operationAttendees ? `Presentes (Empresa da Operação): ${event.operationAttendees}\n` : ''}
--------------------
Descrição:
--------------------
${stripHtml(event.description)}

--------------------
Próximos Passos:
--------------------
${event.nextSteps ? stripHtml(event.nextSteps) : 'Nenhum'}
        `.trim().replace(/^\s+/gm, '');

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sanitizedTitle = event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `evento_${sanitizedTitle}_${event.id}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
    
    const handleSaveReview = async (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: Sentiment, videoUrl: string }) => {
        if (!reviewTaskToComplete) return;

        const newEventId = Date.now();
        const eventToSave: Event = {
            ...data.event,
            id: newEventId,
            completedTaskId: reviewTaskToComplete.id
        };
       
        const newHistoryEntry: RatingHistoryEntry = {
            id: Date.now() + 1,
            date: eventToSave.date,
            ratingOperation: data.ratingOp,
            ratingGroup: data.ratingGroup,
            ratingMasterGroup: data.ratingMasterGroup,
            watchlist: operation.watchlist,
            sentiment: data.sentiment,
            eventId: newEventId,
        };

        const updatedTasks = operation.tasks.map(t => t.id === reviewTaskToComplete.id ? {...t, status: TaskStatus.COMPLETED} : t);

        const updatedOperation: Operation = {
            ...operation,
            ratingOperation: data.ratingOp,
            ratingGroup: data.ratingGroup,
            ratingMasterGroup: data.ratingMasterGroup,
            events: [...operation.events, eventToSave],
            ratingHistory: [...operation.ratingHistory, newHistoryEntry],
            tasks: updatedTasks
        };
        
        onUpdateOperation(updatedOperation);

        // Auto-criar item de revisão no próximo comitê de investimento
        autoCreateComiteReviewItem({
          operationId: operation.id,
          operationName: operation.name,
          operationArea: operation.area,
          reviewTitle: eventToSave.title || `Revisão de crédito - ${operation.name}`,
          reviewDescription: data.event.description,
          analystName: operation.responsibleAnalyst,
          videoUrl: data.videoUrl || '',
          watchlist: operation.watchlist,
          ratingOperation: data.ratingOp,
          sentiment: data.sentiment,
        });

        setReviewTaskToComplete(null);
        setIsReviewFormOpen(false);
    };

    const handleSaveWatchlistChange = (data: { watchlist: WatchlistStatus, ratingOp: Rating, ratingGroup: Rating, sentiment: Sentiment, event: Omit<Event, 'id'>}) => {
        const newEventId = Date.now();
        const eventToSave: Event = { ...data.event, id: newEventId };

        const newHistoryEntry: RatingHistoryEntry = {
            id: Date.now() + 1,
            date: eventToSave.date,
            ratingOperation: data.ratingOp,
            ratingGroup: data.ratingGroup,
            watchlist: data.watchlist,
            sentiment: data.sentiment,
            eventId: newEventId,
        };

        const updatedOperation: Operation = {
            ...operation,
            watchlist: data.watchlist,
            ratingOperation: data.ratingOp,
            ratingGroup: data.ratingGroup,
            events: [...operation.events, eventToSave],
            ratingHistory: [...operation.ratingHistory, newHistoryEntry],
        };

        onUpdateOperation(updatedOperation);
        setIsWatchlistFormOpen(false);
    };

    const handleUpdateRule = (updatedRuleData: Omit<TaskRule, 'id'>) => {
        if (!ruleToEdit) return;
        const updatedRule = { ...ruleToEdit, ...updatedRuleData };
        const updatedOperation = {
            ...operation,
            taskRules: operation.taskRules.map(r => r.id === ruleToEdit.id ? updatedRule : r)
        };
        onUpdateOperation(updatedOperation);
        setRuleToEdit(null);
    };

    const handleConfirmDeleteRule = () => {
        if (!ruleToDelete) return;
        const updatedOperation = {
            ...operation,
            taskRules: operation.taskRules.filter(r => r.id !== ruleToDelete.id)
        };
        onUpdateOperation(updatedOperation);
        setRuleToDelete(null);
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

    const handleViewEventClick = (taskId: string) => {
        const completionEvent = operation.events.find(e => e.completedTaskId === taskId);
        if (completionEvent) {
            setSelectedEventForDetails(completionEvent);
        }
    }

    const handleSaveEditedOperation = (updatedData: Operation) => {
        onUpdateOperation(updatedData);
        setIsEditOperationFormOpen(false);
    };

    const handleConfirmDeleteOperation = () => {
        onDeleteOperation(operation.id);
        setIsDeleteOperationModalOpen(false);
    };
    
    const watchlistColorClasses = {
      [WatchlistStatus.VERDE]: 'bg-green-500 text-white hover:bg-green-600',
      [WatchlistStatus.AMARELO]: 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500',
      [WatchlistStatus.ROSA]: 'bg-pink-500 text-white hover:bg-pink-600',
      [WatchlistStatus.VERMELHO]: 'bg-red-600 text-white hover:bg-red-700',
    };

    return (
        <div className="space-y-8">
            {(isEventFormOpen || eventToEdit) && (
                <EventForm 
                    onClose={() => { setIsEventFormOpen(false); setTaskToComplete(null); setEventToEdit(null); }} 
                    onSave={handleSaveEvent}
                    analystName={operation.responsibleAnalyst}
                    prefilledTitle={taskToComplete ? `Conclusão: ${taskToComplete.ruleName}` : ''}
                    initialData={eventToEdit}
                />
            )}
            {isWatchlistFormOpen && (
                <WatchlistChangeForm
                    operation={operation}
                    onClose={() => setIsWatchlistFormOpen(false)}
                    onSave={handleSaveWatchlistChange}
                />
            )}
            {isReviewFormOpen && reviewTaskToComplete && (
                <ReviewCompletionForm
                    task={reviewTaskToComplete}
                    operation={operation}
                    onClose={() => setIsReviewFormOpen(false)}
                    onSave={handleSaveReview}
                />
            )}
            {isEditOperationFormOpen && (
                <OperationForm
                    onClose={() => setIsEditOperationFormOpen(false)}
                    onSave={handleSaveEditedOperation}
                    initialData={operation}
                    apiUrl={apiUrl}
                />
            )}
            {isDeleteOperationModalOpen && (
                 <Modal
                    isOpen={true}
                    onClose={() => setIsDeleteOperationModalOpen(false)}
                    title={`Deletar Operação: ${operation.name}`}
                >
                    <div className="text-center">
                        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                        Você tem certeza que deseja deletar esta operação? Esta ação não pode ser desfeita e removerá todas as tarefas, eventos e históricos associados.
                        </p>
                        <div className="flex justify-center gap-4">
                        <button
                            onClick={() => setIsDeleteOperationModalOpen(false)}
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmDeleteOperation}
                            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                            Confirmar Deleção
                        </button>
                        </div>
                    </div>
                </Modal>
            )}
            {ruleToEdit && (
                <Modal isOpen={true} onClose={() => setRuleToEdit(null)} title="Editar Regra de Tarefa">
                    <TaskRuleForm
                        onClose={() => setRuleToEdit(null)}
                        onSave={handleUpdateRule}
                        initialData={ruleToEdit}
                    />
                </Modal>
            )}
            {ruleToDelete && (
                 <Modal
                    isOpen={true}
                    onClose={() => setRuleToDelete(null)}
                    title={`Deletar Regra: ${ruleToDelete.name}`}
                >
                    <div className="text-center">
                        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                        Você tem certeza que deseja deletar esta regra de tarefa?
                        </p>
                        <div className="flex justify-center gap-4">
                        <button
                            onClick={() => setRuleToDelete(null)}
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmDeleteRule}
                            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                            Confirmar Deleção
                        </button>
                        </div>
                    </div>
                </Modal>
            )}
            {taskToEdit && (
                 <Modal isOpen={true} onClose={() => setTaskToEdit(null)} title="Editar Tarefa">
                    <AdHocTaskForm
                        onClose={() => setTaskToEdit(null)}
                        onSave={handleSaveEditedTask}
                        initialTask={taskToEdit}
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
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmDeleteTask}
                            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                            Confirmar Deleção
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
                        <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-2">
                            <span className="font-medium text-blue-600 dark:text-blue-400">{selectedEventForDetails.type}</span>
                            <span>{new Date(selectedEventForDetails.date).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Descrição</h4>
                            <div className="prose prose-sm dark:prose-invert max-w-none break-words overflow-x-auto text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.description }} />
                        </div>

                        {(selectedEventForDetails.ourAttendees || selectedEventForDetails.operationAttendees) && (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                {selectedEventForDetails.ourAttendees && (
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                        <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Presentes (Nossa Empresa)</h4>
                                        <p className="text-sm text-gray-800 dark:text-gray-200">{selectedEventForDetails.ourAttendees}</p>
                                    </div>
                                )}
                                {selectedEventForDetails.operationAttendees && (
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                        <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Presentes (Empresa da Operação)</h4>
                                        <p className="text-sm text-gray-800 dark:text-gray-200">{selectedEventForDetails.operationAttendees}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        {selectedEventForDetails.nextSteps && (
                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                <h4 className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase mb-2">Próximos Passos</h4>
                                <div className="text-sm text-blue-900 dark:text-blue-200 prose prose-sm dark:prose-invert max-w-none break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.nextSteps }} />
                            </div>
                        )}
                        {selectedEventForDetails.attentionPoints && (
                            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50">
                                <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase mb-2">Pontos de Atenção</h4>
                                <div className="text-sm text-amber-900 dark:text-amber-200 prose prose-sm dark:prose-invert max-w-none break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.attentionPoints }} />
                            </div>
                        )}
                        <div className="pt-2 text-xs text-gray-400 dark:text-gray-500">
                            Registrado por: {selectedEventForDetails.registeredBy}
                        </div>
                        <div className="flex justify-end pt-4">
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

            {isAddingRisk && (
                <Modal isOpen={true} onClose={() => setIsAddingRisk(false)} title="Adicionar Risco / Ponto de Atenção">
                    <RiskForm onClose={() => setIsAddingRisk(false)} onSave={handleAddRisk} />
                </Modal>
            )}

            {editingRisk && (
                <Modal isOpen={true} onClose={() => setEditingRisk(null)} title="Editar Risco / Ponto de Atenção">
                    <RiskForm onClose={() => setEditingRisk(null)} onSave={handleUpdateRisk} initialData={editingRisk} />
                </Modal>
            )}

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{operation.name}</h2>
                        <span className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm">
                            ID: {operation.id}
                        </span>
                        <button onClick={() => setIsEditOperationFormOpen(true)} className="text-gray-400 hover:text-blue-600" title="Editar Operação">
                            <PencilIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsDeleteOperationModalOpen(true)} className="text-gray-400 hover:text-red-600" title="Deletar Operação">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => setIsConfirmingLegacy(true)} 
                            className={`transition-colors ${operation.status === 'Legado' ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-400 hover:text-emerald-600'}`} 
                            title={operation.status === 'Legado' ? "Reativar Operação" : "Mover para Legado"}
                        >
                            <ArchiveIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <button onClick={() => setIsWatchlistFormOpen(true)} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${watchlistColorClasses[currentWatchlistStatus]}`}>
                        <BellIcon className="w-5 h-5"/> Alterar Watchlist / Rating
                    </button>
                </div>

                {isConfirmingLegacy && (
                    <Modal 
                        isOpen={true} 
                        onClose={() => setIsConfirmingLegacy(false)} 
                        title={operation.status === 'Legado' ? "Reativar Operação" : "Mover para Legado"}
                    >
                        <div className="text-center p-4">
                            <p className="text-gray-700 dark:text-gray-300 mb-6">
                                Tem certeza que deseja {operation.status === 'Legado' ? 'reativar' : 'mover para o legado'} a operação <strong>{operation.name}</strong>?
                            </p>
                            <div className="flex justify-center gap-4">
                                <button 
                                    onClick={() => setIsConfirmingLegacy(false)}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleToggleLegacy}
                                    className={`px-4 py-2 text-white rounded-md transition-colors ${operation.status === 'Legado' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}

                {/* Operation Description Section */}
                <div className="mb-6 bg-blue-50/30 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100/50 dark:border-blue-800/50">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider">Descrição da Operação</h3>
                        {!isEditingDescription ? (
                            <button 
                                onClick={() => setIsEditingDescription(true)}
                                className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 font-bold uppercase transition-colors"
                            >
                                <Edit2 className="w-3 h-3" /> Editar Descrição
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleSaveDescription}
                                    disabled={isSavingDescription}
                                    className="text-[10px] text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-bold uppercase transition-colors"
                                >
                                    {isSavingDescription ? 'Salvando...' : 'Salvar'}
                                </button>
                                <button 
                                    onClick={() => {
                                        setIsEditingDescription(false);
                                        setDescription(operation.description || '');
                                    }}
                                    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-bold uppercase transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </div>
                    {isEditingDescription ? (
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full p-3 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800"
                            rows={3}
                            placeholder="Descreva os detalhes principais da operação..."
                        />
                    ) : (
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed break-words overflow-hidden">
                            {operation.description || 'Nenhuma descrição fornecida.'}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoCard title="Área">{operation.area}</InfoCard>
                    <InfoCard title="Projetos">{operation.projects.map(p => p.name).join(', ')}</InfoCard>
                    <InfoCard title="Garantias">{operation.guarantees.map(g => g.name).join(', ')}</InfoCard>
                    <InfoCard title="Segmento">{operation.segmento}</InfoCard>
                    <InfoCard title="Vencimento" highlight>{operation.maturityDate ? new Date(operation.maturityDate).toLocaleDateString('pt-BR') : 'N/A'}</InfoCard>
                    <InfoCard title="Analista">{operation.responsibleAnalyst}</InfoCard>
                    {operation.structuringAnalyst && <InfoCard title="Analista Estruturação">{operation.structuringAnalyst}</InfoCard>}
                    <InfoCard title="Próx. Rev. Gerencial" highlight>{operation.nextReviewGerencial ? new Date(operation.nextReviewGerencial).toLocaleDateString('pt-BR') : 'N/A'}</InfoCard>
                    <InfoCard title="Próx. Rev. Política" highlight>{operation.nextReviewPolitica ? new Date(operation.nextReviewPolitica).toLocaleDateString('pt-BR') : 'N/A'}</InfoCard>
                </div>
            </div>

            {/* Notas / Observações Gerais */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mt-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <FileTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        Notas / Observações Gerais
                    </h3>
                    {!isEditingNotes ? (
                        <button 
                            onClick={() => setIsEditingNotes(true)}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                            <PencilIcon className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => {
                                    setIsEditingNotes(false);
                                    setNotes(operation.notes || '');
                                }}
                                className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSaveNotes}
                                disabled={isSavingNotes}
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isSavingNotes ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    )}
                </div>
                
                {isEditingNotes ? (
                    <RichTextEditor 
                        value={notes} 
                        onChange={setNotes} 
                        className="min-h-[150px]" 
                    />
                ) : (
                    operation.notes ? (
                        <div 
                            className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 break-words overflow-hidden"
                            dangerouslySetInnerHTML={{ __html: operation.notes }}
                        />
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic text-sm">Nenhuma nota ou observação geral adicionada.</p>
                    )
                )}
            </div>

            {/* Comentários Advogado de Litígio */}
            <LitigationCommentsSection 
                operation={operation}
                onUpdateOperation={onUpdateOperation}
                apiUrl={apiUrl}
                showToast={showToast}
                setIsSyncing={setIsSyncing}
            />

            {/* Risks and Points of Attention Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-orange-500" />
                        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Riscos e Pontos de Atenção</h3>
                    </div>
                    <button 
                        onClick={() => setIsAddingRisk(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-medium shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Adicionar Risco
                    </button>
                </div>

                {lastReviewWithAttentionPoints && (
                    <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                            <BellIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Pontos de Atenção da Última Revisão</h4>
                            <span className="text-[10px] text-amber-600 dark:text-amber-500 font-medium ml-auto italic">
                                Registrado em {new Date(lastReviewWithAttentionPoints.date).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                        <div 
                            className="text-sm text-amber-900 dark:text-amber-200 prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: lastReviewWithAttentionPoints.attentionPoints || '' }}
                        />
                        <p className="mt-3 text-[10px] text-amber-600/70 dark:text-amber-500/50 italic border-t border-amber-200/50 dark:border-amber-800/50 pt-2">
                            * Estes pontos foram importados automaticamente da última revisão de crédito concluída.
                        </p>
                    </div>
                )}

                {operation.risks && operation.risks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {operation.risks.map(risk => (
                            <div key={risk.id} className={`flex flex-col p-4 rounded-lg border-l-4 shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${
                                risk.severity === 'Alta' ? 'border-l-red-500' : 
                                risk.severity === 'Média' ? 'border-l-orange-500' : 
                                'border-l-yellow-500'
                            }`}>
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 leading-tight">{risk.title}</h4>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => setEditingRisk(risk)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDeleteRisk(risk.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-grow line-clamp-3">{risk.description}</p>
                                <div className="flex justify-between items-center pt-3 border-t border-gray-50 dark:border-gray-700 mt-auto">
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                        risk.severity === 'Alta' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                                        risk.severity === 'Média' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' : 
                                        'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                    }`}>
                                        {risk.severity}
                                    </span>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                        Atualizado em {new Date(risk.updatedAt).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <AlertTriangle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum risco ou ponto de atenção identificado para esta operação.</p>
                        <button 
                            onClick={() => setIsAddingRisk(true)}
                            className="mt-3 text-sm text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 font-bold uppercase tracking-wider"
                        >
                            Clique para adicionar o primeiro
                        </button>
                    </div>
                )}
            </div>

            {/* Contacts */}
            {isAddingContact && (
                <ContactForm
                    onClose={() => setIsAddingContact(false)}
                    onSave={handleSaveContact}
                />
            )}
            {editingContact && (
                <ContactForm
                    onClose={() => setEditingContact(null)}
                    onSave={handleSaveContact}
                    initialData={editingContact}
                />
            )}

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-500" />
                        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Contatos da Operação</h3>
                    </div>
                    <button 
                        onClick={() => setIsAddingContact(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-medium shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Novo Contato
                    </button>
                </div>

                {operation.contacts && operation.contacts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {operation.contacts.map((contact) => (
                            <div key={contact.id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600 relative group">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingContact(contact)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-400 hover:text-blue-600 transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => { if(window.confirm('Excluir contato?')) handleDeleteContact(contact.id); }} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-400 hover:text-red-600 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-1 pr-12">{contact.name}</h4>
                                {contact.role && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{contact.role}</p>}
                                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                    {contact.email && <p className="truncate" title={contact.email}><a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a></p>}
                                    {contact.phone && <p>{contact.phone}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-500 dark:text-gray-400">Nenhum contato cadastrado.</p>
                    </div>
                )}
            </div>

            <EventHistory 
                events={filteredEvents}
                onAddEvent={() => setIsEventFormOpen(true)}
                onEditEvent={handleOpenEditEventModal}
                onDownloadEvent={handleDownloadEvent}
                dateFilter={eventDateFilter}
                onDateFilterChange={setEventDateFilter}
                typeFilter={eventTypeFilter}
                onTypeFilterChange={setEventTypeFilter}
                personFilter={eventPersonFilter}
                onPersonFilterChange={setEventPersonFilter}
                uniqueEventTypes={uniqueEventTypes}
                uniqueRegisteredBy={uniqueRegisteredBy}
                onViewDetails={setSelectedEventForDetails}
                eventRefs={eventRefs}
            />
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Próximas Revisões</h3>
                    {(operation.nextReviewGerencialTask || operation.nextReviewPoliticaTask) && (
                        <button 
                            onClick={() => handleCompleteTaskClick((operation.nextReviewGerencialTask || operation.nextReviewPoliticaTask)!)} 
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-bold shadow-sm"
                        >
                            <CheckCircleIcon className="w-5 h-5" /> Completar Revisão
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-md">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">Revisão Gerencial</p>
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                            Vencimento: {operation.nextReviewGerencial ? new Date(operation.nextReviewGerencial).toLocaleDateString('pt-BR') : 'Não agendada'}
                        </p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 rounded-md">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">Revisão Política</p>
                        <p className="text-sm text-purple-700 dark:text-purple-400">
                            Vencimento: {operation.nextReviewPolitica ? new Date(operation.nextReviewPolitica).toLocaleDateString('pt-BR') : 'Não agendada'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Execução de Tarefas</h3>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status:</label>
                                <select 
                                    value={taskStatusFilter} 
                                    onChange={(e) => setTaskStatusFilter(e.target.value as any)}
                                    className="text-xs border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                    <option value="all">Todos</option>
                                    <option value="pending">Pendentes</option>
                                    <option value="overdue">Atrasadas</option>
                                </select>
                            </div>
                            <button 
                                onClick={() => setTaskSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                                title={taskSortOrder === 'asc' ? 'Vencimento Crescente' : 'Vencimento Decrescente'}
                            >
                                Vencimento {taskSortOrder === 'asc' ? '↑' : '↓'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                       {activeTasks.map(task => {
                           const rulePriority = task.priority || operation.taskRules?.find(r => r.id === task.ruleId)?.priority;
                           let priorityColor = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
                           if (rulePriority === 'Urgente') priorityColor = 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
                           if (rulePriority === 'Alta') priorityColor = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
                           if (rulePriority === 'Média') priorityColor = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
                           if (rulePriority === 'Baixa') priorityColor = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';

                           return (
                           <div key={task.id} className={`p-3 rounded-md flex justify-between items-center ${task.status === TaskStatus.OVERDUE ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500' : 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500'}`}>
                               <div>
                                   <div className="flex items-center gap-2">
                                       <p className="font-semibold text-gray-800 dark:text-gray-200">{task.ruleName}</p>
                                       {rulePriority && (
                                           <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${priorityColor}`}>
                                               {rulePriority}
                                           </span>
                                       )}
                                   </div>
                                   <p className={`text-sm ${task.status === TaskStatus.OVERDUE ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                                       {task.dueDate ? `Vencimento: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : 'Sem Prazo'}
                                   </p>
                               </div>
                               <div className="flex items-center gap-2">
                                    <button onClick={() => setTaskToEdit(task)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar Tarefa">
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                     <button onClick={() => setTaskToDelete(task)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Deletar Tarefa">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => handleCompleteTaskClick(task)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm">
                                        <CheckCircleIcon className="w-4 h-4" /> Completar
                                    </button>
                               </div>
                           </div>
                       )})}
                        {activeTasks.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma tarefa pendente para os filtros selecionados.</p>}
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Regras de Tarefas</h3>
                         <button onClick={() => onOpenNewTaskModal(operation.id)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm transition-colors">
                            <PlusCircleIcon className="w-5 h-5"/> Adicionar Tarefa
                        </button>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {operation.taskRules.map(rule => {
                            let priorityColor = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
                            if (rule.priority === 'Urgente') priorityColor = 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
                            if (rule.priority === 'Alta') priorityColor = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
                            if (rule.priority === 'Média') priorityColor = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
                            if (rule.priority === 'Baixa') priorityColor = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';

                            return (
                            <div key={rule.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md flex justify-between items-center border border-transparent dark:border-gray-700">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{rule.name} <span className="text-xs font-normal text-white bg-blue-500 dark:bg-blue-600 px-2 py-0.5 rounded-full">{rule.frequency}</span></p>
                                        {rule.priority && (
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${priorityColor}`}>
                                                {rule.priority}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: rule.description }} />
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        {rule.frequency === 'Pontual' ? (
                                            <span className="font-medium text-blue-600 dark:text-blue-400">Pontual: {rule.startDate ? new Date(rule.startDate).toLocaleDateString('pt-BR') : 'N/A'}</span>
                                        ) : (
                                            `${rule.startDate ? new Date(rule.startDate).toLocaleDateString('pt-BR') : 'N/A'} até ${rule.endDate ? new Date(rule.endDate).toLocaleDateString('pt-BR') : 'N/A'}`
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setRuleToEdit(rule)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar Regra">
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => setRuleToDelete(rule)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Deletar Regra">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )})}
                        {operation.taskRules.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma regra de tarefa definida.</p>}
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4">Histórico de Ratings e Sentimentos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {sortedHistory.length > 0 ? (
                            sortedHistory.map((entry, index, array) => {
                                const previousEntry = array[index + 1];
                                const opRatingChange = getRatingChange(entry.ratingOperation, previousEntry?.ratingOperation);
                                const groupRatingChange = getRatingChange(entry.ratingGroup, previousEntry?.ratingGroup);

                                return (
                                    <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md flex flex-wrap items-center justify-between gap-y-2 gap-x-4 border border-transparent dark:border-gray-700">
                                        <div className="font-medium text-gray-700 dark:text-gray-300">{new Date(entry.date).toLocaleDateString('pt-BR')}</div>
                                        <div className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Op: </span>
                                            <RatingChangeIndicator change={opRatingChange} />
                                            {entry.ratingOperation}
                                        </div>
                                        <div className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Grupo: </span>
                                            <RatingChangeIndicator change={groupRatingChange} />
                                            {entry.ratingGroup}
                                        </div>
                                        <div className={`flex items-center gap-2 font-semibold text-sm ${entry.sentiment === 'Positivo' ? 'text-green-600 dark:text-green-400' : entry.sentiment === 'Negativo' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                            {entry.sentiment === 'Positivo' && <ArrowUpIcon className="w-4 h-4" />}
                                            {entry.sentiment === 'Neutro' && <ArrowRightIcon className="w-4 h-4" />}
                                            {entry.sentiment === 'Negativo' && <ArrowDownIcon className="w-4 h-4" />}
                                            {entry.sentiment}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhum histórico de rating para esta operação.</p>
                        )}
                    </div>
                    <div>
                        <RatingHistoryChart history={operation.ratingHistory} />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4">Tarefas Concluídas (Últimas 5)</h3>
                <div className="space-y-3">
                    {completedTasks.length > 0 ? (
                        completedTasks.slice(0, 5).map(task => {
                            const completionEvent = operation.events.find(e => e.completedTaskId === task.id);
                            return (
                                <div key={task.id} className="p-3 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-md flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{task.ruleName}</p>
                                        <p className="text-xs text-green-700 dark:text-green-400">
                                            Concluída em: {completionEvent ? new Date(completionEvent.date).toLocaleDateString('pt-BR') : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleViewEventClick(task.id)} 
                                            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors"
                                        >
                                            <EyeIcon className="w-4 h-4" /> Ver Detalhes
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma tarefa concluída recentemente.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OperationDetail;
