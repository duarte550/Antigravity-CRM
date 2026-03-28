
import React, { useState, useEffect } from 'react';
import type { TaskRule, TaskPriority } from '../types';
import { Label, Input, Select } from './UI';
import RichTextEditor from './RichTextEditor';

interface TaskRuleFormProps {
  onClose: () => void;
  onSave: (rule: Omit<TaskRule, 'id'>) => void;
  initialData?: TaskRule;
}

const TaskRuleForm: React.FC<TaskRuleFormProps> = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<TaskRule['frequency']>('Mensal');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Média');

  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
        setFrequency(initialData.frequency);
        setStartDate(initialData.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setEndDate(initialData.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : '');
        setDescription(initialData.description || '');
        setPriority(initialData.priority || 'Média');
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isoStart = new Date(startDate + 'T12:00:00').toISOString();
    const isoEnd = frequency === 'Pontual' ? isoStart : (endDate ? new Date(endDate + 'T12:00:00').toISOString() : isoStart);
    onSave({
      name,
      frequency,
      startDate: isoStart,
      endDate: isoEnd,
      description,
      priority,
    });
    onClose();
  };
  
  return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3">
                <Label htmlFor="name">Nome da Regra</Label>
                <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="md:col-span-1">
                <Label htmlFor="priority">Prioridade</Label>
                <Select id="priority" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="py-2 text-sm">
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Urgente">Urgente</option>
                </Select>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <Label htmlFor="frequency">Frequência</Label>
                <Select id="frequency" value={frequency} onChange={e => setFrequency(e.target.value as TaskRule['frequency'])}>
                    <option value="Pontual">Pontual</option>
                    <option value="Diário">Diário</option>
                    <option value="Semanal">Semanal</option>
                    <option value="Quinzenal">Quinzenal</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Trimestral">Trimestral</option>
                    <option value="Semestral">Semestral</option>
                    <option value="Anual">Anual</option>
                </Select>
            </div>
            <div>
                <Label htmlFor="startDate">{frequency === 'Pontual' ? 'Data da Tarefa' : 'Data de Início'}</Label>
                <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            {frequency !== 'Pontual' && (
                <div>
                    <Label htmlFor="endDate">Data de Fim</Label>
                    <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
            )}
        </div>
        <div>
            <Label htmlFor="description">Descrição</Label>
            <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="h-32"
            />
        </div>
         <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            {initialData ? 'Salvar Alterações' : 'Salvar Regra'}
          </button>
        </div>
      </form>
  );
};

export default TaskRuleForm;
