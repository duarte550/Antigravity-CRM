import React, { useState, useEffect } from 'react';
import { Page, StructuringOperation, Event, Contact, StructuringOperationStage } from '../types';
import EventForm from './EventForm';
import OperationForm from './OperationForm';
import AdHocTaskForm from './AdHocTaskForm';
import AnalystSelect from './AnalystSelect';
import { TaskRule } from '../types';
import { fetchApi } from '../utils/api';

interface StructuringOperationDetailsPageProps {
  operationId: number;
  onNavigate: (page: Page, id?: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  pushToGenericQueue?: (url: string, method: string, payload: any) => void;
}

interface StructuringOperationFull extends StructuringOperation {
  events?: Event[];
  contacts?: Contact[];
}

const StructuringOperationDetailsPage: React.FC<StructuringOperationDetailsPageProps> = ({ operationId, onNavigate, apiUrl, showToast, pushToGenericQueue }) => {
  const [operation, setOperation] = useState<StructuringOperationFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [isEditingStages, setIsEditingStages] = useState(false);
  const [stagesDraft, setStagesDraft] = useState<StructuringOperationStage[]>([]);

  const [isEditingSeries, setIsEditingSeries] = useState(false);
  const [seriesDraft, setSeriesDraft] = useState<any[]>([]);
  
  const [isMigratingToActive, setIsMigratingToActive] = useState(false);
  const [stageToComplete, setStageToComplete] = useState<StructuringOperationStage | null>(null);
  const [selectedEventForModal, setSelectedEventForModal] = useState<Event | null>(null);
  const [isEditingAnalyst, setIsEditingAnalyst] = useState(false);
  const [analystDraft, setAnalystDraft] = useState('');

  useEffect(() => {
    fetchOperation();
  }, [operationId]);

  const fetchOperation = async () => {
    setIsLoading(true);
    try {
      const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}`);
      if (!response.ok) throw new Error('Falha ao buscar detalhes da operação em estruturação');
      const data = await response.json();
      setOperation(data);
      if (data.stages && data.stages.length > 0 && selectedStageId === null) {
        setSelectedStageId(data.stages[0].id);
      }
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar detalhes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEvent = async (eventData: Omit<Event, 'id'>) => {
    try {
      const payload = { ...eventData, structuringOperationStageId: selectedStageId };
      if (pushToGenericQueue) {
          pushToGenericQueue(`${apiUrl}/api/structuring-operations/${operationId}/events`, 'POST', payload);
          // Otimismo
          setOperation(prev => {
             if (!prev) return null;
             return { ...prev, events: [{ ...eventData, id: Date.now() } as any, ...(prev.events || [])] };
          });
      } else {
          const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error('Falha ao adicionar evento');
          await fetchOperation();
      }
      showToast('Evento adicionado', 'success');
      setIsEventModalOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Erro ao adicionar evento', 'error');
    }
  };

  const handleSaveTask = async (taskRule: Omit<TaskRule, 'id'>) => {
    if (!operation) return;
    try {
      const newTaskRule: TaskRule = {
          ...taskRule,
          structuringOperationStageId: selectedStageId || undefined,
          id: Date.now(),
      };
      
      const payload = {
        taskRules: [...(operation.taskRules || []), newTaskRule]
      };
      
      // Optimistic
      setOperation(prev => prev ? { ...prev, taskRules: payload.taskRules } : null);

      if (pushToGenericQueue) {
          pushToGenericQueue(`${apiUrl}/api/structuring-operations/${operationId}`, 'PUT', payload);
      } else {
          const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error('Falha ao adicionar tarefa');
      }
      showToast('Tarefa adicionada com sucesso', 'success');
      setIsTaskModalOpen(false);
    } catch (error) {
      showToast('Erro ao adicionar tarefa', 'error');
    }
  };

  const handleUpdateOperation = async (updates: Partial<StructuringOperation>) => {
    if (!operation) return;
    try {
      const payload = {
        name: operation.name,
        stage: operation.stage,
        liquidationDate: operation.liquidationDate,
        risk: operation.risk,
        temperature: operation.temperature,
        ...updates
      };
      
      setOperation(prev => prev ? { ...prev, ...updates } : null); // Optimistic

      if (pushToGenericQueue) {
          pushToGenericQueue(`${apiUrl}/api/structuring-operations/${operationId}`, 'PUT', payload);
      } else {
          const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error('Falha ao atualizar operação');
      }
      showToast('Operação atualizada', 'success');
      setIsEditingSeries(false);
    } catch (error) {
      showToast('Erro ao atualizar operação', 'error');
    }
  };

  const handleDeleteOperation = async () => {
    if (!confirm('Tem certeza que deseja DELETAR esta operação estruturada? Esta ação não pode ser desfeita.')) return;
    try {
       const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}`, {
         method: 'DELETE',
       });
       if (!response.ok) throw new Error('Falha ao deletar operação');
       showToast('Operação deletada', 'success');
       onNavigate(Page.ORIGINATION_PIPELINE);
    } catch (e) {
       showToast('Erro ao deletar operação', 'error');
    }
  };

  const handleSaveStages = async () => {
    try {
      const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}/stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages: stagesDraft.map((s, i) => ({ ...s, order_index: i })) }),
      });
      if (!response.ok) throw new Error('Falha ao atualizar etapas');
      await fetchOperation();
      showToast('Etapas atualizadas!', 'success');
      setIsEditingStages(false);
    } catch (e) {
      showToast('Erro ao salvar etapas', 'error');
    }
  };

  const toggleStageCompletion = async (stage: StructuringOperationStage) => {
    if (!stage.isCompleted && (stage.name.toLowerCase() === 'liquidação' || stage.name.toLowerCase().includes('liquid'))) {
       setStageToComplete(stage);
       setIsMigratingToActive(true);
       return;
    }

    const newStages = (operation?.stages || []).map(s => 
      s.id === stage.id ? { ...s, isCompleted: !s.isCompleted } : s
    );
    
    // Optimistic
    setOperation(prev => prev ? { ...prev, stages: newStages } : null);

    try {
      const payload = { stages: newStages };
      if (pushToGenericQueue) {
          pushToGenericQueue(`${apiUrl}/api/structuring-operations/${operationId}/stages`, 'PUT', payload);
      } else {
          const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}/stages`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error('Falha ao atualizar etapas');
          await fetchOperation();
      }

      // Auto-generate event if stage is being completed
      if (!stage.isCompleted) {
        const eventPayload = {
          title: `Etapa Concluída: ${stage.name}`,
          description: `A etapa '${stage.name}' foi marcada como concluída no Kanban.`,
          type: 'Atualização de Pipeline',
          date: new Date().toISOString(),
          isOrigination: true
        };
        if (pushToGenericQueue) {
            pushToGenericQueue(`${apiUrl}/api/structuring-operations/${operationId}/events`, 'POST', eventPayload);
            setOperation(prev => prev ? { ...prev, events: [{...eventPayload, id: Date.now()} as any, ...(prev.events || [])] } : null);
        } else {
            fetchApi(`${apiUrl}/api/structuring-operations/${operationId}/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(eventPayload),
            }).then(() => fetchOperation()).catch(console.error);
        }
        showToast(`Evento automático gerado: Etapa ${stage.name}`, 'success');
      }
    } catch (e) {
      showToast('Erro ao marcar etapa', 'error');
      // Rollback (simplified)
      fetchOperation();
    }
  };

  const handleSaveMigratedOperation = async (opData: any) => {
    if (!operation) return;
    try {
      // Create new active operation
      const payload = { ...opData, structuringOperationId: operationId };
      const response = await fetchApi(`${apiUrl}/api/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Falha ao migrar operação');
      const newActiveOperation = await response.json();
      
      // Update stage to completed
      const newStages = (operation.stages || []).map(s => 
        s.id === stageToComplete?.id ? { ...s, isCompleted: true } : s
      );
      await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}/stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages: newStages }),
      });
      
      // Archive structuring operation
      await fetchApi(`${apiUrl}/api/structuring-operations/${operationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...operation, isActive: false }),
      });

      showToast('Migração concluída com sucesso! Eventos transferidos.', 'success');
      onNavigate(Page.DETAIL, newActiveOperation.id);
    } catch (error) {
       console.error(error);
       showToast('Erro ao migrar operação para Ativa', 'error');
    } finally {
       setIsMigratingToActive(false);
       setStageToComplete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!operation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Operação não encontrada</h2>
        <button
          onClick={() => onNavigate(Page.ORIGINATION_PIPELINE)}
          className="text-blue-600 hover:text-blue-500 font-medium"
        >
          Voltar para Originação
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => onNavigate(Page.ORIGINATION_PIPELINE)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{operation.name}</h1>
                  <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/50">
                    Originação
                  </span>
                  <span className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm">
                    ID: {operation.id}
                  </span>
                </div>
              </div>
              <p className="text-gray-500 dark:text-gray-400 ml-8 text-sm">
                Grupo Pai: <button onClick={() => onNavigate(Page.MASTER_GROUP_DETAIL, operation.masterGroupId)} className="text-blue-600 hover:underline">{operation.masterGroupName}</button>
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedStageId(null); setIsTaskModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors bg-white dark:bg-gray-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Adicionar Tarefa
              </button>
              <button
                onClick={() => { setSelectedStageId(null); setIsEventModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                Adicionar Evento
              </button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div>
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Analista</p>
              {!isEditingAnalyst && (
                <button 
                  onClick={() => { setAnalystDraft(operation.analyst || ''); setIsEditingAnalyst(true); }} 
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Editar
                </button>
              )}
            </div>
            {isEditingAnalyst ? (
              <div className="flex flex-col gap-2 mt-1">
                <AnalystSelect
                  id="analyst-edit"
                  value={analystDraft}
                  onChange={setAnalystDraft}
                  apiUrl={apiUrl}
                  className="w-full text-sm"
                />
                <div className="flex gap-3 justify-end mt-1">
                  <button 
                    onClick={() => setIsEditingAnalyst(false)} 
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => { 
                      handleUpdateOperation({ analyst: analystDraft }); 
                      setIsEditingAnalyst(false); 
                    }} 
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {operation.analyst || 'Não informado'}
                </p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Risco</p>
            <select
              value={operation.risk || ''}
              onChange={(e) => handleUpdateOperation({ risk: e.target.value })}
              className="mt-1 w-full text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Selecione...</option>
              <option value="High Grade">High Grade</option>
              <option value="High Yield">High Yield</option>
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Temperatura</p>
            <select
              value={operation.temperature || ''}
              onChange={(e) => handleUpdateOperation({ temperature: e.target.value })}
              className="mt-1 w-full text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Selecione...</option>
              <option value="Frio">Frio</option>
              <option value="Morno">Morno</option>
              <option value="Quente">Quente</option>
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Volume Total (R$ milhões)</p>
            {operation.series && operation.series.length > 0 ? (
                <p className="mt-1 font-semibold text-gray-900 dark:text-white text-lg">
                  R$ {(operation.series.reduce((acc, s) => acc + (s.volume || 0), 0)).toFixed(2)}M
                </p>
            ) : (
                <input
                  type="number"
                  value={''}
                  onChange={(e) => {
                     const newVol = Number(e.target.value);
                     handleUpdateOperation({ series: [{ name: 'Série Única', volume: newVol }] });
                  }}
                  className="mt-1 w-full text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Ex: 50"
                />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Etapas Concluídas</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white text-lg">
              {operation.stages?.filter(s => s.isCompleted).length || 0} / {operation.stages?.length || 0}
            </p>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 pb-6 pt-0 border-b border-gray-200 dark:border-gray-700 flex justify-end gap-3">
             {operation.isActive !== false ? (
                 <button onClick={() => handleUpdateOperation({ isActive: false })} className="text-sm px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded transition-colors dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20">
                     Inativar Operação (Cair)
                 </button>
             ) : (
                 <button onClick={() => handleUpdateOperation({ isActive: true })} className="text-sm px-3 py-1.5 border border-green-200 text-green-600 hover:bg-green-50 rounded transition-colors dark:border-green-900/50 dark:text-green-400 dark:hover:bg-green-900/20">
                     Reativar Operação
                 </button>
             )}
             <button onClick={handleDeleteOperation} className="text-sm px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded transition-colors shadow-sm font-medium">
                 Deletar Operação Definitivamente
             </button>
        </div>
      </div>

      {/* Secão Separada para Eventos Gerais */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                 <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                 Eventos Gerais / Ad-hoc
              </h2>
              <div className="flex gap-2">
                 <button onClick={() => { setSelectedStageId(null); setIsTaskModalOpen(true); }} className="text-xs font-semibold px-3 py-1.5 border border-indigo-200 text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase">
                    + Tarefa
                 </button>
                 <button onClick={() => { setSelectedStageId(null); setIsEventModalOpen(true); }} className="text-xs font-semibold px-3 py-1.5 border border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors uppercase">
                    + Evento
                 </button>
              </div>
          </div>
          <div className="space-y-3">
              {(() => {
                  const generalEvents = operation.events?.filter(e => !e.structuringOperationStageId) || [];
                  if (generalEvents.length === 0) return <div className="text-center py-4 text-gray-400 text-sm">Nenhum evento geral registrado.</div>;
                  return generalEvents.map(event => (
                      <div key={event.id} onClick={() => setSelectedEventForModal(event as any)} className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm relative group flex flex-col md:flex-row gap-4 items-start md:items-center justify-between cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all">
                           <div className="flex-1">
                               <div className="flex items-center gap-2 mb-1">
                                   <span className={`text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm ${event.completedTaskId ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                       {event.completedTaskId ? 'Tarefa Concluída' : event.type}
                                   </span>
                                   <time className="text-xs text-gray-500 dark:text-gray-400 font-medium">{new Date(event.date).toLocaleDateString()}</time>
                               </div>
                               <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-tight">{event.title}</h4>
                               <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{event.description}</p>
                           </div>
                           {(event.attentionPoints || event.nextSteps) && (
                               <div className="md:w-1/3 flex flex-col gap-1.5 w-full">
                                   {event.attentionPoints && <div className="text-[11px] bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 p-1.5 rounded"><span className="font-semibold">Alerta:</span> {event.attentionPoints}</div>}
                                   {event.nextSteps && <div className="text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 p-1.5 rounded"><span className="font-semibold">Próx. Passo:</span> {event.nextSteps}</div>}
                               </div>
                           )}
                      </div>
                  ));
              })()}
          </div>
      </div>

      {/* Kanban Pipeline */}
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kanban de Estruturação</h2>
              <span className="text-sm text-gray-500">Visualize todas as frentes, tarefas e eventos desta operação.</span>
            </div>
        </div>
        
        <div className="flex overflow-x-auto pb-4 space-x-4 min-h-[500px]">

            {operation.stages?.sort((a,b) => (a.order_index || 0) - (b.order_index || 0)).map((stage, idx) => {
                const stageEvents = operation.events?.filter(e => e.structuringOperationStageId === stage.id) || [];
                return (
                    <div key={idx} className={`flex-shrink-0 w-80 bg-gray-100/50 dark:bg-gray-800/40 rounded-xl border flex flex-col ${stage.isCompleted ? 'border-green-400 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex justify-between items-center ${stage.isCompleted ? 'bg-green-500 text-white rounded-t-xl' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-xl'}`}>
                            <h3 className={`font-bold text-md max-w-[65%] leading-tight ${stage.isCompleted ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`} title={stage.name}>
                                {stage.name}
                            </h3>
                            {stage.isCompleted ? (
                                <span className={`text-xs px-2 py-1.5 rounded font-semibold border transition-colors ${stage.isCompleted ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-500'}`}>
                                    Etapa Concluída
                                </span>
                            ) : (
                                <button onClick={() => toggleStageCompletion(stage)} className="text-xs px-2 py-1.5 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded font-semibold border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                    Concluir Etapa
                                </button>
                            )}
                        </div>
                        {/* Body */}
                        <div className="p-3 flex-1 overflow-y-auto space-y-3">
                            {stageEvents.map(event => (
                                <div key={event.id} onClick={() => setSelectedEventForModal(event as any)} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm relative group cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm ${event.completedTaskId ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                            {event.completedTaskId ? 'Tarefa Concluída' : event.type}
                                        </span>
                                        <time className="text-xs text-gray-500 dark:text-gray-400 font-medium">{new Date(event.date).toLocaleDateString()}</time>
                                    </div>
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-tight mb-1">{event.title}</h4>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{event.description}</p>
                                    
                                    {(event.attentionPoints || event.nextSteps) && (
                                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                                            {event.attentionPoints && <div className="text-[11px] bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 p-1.5 rounded line-clamp-2"><span className="font-semibold">Alerta:</span> {event.attentionPoints}</div>}
                                            {event.nextSteps && <div className="text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 p-1.5 rounded line-clamp-2"><span className="font-semibold">Próx. Passo:</span> {event.nextSteps}</div>}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {stageEvents.length === 0 && (
                                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                                    Nenhum evento registrado nesta etapa ainda.
                                </div>
                            )}
                            
                            <div className="flex gap-2 w-full mt-2">
                                <button 
                                    onClick={() => { setSelectedStageId(stage.id!); setIsTaskModalOpen(true); }}
                                    className="flex-1 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold tracking-wide text-indigo-600 dark:text-indigo-400 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors uppercase"
                                >
                                    + Tarefa
                                </button>
                                <button 
                                    onClick={() => { setSelectedStageId(stage.id!); setIsEventModalOpen(true); }}
                                    className="flex-1 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold tracking-wide text-emerald-600 dark:text-emerald-400 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors uppercase"
                                >
                                    + Evento
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {/* Grid Inferior de Metadados: Séries e Contatos lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Series List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-md font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Séries da Dívida
              </h2>
              {!isEditingSeries ? (
                  <button onClick={() => { 
                      const formattedDraft = (operation.series || []).map(s => ({
                          ...s,
                          rate: (s.rate && !isNaN(Number(s.rate))) ? (Number(s.rate) * 100).toFixed(2).replace('.', ',') : (s.rate || '')
                      }));
                      setSeriesDraft(formattedDraft); 
                      setIsEditingSeries(true); 
                  }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      Editar Séries
                  </button>
              ) : (
                  <div className="flex gap-2">
                      <button onClick={() => setIsEditingSeries(false)} className="text-xs text-gray-500 hover:underline">Cancelar</button>
                      <button onClick={() => {
                          const payloadSeries = seriesDraft.map(s => {
                              let dbRate = String(s.rate || '');
                              if (dbRate) {
                                  let rStr = dbRate.replace('%', '').trim().replace(',', '.');
                                  const num = Number(rStr);
                                  if (!isNaN(num)) {
                                      dbRate = (num / 100).toString();
                                  }
                              }
                              return { ...s, rate: dbRate };
                          });
                          handleUpdateOperation({ series: payloadSeries });
                      }} className="text-xs text-blue-600 font-bold hover:underline">Salvar</button>
                  </div>
              )}
            </div>
            <div className="p-4">
               {isEditingSeries ? (
                   <div className="space-y-4">
                       {seriesDraft.map((s, idx) => (
                           <div key={idx} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 relative">
                               <button onClick={() => setSeriesDraft(seriesDraft.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-red-500">✕</button>
                               <div className="grid grid-cols-2 gap-3">
                                   <div><p className="text-xs text-gray-500">Nome</p><input className="w-full text-sm border p-1 rounded" value={s.name || ''} onChange={(e) => { const n = [...seriesDraft]; n[idx].name = e.target.value; setSeriesDraft(n); }} /></div>
                                   <div><p className="text-xs text-gray-500">Indexador</p><input className="w-full text-sm border p-1 rounded" value={s.indexer || ''} onChange={(e) => { const n = [...seriesDraft]; n[idx].indexer = e.target.value; setSeriesDraft(n); }} /></div>
                                   <div><p className="text-xs text-gray-500">Taxa</p><input className="w-full text-sm border p-1 rounded" value={s.rate || ''} onChange={(e) => { const n = [...seriesDraft]; n[idx].rate = e.target.value; setSeriesDraft(n); }} placeholder="Ex: 9,20%" /></div>
                                   <div><p className="text-xs text-gray-500">Volume (R$ MM)</p><input type="number" className="w-full text-sm border p-1 rounded" value={s.volume || ''} onChange={(e) => { const n = [...seriesDraft]; n[idx].volume = Number(e.target.value); setSeriesDraft(n); }} /></div>
                                   <div className="col-span-2"><p className="text-xs text-gray-500">Fundo</p><input className="w-full text-sm border p-1 rounded" value={s.fund || ''} onChange={(e) => { const n = [...seriesDraft]; n[idx].fund = e.target.value; setSeriesDraft(n); }} /></div>
                               </div>
                           </div>
                       ))}
                       <button onClick={() => setSeriesDraft([...seriesDraft, { name: 'Nova Série', indexer: 'CDI', rate: '', volume: 0, fund: '' }])} className="w-full py-2 border-2 border-dashed rounded text-sm text-gray-500 hover:text-blue-500">+ Adicionar Opção de Série</button>
                       <button onClick={() => {
                          const payloadSeries = seriesDraft.map(s => {
                              let dbRate = String(s.rate || '');
                              if (dbRate) {
                                  let rStr = dbRate.replace('%', '').trim().replace(',', '.');
                                  const num = Number(rStr);
                                  if (!isNaN(num)) {
                                      dbRate = (num / 100).toString();
                                  }
                              }
                              return { ...s, rate: dbRate };
                          });
                          handleUpdateOperation({ series: payloadSeries });
                       }} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition">Salvar Alterações</button>
                   </div>
               ) : operation.series && operation.series.length > 0 ? (
                 <div className="space-y-4">
                   {operation.series.map((series, idx) => (
                     <div key={idx} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                       <div className="flex justify-between items-start mb-3">
                         <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{series.name}</h3>
                         <span className="text-sm font-medium px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-md">
                           {series.indexer || 'N/A'} {series.rate ? `+ ${!isNaN(Number(series.rate)) ? (Number(series.rate) * 100).toFixed(2).replace('.', ',') + '%' : series.rate}` : ''}
                         </span>
                       </div>
                       <div className="grid grid-cols-2 gap-4 text-sm">
                         <div>
                           <p className="text-gray-500 dark:text-gray-400">Volume</p>
                           <p className="font-medium text-gray-900 dark:text-white">
                             {series.volume ? `R$ ${(series.volume).toFixed(2)}M` : 'N/A'}
                           </p>
                         </div>
                         <div>
                           <p className="text-gray-500 dark:text-gray-400">Fundo</p>
                           <p className="font-medium text-gray-900 dark:text-white">{series.fund || 'Não informado'}</p>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-6 text-gray-500 dark:text-gray-400">Nenhuma série cadastrada. Clique em editar para adicionar.</div>
               )}
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-md font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Contatos do Grupo
              </h2>
            </div>
            <div className="p-0 max-h-[400px] overflow-y-auto">
              {operation.contacts && operation.contacts.length > 0 ? (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {operation.contacts.map((contact) => (
                    <li key={contact.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.name}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{contact.role}</p>
                        </div>
                        <div className="text-right text-sm">
                          {contact.email && <p className="text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{contact.email}</p>}
                          {contact.phone && <p className="text-gray-500 dark:text-gray-400">{contact.phone}</p>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhum contato cadastrado no Master Group.
                </div>
              )}
            </div>
          </div>
      </div>

      {isEventModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Novo Evento - {operation.name}
              </h2>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vinculado a qual Etapa do Pipeline? (Opcional)</label>
                  <select 
                      value={selectedStageId || ''} 
                      onChange={e => setSelectedStageId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 p-2 border"
                  >
                      <option value="">Geral / Sem Etapa Específica</option>
                      {operation.stages?.sort((a,b) => (a.order_index || 0) - (b.order_index || 0)).map(st => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                  </select>
              </div>
              <EventForm
                onSave={handleAddEvent}
                onClose={() => setIsEventModalOpen(false)}
                analystName="Analista" // Ideally pass actual user
                showOriginationToggle={false}
                defaultIsOrigination={true}
              />
            </div>
          </div>
        </div>
      )}

      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl my-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10 rounded-t-2xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                Nova Tarefa {operation?.name ? `- ${operation.name}` : ''}
              </h2>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
                title="Fechar"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vinculado a qual Etapa do Pipeline? (Opcional)</label>
                  <select 
                      value={selectedStageId || ''} 
                      onChange={e => setSelectedStageId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 p-2 border"
                  >
                      <option value="">Geral / Sem Etapa Específica</option>
                      {operation.stages?.sort((a,b) => (a.order_index || 0) - (b.order_index || 0)).map(st => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                  </select>
              </div>
              <AdHocTaskForm
                onClose={() => setIsTaskModalOpen(false)}
                onSave={handleSaveTask}
              />
            </div>
          </div>
        </div>
      )}

      {isMigratingToActive && operation && (
         <OperationForm
            onClose={() => { setIsMigratingToActive(false); setStageToComplete(null); }}
            onSave={handleSaveMigratedOperation}
            seedData={{
               structuringOperationId: operationId,
               name: operation.name,
               masterGroupId: operation.masterGroupId,
               maturityDate: operation.liquidationDate,
               guaranteesString: operation.series?.map(s => s.name).join(', ') || ''
            }}
            apiUrl={apiUrl}
         />
      )}

      {isEditingStages && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Gerenciar Etapas</h2>
              <button onClick={() => setIsEditingStages(false)} className="text-gray-400 hover:text-gray-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {stagesDraft.map((st, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <span className="text-sm font-bold w-6 text-gray-400">{i + 1}.</span>
                        <input 
                            type="text" 
                            className="flex-1 text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            value={st.name} 
                            onChange={e => {
                                const nw = [...stagesDraft]; nw[i].name = e.target.value; setStagesDraft(nw);
                            }} 
                        />
                    </div>
                ))}
                
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setIsEditingStages(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancelar
              </button>
              <button onClick={handleSaveStages} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg">
                Salvar Etapas
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEventForModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalhes do Evento</h2>
              </div>
              <button
                onClick={() => setSelectedEventForModal(null)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors bg-white dark:bg-gray-700 rounded-full p-1 border border-gray-200 dark:border-gray-600 shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
               <div>
                  <div className="flex items-center gap-2 mb-2">
                     <span className={`text-xs font-bold px-2.5 py-1 uppercase tracking-wider rounded-md ${selectedEventForModal.completedTaskId ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                         {selectedEventForModal.completedTaskId ? 'Tarefa Concluída' : selectedEventForModal.type}
                     </span>
                     <time className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {new Date(selectedEventForModal.date).toLocaleDateString()}
                     </time>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{selectedEventForModal.title}</h3>
               </div>
               
               <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed whitespace-pre-line text-sm">
                     {selectedEventForModal.description}
                  </p>
               </div>

               {(selectedEventForModal.attentionPoints || selectedEventForModal.nextSteps) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                     {selectedEventForModal.attentionPoints && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl">
                           <h4 className="font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2 mb-2 text-sm">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              Pontos de Atenção
                           </h4>
                           <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{selectedEventForModal.attentionPoints}</p>
                        </div>
                     )}
                     {selectedEventForModal.nextSteps && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 p-4 rounded-xl">
                           <h4 className="font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-2 mb-2 text-sm">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                              Próximos Passos
                           </h4>
                           <p className="text-sm text-blue-900 dark:text-blue-200 whitespace-pre-wrap">{selectedEventForModal.nextSteps}</p>
                        </div>
                     )}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StructuringOperationDetailsPage;
