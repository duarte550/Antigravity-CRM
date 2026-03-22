
import React, { useState, useMemo } from 'react';
import type { Operation } from '../types';
import { Page } from '../types';
import { EyeIcon, SearchIcon, ArchiveIcon } from './icons/Icons';
import Modal from './Modal';

interface LegacyPageProps {
  operations: Operation[];
  onNavigate: (page: Page, operationId?: number) => void;
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => Promise<void>;
}

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
        return 'Erro';
    }
};

const LegacyPage: React.FC<LegacyPageProps> = ({ operations, onNavigate, onUpdateOperation }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLegacy = useMemo(() => {
    return operations.filter(op => 
      op.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.responsibleAnalyst.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.maturityDate).getTime() - new Date(a.maturityDate).getTime());
  }, [operations, searchTerm]);

  const [opToReactivate, setOpToReactivate] = useState<Operation | null>(null);

  const handleReactivate = async () => {
    if (opToReactivate) {
      await onUpdateOperation({ ...opToReactivate, status: 'Ativa', movedToLegacyDate: undefined });
      setOpToReactivate(null);
    }
  };

  return (
    <div className="space-y-6">
      {opToReactivate && (
        <Modal 
            isOpen={true} 
            onClose={() => setOpToReactivate(null)} 
            title="Reativar Operação"
        >
            <div className="text-center p-4">
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                    Tem certeza que deseja reativar a operação <strong>{opToReactivate.name}</strong>?
                </p>
                <div className="flex justify-center gap-4">
                    <button 
                        onClick={() => setOpToReactivate(null)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleReactivate}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                    >
                        Confirmar Reativação
                    </button>
                </div>
            </div>
        </Modal>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArchiveIcon className="w-7 h-7 text-gray-500" />
            Operações Legado
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Histórico de operações encerradas ou maturadas.</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            placeholder="Buscar por nome ou analista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Operação</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Área</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Analista</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Movido em</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Maturidade</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLegacy.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Nenhuma operação legado encontrada.
                  </td>
                </tr>
              ) : (
                filteredLegacy.map((op) => (
                  <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{op.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{op.operationType}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${
                        op.area === 'CRI' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      }`}>
                        {op.area}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {op.responsibleAnalyst}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(op.movedToLegacyDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(op.maturityDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button
                        onClick={() => onNavigate(Page.DETAIL, op.id)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 inline-flex items-center gap-1"
                        title="Ver Detalhes"
                      >
                        <EyeIcon className="w-4 h-4" /> Detalhes
                      </button>
                      <button
                        onClick={() => setOpToReactivate(op)}
                        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 inline-flex items-center gap-1"
                        title="Reativar Operação"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Reativar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LegacyPage;
