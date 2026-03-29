
import React, { useState, useEffect } from 'react';
import type { TaskRule, Task, TaskPriority, TaskChecklistItem } from '../types';
import { Label, Input } from './UI';
import RichTextEditor from './RichTextEditor';
import { PlusCircleIcon, TrashIcon } from './icons/Icons';

interface AdHocTaskFormProps {
  onClose: () => void;
  onSave: (rule: Omit<TaskRule, 'id'>) => void;
  initialTask?: Task;
  analysts?: string[];
  defaultAnalyst?: string;
}

const AdHocTaskForm: React.FC<AdHocTaskFormProps> = ({ onClose, onSave, initialTask, analysts = [], defaultAnalyst }) => {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [noDeadline, setNoDeadline] = useState(false);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Média');
  const [checklistItems, setChecklistItems] = useState<Partial<TaskChecklistItem>[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [showAdditionalAssignees, setShowAdditionalAssignees] = useState(false);

  // Initialize default analyst
  useEffect(() => {
    if (!initialTask && defaultAnalyst && selectedAssignees.length === 0) {
      setSelectedAssignees([defaultAnalyst]);
    }
  }, [defaultAnalyst]);

  useEffect(() => {
    if (initialTask) {
        setName(initialTask.ruleName);
        if (initialTask.dueDate) {
            setDueDate(new Date(initialTask.dueDate).toISOString().split('T')[0]);
            setNoDeadline(false);
        } else {
            setNoDeadline(true);
        }
        setDescription('');
        setPriority(initialTask.priority || 'Média');
        setChecklistItems(initialTask.checklistItems || []);
        const taskAssignees = initialTask.assignees || [];
        setSelectedAssignees(taskAssignees);
        setShowAdditionalAssignees(taskAssignees.length > 1);
    }
  }, [initialTask]);

  const handleAddChecklistItem = () => {
    if (!newChecklistTitle.trim()) return;
    setChecklistItems(prev => [...prev, {
      id: Date.now(),
      title: newChecklistTitle.trim(),
      isCompleted: false,
      orderIndex: prev.length
    }]);
    setNewChecklistTitle('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleAssignee = (analyst: string) => {
    setSelectedAssignees(prev => 
      prev.includes(analyst)
        ? prev.filter(a => a !== analyst)
        : [...prev, analyst]
    );
  };

  // Other analysts (excluding the default one)
  const otherAnalysts = analysts.filter(a => a !== defaultAnalyst);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isoDate = noDeadline ? null : new Date(dueDate + 'T12:00:00').toISOString();
    onSave({
      name,
      frequency: noDeadline ? 'Sem Prazo' : 'Pontual',
      startDate: isoDate as any,
      endDate: isoDate as any,
      description,
      priority,
      checklistItems: checklistItems as TaskChecklistItem[],
      assignees: selectedAssignees.length > 0 ? selectedAssignees : undefined,
    });
    onClose();
  };
  
  return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Name + Date + Priority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="adhoc-name">Nome da Tarefa</Label>
                <Input id="adhoc-name" type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="adhoc-dueDate">Vencimento</Label>
                    {noDeadline ? (
                      <div className="flex items-center h-[38px] px-3 bg-gray-100 dark:bg-gray-700/50 rounded-md border border-gray-300 dark:border-gray-600">
                        <span className="text-sm text-gray-400 dark:text-gray-500 italic">Sem prazo</span>
                      </div>
                    ) : (
                      <Input 
                          id="adhoc-dueDate" 
                          type="date" 
                          value={dueDate} 
                          onChange={e => setDueDate(e.target.value)} 
                          required={!noDeadline}
                      />
                    )}
                    <label 
                      htmlFor="no-deadline" 
                      className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none group"
                    >
                      <input 
                          type="checkbox" 
                          id="no-deadline" 
                          checked={noDeadline} 
                          onChange={e => setNoDeadline(e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700 w-3.5 h-3.5"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">Sem prazo definido</span>
                    </label>
                </div>
                <div>
                    <Label htmlFor="adhoc-priority">Prioridade</Label>
                    <select 
                        id="adhoc-priority"
                        value={priority} 
                        onChange={e => setPriority(e.target.value as TaskPriority)} 
                        className="w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                        <option value="Baixa">Baixa</option>
                        <option value="Média">Média</option>
                        <option value="Alta">Alta</option>
                        <option value="Urgente">Urgente</option>
                    </select>
                </div>
            </div>
        </div>

        {/* Assignee Section */}
        {defaultAnalyst && (
          <div>
            <Label htmlFor="adhoc-assignees">Responsável</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                selectedAssignees.includes(defaultAnalyst) 
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 line-through'
              }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {defaultAnalyst}
              </div>
              
              {/* Additional assignees badges */}
              {selectedAssignees.filter(a => a !== defaultAnalyst).map(analyst => (
                <div key={analyst} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {analyst.split(' ')[0]}
                  <button
                    type="button"
                    onClick={() => handleToggleAssignee(analyst)}
                    className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              ))}

              {/* Toggle "add more people" */}
              {otherAnalysts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdditionalAssignees(!showAdditionalAssignees)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  {showAdditionalAssignees ? 'Fechar' : 'Adicionar pessoas'}
                </button>
              )}
            </div>

            {/* Expandable other analysts */}
            {showAdditionalAssignees && otherAnalysts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {otherAnalysts.map(analyst => (
                  <button
                    key={analyst}
                    type="button"
                    onClick={() => handleToggleAssignee(analyst)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                      selectedAssignees.includes(analyst)
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    {selectedAssignees.includes(analyst) && (
                      <svg className="w-3 h-3 inline mr-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    )}
                    {analyst}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fallback: no default analyst (general task mode) */}
        {!defaultAnalyst && analysts.length > 0 && (
          <div>
            <Label htmlFor="adhoc-assignees">Atribuir a</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {analysts.map(analyst => (
                <button
                  key={analyst}
                  type="button"
                  onClick={() => handleToggleAssignee(analyst)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    selectedAssignees.includes(analyst)
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  {selectedAssignees.includes(analyst) && (
                    <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  )}
                  {analyst}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Checklist Items */}
        <div>
          <Label htmlFor="adhoc-checklist">Itens de Checklist (sub-tarefas)</Label>
          <div className="space-y-2 mt-1">
            {checklistItems.map((item, index) => (
              <div key={item.id || index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 group">
                <div className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                  {item.isCompleted && (
                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  )}
                </div>
                <span className={`flex-1 text-sm ${item.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                  {item.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveChecklistItem(index)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddChecklistItem(); } }}
                placeholder="Adicionar item de checklist..."
                className="flex-1 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5 px-3 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                disabled={!newChecklistTitle.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm disabled:opacity-40 transition-colors"
              >
                <PlusCircleIcon className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          </div>
        </div>

        <div>
            <Label htmlFor="adhoc-description">Descrição</Label>
            <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="h-32"
            />
        </div>
         <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            {initialTask ? 'Salvar Alterações' : 'Salvar Tarefa'}
          </button>
        </div>
      </form>
  );
};

export default AdHocTaskForm;
