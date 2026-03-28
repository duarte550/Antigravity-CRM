
import React, { useState } from 'react';
import type { Operation } from '../types';
import { Page } from '../types';
import { WarningIcon, ChevronDownIcon, ChevronUpIcon } from './icons/Icons';

interface OverdueOperationsHighlightProps {
  operations: Operation[];
  onNavigate: (page: Page, operationId?: number) => void;
}

const OverdueOperationsHighlight: React.FC<OverdueOperationsHighlightProps> = ({ operations, onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const overdueOperations = React.useMemo(() => {
    return operations
      .filter(op => op.overdueCount > 0)
      .sort((a, b) => b.overdueCount - a.overdueCount);
  }, [operations]);

  if (overdueOperations.length === 0) {
    return null;
  }

  const totalOverdue = overdueOperations.reduce((acc, op) => acc + op.overdueCount, 0);

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-500/50 text-red-800 dark:text-red-400 rounded-md shadow-sm mb-6 overflow-hidden transition-all duration-300" role="alert">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg">
            <WarningIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-red-900 dark:text-red-300">Atenção: {totalOverdue} tarefas atrasadas em {overdueOperations.length} operações</p>
            {!isExpanded && <p className="text-xs text-red-700 dark:text-red-400">Clique para ver detalhes</p>}
          </div>
        </div>
        <button className="p-1 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-full transition-colors">
          {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-red-200 dark:border-red-900/30 bg-white/50 dark:bg-gray-800/50">
          <ul className="mt-3 space-y-2">
            {overdueOperations.map(op => (
              <li key={op.id} className="flex items-center justify-between text-sm p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 dark:bg-red-400 rounded-full"></span>
                  <span className="font-medium">{op.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-red-600 dark:text-red-400 font-bold">{op.overdueCount} atrasos</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(Page.DETAIL, op.id);
                    }} 
                    className="text-xs bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 px-2 py-1 rounded font-semibold transition-colors"
                  >
                    Ver Operação
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OverdueOperationsHighlight;
