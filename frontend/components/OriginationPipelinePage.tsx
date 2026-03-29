import React, { useState, useEffect, useMemo } from 'react';
import { Page, StructuringOperation, Event, MasterGroup } from '../types';
import StructuringOperationForm from './StructuringOperationForm';
import EventForm from './EventForm';
import MasterGroupForm from './MasterGroupForm';
import OriginationTasksPage from './OriginationTasksPage';
import PorFundoTab from './PorFundoTab';
import type { Task, TaskRule } from '../types';
import { TaskStatus } from '../types';
import { fetchApi } from '../utils/api';

interface OriginationPipelinePageProps {
  onNavigate: (page: Page, id?: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  pushToGenericQueue?: (url: string, method: string, payload: any) => void;
}

const STAGES = ['Conversa Inicial', 'Term Sheet', 'Due Diligence', 'Aprovação', 'Liquidação'];

const OriginationPipelinePage: React.FC<OriginationPipelinePageProps> = ({ onNavigate, apiUrl, showToast, pushToGenericQueue }) => {
  const [operations, setOperations] = useState<StructuringOperation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [operationToEdit, setOperationToEdit] = useState<StructuringOperation | null>(null);
  
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [operationForEvent, setOperationForEvent] = useState<StructuringOperation | null>(null);
  
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>('');
  const [masterGroupFilter, setMasterGroupFilter] = useState<string>('All');
  const [economicGroupFilter, setEconomicGroupFilter] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'kanban' | 'table' | 'tasks' | 'resumo' | 'por-fundo'>('resumo');

  const [masterGroups, setMasterGroups] = useState<{ id: number, name: string, economicGroups?: any[] }[]>([]);
  const [isMasterGroupFormOpen, setIsMasterGroupFormOpen] = useState(false);

  // Table Sorting and Searching
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, desc: boolean }>({ key: 'liquidationDate', desc: false });

  const [resumoSearchTerm, setResumoSearchTerm] = useState('');
  const [resumoSortConfig, setResumoSortConfig] = useState<{ key: string, desc: boolean }>({ key: 'createdAt', desc: true });
  const [showLiquidated, setShowLiquidated] = useState(false);

  const [resumoOriginatorFilter, setResumoOriginatorFilter] = useState('');
  const [resumoDateFilter, setResumoDateFilter] = useState('');
  const [resumoTemperatureFilter, setResumoTemperatureFilter] = useState('');
  const [resumoIndexerFilter, setResumoIndexerFilter] = useState('');
  const [resumoStatusFilter, setResumoStatusFilter] = useState('');

  // HY/HG toggle filters — apply globally to all tabs
  const [showHighYield, setShowHighYield] = useState(true);
  const [showHighGrade, setShowHighGrade] = useState(true);
  
  const originatorsOpts = useMemo(() => Array.from(new Set(operations.map(o => o.originator).filter(Boolean))), [operations]);
  const indexersOpts = useMemo(() => Array.from(new Set(operations.flatMap(o => o.series?.map(s => s.indexer) || []).filter(Boolean))), [operations]);



  const handleDeleteOrInactivate = async (opId: number, action: 'delete' | 'inactivate' | 'reactivate') => {
      try {
          if (action === 'delete') {
              if (!confirm('Cortar o mal pela raiz? Deletar esta operação estruturada não tem volta.')) return;
              const response = await fetchApi(`${apiUrl}/api/structuring-operations/${opId}`, { method: 'DELETE' });
              if (!response.ok) throw new Error();
              showToast('Operação apagada com sucesso!', 'success');
          } else {
              const isActive = action === 'reactivate';
              const response = await fetchApi(`${apiUrl}/api/structuring-operations/${opId}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive })
              });
              if (!response.ok) throw new Error();
              showToast(isActive ? 'Operação reativada!' : 'Operação inativada!', 'success');
          }
          fetchOperations();
      } catch (err) {
          showToast(`Erro ao processar ação (${action})`, 'error');
      }
  };

  const handleUpdateStructuringOperation = async (updatedOp: StructuringOperation, syncToBackend?: boolean) => {
    setOperations(prev => prev.map(o => o.id === updatedOp.id ? updatedOp : o));
    if (syncToBackend) {
      try {
        await fetchApi(`${apiUrl}/api/structuring-operations/${updatedOp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedOp)
        });
        showToast('Operação atualizada', 'success');
      } catch (err) {
        showToast('Erro ao atualizar', 'error');
      }
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const op = operations.find(o => o.id === task.structuringOperationId);
    if (!op) return;
    const updatedOp: StructuringOperation = {
        ...op,
        taskExceptions: [...(op.taskExceptions || []), task.id]
    };
    await handleUpdateStructuringOperation(updatedOp, true);
    showToast('Tarefa deletada', 'success');
  };

  const handleEditTask = async (task: Task, updates: { name: string, dueDate: string | null, notes?: string }) => {
    const op = operations.find(o => o.id === task.structuringOperationId);
    if (!op) return;
    const isoDate = updates.dueDate ? (updates.dueDate.includes('T') ? updates.dueDate : new Date(updates.dueDate + 'T12:00:00').toISOString()) : null;
    const newAdHocRule: TaskRule = {
        id: Date.now(),
        name: updates.name,
        frequency: updates.dueDate ? 'Pontual' : 'Sem Prazo',
        startDate: isoDate,
        endDate: isoDate,
        description: updates.notes || `Tarefa editada a partir da tarefa original: ${task.ruleName}`,
    };
    const updatedOp: StructuringOperation = {
        ...op,
        taskExceptions: [...(op.taskExceptions || []), task.id],
        taskRules: [...(op.taskRules || []), newAdHocRule]
    };
    await handleUpdateStructuringOperation(updatedOp, true);
    showToast('Tarefa editada', 'success');
  };

  const handleOpenNewTaskModal = (operationId?: number) => {
      // Basic modal state not fully implemented here yet, but allows signature passing
      showToast('Adição de tarefas ad-hoc pela visão principal entrará em breve. Adicione pela página da operação.', 'success');
  };

  const activeOperations = operations.filter(op => op.isActive !== false);

  const analysts = useMemo(() => {
    const filtered = activeOperations.filter(op => 
      (masterGroupFilter === 'All' || (op.masterGroupName || 'Sem Master Group') === masterGroupFilter) &&
      (economicGroupFilter === 'All' || (op.economicGroupName || 'Sem Grupo Econômico') === economicGroupFilter)
    );
    return Array.from(
      new Set(
        filtered.flatMap(op => [op.analyst, ...(op.recentEvents?.map(e => e.registeredBy) || [])]).filter(Boolean)
      )
    ) as string[];
  }, [activeOperations, masterGroupFilter, economicGroupFilter]);

  const filteredOperations = activeOperations.filter(op => {
    if (selectedAnalyst && op.analyst !== selectedAnalyst && !op.recentEvents?.some(e => e.registeredBy === selectedAnalyst)) return false;
    if (masterGroupFilter !== 'All' && (op.masterGroupName || 'Sem Master Group') !== masterGroupFilter) return false;
    if (economicGroupFilter !== 'All' && (op.economicGroupName || 'Sem Grupo Econômico') !== economicGroupFilter) return false;
    // HY/HG filter
    if (!showHighYield && op.risk === 'High Yield') return false;
    if (!showHighGrade && op.risk === 'High Grade') return false;
    return true;
  });

  const masterGroupsOpts = useMemo(() => {
    const filtered = activeOperations.filter(op => 
      (!selectedAnalyst || op.analyst === selectedAnalyst || op.recentEvents?.some(e => e.registeredBy === selectedAnalyst)) &&
      (economicGroupFilter === 'All' || (op.economicGroupName || 'Sem Grupo Econômico') === economicGroupFilter)
    );
    const mgs = filtered.map(op => op.masterGroupName || 'Sem Master Group');
    return ['All', ...Array.from(new Set(mgs)).sort()];
  }, [activeOperations, selectedAnalyst, economicGroupFilter]);

  const economicGroupsOpts = useMemo(() => {
    const filtered = activeOperations.filter(op => 
      (!selectedAnalyst || op.analyst === selectedAnalyst || op.recentEvents?.some(e => e.registeredBy === selectedAnalyst)) &&
      (masterGroupFilter === 'All' || (op.masterGroupName || 'Sem Master Group') === masterGroupFilter)
    );
    const egs = filtered.map(op => op.economicGroupName || 'Sem Grupo Econômico');
    return ['All', ...Array.from(new Set(egs)).sort()];
  }, [activeOperations, selectedAnalyst, masterGroupFilter]);

  useEffect(() => {
    if (selectedAnalyst && !analysts.includes(selectedAnalyst)) {
      setSelectedAnalyst('');
    }
  }, [analysts, selectedAnalyst]);

  useEffect(() => {
    if (masterGroupFilter !== 'All' && !masterGroupsOpts.includes(masterGroupFilter)) {
      setMasterGroupFilter('All');
    }
  }, [masterGroupsOpts, masterGroupFilter]);

  useEffect(() => {
    if (economicGroupFilter !== 'All' && !economicGroupsOpts.includes(economicGroupFilter)) {
      setEconomicGroupFilter('All');
    }
  }, [economicGroupsOpts, economicGroupFilter]);
  
  const allOriginationTasks = useMemo(() => {
    return filteredOperations.flatMap(op => op.tasks || []);
  }, [filteredOperations]);

  useEffect(() => {
    fetchOperations(showLiquidated);
  }, [showLiquidated]);

  useEffect(() => {
    fetchMasterGroups();
  }, []);

  const fetchMasterGroups = async () => {
    try {
      const cached = localStorage.getItem('cachedMasterGroupsMapped');
      if (cached) {
        try { setMasterGroups(JSON.parse(cached)); } catch(e) {}
      }

      const response = await fetchApi(`${apiUrl}/api/master-groups`);
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map((mg: any) => ({ id: mg.id, name: mg.name, economicGroups: mg.economicGroups }));
        setMasterGroups(mapped);
        localStorage.setItem('cachedMasterGroupsMapped', JSON.stringify(mapped));
      }
    } catch(err) {
      console.error(err);
    }
  };

  const fetchOperations = async (includeLiquidated: boolean = false) => {
    try {
      setIsLoading(true);
      const url = includeLiquidated ? `${apiUrl}/api/structuring-operations?includeLiquidated=true` : `${apiUrl}/api/structuring-operations`;
      const response = await fetchApi(url);
      if (!response.ok) throw new Error('Failed to fetch structuring operations');
      const data = await response.json();
      setOperations(data);
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar operações em estruturação', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = async (id: number, field: string, value: any) => {
    // Optimistic UI implementation 
    const op = operations.find(o => o.id === id);
    if (!op) return;
    
    const updatedOp = { ...op, [field === 'isActive' ? 'isActive' : field]: value };
    setOperations(prev => prev.map(o => o.id === id ? updatedOp : o));
    
    // In background sync
    try {
      const payload = { ...updatedOp };
      if (pushToGenericQueue) {
         pushToGenericQueue(`${apiUrl}/api/structuring-operations/${id}`, 'PUT', payload);
         if (field === 'isActive' && value === false) {
             showToast('Operação inativada via fila de background.', 'success');
         }
      } else {
         const response = await fetchApi(`${apiUrl}/api/structuring-operations/${id}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload),
         });
         if (!response.ok) throw new Error('Falha na sincronização.');
         if (field === 'isActive' && value === false) {
             showToast('Operação inativada com sucesso.', 'success');
         }
      }
    } catch(err) {
      showToast('Erro ao atualizar campo. Sincronização pendente.', 'error');
      // Revert if critical error (or let sync queue handle it in future)
      fetchOperations(); 
    }
  };

  const handleSaveOperation = async (data: Omit<StructuringOperation, 'id' | 'masterGroupId' | 'masterGroupName'> & { masterGroupId?: number }) => {
    try {
      if (operationToEdit) {
        const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationToEdit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to update structuring operation');
        await fetchOperations();
        showToast('Operação atualizada com sucesso', 'success');
      } else {
        if (!data.masterGroupId) {
          showToast('Por favor, selecione um Master Group', 'error');
          return;
        }
        
        const tempId = Date.now();
        const mgName = masterGroups.find(m => m.id === data.masterGroupId)?.name || 'N/A';
        const tempOp: StructuringOperation = {
          ...data,
          id: tempId,
          masterGroupId: data.masterGroupId,
          masterGroupName: mgName,
          temperature: data.temperature || 'Morno',
          risk: data.risk || 'High Yield',
          isActive: true,
          stages: STAGES.map((s, i) => ({ id: Math.random(), name: s, order_index: i, isCompleted: false })),
          series: data.series || [],
        };
        
        setOperations(prev => [tempOp, ...prev]);
        setIsFormOpen(false);
        setOperationToEdit(null);
        showToast('Criando operação...', 'success');

        const response = await fetchApi(`${apiUrl}/api/structuring-operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
           setOperations(prev => prev.filter(o => o.id !== tempId));
           throw new Error('Falha ao criar operação');
        }
        await fetchOperations();
        showToast('Operação criada com sucesso', 'success');
      }
    } catch (error) {
      showToast('Erro ao salvar operação', 'error');
    }
  };

  const handleSaveMasterGroup = async (data: Omit<MasterGroup, 'id' | 'operations' | 'structuringOperations' | 'contacts' | 'events'>) => {
    try {
      showToast('Criando Master Group...', 'success');
      const response = await fetchApi(`${apiUrl}/api/master-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Falha ao criar Master Group');
      const responseData = await response.json();
      
      setMasterGroups(prev => [...prev, { id: responseData.id, name: data.name }]);
      setIsMasterGroupFormOpen(false);
      showToast('Master Group adicionado.', 'success');
    } catch (error) {
      showToast('Erro ao criar Master Group', 'error');
      setIsMasterGroupFormOpen(false);
    }
  };

  const handleAddEvent = async (eventData: Omit<Event, 'id'>) => {
    if (!operationForEvent) return;
    try {
      const activeStage = operationForEvent.stages?.find(s => !s.isCompleted);
      const payload = { ...eventData, structuringOperationStageId: activeStage?.id };

      const response = await fetchApi(`${apiUrl}/api/structuring-operations/${operationForEvent.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to add event');
      await fetchOperations();
      showToast('Evento adicionado com sucesso', 'success');
      setIsEventFormOpen(false);
      setOperationForEvent(null);
    } catch (error) {
      showToast('Erro ao adicionar evento', 'error');
    }
  };

  const getActiveColumn = (op: StructuringOperation) => {
    if (!op.stages || op.stages.length === 0) {
        if (STAGES.includes(op.stage)) return op.stage;
        return STAGES[0]; 
    }
    
    const firstIncompleteIndex = op.stages.findIndex(s => !s.isCompleted);
    if (firstIncompleteIndex === -1) return 'Concluído'; 
    
    const stage = op.stages[firstIncompleteIndex];
    if (STAGES.includes(stage.name)) return stage.name;
    
    for (let i = firstIncompleteIndex + 1; i < op.stages.length; i++) {
        if (STAGES.includes(op.stages[i].name)) {
             return op.stages[i].name;
        }
    }
    return 'Concluído';
  };

  const groupedOperations = STAGES.reduce((acc, stage) => {
    acc[stage] = filteredOperations.filter(op => getActiveColumn(op) === stage);
    return acc;
  }, {} as Record<string, StructuringOperation[]>);

  // Metrics calculation
  const totalVolume = filteredOperations.reduce((acc, op) => acc + (op.series && op.series.length > 0 ? op.series.reduce((sAcc, s) => sAcc + Number(s.volume || 0), 0) : Number(op.volume || 0)), 0);
  const highGradeCount = filteredOperations.filter(op => op.risk === 'High Grade').length;
  const highYieldCount = filteredOperations.filter(op => op.risk === 'High Yield').length;
  const tempFrio = filteredOperations.filter(op => op.temperature === 'Frio').length;
  const tempMorno = filteredOperations.filter(op => op.temperature === 'Morno').length;
  const tempQuente = filteredOperations.filter(op => op.temperature === 'Quente').length;

  const volumeByMonth = filteredOperations.reduce((acc, op) => {
      if (op.liquidationDate) {
          const date = new Date(op.liquidationDate);
          const monthYear = `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
          const vol = op.series && op.series.length > 0 ? op.series.reduce((sAcc, s) => sAcc + Number(s.volume || 0), 0) : Number(op.volume || 0);
          acc[monthYear] = (acc[monthYear] || 0) + vol;
      }
      return acc;
  }, {} as Record<string, number>);

  const chartMax = Math.max(...Object.values(volumeByMonth), 1);
  const chartLabels = Object.keys(volumeByMonth).sort((a, b) => {
      const [mA, yA] = a.split('/'); const [mB, yB] = b.split('/');
      return new Date(2000+parseInt(yA), parseInt(mA)-1).getTime() - new Date(2000+parseInt(yB), parseInt(mB)-1).getTime();
  });

  // Table Data (Flatten series)
  const allSeriesRows = useMemo(() => {
      let rows = filteredOperations.flatMap(op => {
          const hasSeries = op.series && op.series.length > 0;
          if (hasSeries) {
              return op.series!.map(s => ({
                  operationId: op.id,
                  operationName: op.name,
                  liquidationDate: op.liquidationDate,
                  analyst: op.analyst || op.recentEvents?.[0]?.registeredBy || 'Analista N/D',
                  seriesName: s.name,
                  fund: s.fund || 'N/D',
                  volume: Number(s.volume || 0),
                  indexer: s.indexer || '-',
                  rate: s.rate || '-'
              }));
          } else {
              return [{
                  operationId: op.id,
                  operationName: op.name,
                  liquidationDate: op.liquidationDate,
                  analyst: op.analyst || op.recentEvents?.[0]?.registeredBy || 'Analista N/D',
                  seriesName: 'Série Única (Padrão)',
                  fund: 'N/D',
                  volume: Number(op.volume || 0),
                  indexer: op.indexer || '-',
                  rate: op.rate || '-'
              }];
          }
      });

      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          rows = rows.filter(r => 
              r.operationName.toLowerCase().includes(lower) || 
              r.seriesName.toLowerCase().includes(lower) ||
              r.fund.toLowerCase().includes(lower) ||
              r.indexer.toLowerCase().includes(lower)
          );
      }

      rows.sort((a, b) => {
          let valA: any = a[sortConfig.key as keyof typeof a];
          let valB: any = b[sortConfig.key as keyof typeof b];
          if (sortConfig.key === 'liquidationDate') {
              valA = valA ? new Date(valA).getTime() : 0;
              valB = valB ? new Date(valB).getTime() : 0;
          }
          if (valA < valB) return sortConfig.desc ? 1 : -1;
          if (valA > valB) return sortConfig.desc ? -1 : 1;
          return 0;
      });

      return rows;
  }, [filteredOperations, searchTerm, sortConfig]);

  const toggleSort = (key: string) => {
      setSortConfig(prev => ({ key, desc: prev.key === key ? !prev.desc : false }));
  };

  const sortedAndFilteredResumoOps = useMemo(() => {
        let baseOps = operations.filter(op => {
            if (!showLiquidated && op.isActive === false) return false;
            if (selectedAnalyst && op.analyst !== selectedAnalyst && !op.recentEvents?.some(e => e.registeredBy === selectedAnalyst)) return false;
            if (masterGroupFilter !== 'All' && (op.masterGroupName || 'Sem Master Group') !== masterGroupFilter) return false;
            if (economicGroupFilter !== 'All' && (op.economicGroupName || 'Sem Grupo Econômico') !== economicGroupFilter) return false;
            return true;
        });

        let ops = baseOps.map(op => {
            const hasSeries = op.series && op.series.length > 0;
            const totalVol = hasSeries ? op.series!.reduce((acc, s) => acc + Number(s.volume || 0), 0) : Number(op.volume || 0);
            
            let rates: number[] = [];
            if (hasSeries) {
                rates = op.series!.map(s => parseFloat(String(s.rate || '').replace(/[^0-9.-]/g, ''))).filter(r => !isNaN(r));
            } else if (op.rate) {
                rates = [parseFloat(String(op.rate).replace(/[^0-9.-]/g, ''))].filter(r => !isNaN(r));
            }
            const avgRateVal = rates.length > 0 ? (rates.reduce((a,b)=>a+b,0) / rates.length) : -999;
            const avgRateStr = rates.length > 0 ? (avgRateVal * 100).toFixed(2).replace('.', ',') + '%' : '-';
            
            let indexers: string[] = [];
            if (hasSeries) {
                indexers = op.series!.map(s => s.indexer || '').filter(Boolean);
            } else if (op.indexer) {
                indexers = [op.indexer];
            }
            const indexerStr = indexers.length > 0 ? Array.from(new Set(indexers)).join(', ') : '-';
            
            const lastEvent = op.recentEvents && op.recentEvents.length > 0 ? op.recentEvents[0].title : '-';

            return {
                ...op,
                _totalVol: totalVol,
                _avgRateVal: avgRateVal,
                _avgRateStr: avgRateStr,
                _indexerStr: indexerStr,
                _lastEvent: lastEvent
            };
        });

        if (resumoSearchTerm) {
            const lower = resumoSearchTerm.toLowerCase();
            ops = ops.filter(op => 
                op.name.toLowerCase().includes(lower) || 
                (op.originator || '').toLowerCase().includes(lower) ||
                (op.modality || '').toLowerCase().includes(lower) ||
                (op.analyst || '').toLowerCase().includes(lower) ||
                (op.stage || '').toLowerCase().includes(lower) ||
                (op._lastEvent || '').toLowerCase().includes(lower)
            );
        }

        if (resumoOriginatorFilter) ops = ops.filter(o => o.originator === resumoOriginatorFilter);
        if (resumoTemperatureFilter) ops = ops.filter(o => o.temperature === resumoTemperatureFilter);
        if (resumoIndexerFilter) ops = ops.filter(o => o.series?.some(s => s.indexer === resumoIndexerFilter));
        if (resumoStatusFilter) ops = ops.filter(o => o.stage === resumoStatusFilter);
        if (resumoDateFilter) ops = ops.filter(o => o.createdAt && o.createdAt.startsWith(resumoDateFilter));


        ops.sort((a, b) => {
            let valA: any = a[resumoSortConfig.key as keyof typeof a] || '';
            let valB: any = b[resumoSortConfig.key as keyof typeof b] || '';

            if (resumoSortConfig.key === '_totalVol') { valA = a._totalVol; valB = b._totalVol; }
            if (resumoSortConfig.key === '_avgRateVal') { valA = a._avgRateVal; valB = b._avgRateVal; }
            if (resumoSortConfig.key === '_indexerStr') { valA = a._indexerStr || ''; valB = b._indexerStr || ''; }
            if (resumoSortConfig.key === 'createdAt') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            }

            if (valA < valB) return resumoSortConfig.desc ? 1 : -1;
            if (valA > valB) return resumoSortConfig.desc ? -1 : 1;
            return 0;
        });

        return ops;
  }, [filteredOperations, resumoSearchTerm, resumoSortConfig, resumoOriginatorFilter, resumoTemperatureFilter, resumoIndexerFilter, resumoStatusFilter, resumoDateFilter]);

  const toggleResumoSort = (key: string) => {
      setResumoSortConfig(prev => ({ key, desc: prev.key === key ? !prev.desc : false }));
  };

  // Aggregated Summaries
  const summaries = useMemo(() => {
      const liqOps = filteredOperations.filter(o => getActiveColumn(o) === 'Liquidação');
      const estOps = filteredOperations.filter(o => getActiveColumn(o) !== 'Liquidação' && getActiveColumn(o) !== 'Concluído');
      
      const fundSummary: Record<string, { liq: number, est: number }> = {};
      const indexerSummary: Record<string, { liqRates: number[], estRates: number[] }> = {};

      const processOpsForSummary = (ops: StructuringOperation[], type: 'liq' | 'est') => {
          ops.forEach(op => {
              const hasSeries = op.series && op.series.length > 0;
              const items = hasSeries ? op.series! : [{ fund: 'N/D', indexer: op.indexer, rate: op.rate, volume: op.volume }];
              
              items.forEach(s => {
                  const fund = s.fund || 'N/D';
                  if (!fundSummary[fund]) fundSummary[fund] = { liq: 0, est: 0 };
                  fundSummary[fund][type] += Number(s.volume || 0);

                  const idx = s.indexer || 'N/D';
                  if (!indexerSummary[idx]) indexerSummary[idx] = { liqRates: [], estRates: [] };
                  const rateNum = parseFloat(String(s.rate || '').replace(/[^0-9.]/g, ''));
                  if (!isNaN(rateNum)) {
                      if (type === 'liq') indexerSummary[idx].liqRates.push(rateNum);
                      else indexerSummary[idx].estRates.push(rateNum);
                  }
              });
          });
      };

      processOpsForSummary(liqOps, 'liq');
      processOpsForSummary(estOps, 'est');

      const indexerAvg = Object.keys(indexerSummary).map(idx => {
          const lRates = indexerSummary[idx].liqRates;
          const eRates = indexerSummary[idx].estRates;
          return {
              indexer: idx,
              avgLiq: lRates.length ? lRates.reduce((a,b)=>a+b,0)/lRates.length : null,
              avgEst: eRates.length ? eRates.reduce((a,b)=>a+b,0)/eRates.length : null
          }
      });

      return { fundSummary, indexerAvg };
  }, [filteredOperations]);

  return (
    <div className="space-y-6 h-full flex flex-col p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center p-6 pb-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Hub de Originação</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Dashboard consolidado e acompanhamento de {filteredOperations.length} operações ativas.</p>
            </div>
            
            <div className="flex gap-4 items-center">
                <div className="bg-gray-100 dark:bg-gray-700/80 p-1 rounded-lg flex text-sm font-medium border border-gray-200 dark:border-gray-600/50">
                    <button 
                      onClick={() => setActiveTab('resumo')}
                      className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'resumo' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        Resumo
                    </button>
                    <button 
                      onClick={() => setActiveTab('por-fundo')}
                      className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'por-fundo' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        Por Fundo
                    </button>
                    <button 
                      onClick={() => setActiveTab('kanban')}
                      className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'kanban' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        Kanban
                    </button>
                    <button 
                      onClick={() => setActiveTab('table')}
                      className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'table' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        Liquidações
                    </button>
                    <button 
                      onClick={() => setActiveTab('tasks')}
                      className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'tasks' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        Tarefas
                    </button>
                </div>
                <button 
                  onClick={() => { setOperationToEdit(null); setIsFormOpen(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium shadow-sm flex items-center gap-2 border border-transparent hover:border-blue-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Nova Operação
                </button>
            </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/30 rounded-b-xl">
            <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
            </div>
            
            <div className="flex block items-center gap-2">
                <select
                    value={selectedAnalyst}
                    onChange={(e) => setSelectedAnalyst(e.target.value)}
                    className="block w-40 pl-3 pr-8 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-500"
                >
                    <option value="">Analista: Todos</option>
                    {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                    value={masterGroupFilter}
                    onChange={(e) => setMasterGroupFilter(e.target.value)}
                    className="block w-48 pl-3 pr-8 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-500"
                >
                    {masterGroupsOpts.map(mg => <option key={mg} value={mg}>{mg === 'All' ? 'Master Group: Todos' : mg}</option>)}
                </select>
                <select
                    value={economicGroupFilter}
                    onChange={(e) => setEconomicGroupFilter(e.target.value)}
                    className="block w-48 pl-3 pr-8 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-500"
                >
                    {economicGroupsOpts.map(eg => <option key={eg} value={eg}>{eg === 'All' ? 'Grupo Econômico: Todos' : eg}</option>)}
                </select>
                
                {/* HY / HG Toggle Filters */}
                <div className="flex items-center gap-1 ml-2 border-l border-gray-200 dark:border-gray-600 pl-3">
                    <button
                        onClick={() => setShowHighYield(!showHighYield)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border ${showHighYield ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 opacity-60'}`}
                    >
                        High Yield
                    </button>
                    <button
                        onClick={() => setShowHighGrade(!showHighGrade)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border ${showHighGrade ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 opacity-60'}`}
                    >
                        High Grade
                    </button>
                </div>

                {(selectedAnalyst || masterGroupFilter !== 'All' || economicGroupFilter !== 'All' || !showHighYield || !showHighGrade) && (
                    <button 
                        onClick={() => {
                            setSelectedAnalyst('');
                            setMasterGroupFilter('All');
                            setEconomicGroupFilter('All');
                            setShowHighYield(true);
                            setShowHighGrade(true);
                        }}
                        className="ml-2 text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors flex items-center gap-1 font-medium"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        Limpar
                    </button>
                )}
            </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
            {/* Metricas & Graficos */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Volume Total</p>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">R$ {(totalVolume).toFixed(2)}M</h2>
                    
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm">
                        <div className="text-center">
                            <p className="text-gray-500 dark:text-gray-400 text-xs">High Grade</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{highGradeCount}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-gray-500 dark:text-gray-400 text-xs">High Yield</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{highYieldCount}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-3">Funil Térmico</p>
                    <div className="space-y-2.5">
                        <div>
                            <div className="flex justify-between text-xs mb-1"><span className="text-red-500 font-medium">Quente</span><span className="text-gray-500">{tempQuente}</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(tempQuente / Math.max(filteredOperations.length, 1)) * 100}%` }}></div></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1"><span className="text-amber-500 font-medium">Morno</span><span className="text-gray-500">{tempMorno}</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5"><div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${(tempMorno / Math.max(filteredOperations.length, 1)) * 100}%` }}></div></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1"><span className="text-blue-500 font-medium">Frio</span><span className="text-gray-500">{tempFrio}</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5"><div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(tempFrio / Math.max(filteredOperations.length, 1)) * 100}%` }}></div></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                     <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-4">Volume por Data</p>
                     <div className="flex h-20 items-end gap-1.5 px-1 border-b border-gray-200 dark:border-gray-700 pb-1">
                        {chartLabels.length > 0 ? chartLabels.map(l => (
                            <div key={l} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-gray-800 text-white text-[10px] py-0.5 px-1.5 rounded z-10 whitespace-nowrap">{(volumeByMonth[l]).toFixed(2)}M</div>
                                <div className="bg-blue-500 dark:bg-blue-600 rounded-t-sm w-full transition-all hover:bg-blue-400" style={{ height: `${(volumeByMonth[l]/chartMax)*100}%` }}></div>
                                <span className="text-[9px] text-gray-400 mt-1 absolute top-full pt-0.5">{l}</span>
                            </div>
                        )) : (
                           <div className="w-full text-center text-xs text-gray-400">Sem dados cronológicos.</div>
                        )}
                     </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 overflow-y-auto text-xs">
                    <p className="text-gray-500 dark:text-gray-400 font-medium mb-2">Taxas Médias (Liq vs Est)</p>
                    <table className="w-full text-left">
                        <thead><tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700"><th className="pb-1">Idx</th><th className="pb-1 text-right">Liq</th><th className="pb-1 text-right">Est</th></tr></thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                            {summaries.indexerAvg.length > 0 ? summaries.indexerAvg.map(sa => (
                                <tr key={sa.indexer}>
                                    <td className="py-1 font-medium text-gray-900 dark:text-gray-200">{sa.indexer}</td>
                                    <td className="py-1 text-right text-gray-600 dark:text-gray-300">{sa.avgLiq !== null ? (sa.avgLiq * 100).toFixed(2).replace('.', ',')+'%' : '-'}</td>
                                    <td className="py-1 text-right text-gray-600 dark:text-gray-300">{sa.avgEst !== null ? (sa.avgEst * 100).toFixed(2).replace('.', ',')+'%' : '-'}</td>
                                </tr>
                            )) : <tr><td colSpan={3} className="py-2 text-center text-gray-400">Nenhum indexador.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {activeTab === 'resumo' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex-1 flex flex-col mt-2 h-full">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex flex-wrap items-center gap-3">
                        <input 
                            type="text" 
                            placeholder="Pesquisar..." 
                            value={resumoSearchTerm}
                            onChange={e => setResumoSearchTerm(e.target.value)}
                            className="w-full max-w-[200px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
                        />
                        <select value={resumoOriginatorFilter} onChange={e => setResumoOriginatorFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-xs focus:ring-blue-500 text-gray-900 dark:text-gray-100">
                            <option value="">Originador: Todos</option>
                            {originatorsOpts.map(o => <option key={o as string} value={o as string}>{o as string}</option>)}
                        </select>
                        <select value={resumoStatusFilter} onChange={e => setResumoStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-xs focus:ring-blue-500 text-gray-900 dark:text-gray-100">
                            <option value="">Status: Todos</option>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                            <option value="Concluído">Concluído</option>
                            <option value="Legado">Legado</option>
                        </select>
                        <select value={resumoTemperatureFilter} onChange={e => setResumoTemperatureFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-xs focus:ring-blue-500 text-gray-900 dark:text-gray-100">
                            <option value="">Temp.: Todos</option>
                            <option value="Quente">Quente</option>
                            <option value="Morno">Morno</option>
                            <option value="Frio">Frio</option>
                        </select>
                        <select value={resumoIndexerFilter} onChange={e => setResumoIndexerFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-xs focus:ring-blue-500 text-gray-900 dark:text-gray-100">
                            <option value="">Indexador: Todos</option>
                            {indexersOpts.map(i => <option key={i as string} value={i as string}>{i as string}</option>)}
                        </select>
                        <input 
                            type="date" 
                            title="Data de Criação"
                            value={resumoDateFilter}
                            onChange={e => setResumoDateFilter(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-xs focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                        />
                        {(resumoOriginatorFilter || resumoStatusFilter || resumoTemperatureFilter || resumoIndexerFilter || resumoDateFilter || resumoSearchTerm) && (
                            <button onClick={() => {
                                setResumoOriginatorFilter(''); setResumoStatusFilter(''); setResumoTemperatureFilter(''); setResumoIndexerFilter(''); setResumoDateFilter(''); setResumoSearchTerm('');
                            }} className="text-xs text-red-500 hover:text-red-600 font-medium ml-1">
                                Limpar
                            </button>
                        )}
                        
                        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={showLiquidated} 
                                onChange={e => setShowLiquidated(e.target.checked)} 
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-2 bg-white dark:bg-gray-700 cursor-pointer transition-colors" 
                            />
                            Incluir liquidadas/legado
                        </label>
                    </div>
                    <div className="overflow-x-auto flex-1 h-full">
                        <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-300">
                                <tr>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('name')}>
                                        Operação em estruturação {resumoSortConfig.key === 'name' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('originator')}>
                                        Originador {resumoSortConfig.key === 'originator' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('modality')}>
                                        Modalidade {resumoSortConfig.key === 'modality' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('createdAt')}>
                                        Criação {resumoSortConfig.key === 'createdAt' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('analyst')}>
                                        Analista {resumoSortConfig.key === 'analyst' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('temperature')}>
                                        Temp. {resumoSortConfig.key === 'temperature' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('_totalVol')}>
                                        Volume {resumoSortConfig.key === '_totalVol' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('_indexerStr')}>
                                        Indexador {resumoSortConfig.key === '_indexerStr' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('_avgRateVal')}>
                                        Taxa (Média) {resumoSortConfig.key === '_avgRateVal' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('stage')}>
                                        Status pipeline {resumoSortConfig.key === 'stage' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => toggleResumoSort('_lastEvent')}>
                                        Último evento {resumoSortConfig.key === '_lastEvent' && (resumoSortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700">
                                        Observações
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b dark:border-gray-700 w-24 text-center">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAndFilteredResumoOps.map(op => {
                                    return (
                                    <tr key={op.id} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={() => onNavigate(Page.STRUCTURING_OPERATION_DETAIL, op.id)}>
                                        <th scope="row" className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                                            {op.name}
                                        </th>
                                        <td className="px-4 py-3">{op.originator || '-'}</td>
                                        <td className="px-4 py-3">{op.modality || '-'}</td>
                                        <td className="px-4 py-3">{op.createdAt ? new Date(op.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="px-4 py-3">{op.analyst || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${op.temperature === 'Quente' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : op.temperature === 'Morno' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                                {op.temperature || 'N/D'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">R$ {(op._totalVol).toFixed(2)}M</td>
                                        <td className="px-4 py-3 text-center">{op._indexerStr}</td>
                                        <td className="px-4 py-3 text-right">{op._avgRateStr}</td>
                                        <td className="px-4 py-3 text-sm font-medium">{op.stage}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={op._lastEvent}>{op._lastEvent}</td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <input 
                                              type="text" 
                                              defaultValue={op.description || ''}
                                              onBlur={(e) => {
                                                if (e.target.value !== (op.description || '')) {
                                                   handleUpdateField(op.id, 'description', e.target.value);
                                                }
                                              }}
                                              className="w-full min-w-[150px] bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 focus:ring-0 text-xs px-1 py-0.5 transition-colors dark:text-gray-300"
                                              placeholder="Adicionar obs..."
                                            />
                                        </td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2 justify-center">
                                                {op.isActive !== false ? (
                                                    <button onClick={() => handleDeleteOrInactivate(op.id, 'inactivate')} className="text-amber-500 hover:text-amber-700 p-1" title="Inativar">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleDeleteOrInactivate(op.id, 'reactivate')} className="text-green-500 hover:text-green-700 p-1" title="Reativar">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    </button>
                                                )}
                                                <button onClick={() => handleDeleteOrInactivate(op.id, 'delete')} className="text-red-500 hover:text-red-700 p-1" title="Deletar">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                        {sortedAndFilteredResumoOps.length === 0 && (
                            <div className="text-center py-8 text-gray-500">Nenhuma operação encontrada com os filtros atuais.</div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'por-fundo' && (
                <div className="flex-1 w-full bg-gray-50 dark:bg-gray-900 rounded-xl mt-2 overflow-y-auto">
                    <PorFundoTab 
                        operations={filteredOperations} 
                        apiUrl={apiUrl} 
                        showToast={showToast} 
                        pushToGenericQueue={pushToGenericQueue}
                        onEditOperation={(op) => {
                            setOperationToEdit(op);
                            setIsFormOpen(true);
                        }}
                        onCreateOperation={() => {
                            setOperationToEdit(null);
                            setIsFormOpen(true);
                        }}
                    />
                </div>
            )}

            {activeTab === 'kanban' && (
                <div className="flex-1 overflow-x-auto pb-4 mt-2 h-full">
                    <div className="flex gap-6 min-w-max h-full">
                        {STAGES.map(stage => (
                        <div key={stage} className="w-[340px] flex flex-col bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800/60">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                                    {stage}
                                </h3>
                                <span className="bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-0.5 rounded-full shadow-sm text-xs font-medium">
                                    {groupedOperations[stage]?.length || 0}
                                </span>
                            </div>
                            
                            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                                {groupedOperations[stage]?.map(op => (
                                    <div 
                                    key={op.id} 
                                    className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all group relative"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-gray-900 dark:text-white leading-tight cursor-pointer hover:underline" onClick={() => onNavigate(Page.STRUCTURING_OPERATION_DETAIL, op.id)}>
                                                {op.name}
                                            </h4>
                                            {/* Quick Actions Dropdown Hover */}
                                            <div className="relative group/menu">
                                                <button className="text-gray-400 hover:text-gray-600 p-1">⋮</button>
                                                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-100 dark:border-gray-700 py-1 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-20">
                                                    <div className="px-3 py-1 text-[10px] text-gray-400 uppercase font-bold tracking-wider">Mudar Risco</div>
                                                    <button onClick={() => handleUpdateField(op.id, 'risk', 'High Grade')} className="w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">High Grade</button>
                                                    <button onClick={() => handleUpdateField(op.id, 'risk', 'High Yield')} className="w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">High Yield</button>
                                                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                                                    <div className="px-3 py-1 text-[10px] text-gray-400 uppercase font-bold tracking-wider">Temperatura</div>
                                                    <button onClick={() => handleUpdateField(op.id, 'temperature', 'Quente')} className="w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400">Quente</button>
                                                    <button onClick={() => handleUpdateField(op.id, 'temperature', 'Morno')} className="w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400">Morno</button>
                                                    <button onClick={() => handleUpdateField(op.id, 'temperature', 'Frio')} className="w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400">Frio</button>
                                                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                                                    <button onClick={() => handleUpdateField(op.id, 'isActive', false)} className="w-full text-left px-4 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">Inativar (Cair)</button>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-3 line-clamp-1">{op.masterGroupName}</p>
                                        
                                        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Volume:</span>
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {op.series && op.series.length > 0 ? `R$ ${(op.series.reduce((acc, s) => acc + (s.volume || 0), 0)).toFixed(2)}M` : '-'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Liquidação:</span>
                                                <span className="font-medium text-gray-900 dark:text-white">{op.liquidationDate ? new Date(op.liquidationDate).toLocaleDateString() : '-'}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-gray-500">Resp:</span>
                                                <span className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{op.analyst || op.recentEvents?.[0]?.registeredBy || 'Analista N/D'}</span>
                                            </div>
                                            <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-500">Tags:</span>
                                                <div className="flex gap-1.5 items-center">
                                                    {op.series?.[0]?.indexer && <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800 px-1.5 py-0.5 rounded">{op.series[0].indexer}</span>}
                                                    {op.risk && <span className="text-[10px] uppercase font-bold tracking-wider bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{op.risk}</span>}
                                                    {op.temperature && (
                                                        <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${op.temperature === 'Quente' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' : op.temperature === 'Morno' ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'}`}>
                                                            {op.temperature}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {(!groupedOperations[stage] || groupedOperations[stage].length === 0) && (
                                    <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">Vazio</div>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
            )}
            
            {activeTab === 'table' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mt-2 flex flex-col">
                     <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Buscar operação, série ou fundo..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 w-72 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        
                        {/* Summary by Fund side-by-side config */}
                        <div className="flex gap-4 text-xs">
                             <div className="bg-white dark:bg-gray-800 p-2 rounded shadow-sm border border-gray-200 dark:border-gray-700 flex gap-4">
                                <div><span className="text-gray-500 mr-2">Vol. Liq:</span><span className="font-semibold text-green-600">R$ {(Object.values(summaries.fundSummary).reduce((a,b)=>a+b.liq,0)).toFixed(2)}M</span></div>
                                <div><span className="text-gray-500 mr-2">Vol. Est:</span><span className="font-semibold text-blue-600">R$ {(Object.values(summaries.fundSummary).reduce((a,b)=>a+b.est,0)).toFixed(2)}M</span></div>
                             </div>
                        </div>
                     </div>

                     <div className="overflow-x-auto flex-1 h-[500px]">
                        <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-xs uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('operationName')}>
                                        Operação {sortConfig.key === 'operationName' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('seriesName')}>
                                        Série {sortConfig.key === 'seriesName' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('liquidationDate')}>
                                        Previsão Liq. {sortConfig.key === 'liquidationDate' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('analyst')}>
                                        Analista {sortConfig.key === 'analyst' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('fund')}>
                                        Fundo {sortConfig.key === 'fund' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('volume')}>
                                        Volume {sortConfig.key === 'volume' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                    <th className="px-5 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => toggleSort('indexer')}>
                                        Taxa / Idx {sortConfig.key === 'indexer' && (sortConfig.desc ? '↓' : '↑')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {allSeriesRows.length > 0 ? allSeriesRows.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                        <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600" onClick={() => onNavigate(Page.STRUCTURING_OPERATION_DETAIL, row.operationId)}>{row.operationName}</td>
                                        <td className="px-5 py-3 truncate max-w-[150px]" title={row.seriesName}>{row.seriesName}</td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${row.liquidationDate ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : 'text-gray-400'}`}>
                                                {row.liquidationDate ? new Date(row.liquidationDate).toLocaleDateString() : 'A Definir'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{row.analyst}</td>
                                        <td className="px-5 py-3">{row.fund}</td>
                                        <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                            {row.volume ? `R$ ${(row.volume).toFixed(2)}M` : '-'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex gap-1">
                                                {row.indexer !== '-' && <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded text-xs">{row.indexer}</span>}
                                                {row.rate !== '-' && <span className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded text-xs">+{!isNaN(Number(row.rate)) ? (Number(row.rate) * 100).toFixed(2).replace('.', ',') + '%' : row.rate}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">Nenhum dado com a busca.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'tasks' && (
                <OriginationTasksPage 
                    operations={filteredOperations}
                    allTasks={allOriginationTasks}
                    onUpdateOperation={handleUpdateStructuringOperation}
                    onOpenNewTaskModal={handleOpenNewTaskModal}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={handleEditTask}
                />
            )}
        </>
      )}

      {isFormOpen && (
        <StructuringOperationForm
          onClose={() => { setIsFormOpen(false); setOperationToEdit(null); }}
          onSave={handleSaveOperation}
          initialData={operationToEdit}
          masterGroups={masterGroups}
          onOpenNewMasterGroup={() => setIsMasterGroupFormOpen(true)}
          apiUrl={apiUrl}
        />
      )}

      {isMasterGroupFormOpen && (
        <MasterGroupForm
          onClose={() => setIsMasterGroupFormOpen(false)}
          onSave={handleSaveMasterGroup}
        />
      )}

      {isEventFormOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Novo Evento - {operationForEvent?.name}</h2>
              <button onClick={() => { setIsEventFormOpen(false); setOperationForEvent(null); }} className="text-gray-400 hover:text-gray-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <EventForm onSave={handleAddEvent} onClose={() => { setIsEventFormOpen(false); setOperationForEvent(null); }} analystName="Analista" showOriginationToggle={false} defaultIsOrigination={true} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OriginationPipelinePage;
