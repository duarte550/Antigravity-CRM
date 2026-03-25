
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Operation, RatingHistoryEntry, Event, Rating, Sentiment as SentimentType, WatchlistStatus as WatchlistStatusType } from '../types';
import { WatchlistStatus, Sentiment, ratingOptions } from '../types';
import { BellIcon, ArrowUpIcon, ArrowRightIcon, ArrowDownIcon, PencilIcon, TrashIcon } from './icons/Icons';
import WatchlistChangeForm from './WatchlistChangeForm';
import WatchlistHistoryChart from './WatchlistHistoryChart';
import WatchlistSummary from './WatchlistSummary';
import WatchlistReportModal from './WatchlistReportModal';
import Modal from './Modal';


interface WatchlistPageProps {
  operations: Operation[];
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => void;
}

const WatchlistPage: React.FC<WatchlistPageProps> = ({ operations, onUpdateOperation }) => {
    const [activeFilter, setActiveFilter] = useState<WatchlistStatus | 'All'>('All');
    const [masterGroupFilter, setMasterGroupFilter] = useState<string>('All');
    const [economicGroupFilter, setEconomicGroupFilter] = useState<string>('All');
    const [expandedOpId, setExpandedOpId] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [operationToEdit, setOperationToEdit] = useState<Operation | null>(null);
    
    // State for editing existing events
    const [editingHistoryEntry, setEditingHistoryEntry] = useState<RatingHistoryEntry | null>(null);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);

    const filterOptions: (WatchlistStatus | 'All')[] = ['All', ...Object.values(WatchlistStatus)];

    const filteredOperations = useMemo(() => {
        // This initial filter uses the derived current status for accuracy.
        const filtered = operations.filter(op => {
            if (masterGroupFilter !== 'All' && (op.masterGroupName || 'Sem Master Group') !== masterGroupFilter) return false;
            if (economicGroupFilter !== 'All' && (op.economicGroupName || 'Sem Grupo Econômico') !== economicGroupFilter) return false;

            if (activeFilter === 'All') return true;
            const latestHistoryEntry = op.ratingHistory.length > 0
                ? [...op.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                : null;
            const currentStatus = latestHistoryEntry?.watchlist ?? op.watchlist;
            return currentStatus === activeFilter;
        });

        // Sort operations: Red -> Pink -> Yellow -> Green, then Alphabetical
        const statusOrder: Record<string, number> = {
            [WatchlistStatus.VERMELHO]: 0,
            [WatchlistStatus.ROSA]: 1,
            [WatchlistStatus.AMARELO]: 2,
            [WatchlistStatus.VERDE]: 3,
        };

        return filtered.sort((a, b) => {
            const statusA = (a.ratingHistory.length > 0
                ? [...a.ratingHistory].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0].watchlist
                : a.watchlist) || WatchlistStatus.VERDE;
            
            const statusB = (b.ratingHistory.length > 0
                ? [...b.ratingHistory].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0].watchlist
                : b.watchlist) || WatchlistStatus.VERDE;

            const orderA = statusOrder[statusA] ?? 99;
            const orderB = statusOrder[statusB] ?? 99;

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            return a.name.localeCompare(b.name);
        });
    }, [operations, activeFilter, masterGroupFilter, economicGroupFilter]);

    const masterGroupsOpts = useMemo(() => {
        const filtered = operations.filter(op => {
            if (economicGroupFilter !== 'All' && (op.economicGroupName || 'Sem Grupo Econômico') !== economicGroupFilter) return false;
            
            if (activeFilter === 'All') return true;
            const latestHistoryEntry = op.ratingHistory.length > 0
                ? [...op.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                : null;
            const currentStatus = latestHistoryEntry?.watchlist ?? op.watchlist;
            return currentStatus === activeFilter;
        });
        const mgs = filtered.map(op => op.masterGroupName || 'Sem Master Group');
        return ['All', ...Array.from(new Set(mgs)).sort()];
    }, [operations, economicGroupFilter, activeFilter]);

    const economicGroupsOpts = useMemo(() => {
        const filtered = operations.filter(op => {
            if (masterGroupFilter !== 'All' && (op.masterGroupName || 'Sem Master Group') !== masterGroupFilter) return false;

            if (activeFilter === 'All') return true;
            const latestHistoryEntry = op.ratingHistory.length > 0
                ? [...op.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                : null;
            const currentStatus = latestHistoryEntry?.watchlist ?? op.watchlist;
            return currentStatus === activeFilter;
        });
        const egs = filtered.map(op => op.economicGroupName || 'Sem Grupo Econômico');
        return ['All', ...Array.from(new Set(egs)).sort()];
    }, [operations, masterGroupFilter, activeFilter]);

    useEffect(() => {
        if (masterGroupFilter !== 'All' && !masterGroupsOpts.includes(masterGroupFilter)) {
            setMasterGroupFilter('All');
        }
    }, [masterGroupsOpts, masterGroupFilter]);

    useEffect(() => {
        if (economicGroupFilter !== 'All' && !economicGroupsOpts.includes(economicGroupFilter)) {
            setEconomicGroupFilter('All');
        }
    }, [economicGroupsOpts, economicGroupFilter]);

    const handleOpenModal = (op: Operation) => {
        setOperationToEdit(op);
        setIsModalOpen(true);
        setEditingHistoryEntry(null);
        setEditingEvent(null);
    };
    
    const handleCloseModal = () => {
        setOperationToEdit(null);
        setIsModalOpen(false);
        setEditingHistoryEntry(null);
        setEditingEvent(null);
    };
    
    const handleSaveChanges = (data: Parameters<typeof onUpdateOperation>[0]) => {
        onUpdateOperation(data);
        handleCloseModal();
    };

    const handleSaveWatchlistChange = (op: Operation, data: { watchlist: WatchlistStatusType, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: SentimentType, event: Omit<Event, 'id'>}) => {
        if (editingHistoryEntry && editingEvent) {
            // Update existing entry
            const updatedEvent = { ...editingEvent, ...data.event };
            const updatedHistoryEntry = { 
                ...editingHistoryEntry, 
                watchlist: data.watchlist,
                ratingOperation: data.ratingOp,
                ratingGroup: data.ratingGroup,
                ratingMasterGroup: data.ratingMasterGroup,
                sentiment: data.sentiment,
                date: data.event.date // Update date if changed
            };

            const updatedOp = {
                ...op,
                watchlist: data.watchlist, // Update current status if it's the latest entry? Ideally we recalculate, but simple update is fine for now
                ratingOperation: data.ratingOp,
                ratingGroup: data.ratingGroup,
                ratingMasterGroup: data.ratingMasterGroup,
                events: op.events.map(e => e.id === editingEvent.id ? updatedEvent : e),
                ratingHistory: op.ratingHistory.map(h => h.id === editingHistoryEntry.id ? updatedHistoryEntry : h),
            };
            handleSaveChanges(updatedOp);

        } else {
            // Create new entry
            const newEventId = Date.now();
            const eventToSave: Event = { ...data.event, id: newEventId };
            
            const newHistoryEntry: RatingHistoryEntry = {
                id: Date.now() + 1,
                date: eventToSave.date,
                ratingOperation: data.ratingOp,
                ratingGroup: data.ratingGroup,
                ratingMasterGroup: data.ratingMasterGroup,
                watchlist: data.watchlist,
                sentiment: data.sentiment, // Use manually selected sentiment
                eventId: newEventId,
            };
    
            const updatedOp = {
                ...op,
                watchlist: data.watchlist,
                ratingOperation: data.ratingOp,
                ratingGroup: data.ratingGroup,
                ratingMasterGroup: data.ratingMasterGroup,
                events: [...op.events, eventToSave],
                ratingHistory: [...op.ratingHistory, newHistoryEntry],
            };
            handleSaveChanges(updatedOp);
        }
    };

    const handleEditEvent = (op: Operation, historyEntry: RatingHistoryEntry, event: Event) => {
        setOperationToEdit(op);
        setEditingHistoryEntry(historyEntry);
        setEditingEvent(event);
        setIsModalOpen(true);
    };

    const handleDeleteEvent = (op: Operation, historyEntryId: number, eventId: number) => {
        if (window.confirm('Tem certeza que deseja excluir este evento do histórico?')) {
            const updatedOp = {
                ...op,
                events: op.events.filter(e => e.id !== eventId),
                ratingHistory: op.ratingHistory.filter(h => h.id !== historyEntryId),
            };
            // Recalculate current status based on remaining history
            const sortedHistory = [...updatedOp.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            if (sortedHistory.length > 0) {
                updatedOp.watchlist = sortedHistory[0].watchlist;
                updatedOp.ratingOperation = sortedHistory[0].ratingOperation;
                updatedOp.ratingGroup = sortedHistory[0].ratingGroup;
            }
            
            onUpdateOperation(updatedOp);
        }
    };

    return (
        <div className="space-y-8">
            {isModalOpen && operationToEdit && (
                <WatchlistChangeForm
                    operation={operationToEdit}
                    onClose={handleCloseModal}
                    onSave={(data) => handleSaveWatchlistChange(operationToEdit, data)}
                    initialData={editingHistoryEntry && editingEvent ? {
                        watchlist: editingHistoryEntry.watchlist,
                        ratingOp: editingHistoryEntry.ratingOperation,
                        ratingGroup: editingHistoryEntry.ratingGroup,
                        ratingMasterGroup: (editingHistoryEntry.ratingMasterGroup || 'B') as Rating,
                        sentiment: editingHistoryEntry.sentiment,
                        event: editingEvent
                    } : undefined}
                />
            )}

            {isReportModalOpen && (
                <WatchlistReportModal
                    operations={operations}
                    onClose={() => setIsReportModalOpen(false)}
                />
            )}

            <WatchlistSummary operations={operations} />

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition-colors duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Gerenciamento de Watchlist</h2>
                    <button 
                        onClick={() => setIsReportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Gerar Relatório Mensal
                    </button>
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
                    <div className="flex items-center gap-2 overflow-x-auto flex-1 pb-2 md:pb-0">
                        {filterOptions.map(status => (
                            <button
                                key={status}
                                onClick={() => setActiveFilter(status)}
                                className={`whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-full transition-colors duration-200 ${
                                    activeFilter === status
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                {status === 'All' ? 'Todas' : status}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <select
                            value={masterGroupFilter}
                            onChange={(e) => setMasterGroupFilter(e.target.value)}
                            className="block rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 transition-colors duration-200"
                        >
                            {masterGroupsOpts.map(mg => <option key={mg} value={mg}>{mg === 'All' ? 'Master Group: Todos' : mg}</option>)}
                        </select>
                        <select
                            value={economicGroupFilter}
                            onChange={(e) => setEconomicGroupFilter(e.target.value)}
                            className="block rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 transition-colors duration-200"
                        >
                            {economicGroupsOpts.map(eg => <option key={eg} value={eg}>{eg === 'All' ? 'Grupo Econômico: Todos' : eg}</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    {filteredOperations.map(op => (
                        <OperationCard 
                            key={op.id}
                            operation={op}
                            isExpanded={expandedOpId === op.id}
                            onToggle={() => setExpandedOpId(prev => prev === op.id ? null : op.id)}
                            onOpenUpdateModal={() => handleOpenModal(op)}
                            onEditEvent={(historyEntry, event) => handleEditEvent(op, historyEntry, event)}
                            onDeleteEvent={(historyEntryId, eventId) => handleDeleteEvent(op, historyEntryId, eventId)}
                        />
                    ))}
                    {filteredOperations.length === 0 && (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <p>Nenhuma operação encontrada para o filtro "{activeFilter}".</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition-colors duration-200">
                <WatchlistHistoryChart operations={operations} />
            </div>
        </div>
    );
};

const WatchlistBadge: React.FC<{ status: WatchlistStatusType | null }> = ({ status }) => {
    if (!status) return null;
    const colorClasses = {
        [WatchlistStatus.VERDE]: 'bg-green-100 text-green-800',
        [WatchlistStatus.AMARELO]: 'bg-yellow-100 text-yellow-800',
        [WatchlistStatus.ROSA]: 'bg-pink-100 text-pink-800',
        [WatchlistStatus.VERMELHO]: 'bg-red-100 text-red-800',
    };

    return (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[status]}`}>
        {status}
        </span>
    );
};


interface OperationCardProps {
    operation: Operation;
    isExpanded: boolean;
    onToggle: () => void;
    onOpenUpdateModal: () => void;
    onEditEvent: (historyEntry: RatingHistoryEntry, event: Event) => void;
    onDeleteEvent: (historyEntryId: number, eventId: number) => void;
}

const OperationCard: React.FC<OperationCardProps> = ({ operation, isExpanded, onToggle, onOpenUpdateModal, onEditEvent, onDeleteEvent }) => {
    const [showFullHistory, setShowFullHistory] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const sortedHistory = useMemo(() => {
        return [...operation.ratingHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [operation.ratingHistory]);

    useEffect(() => {
        if (isExpanded && !showFullHistory && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
    }, [isExpanded, showFullHistory]);

    const currentWatchlistStatus = useMemo(() => {
        return sortedHistory[0]?.watchlist ?? operation.watchlist;
    }, [sortedHistory, operation.watchlist]);

    const statusClasses: Record<string, { border: string; bg: string }> = {
        [WatchlistStatus.VERDE]: { border: 'border-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
        [WatchlistStatus.AMARELO]: { border: 'border-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
        [WatchlistStatus.ROSA]: { border: 'border-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20' },
        [WatchlistStatus.VERMELHO]: { border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    };

    const defaultStatusClass = { border: 'border-gray-300 dark:border-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' };
    const currentStatusClass = statusClasses[currentWatchlistStatus] || defaultStatusClass;

    const previousWatchlistStatus = useMemo(() => {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const relevantHistory = operation.ratingHistory
            .filter(h => new Date(h.date) < startOfThisMonth)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return relevantHistory.length > 0 ? relevantHistory[0].watchlist : null;
    }, [operation.ratingHistory]);

    const renderFullEntry = (entry: RatingHistoryEntry, index: number) => {
        const event = operation.events.find(e => e.id === entry.eventId);
        const previousEntry = sortedHistory[index + 1];

        const prevStatus = previousEntry?.watchlist;
        const statusChanged = prevStatus && prevStatus !== entry.watchlist;

        const prevRatingOp = previousEntry?.ratingOperation;
        const ratingOpChanged = prevRatingOp && prevRatingOp !== entry.ratingOperation;

        const prevRatingGroup = previousEntry?.ratingGroup;
        const ratingGroupChanged = prevRatingGroup && prevRatingGroup !== entry.ratingGroup;

        return (
            <div key={entry.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-base w-24">{new Date(entry.date).toLocaleDateString('pt-BR')}</p>
                        <div className="flex flex-col items-start text-sm space-y-1">
                            {/* Watchlist change */}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 dark:text-gray-400 w-12 text-right">Farol:</span>
                                {statusChanged ? (
                                    <span className="flex items-center gap-1.5"><WatchlistBadge status={prevStatus} /><span className="font-bold text-gray-700 dark:text-gray-300 mx-1">→</span><WatchlistBadge status={entry.watchlist} /></span>
                                ) : (
                                    <WatchlistBadge status={entry.watchlist} />
                                )}
                            </div>
                            {/* Rating Op change */}
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="text-gray-500 dark:text-gray-400 w-12 text-right">Op:</span>
                                {ratingOpChanged ? (
                                    <span className="flex items-center gap-1.5"><span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{prevRatingOp}</span><span className="font-bold text-gray-700 dark:text-gray-300 mx-1">→</span><span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded font-semibold">{entry.ratingOperation}</span></span>
                                ) : (
                                    <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded font-semibold">{entry.ratingOperation}</span>
                                )}
                            </div>
                            {/* Rating Group change */}
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="text-gray-500 dark:text-gray-400 w-12 text-right">Grupo:</span>
                                {ratingGroupChanged ? (
                                        <span className="flex items-center gap-1.5"><span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{prevRatingGroup}</span><span className="font-bold text-gray-700 dark:text-gray-300 mx-1">→</span><span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded font-semibold">{entry.ratingGroup}</span></span>
                                ) : (
                                    <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded font-semibold">{entry.ratingGroup}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 font-semibold text-sm ${entry.sentiment === 'Positivo' ? 'text-green-600 dark:text-green-400' : entry.sentiment === 'Negativo' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            {entry.sentiment === 'Positivo' && <ArrowUpIcon className="w-4 h-4" />}
                            {entry.sentiment === 'Neutro' && <ArrowRightIcon className="w-4 h-4" />}
                            {entry.sentiment === 'Negativo' && <ArrowDownIcon className="w-4 h-4" />}
                            {entry.sentiment}
                        </div>
                        {event && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => onEditEvent(entry, event)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" title="Editar Evento">
                                    <PencilIcon className="w-4 h-4" />
                                </button>
                                <button onClick={() => onDeleteEvent(entry.id, event.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400" title="Excluir Evento">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {event && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 text-sm text-gray-800 dark:text-gray-200 space-y-2">
                        <p><strong className="font-semibold text-gray-600 dark:text-gray-400">Evento:</strong> {event.title}</p>
                        <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
                        {event.nextSteps && (
                            <div>
                                <strong className="font-semibold text-gray-600 dark:text-gray-400 block mb-1">Próximos Passos:</strong>
                                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: event.nextSteps }} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderTimelineItemHorizontal = (entry: RatingHistoryEntry, index: number) => {
        const previousEntry = sortedHistory[index + 1]; // The one before this one chronologically
        
        const prevStatus = previousEntry?.watchlist;
        const statusChanged = prevStatus && prevStatus !== entry.watchlist;

        const prevRatingOp = previousEntry?.ratingOperation;
        const ratingOpChanged = prevRatingOp && prevRatingOp !== entry.ratingOperation;

        const prevRatingGroup = previousEntry?.ratingGroup;
        const ratingGroupChanged = prevRatingGroup && prevRatingGroup !== entry.ratingGroup;

        return (
            <div key={entry.id} className="flex-shrink-0 flex flex-col items-center w-[220px] relative px-2 group">
                {/* Date */}
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono mb-2 font-semibold">
                    {new Date(entry.date).toLocaleDateString('pt-BR')}
                </span>

                {/* Dot and Line */}
                <div className="relative w-full flex justify-center items-center mb-3">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 dark:bg-gray-700 -z-10"></div>
                    <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-800 z-0 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors"></div>
                </div>

                {/* Content Card */}
                <div className="flex flex-col items-center gap-2 text-sm bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 w-full shadow-sm hover:shadow-md transition-shadow">
                     {/* Watchlist */}
                     {statusChanged ? (
                         <div className="flex items-center gap-1 justify-center w-full">
                            <WatchlistBadge status={prevStatus} />
                            <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>
                            <WatchlistBadge status={entry.watchlist} />
                         </div>
                    ) : (
                         <WatchlistBadge status={entry.watchlist} />
                    )}

                    {/* Ratings & Sentiment Row */}
                    <div className="flex flex-wrap justify-center gap-2 w-full">
                        {/* Rating Op */}
                        {ratingOpChanged && (
                            <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 dark:text-gray-500">Op:</span>
                                <span className="font-mono bg-white dark:bg-gray-700 px-1 rounded text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">{prevRatingOp}</span>
                                <span className="text-gray-400 dark:text-gray-500">→</span>
                                <span className="font-mono bg-white dark:bg-gray-700 px-1 rounded font-semibold border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200">{entry.ratingOperation}</span>
                            </div>
                        )}

                        {/* Rating Group */}
                        {ratingGroupChanged && (
                            <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 dark:text-gray-500">Gr:</span>
                                <span className="font-mono bg-white dark:bg-gray-700 px-1 rounded text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">{prevRatingGroup}</span>
                                <span className="text-gray-400 dark:text-gray-500">→</span>
                                <span className="font-mono bg-white dark:bg-gray-700 px-1 rounded font-semibold border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200">{entry.ratingGroup}</span>
                            </div>
                        )}
                    </div>

                    {/* Sentiment */}
                    <div className={`flex items-center gap-1 text-xs font-medium ${entry.sentiment === 'Positivo' ? 'text-green-600 dark:text-green-400' : entry.sentiment === 'Negativo' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {entry.sentiment === 'Positivo' && <ArrowUpIcon className="w-3 h-3" />}
                        {entry.sentiment === 'Neutro' && <ArrowRightIcon className="w-3 h-3" />}
                        {entry.sentiment === 'Negativo' && <ArrowDownIcon className="w-3 h-3" />}
                        {entry.sentiment}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`border-l-4 rounded-r-lg shadow-sm transition-all duration-300 ${currentStatusClass.border} ${isExpanded ? currentStatusClass.bg : 'bg-white dark:bg-gray-800'}`}>
            <div 
                className="p-4 cursor-pointer"
                onClick={onToggle}
            >
                <div className="flex justify-between items-center">
                    <div className="flex-1">
                        <p className="font-bold text-lg text-gray-900 dark:text-gray-100">{operation.name}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300 mt-1">
                            <span>Analista: <span className="font-medium">{operation.responsibleAnalyst}</span></span>
                            <span>Rating Op: <span className="font-medium">{operation.ratingOperation}</span></span>
                            <span>Rating Grupo: <span className="font-medium">{operation.ratingGroup}</span></span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                           <p className="text-xs text-gray-500 dark:text-gray-400">Mês Anterior</p>
                            {previousWatchlistStatus ? (
                                <WatchlistBadge status={previousWatchlistStatus} />
                            ) : (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                    N/A
                                </span>
                            )}
                        </div>
                        <div className="text-right">
                           <p className="text-xs text-gray-500 dark:text-gray-400">Farol Atual</p>
                           <WatchlistBadge status={currentWatchlistStatus} />
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onOpenUpdateModal(); }} className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors text-sm font-semibold">
                            <BellIcon className="w-4 h-4" /> Alterar Status
                        </button>
                        <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
                            <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </span>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-gray-700 dark:text-gray-300">
                            {showFullHistory ? 'Histórico Completo' : 'Última Atualização & Linha do Tempo'}
                        </h4>
                        <button 
                            onClick={() => setShowFullHistory(!showFullHistory)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                        >
                            {showFullHistory ? 'Ver Resumo' : 'Ver Histórico Completo'}
                        </button>
                    </div>

                    {sortedHistory.length > 0 ? (
                        showFullHistory ? (
                            <div className="space-y-4">
                                {sortedHistory.map((entry, index) => renderFullEntry(entry, index))}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Latest Event (Full Detail) */}
                                <div>
                                    {renderFullEntry(sortedHistory[0], 0)}
                                </div>

                                {/* Timeline of previous events */}
                                {sortedHistory.length > 1 && (
                                    <div className="mt-6">
                                        <div 
                                            ref={scrollContainerRef}
                                            className="flex overflow-x-auto pb-4 pt-2 px-2 -mx-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
                                        >
                                            {sortedHistory.slice(1).reverse().map((entry) => {
                                                const originalIndex = sortedHistory.findIndex(h => h.id === entry.id);
                                                return renderTimelineItemHorizontal(entry, originalIndex);
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhum histórico de alteração para esta operação.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default WatchlistPage;
