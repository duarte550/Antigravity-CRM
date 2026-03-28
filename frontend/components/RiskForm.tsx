
import React, { useState } from 'react';
import type { OperationRisk } from '../types';
import { Label, Input, Select, FormRow } from './UI';

interface RiskFormProps {
  onClose: () => void;
  onSave: (riskData: Omit<OperationRisk, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  initialData?: OperationRisk;
}

const RiskForm: React.FC<RiskFormProps> = ({ onClose, onSave, initialData }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [severity, setSeverity] = useState<'Baixa' | 'Média' | 'Alta'>(initialData?.severity || 'Média');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({ title, description, severity });
      onClose();
    } catch (error) {
      console.error("Error saving risk:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="risk-title">Título do Risco / Ponto de Atenção</Label>
        <Input
          id="risk-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Ex: Atraso na entrega do relatório mensal"
        />
      </div>
      <div>
        <Label htmlFor="risk-severity">Severidade</Label>
        <Select
          id="risk-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as any)}
        >
          <option value="Baixa">Baixa</option>
          <option value="Média">Média</option>
          <option value="Alta">Alta</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="risk-description">Descrição Detalhada (Opcional)</Label>
        <textarea
          id="risk-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          rows={3}
          placeholder="Descreva o risco e possíveis impactos..."
        />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isSaving ? 'Salvando...' : (initialData ? 'Atualizar' : 'Adicionar')}
        </button>
      </div>
    </form>
  );
};

export default RiskForm;
