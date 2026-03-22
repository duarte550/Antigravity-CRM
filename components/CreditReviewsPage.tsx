
import React, { useState, useMemo, useEffect } from 'react';
import type { Operation, Task, Area, OperationReviewNote } from '../types';
import { TaskStatus } from '../types';
import { PencilIcon, CheckCircleIcon, ArrowUpIcon, ArrowDownIcon } from './icons/Icons';
import RichTextEditor from './RichTextEditor';

interface CreditReviewsPageProps {
  operations: Operation[];
  onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => void;
  onCompleteReview: (task: Task) => void;
  onSelectOperation: (id: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
}

  type SortField = 'name' | 'maturityDate' | 'nextReviewGerencial' | 'nextReviewPolitica' | 'estimatedDate';
  type SortDirection = 'asc' | 'desc';

  const CreditReviewsPage: React.FC<CreditReviewsPageProps> = ({ operations, onUpdateOperation, onCompleteReview, onSelectOperation, apiUrl, showToast, setIsSyncing, setIsRefreshing }) => {
    const [searchTerm, setSearchTerm] = useState('');
    // Filters
    const [analystFilter, setAnalystFilter] = useState('All');
    const [areaFilter, setAreaFilter] = useState<'All' | Area>('All');
    const [selectedMonthsGerencial, setSelectedMonthsGerencial] = useState<string[]>([]);
    const [selectedMonthsPolitica, setSelectedMonthsPolitica] = useState<string[]>([]);
    const [selectedMonthsEstimated, setSelectedMonthsEstimated] = useState<string[]>([]);
    const [monthInputGerencial, setMonthInputGerencial] = useState('');
    const [monthInputPolitica, setMonthInputPolitica] = useState('');
    const [monthInputEstimated, setMonthInputEstimated] = useState('');
    
    // Sorting state
    const [sortConfig, setSortConfig] = useState<{field: SortField, direction: SortDirection}>({
        field: 'name',
        direction: 'asc'
    });
  
    // In-line editing state
    const [editingOpId, setEditingOpId] = useState<number | null>(null);
    const [editingNotes, setEditingNotes] = useState('');
  
    const analysts = useMemo(() => ['All', ...new Set(operations.map(op => op.responsibleAnalyst))], [operations]);
  
    const handleSort = (field: SortField) => {
        setSortConfig(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };
  
    const filteredAndSortedOperations = useMemo(() => {
      let result = operations.filter(op => {
          const matchesSearch = op.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              op.responsibleAnalyst.toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchesSearch) return false;
          if (analystFilter !== 'All' && op.responsibleAnalyst !== analystFilter) return false;
          if (areaFilter !== 'All' && op.area !== areaFilter) return false;
          
          if (selectedMonthsGerencial.length > 0) {
              const date = op.nextReviewGerencialTask ? op.nextReviewGerencialTask.dueDate.substring(0, 7) : null;
              if (!date || !selectedMonthsGerencial.includes(date)) return false;
          }

          if (selectedMonthsPolitica.length > 0) {
              const date = op.nextReviewPoliticaTask ? op.nextReviewPoliticaTask.dueDate.substring(0, 7) : null;
              if (!date || !selectedMonthsPolitica.includes(date)) return false;
          }

          if (selectedMonthsEstimated.length > 0) {
              const date = op.estimatedDate ? op.estimatedDate.substring(0, 7) : null;
              if (!date || !selectedMonthsEstimated.includes(date)) return false;
          }

          return true;
      });
  
      // Sort the result
      result.sort((a, b) => {
          let valA: any = a[sortConfig.field as keyof Operation];
          let valB: any = b[sortConfig.field as keyof Operation];
  
          // Handle nested task dates for sorting
          if (sortConfig.field === 'nextReviewGerencial') {
              valA = a.nextReviewGerencialTask ? new Date(a.nextReviewGerencialTask.dueDate).getTime() : 0;
              valB = b.nextReviewGerencialTask ? new Date(b.nextReviewGerencialTask.dueDate).getTime() : 0;
          } else if (sortConfig.field === 'nextReviewPolitica') {
              valA = a.nextReviewPoliticaTask ? new Date(a.nextReviewPoliticaTask.dueDate).getTime() : 0;
              valB = b.nextReviewPoliticaTask ? new Date(b.nextReviewPoliticaTask.dueDate).getTime() : 0;
          } else if (sortConfig.field === 'maturityDate') {
              valA = a.maturityDate ? new Date(a.maturityDate).getTime() : 0;
              valB = b.maturityDate ? new Date(b.maturityDate).getTime() : 0;
          } else if (sortConfig.field === 'estimatedDate') {
              valA = a.estimatedDate ? new Date(a.estimatedDate).getTime() : 0;
              valB = b.estimatedDate ? new Date(b.estimatedDate).getTime() : 0;
          } else {
              valA = (valA || "").toString().toLowerCase();
              valB = (valB || "").toString().toLowerCase();
          }
  
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  
      return result;
    }, [operations, searchTerm, analystFilter, areaFilter, selectedMonthsGerencial, selectedMonthsPolitica, selectedMonthsEstimated, sortConfig]);

    const handleAddMonth = (type: 'gerencial' | 'politica' | 'estimated') => {
        if (type === 'gerencial' && monthInputGerencial && !selectedMonthsGerencial.includes(monthInputGerencial)) {
            setSelectedMonthsGerencial([...selectedMonthsGerencial, monthInputGerencial]);
            setMonthInputGerencial('');
        } else if (type === 'politica' && monthInputPolitica && !selectedMonthsPolitica.includes(monthInputPolitica)) {
            setSelectedMonthsPolitica([...selectedMonthsPolitica, monthInputPolitica]);
            setMonthInputPolitica('');
        } else if (type === 'estimated' && monthInputEstimated && !selectedMonthsEstimated.includes(monthInputEstimated)) {
            setSelectedMonthsEstimated([...selectedMonthsEstimated, monthInputEstimated]);
            setMonthInputEstimated('');
        }
    };

    const handleRemoveMonth = (month: string, type: 'gerencial' | 'politica' | 'estimated') => {
        if (type === 'gerencial') setSelectedMonthsGerencial(selectedMonthsGerencial.filter(m => m !== month));
        else if (type === 'politica') setSelectedMonthsPolitica(selectedMonthsPolitica.filter(m => m !== month));
        else if (type === 'estimated') setSelectedMonthsEstimated(selectedMonthsEstimated.filter(m => m !== month));
    };

    const formatMonthBadge = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        return `${monthNames[parseInt(month) - 1]}/${year}`;
    };
  
    const handleStartEditing = (op: Operation) => {
        setEditingOpId(op.id);
        setEditingNotes(op.notes || '');
    };
  
    const handleCancelEditing = () => {
        setEditingOpId(null);
        setEditingNotes('');
    };
  
    const handleSaveNote = async () => {
        if (!editingOpId) return;
        
        const opToUpdate = operations.find(op => op.id === editingOpId);
        if (!opToUpdate) return;
  
        setIsSyncing(true);
        try {
          const response = await fetch(`${apiUrl}/api/operation_review_notes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  operationId: editingOpId,
                  notes: editingNotes,
                  userName: opToUpdate.responsibleAnalyst
              }),
              credentials: 'include'
          });
          if (!response.ok) throw new Error('Falha ao salvar a observação.');
  
          const savedNote = await response.json();
          
          // Optimistic UI update
          const updatedOperation = { ...opToUpdate, notes: savedNote.notes };
          onUpdateOperation(updatedOperation, false);
  
          showToast('Observação salva com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar observação.', 'error');
        } finally {
            handleCancelEditing();
            setIsSyncing(false);
        }
    };

    const handleEstimatedDateChange = (op: Operation, newDate: string) => {
        const updatedOperation = { ...op, estimatedDate: newDate };
        onUpdateOperation(updatedOperation);
    };
  
    const getStatusBadge = (dueDate: string | undefined | null) => {
      if (!dueDate) {
          return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Sem Prazo</span>;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let due = new Date(dueDate);
      try {
          const datePart = dueDate.split('T')[0];
          const parts = datePart.split('-');
          if (parts.length === 3) {
              const [year, month, day] = parts.map(Number);
              due = new Date(year, month - 1, day);
          }
      } catch (e) {
          // fallback to standard parsing
      }
      due.setHours(0, 0, 0, 0);
      
      const isCurrentMonth = today.getMonth() === due.getMonth() && today.getFullYear() === due.getFullYear();
      
      if (isCurrentMonth) {
          return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">Esse mês</span>;
      }

      const diffDays = (due.getTime() - today.getTime()) / (1000 * 3600 * 24);

      if (diffDays < 0) {
          return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Atrasada</span>;
      }
      if (diffDays <= 7) {
          return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Próxima</span>;
      }
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">No Prazo</span>;
  };

  const formatMonthYear = (dateString: string | undefined | null) => {
      if (!dateString) return 'Sem Prazo';
      try {
          const datePart = dateString.split('T')[0];
          const parts = datePart.split('-');
          if (parts.length !== 3) return 'Data Inválida';
          
          const [year, month, day] = parts.map(Number);
          const date = new Date(year, month - 1, day);
          
          if (isNaN(date.getTime())) return 'Data Inválida';
          
          const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
          return `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
      } catch (e) {
          return 'Erro na Data';
      }
  };

  const ReviewInfoCell: React.FC<{ task: Task | null | undefined }> = ({ task }) => {
    if (!task) {
        return <span className="text-gray-400">N/A</span>;
    }
    return (
        <div className="flex items-center gap-2">
            <span>{formatMonthYear(task.dueDate)}</span>
            {getStatusBadge(task.dueDate)}
        </div>
    );
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
      if (sortConfig.field !== field) return <div className="w-4 h-4 text-gray-300 ml-1 inline-block"><ArrowUpIcon className="opacity-30" /></div>;
      return sortConfig.direction === 'asc' 
          ? <ArrowUpIcon className="w-4 h-4 text-blue-600 ml-1 inline-block" /> 
          : <ArrowDownIcon className="w-4 h-4 text-blue-600 ml-1 inline-block" />;
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition-colors duration-200">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Painel de Revisões de Crédito</h2>
        
        <div className="mb-6">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    placeholder="Buscar por operação ou analista..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors duration-200"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-4 grid grid-cols-1 md:grid-cols-5 gap-4 transition-colors duration-200">
            <div>
                <label htmlFor="analyst-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Analista</label>
                <select id="analyst-filter" value={analystFilter} onChange={e => setAnalystFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm sm:text-sm transition-colors duration-200">
                    {analysts.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="area-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Área</label>
                <select id="area-filter" value={areaFilter} onChange={e => setAreaFilter(e.target.value as any)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm sm:text-sm transition-colors duration-200">
                    <option value="All">Todas</option>
                    <option value="CRI">CRI</option>
                    <option value="Capital Solutions">Capital Solutions</option>
                </select>
            </div>

            {/* Gerencial Month Filter */}
            <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Venc. Gerencial</label>
                <div className="mt-1 flex gap-1">
                    <input 
                        type="month" 
                        value={monthInputGerencial} 
                        onChange={e => setMonthInputGerencial(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm text-xs transition-colors duration-200"
                    />
                    <button onClick={() => handleAddMonth('gerencial')} className="px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-[10px] font-medium transition-colors">Add</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                    {selectedMonthsGerencial.map(month => (
                        <span key={month} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {formatMonthBadge(month)}
                            <button onClick={() => handleRemoveMonth(month, 'gerencial')} className="ml-1 text-blue-400 hover:text-blue-600">×</button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Politica Month Filter */}
            <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Venc. Política</label>
                <div className="mt-1 flex gap-1">
                    <input 
                        type="month" 
                        value={monthInputPolitica} 
                        onChange={e => setMonthInputPolitica(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm text-xs transition-colors duration-200"
                    />
                    <button onClick={() => handleAddMonth('politica')} className="px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-[10px] font-medium transition-colors">Add</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                    {selectedMonthsPolitica.map(month => (
                        <span key={month} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {formatMonthBadge(month)}
                            <button onClick={() => handleRemoveMonth(month, 'politica')} className="ml-1 text-blue-400 hover:text-blue-600">×</button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Estimated Month Filter */}
            <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Data Estimada</label>
                <div className="mt-1 flex gap-1">
                    <input 
                        type="month" 
                        value={monthInputEstimated} 
                        onChange={e => setMonthInputEstimated(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm text-xs transition-colors duration-200"
                    />
                    <button onClick={() => handleAddMonth('estimated')} className="px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-[10px] font-medium transition-colors">Add</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                    {selectedMonthsEstimated.map(month => (
                        <span key={month} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {formatMonthBadge(month)}
                            <button onClick={() => handleRemoveMonth(month, 'estimated')} className="ml-1 text-blue-400 hover:text-blue-600">×</button>
                        </span>
                    ))}
                </div>
            </div>
        </div>
        
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('name')}
                        >
                            Operação <SortIcon field="name" />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Analista</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Última Revisão</th>
                        <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('nextReviewGerencial')}
                        >
                            Próx. Rev. Gerencial <SortIcon field="nextReviewGerencial" />
                        </th>
                        <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('nextReviewPolitica')}
                        >
                            Próx. Rev. Política <SortIcon field="nextReviewPolitica" />
                        </th>
                        <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('estimatedDate')}
                        >
                            Data Estimada <SortIcon field="estimatedDate" />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-1/4">Observações</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredAndSortedOperations.map(op => {
                        const gerencialTask = op.nextReviewGerencialTask;
                        const politicaTask = op.nextReviewPoliticaTask;
                        let taskForCompletion: Task | null = null;

                        if (gerencialTask && politicaTask) {
                            if (!gerencialTask.dueDate) taskForCompletion = politicaTask;
                            else if (!politicaTask.dueDate) taskForCompletion = gerencialTask;
                            else taskForCompletion = new Date(gerencialTask.dueDate) <= new Date(politicaTask.dueDate) ? gerencialTask : politicaTask;
                        } else {
                            taskForCompletion = gerencialTask || politicaTask || null;
                        }

                        return (
                            <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td 
                                    className="px-6 py-4 whitespace-nowrap text-sm font-medium cursor-pointer"
                                    onClick={() => onSelectOperation(op.id)}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">{op.name}</span>
                                        {op.maturityDate && (
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                                                Venc: {formatMonthYear(op.maturityDate)}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{op.responsibleAnalyst}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {(() => {
                                        const reviewEvents = op.events.filter(e => e.type === 'Revisão Periódica');
                                        if (reviewEvents.length === 0) return <span className="text-gray-400 dark:text-gray-500">Nenhuma</span>;
                                        const last = [...reviewEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                        return <span>{formatMonthYear(last.date)}</span>;
                                    })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <ReviewInfoCell task={gerencialTask} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <ReviewInfoCell task={politicaTask} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{formatMonthYear(op.estimatedDate)}</span>
                                        <input 
                                            type="date" 
                                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-1 py-0.5 text-[10px] focus:ring-blue-500 focus:border-blue-500 block w-full transition-colors duration-200"
                                            value={op.estimatedDate ? op.estimatedDate.split('T')[0] : ''}
                                            onChange={(e) => handleEstimatedDateChange(op, e.target.value)}
                                        />
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {taskForCompletion ? (
                                        <button
                                            onClick={() => onCompleteReview(taskForCompletion!)}
                                            className="flex items-center justify-center gap-1.5 w-full max-w-[120px] px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs shadow-sm active:scale-95 transition-transform"
                                        >
                                            <CheckCircleIcon className="w-4 h-4" /> Completar
                                        </button>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    {editingOpId === op.id ? (
                                        <div className="space-y-2">
                                            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden transition-colors duration-200">
                                                <RichTextEditor
                                                    value={editingNotes}
                                                    onChange={setEditingNotes}
                                                    className="h-32 mb-12"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={handleSaveNote} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 shadow-sm font-medium transition-colors">Salvar</button>
                                                <button onClick={handleCancelEditing} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 shadow-sm font-medium transition-colors">Cancelar</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start justify-between group">
                                            <div 
                                                className="prose prose-sm dark:prose-invert max-w-none italic text-gray-500 dark:text-gray-400 line-clamp-3 flex-1"
                                                dangerouslySetInnerHTML={{ __html: op.notes || "Sem observações..." }}
                                            />
                                            <button onClick={() => handleStartEditing(op)} className="ml-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100">
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {filteredAndSortedOperations.length === 0 && (
                 <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Nenhuma operação encontrada para os filtros selecionados.
                </div>
            )}
        </div>
    </div>
  );
};

export default CreditReviewsPage;
