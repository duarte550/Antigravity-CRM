
import React, { useState, useEffect, useMemo } from 'react';
import type { Operation, TaskRule, Task } from '../types';
import { Page, TaskStatus } from '../types';
import Modal from './Modal';
import TaskRuleForm from './TaskRuleForm';
import AdHocTaskForm from './AdHocTaskForm';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  operations: Operation[];
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => void;
  onAddGeneralTask?: (analystName: string, rule: Omit<TaskRule, 'id'>) => void;
  preselectedOperationId?: number;
  preselectedAnalyst?: string;
}

const RATING_TO_POLITICA_FREQUENCY: Record<string, string> = {
    'A4': 'Anual', 'Baa1': 'Anual', 'Baa3': 'Anual', 'Baa4': 'Anual',
    'Ba1': 'Anual', 'Ba4': 'Anual', 'Ba5': 'Anual', 'Ba6': 'Anual',
    'B1': 'Semestral', 'B2': 'Semestral', 'B3': 'Semestral',
    'C1': 'Semestral', 'C2': 'Semestral', 'C3': 'Semestral',
};

const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, operations, onUpdateOperation, onAddGeneralTask, preselectedOperationId, preselectedAnalyst }) => {
  const [operationId, setOperationId] = useState<number | null>(null);
  const [formType, setFormType] = useState<'pontual' | 'recorrente'>('pontual');
  const [templateData, setTemplateData] = useState<TaskRule | undefined>(undefined);
  const [taskMode, setTaskMode] = useState<'operation' | 'general'>('operation');
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>('');

  const uniqueAnalysts = useMemo(() => {
    const analysts = new Set<string>();
    operations.forEach(op => {
        if (op.responsibleAnalyst) analysts.add(op.responsibleAnalyst);
    });
    return Array.from(analysts).sort();
  }, [operations]);

  const selectedOperation = useMemo(() => {
    return operations.find(op => op.id === operationId);
  }, [operationId, operations]);

  const handleSaveTaskRule = (rule: Omit<TaskRule, 'id'>) => {
    if (taskMode === 'general') {
        if (!selectedAnalyst || !onAddGeneralTask) return;
        onAddGeneralTask(selectedAnalyst, rule);
        onClose();
        return;
    }

    if (!operationId) return;
    const opToUpdate = operations.find(op => op.id === operationId);
    if (opToUpdate) {
        const ruleId = Date.now();
        const newRule = { ...rule, id: ruleId };
        
        // Optimistic Task for 'Pontual' or 'Sem Prazo' rules
        let updatedTasks = opToUpdate.tasks || [];
        if (rule.frequency === 'Pontual' || rule.frequency === 'Sem Prazo') {
            const optimisticTask: Task = {
                id: `opt-${ruleId}`,
                operationId: opToUpdate.id,
                ruleId: ruleId,
                ruleName: rule.name,
                dueDate: rule.startDate || undefined,
                status: TaskStatus.PENDING,
                priority: rule.priority,
                notes: rule.description,
                checklistItems: rule.checklistItems || [],
                assignees: rule.assignees || []
            };
            updatedTasks = [...updatedTasks, optimisticTask];
        }

        const updatedOp = {
            ...opToUpdate,
            taskRules: [...opToUpdate.taskRules, newRule],
            tasks: updatedTasks
        };
        onUpdateOperation(updatedOp);
    }
    onClose();
  };
  
  useEffect(() => {
      if (isOpen) {
          setOperationId(preselectedOperationId ?? null);
          setFormType('pontual'); // Reset to default tab when opening
          setTemplateData(undefined);
          setTaskMode(preselectedOperationId ? 'operation' : (preselectedAnalyst ? 'general' : 'operation'));
          setSelectedAnalyst(preselectedAnalyst ?? '');
      } else {
          // Delay reset to prevent form disappearing before modal closes
          setTimeout(() => {
              setOperationId(null);
              setTemplateData(undefined);
              setTaskMode('operation');
              setSelectedAnalyst('');
          }, 200); 
      }
  }, [isOpen, preselectedOperationId, preselectedAnalyst]);
  
  const title = taskMode === 'general' 
    ? "Adicionar Tarefa Geral"
    : selectedOperation 
        ? `Adicionar Tarefa para: ${selectedOperation.name}` 
        : "Adicionar Nova Tarefa";

  const TabButton: React.FC<{isActive: boolean, onClick: () => void, children: React.ReactNode}> = ({ isActive, onClick, children }) => (
      <button
        type="button"
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border ${isActive ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 border-b-transparent dark:border-b-transparent text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-900 border-transparent border-b-gray-300 dark:border-b-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        style={{ marginBottom: '-1px' }}
      >
        {children}
      </button>
  );

  const handleTemplateSelect = (value: string) => {
      if (!selectedOperation) return;
      
      const today = new Date().toISOString().split('T')[0];
      const maturity = selectedOperation.maturityDate ? selectedOperation.maturityDate.split('T')[0] : today;
      
      let newTemplate: Partial<TaskRule> = {
          startDate: today,
          endDate: maturity,
      };

      switch (value) {
          case 'gerencial':
              newTemplate = { ...newTemplate, name: 'Revisão Gerencial', frequency: selectedOperation.reviewFrequency as any, description: 'Revisão periódica gerencial.' };
              break;
          case 'politica':
               const freq = RATING_TO_POLITICA_FREQUENCY[selectedOperation.ratingGroup] || 'Anual';
               newTemplate = { ...newTemplate, name: 'Revisão Política', frequency: freq as any, description: 'Revisão de política de crédito anual.' };
               break;
          case 'call':
              newTemplate = { ...newTemplate, name: 'Call de Acompanhamento', frequency: selectedOperation.callFrequency as any, description: 'Call de acompanhamento.' };
              break;
          case 'dfs':
              newTemplate = { ...newTemplate, name: 'Análise de DFs & Dívida', frequency: selectedOperation.dfFrequency as any, description: 'Análise dos DFs.' };
              break;
          case 'news':
              newTemplate = { ...newTemplate, name: 'Monitorar Notícias', frequency: 'Semanal', description: 'Acompanhar notícias.' };
              break;
          case 'fiiReport':
              newTemplate = { ...newTemplate, name: 'Verificar Relatório FII', frequency: 'Mensal', description: 'Verificar relatório mensal do FII.' };
              break;
          case 'operationalInfo':
              newTemplate = { ...newTemplate, name: 'Info Operacional', frequency: 'Mensal', description: 'Coletar e analisar informações operacionais.' };
              break;
          case 'receivablesPortfolio':
              newTemplate = { ...newTemplate, name: 'Carteira de Recebíveis', frequency: 'Mensal', description: 'Análise da carteira de recebíveis.' };
              break;
          case 'monthlyConstructionReport':
              newTemplate = { ...newTemplate, name: 'Relatório Mensal de Obra', frequency: 'Mensal', description: 'Acompanhamento do relatório de obra.' };
              break;
          case 'monthlyCommercialInfo':
              newTemplate = { ...newTemplate, name: 'Info Comercial Mensal', frequency: 'Mensal', description: 'Acompanhamento comercial mensal.' };
              break;
          case 'speDfs':
              newTemplate = { ...newTemplate, name: 'DFs da SPE', frequency: 'Anual', description: 'Coleta e análise das DFs da SPE.' };
              break;
          default:
              setTemplateData(undefined);
              return;
      }
      // We cast to TaskRule because the form uses it for initial state, but doesn't strictly require ID for that purpose
      setTemplateData(newTemplate as TaskRule);
  };

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose}>
      <div className="space-y-4">
        {!preselectedOperationId && (
            <div className="mb-4 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="taskMode" 
                        value="operation" 
                        checked={taskMode === 'operation'} 
                        onChange={() => setTaskMode('operation')} 
                        className="text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarefa de Operação</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="taskMode" 
                        value="general" 
                        checked={taskMode === 'general'} 
                        onChange={() => setTaskMode('general')} 
                        className="text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarefa Geral (Por Analista)</span>
                </label>
            </div>
        )}

        {!preselectedOperationId && taskMode === 'operation' && (
            <div className="mb-4">
                <label htmlFor="op-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">1. Selecione a Operação</label>
                <select
                    id="op-select"
                    value={operationId ?? ''}
                    onChange={e => setOperationId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                    <option value="">-- Por favor, escolha uma operação --</option>
                    {operations.filter(op => op.operationType !== 'Geral').map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                </select>
            </div>
        )}

        {taskMode === 'general' && (
            <div className="mb-4">
                <label htmlFor="analyst-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">1. Selecione o Analista</label>
                <select
                    id="analyst-select"
                    value={selectedAnalyst}
                    onChange={e => setSelectedAnalyst(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                    <option value="">-- Por favor, escolha um analista --</option>
                    {uniqueAnalysts.map(analyst => <option key={analyst} value={analyst}>{analyst}</option>)}
                </select>
            </div>
        )}

        {(operationId || (taskMode === 'general' && selectedAnalyst)) && (
            <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {preselectedOperationId ? 'Defina a Tarefa' : '2. Defina a Tarefa'}
                 </label>
                
                 <div className="flex border-b border-gray-300 dark:border-gray-700">
                    <TabButton isActive={formType === 'pontual'} onClick={() => setFormType('pontual')}>
                        Tarefa Pontual
                    </TabButton>
                    <TabButton isActive={formType === 'recorrente'} onClick={() => setFormType('recorrente')}>
                        Tarefa Recorrente (Regra)
                    </TabButton>
                 </div>

                <div className="p-4 border border-t-0 border-gray-300 dark:border-gray-700 rounded-b-md bg-white dark:bg-gray-800">
                     {formType === 'pontual' && (
                        <AdHocTaskForm
                            onClose={onClose}
                            onSave={handleSaveTaskRule}
                            analysts={uniqueAnalysts}
                            defaultAnalyst={selectedOperation?.responsibleAnalyst}
                        />
                     )}
                     {formType === 'recorrente' && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800/50">
                                <label className="block text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase mb-1">
                                    Carregar Modelo Padrão (Opcional)
                                </label>
                                <select 
                                    className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    onChange={(e) => handleTemplateSelect(e.target.value)}
                                    value=""
                                >
                                    <option value="" disabled>Selecione para preencher automaticamente...</option>
                                    <option value="gerencial">Revisão Gerencial</option>
                                    <option value="politica">Revisão Política</option>
                                    <option value="call">Call de Acompanhamento</option>
                                    <option value="dfs">Análise de DFs & Dívida</option>
                                    <option value="news">Monitorar Notícias</option>
                                    <option value="fiiReport">Verificar Relatório FII</option>
                                    <option value="operationalInfo">Info Operacional</option>
                                    <option value="receivablesPortfolio">Carteira de Recebíveis</option>
                                    <option value="monthlyConstructionReport">Relatório Mensal de Obra</option>
                                    <option value="monthlyCommercialInfo">Info Comercial Mensal</option>
                                    <option value="speDfs">DFs da SPE</option>
                                </select>
                            </div>
                            <TaskRuleForm
                                onClose={onClose}
                                onSave={handleSaveTaskRule}
                                initialData={templateData}
                            />
                        </div>
                     )}
                </div>
           </div>
        )}
      </div>
    </Modal>
  );
};

export default NewTaskModal;