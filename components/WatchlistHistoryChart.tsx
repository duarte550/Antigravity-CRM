
import React, { useMemo, useState } from 'react';
import type { Operation } from '../types';
import { WatchlistStatus } from '../types';

interface WatchlistHistoryChartProps {
    operations: Operation[];
    defaultMonths?: number;
    hideControls?: boolean;
}

// Helper to get the last day of a given month
const getEndOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

// Corrected helper to get the watchlist status of an operation at a specific point in time
const getStatusForMonth = (operation: Operation, monthEndDate: Date): WatchlistStatus | null => {
    if (!operation.ratingHistory || operation.ratingHistory.length === 0) {
        return null;
    }

    // Find the earliest entry to determine creation date
    const creationEntry = operation.ratingHistory.reduce((earliest, current) => 
        new Date(current.date) < new Date(earliest.date) ? current : earliest
    );

    // If the month we are checking is before the operation was created, it had no status.
    if (monthEndDate < new Date(creationEntry.date)) {
        return null; 
    }

    const relevantHistory = operation.ratingHistory
        .filter(h => new Date(h.date) <= monthEndDate)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Find the most recent entry that has a valid watchlist status (ignoring nulls/undefined)
    // This ensures "forward fill" behavior: if a month has no watchlist change (or a null change),
    // it inherits the previous valid status.
    const lastValidEntry = relevantHistory.find(h => h.watchlist);

    return lastValidEntry ? lastValidEntry.watchlist : (creationEntry.watchlist || null);
};

const TimePeriodButton: React.FC<{
    label: string;
    value: number;
    currentValue: number;
    onClick: (value: number) => void;
}> = ({ label, value, currentValue, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
            currentValue === value 
            ? 'bg-blue-600 text-white shadow' 
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
        }`}
    >
        {label}
    </button>
);


const WatchlistHistoryChart: React.FC<WatchlistHistoryChartProps> = ({ operations, defaultMonths = 4, hideControls = false }) => {
    const [monthsToShow, setMonthsToShow] = useState(defaultMonths);
    const [filterStatus, setFilterStatus] = useState<WatchlistStatus | 'All'>('All');
    const [searchTerm, setSearchTerm] = useState('');

    const months = useMemo(() => {
        const monthLabels: { name: string; endDate: Date }[] = [];
        const today = new Date();
        for (let i = monthsToShow - 1; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            monthLabels.push({
                name: date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
                endDate: getEndOfMonth(date),
            });
        }
        return monthLabels;
    }, [monthsToShow]);

    const chartData = useMemo(() => {
        const statusOrder: Record<string, number> = {
            [WatchlistStatus.VERMELHO]: 0,
            [WatchlistStatus.ROSA]: 1,
            [WatchlistStatus.AMARELO]: 2,
            [WatchlistStatus.VERDE]: 3,
        };

        return operations
            .filter(op => {
                const currentStatus = (op.ratingHistory.length > 0
                    ? [...op.ratingHistory].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0].watchlist
                    : op.watchlist) || WatchlistStatus.VERDE;
                
                const matchesStatus = filterStatus === 'All' || currentStatus === filterStatus;
                const matchesSearch = op.name.toLowerCase().includes(searchTerm.toLowerCase());
                
                return matchesStatus && matchesSearch;
            })
            .sort((a, b) => {
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
            })
            .map(op => ({
                operationName: op.name,
                statuses: months.map(month => getStatusForMonth(op, month.endDate)),
            }));
    }, [operations, months, filterStatus, searchTerm]);

    const statusColorClasses: Record<WatchlistStatus, string> = {
        [WatchlistStatus.VERDE]: 'bg-green-500',
        [WatchlistStatus.AMARELO]: 'bg-yellow-400',
        [WatchlistStatus.ROSA]: 'bg-pink-500',
        [WatchlistStatus.VERMELHO]: 'bg-red-600',
    };

    if (operations.length === 0) {
        return <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma operação para exibir no gráfico.</p>;
    }

    return (
        <div>
            {!hideControls && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                     <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Histórico Mensal de Watchlist</h2>
                     
                     <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                        {/* Search Input */}
                        <input
                            type="text"
                            placeholder="Buscar operação..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                        />

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as WatchlistStatus | 'All')}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="All">Todos os Faróis</option>
                            <option value={WatchlistStatus.VERMELHO}>Vermelho</option>
                            <option value={WatchlistStatus.ROSA}>Rosa</option>
                            <option value={WatchlistStatus.AMARELO}>Amarelo</option>
                            <option value={WatchlistStatus.VERDE}>Verde</option>
                        </select>

                        {/* Time Period Buttons */}
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                            <TimePeriodButton label="3M" value={3} currentValue={monthsToShow} onClick={setMonthsToShow} />
                            <TimePeriodButton label="4M" value={4} currentValue={monthsToShow} onClick={setMonthsToShow} />
                            <TimePeriodButton label="6M" value={6} currentValue={monthsToShow} onClick={setMonthsToShow} />
                            <TimePeriodButton label="12M" value={12} currentValue={monthsToShow} onClick={setMonthsToShow} />
                        </div>
                     </div>
                </div>
            )}

            <div className="overflow-x-auto p-2 border dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-800/50">
                <div className="inline-block min-w-full">
                    <div className="grid gap-x-4 items-center" style={{ gridTemplateColumns: `minmax(200px, 1.5fr) repeat(${months.length}, minmax(80px, 1fr))` }}>
                        {/* Header */}
                        <div className="font-bold text-gray-700 dark:text-gray-300 pb-3 border-b border-gray-300 dark:border-gray-600">Operação</div>
                        {months.map(month => (
                            <div key={month.name} className="font-bold text-gray-700 dark:text-gray-300 text-center pb-3 border-b border-gray-300 dark:border-gray-600 capitalize text-sm">{month.name}</div>
                        ))}

                        {/* Body */}
                        {chartData.length > 0 ? (
                            chartData.map(({ operationName, statuses }) => (
                                <React.Fragment key={operationName}>
                                    <div className="py-3 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-4" title={operationName}>{operationName}</div>
                                    {statuses.map((status, index) => (
                                        <div key={index} className="py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center">
                                            {status ? (
                                                <div 
                                                    className={`w-5 h-5 rounded-full border border-black/10 dark:border-white/10 shadow-sm ${statusColorClasses[status]}`} 
                                                    title={status}
                                                ></div>
                                            ) : (
                                                <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" title="Sem dados"></div>
                                            )}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))
                        ) : (
                            <div className="col-span-full py-8 text-center text-gray-500 dark:text-gray-400 italic">
                                Nenhuma operação encontrada com os filtros atuais.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WatchlistHistoryChart;
