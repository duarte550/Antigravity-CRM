import React, { useState, useMemo } from 'react';
import { Operation, WatchlistStatus, RatingHistoryEntry } from '../types';
import { ArrowRightIcon } from './icons/Icons';

interface WatchlistSummaryProps {
  operations: Operation[];
}

const WatchlistSummary: React.FC<WatchlistSummaryProps> = ({ operations }) => {
  // Default to current month
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 7); // YYYY-MM
  });

  const movements = useMemo(() => {
    const [year, month] = selectedDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of the month

    const result: Record<WatchlistStatus, { entries: string[], exits: string[] }> = {
      [WatchlistStatus.VERDE]: { entries: [], exits: [] },
      [WatchlistStatus.AMARELO]: { entries: [], exits: [] },
      [WatchlistStatus.ROSA]: { entries: [], exits: [] },
      [WatchlistStatus.VERMELHO]: { entries: [], exits: [] },
    };

    operations.forEach(op => {
      // Sort history descending (newest first)
      const sortedHistory = [...op.ratingHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Find entries within the selected month
      const monthEntries = sortedHistory.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= startDate && entryDate <= endDate;
      });

      monthEntries.forEach(entry => {
        // Find the status *before* this entry
        // Since sortedHistory is descending, the "previous" entry is the one *after* the current one in the array
        const entryIndex = sortedHistory.findIndex(h => h.id === entry.id);
        const prevEntry = sortedHistory[entryIndex + 1];
        
        // If there is no previous entry in history, we assume the operation started with this status (or we don't know previous)
        // However, usually we only care about *changes*. 
        // If it's the very first entry ever, maybe it's an "Entry" to that status? 
        // Let's assume yes, if it's the first record, it entered that status.
        // But if we want "movements", maybe we only care if it changed from something else?
        // Let's assume if prevEntry exists, we check if status changed.
        // If prevEntry doesn't exist, it's an initialization, so it's an Entry to the current status.
        
        const prevStatus = prevEntry ? prevEntry.watchlist : null;
        const currentStatus = entry.watchlist;

        if (prevStatus !== currentStatus) {
            // It's a move!
            
            // Entry into currentStatus
            if (currentStatus) {
                result[currentStatus].entries.push(op.name);
            }

            // Exit from prevStatus (if it existed)
            if (prevStatus) {
                result[prevStatus].exits.push(op.name);
            }
        }
      });
    });

    return result;
  }, [operations, selectedDate]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const statusColors = {
    [WatchlistStatus.VERDE]: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    [WatchlistStatus.AMARELO]: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
    [WatchlistStatus.ROSA]: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800 text-pink-800 dark:text-pink-200',
    [WatchlistStatus.VERMELHO]: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  };

  const statusTitles = {
    [WatchlistStatus.VERDE]: 'Verde',
    [WatchlistStatus.AMARELO]: 'Amarelo',
    [WatchlistStatus.ROSA]: 'Rosa',
    [WatchlistStatus.VERMELHO]: 'Vermelho',
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 transition-colors duration-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Resumo de Movimentações</h2>
        <div className="flex items-center gap-2">
            <label htmlFor="month-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">Mês de Referência:</label>
            <input 
                type="month" 
                id="month-select"
                value={selectedDate} 
                onChange={handleMonthChange}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.values(WatchlistStatus).map(status => (
            <div key={status} className={`border rounded-lg p-4 ${statusColors[status]}`}>
                <h3 className="font-bold text-lg mb-3 border-b border-black/10 dark:border-white/10 pb-2">{statusTitles[status]}</h3>
                
                <div className="space-y-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Entradas</p>
                        {movements[status].entries.length > 0 ? (
                            <ul className="list-disc list-inside text-sm">
                                {movements[status].entries.map((name, idx) => (
                                    <li key={idx} className="truncate" title={name}>{name}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm opacity-50 italic">Nenhuma entrada</p>
                        )}
                    </div>
                    
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Saídas</p>
                        {movements[status].exits.length > 0 ? (
                            <ul className="list-disc list-inside text-sm">
                                {movements[status].exits.map((name, idx) => (
                                    <li key={idx} className="truncate" title={name}>{name}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm opacity-50 italic">Nenhuma saída</p>
                        )}
                    </div>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default WatchlistSummary;
