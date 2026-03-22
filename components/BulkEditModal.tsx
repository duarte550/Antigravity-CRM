import React, { useState, useEffect } from 'react';
import type { Operation, Area, Rating } from '../types';
import { WatchlistStatus, ratingOptions } from '../types';
import Modal from './Modal';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  operations: Operation[];
  onSaveBulk: (updatedOperations: Operation[]) => Promise<void>;
}

const BulkEditModal: React.FC<BulkEditModalProps> = ({ isOpen, onClose, operations, onSaveBulk }) => {
  const [editedOps, setEditedOps] = useState<Record<number, Partial<Operation>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditedOps({});
    }
  }, [isOpen]);

  const handleFieldChange = (opId: number, field: keyof Operation, value: any) => {
    setEditedOps(prev => ({
      ...prev,
      [opId]: {
        ...prev[opId],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const opsToUpdate = Object.keys(editedOps).map(idStr => {
      const id = parseInt(idStr, 10);
      const originalOp = operations.find(o => o.id === id);
      if (!originalOp) return null;
      return { ...originalOp, ...editedOps[id] };
    }).filter(Boolean) as Operation[];

    if (opsToUpdate.length > 0) {
      await onSaveBulk(opsToUpdate);
    }
    setIsSaving(false);
    onClose();
  };

  const hasChanges = Object.keys(editedOps).length > 0;

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edição em Lote de Operações" maxWidth="max-w-7xl">
      <div className="flex flex-col h-[70vh]">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Operação</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Área</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Segmento</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Analista</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Rating Op.</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Rating Grupo</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Watchlist</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {operations.map(op => {
                const currentOp = { ...op, ...(editedOps[op.id] || {}) };
                const isEdited = !!editedOps[op.id];
                
                return (
                  <tr key={op.id} className={isEdited ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                      {op.name}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select 
                        value={currentOp.area} 
                        onChange={e => handleFieldChange(op.id, 'area', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="CRI">CRI</option>
                        <option value="Capital Solutions">Capital Solutions</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input 
                        type="text" 
                        value={currentOp.segmento || ''} 
                        onChange={e => handleFieldChange(op.id, 'segmento', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input 
                        type="text" 
                        value={currentOp.responsibleAnalyst} 
                        onChange={e => handleFieldChange(op.id, 'responsibleAnalyst', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input 
                        type="date" 
                        value={currentOp.maturityDate ? currentOp.maturityDate.split('T')[0] : ''} 
                        onChange={e => handleFieldChange(op.id, 'maturityDate', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select 
                        value={currentOp.ratingOperation} 
                        onChange={e => handleFieldChange(op.id, 'ratingOperation', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select 
                        value={currentOp.ratingGroup} 
                        onChange={e => handleFieldChange(op.id, 'ratingGroup', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select 
                        value={currentOp.watchlist} 
                        onChange={e => handleFieldChange(op.id, 'watchlist', e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {Object.values(WatchlistStatus).map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-between items-center border-t pt-4">
          <div className="text-sm text-gray-500">
            {Object.keys(editedOps).length} operação(ões) modificada(s).
          </div>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BulkEditModal;
