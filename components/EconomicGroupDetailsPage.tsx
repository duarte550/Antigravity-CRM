import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Page, EconomicGroup, StructuringOperation, Event, OperationRisk } from '../types';
import EventForm from './EventForm';
import StructuringOperationForm from './StructuringOperationForm';

import EventHistory from './EventHistory';
import RatingHistoryChart from './RatingHistoryChart';
import RiskForm from './RiskForm';
import { AlertTriangle, Plus, Edit2, Trash2 } from 'lucide-react';
import { ArrowUpIcon, ArrowRightIcon, ArrowDownIcon } from './icons/Icons';
import Modal from './Modal';
import { fetchApi } from '../utils/api';

const getRatingChange = (current?: string, previous?: string): 'up' | 'down' | 'neutral' => {
    if (!current || !previous) return 'neutral';
    const ratingOptions = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D'];
    const currentIndex = ratingOptions.indexOf(current);
    const previousIndex = ratingOptions.indexOf(previous);
    if (currentIndex === -1 || previousIndex === -1) return 'neutral';
    if (currentIndex < previousIndex) return 'up'; // Better rating
    if (currentIndex > previousIndex) return 'down'; // Worse rating
    return 'neutral';
};

const RatingChangeIndicator: React.FC<{ change: 'up' | 'down' | 'neutral' }> = ({ change }) => {
    if (change === 'up') return <ArrowUpIcon className="w-4 h-4 text-green-600" title="Upgrade" />;
    if (change === 'down') return <ArrowDownIcon className="w-4 h-4 text-red-600" title="Downgrade" />;
    return <ArrowRightIcon className="w-4 h-4 text-gray-400" title="Sem alteração" />;
};

interface EconomicGroupDetailsPageProps {
  economicGroupId: number;
  onNavigate: (page: Page, id?: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  pushToGenericQueue?: (url: string, method: string, payload: any) => void;
}

const EconomicGroupDetailsPage: React.FC<EconomicGroupDetailsPageProps> = ({ economicGroupId, onNavigate, apiUrl, showToast, pushToGenericQueue }) => {
  const [economicGroup, setEconomicGroup] = useState<EconomicGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [isStructuringFormOpen, setIsStructuringFormOpen] = useState(false);
  const [structuringToEdit, setStructuringToEdit] = useState<StructuringOperation | null>(null);
  const [showInactiveStructuring, setShowInactiveStructuring] = useState(false);

  // States for Risks
  const [isAddingRisk, setIsAddingRisk] = useState(false);
  const [editingRisk, setEditingRisk] = useState<OperationRisk | null>(null);

  // States for Event History
  const [eventDateFilter, setEventDateFilter] = useState({ start: '', end: '' });
  const [eventTypeFilter, setEventTypeFilter] = useState('Todos');
  const [eventPersonFilter, setEventPersonFilter] = useState('Todos');
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<Event | null>(null);
  const [selectedRecentChange, setSelectedRecentChange] = useState<any>(null);
  const eventRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const events = economicGroup?.events || [];
  
  const uniqueEventTypes = useMemo(() => ['Todos', ...new Set(events.map(e => e.type))], [events]);
  const uniqueRegisteredBy = useMemo(() => ['Todos', ...new Set(events.map(e => e.registeredBy))], [events]);

  const filteredEvents = useMemo(() => {
      return [...events].filter(event => {
          if (!eventDateFilter.start && !eventDateFilter.end) return true;
          const eventDate = new Date(event.date);
          eventDate.setHours(0,0,0,0);
          const startDate = eventDateFilter.start ? new Date(eventDateFilter.start) : null;
          const endDate = eventDateFilter.end ? new Date(eventDateFilter.end) : null;
          if (startDate && startDate > eventDate) return false;
          if (endDate && endDate < eventDate) return false;
          return true;
      }).filter(event => {
          if (eventTypeFilter === 'Todos') return true;
          return event.type === eventTypeFilter;
      }).filter(event => {
          if (eventPersonFilter === 'Todos') return true;
          return event.registeredBy === eventPersonFilter;
      });
  }, [events, eventDateFilter, eventTypeFilter, eventPersonFilter]);

  const sortedHistory = useMemo(() => {
      return [...(economicGroup?.ratingHistory || [])].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [economicGroup?.ratingHistory]);

  useEffect(() => {
    fetchEconomicGroup();
  }, [economicGroupId]);

  const fetchEconomicGroup = async () => {
    setIsLoading(true);
    try {
      const response = await fetchApi(`${apiUrl}/api/economic-groups/${economicGroupId}`);
      if (!response.ok) throw new Error('Failed to fetch Grupo Econômico');
      const data = await response.json();
      setEconomicGroup(data);
    } catch (error) {
      showToast('Erro ao carregar grupo econômico.', 'error');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRisk = async (riskData: any) => {
      try {
          if (editingRisk) {
              await fetchApi(`${apiUrl}/api/economic-groups/${economicGroupId}/risks/${editingRisk.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...riskData, userName: 'Analista' })
              });
              showToast('Risco atualizado.', 'success');
          } else {
              await fetchApi(`${apiUrl}/api/economic-groups/${economicGroupId}/risks`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...riskData, userName: 'Analista' })
              });
              showToast('Novo risco/ponto de atenção isolado adicionado ao grupo.', 'success');
          }
          setIsAddingRisk(false);
          setEditingRisk(null);
          fetchEconomicGroup();
      } catch (e) {
          console.error("Error saving risk:", e);
          showToast('Erro ao salvar risco.', 'error');
      }
  };

  const handleDeleteRisk = async (id: number) => {
      if (!window.confirm("Certeza que deseja remover este Risco/Ponto de Atenção?")) return;
      try {
          await fetchApi(`${apiUrl}/api/economic-groups/${economicGroupId}/risks/${id}?userName=Analista`, {
              method: 'DELETE'
          });
          showToast('Risco removido.', 'success');
          fetchEconomicGroup();
      } catch (e) {
          console.error("Error deleting risk:", e);
          showToast('Erro ao remover risco.', 'error');
      }
  };

  const handleAddEvent = async (eventData: Omit<Event, 'id'>) => {
    try {
      const response = await fetchApi(`${apiUrl}/api/economic-groups/${economicGroupId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });
      if (!response.ok) throw new Error('Failed to add event');
      await fetchEconomicGroup();
      showToast('Evento adicionado com sucesso', 'success');
      setIsEventFormOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Erro ao adicionar evento', 'error');
    }
  };

  const handleSaveStructuringOperation = async (data: Omit<StructuringOperation, 'id' | 'economicGroupId' | 'economicGroupName'>) => {
    try {
      const isEditing = !!structuringToEdit;
      const url = isEditing 
        ? `${apiUrl}/api/structuring-operations/${structuringToEdit.id}`
        : `${apiUrl}/api/structuring-operations`;
      
      const response = await fetchApi(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to save structuring operation');
      
      await fetchEconomicGroup();
      
      showToast(`Operação em estruturação ${isEditing ? 'atualizada' : 'criada'} com sucesso`, 'success');
      setIsStructuringFormOpen(false);
      setStructuringToEdit(null);
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar operação em estruturação', 'error');
    }
  };



  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!economicGroup) {
    return <div className="text-gray-900 dark:text-gray-100">grupo econômico não encontrado.</div>;
  }

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => onNavigate(Page.MASTER_GROUP_DETAIL, economicGroup.masterGroupId)}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{economicGroup.name}</h1>
        {economicGroup.sector && (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {economicGroup.sector}
          </span>
        )}
        {economicGroup.rating && (
          <span className="px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
            Rating Atual: {economicGroup.rating}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Active Operations */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Operações Ativas</h2>
            <div className="space-y-4">
              {economicGroup.operations?.map(op => (
                <div 
                  key={op.id} 
                  className="flex justify-between items-center p-4 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => onNavigate(Page.DETAIL, op.id)}
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{op.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{op.area}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {op.status || 'Ativa'}
                  </span>
                </div>
              ))}
              {(!economicGroup.operations || economicGroup.operations.length === 0) && (
                <p className="text-gray-500 dark:text-gray-400">Nenhuma operação ativa vinculada.</p>
              )}
            </div>
          </div>

          {/* Structuring Operations */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Operações em Estruturação</h2>
              <button 
                onClick={() => {
                  setStructuringToEdit(null);
                  setIsStructuringFormOpen(true);
                }}
                className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-md font-medium transition-colors"
              >
                + Nova Operação
              </button>
            </div>
            <div className="space-y-4">
              {(economicGroup.structuringOperations?.filter(op => op.isActive !== false) || []).map(op => (
                <div 
                  key={op.id} 
                  className="p-4 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => onNavigate(Page.STRUCTURING_OPERATION_DETAIL, op.id)}
                >
                  <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      {op.name}
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Estágio:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{op.stage}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Volume (Total):</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {op.series && op.series.length > 0
                          ? `R$ ${(op.series.reduce((sum, s) => sum + (s.volume || 0), 0) / 1000000).toFixed(2)}M`
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {(!economicGroup.structuringOperations?.filter(op => op.isActive !== false).length) && (
                <p className="text-gray-500 dark:text-gray-400">Nenhuma operação em estruturação ativa.</p>
              )}

              {(economicGroup.structuringOperations?.filter(op => op.isActive === false).length || 0) > 0 && (
                <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                  <button 
                    onClick={() => setShowInactiveStructuring(!showInactiveStructuring)} 
                    className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                  >
                    {showInactiveStructuring ? 'Ocultar' : 'Mostrar'} Operações Desativadas ({(economicGroup.structuringOperations?.filter(op => op.isActive === false).length)})
                  </button>
                  {showInactiveStructuring && (
                    <div className="space-y-4 mt-4 opacity-75">
                      {(economicGroup.structuringOperations?.filter(op => op.isActive === false) || []).map(op => (
                        <div 
                          key={op.id} 
                          className="p-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/80 cursor-pointer"
                          onClick={() => onNavigate(Page.STRUCTURING_OPERATION_DETAIL, op.id)}
                        >
                          <h3 className="font-medium text-gray-500 dark:text-gray-400 line-through flex items-center gap-2">
                              {op.name}
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </h3>
                          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400 dark:text-gray-500">Desativada na etapa:</span>
                              <span className="ml-2 font-medium text-gray-500 dark:text-gray-400">{op.stage}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Risks and Points of Attention Section */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700 mb-6">
              <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-orange-500" />
                      <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Riscos e Pontos de Atenção (Geral)</h3>
                  </div>
                  <button 
                      onClick={() => setIsAddingRisk(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-medium shadow-sm"
                  >
                      <Plus className="w-4 h-4" /> Adicionar Risco ao Grupo
                  </button>
              </div>

              {economicGroup.risks && economicGroup.risks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {economicGroup.risks.map(risk => (
                          <div key={risk.id} className={`flex flex-col p-4 rounded-lg border-l-4 shadow-sm bg-gray-50 dark:bg-gray-800 border border-transparent dark:border-gray-700 ${
                              risk.severity === 'Alta' ? 'border-l-red-500' : 
                              risk.severity === 'Média' ? 'border-l-orange-500' : 
                              'border-l-yellow-500'
                          }`}>
                              <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-gray-800 dark:text-gray-200 leading-tight">{risk.title}</h4>
                                  <div className="flex gap-1 ml-2">
                                      <button onClick={() => setEditingRisk(risk)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                          <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => handleDeleteRisk(risk.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                          <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-grow line-clamp-3">{risk.description}</p>
                              <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700 mt-auto">
                                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                      risk.severity === 'Alta' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                                      risk.severity === 'Média' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' : 
                                      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                  }`}>
                                      {risk.severity}
                                  </span>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                      Atualizado em {new Date(risk.updatedAt).toLocaleDateString('pt-BR')}
                                  </span>
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                      <AlertTriangle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum risco ou ponto de atenção macro identificado.</p>
                      <button 
                          onClick={() => setIsAddingRisk(true)}
                          className="mt-3 text-sm text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 font-bold uppercase tracking-wider"
                      >
                          Clique para adicionar o primeiro
                      </button>
                  </div>
              )}
          </div>

          <EventHistory 
              events={filteredEvents}
              onAddEvent={() => setIsEventFormOpen(true)}
              onEditEvent={() => {}} // Could wire edit
              onDownloadEvent={() => {}} // Could wire download
              dateFilter={eventDateFilter}
              onDateFilterChange={setEventDateFilter}
              typeFilter={eventTypeFilter}
              onTypeFilterChange={setEventTypeFilter}
              personFilter={eventPersonFilter}
              onPersonFilterChange={setEventPersonFilter}
              uniqueEventTypes={uniqueEventTypes}
              uniqueRegisteredBy={uniqueRegisteredBy}
              onViewDetails={setSelectedEventForDetails}
              eventRefs={eventRefs}
          />

        </div>

        <div className="space-y-6">

          {/* Rating History */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4">Histórico de Ratings e Sentimentos</h3>
              <div className="flex flex-col gap-8 items-stretch">
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {sortedHistory.length > 0 ? (
                          sortedHistory.map((entry, index, array) => {
                              const previousEntry = array[index + 1];
                              const opRatingChange = getRatingChange(entry.ratingOperation, previousEntry?.ratingOperation);
                              const groupRatingChange = getRatingChange(entry.ratingGroup, previousEntry?.ratingGroup);

                              return (
                                  <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md flex flex-wrap items-center justify-between gap-y-2 gap-x-4 border border-transparent dark:border-gray-700">
                                      <div className="font-medium text-gray-700 dark:text-gray-300">{new Date(entry.date).toLocaleDateString('pt-BR')}</div>





                                      <div className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                          <span className="text-xs text-gray-500 dark:text-gray-400">Rating: </span>
                                          <RatingChangeIndicator change={groupRatingChange} />
                                          {entry.ratingGroup}
                                      </div>
                                      <div className={`flex items-center gap-2 font-semibold text-sm ${entry.sentiment === 'Positivo' ? 'text-green-600 dark:text-green-400' : entry.sentiment === 'Negativo' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                          {entry.sentiment === 'Positivo' && <ArrowUpIcon className="w-4 h-4" />}
                                          {entry.sentiment === 'Neutro' && <ArrowRightIcon className="w-4 h-4" />}
                                          {entry.sentiment === 'Negativo' && <ArrowDownIcon className="w-4 h-4" />}
                                          {entry.sentiment}
                                      </div>
                                  </div>
                              );
                          })
                      ) : (
                          <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhum histórico de rating para este grupo.</p>
                      )}
                  </div>
                  <div>
                      <RatingHistoryChart history={economicGroup.ratingHistory || []} hideOperationRating={true} />
                  </div>
              </div>
          </div>
          {/* Recent Changes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Alterações Recentes</h2>
            <div className="space-y-4">
              {economicGroup.recentChanges?.map(change => (
                <div key={change.id} className="border-l-2 border-green-500 pl-3 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-r-md transition-colors" onClick={() => setSelectedRecentChange(change)}>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(change.timestamp).toLocaleString()}</p>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{change.user}</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm mt-1">
                    {change.operationName} - {change.entity}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{change.details}</p>
                </div>
              ))}
              {(!economicGroup.recentChanges || economicGroup.recentChanges.length === 0) && (
                <p className="text-gray-500 dark:text-gray-400">Nenhuma alteração recente.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isEventFormOpen && (
        <EventForm
          onClose={() => setIsEventFormOpen(false)}
          onSave={handleAddEvent}
          analystName="Analista" // Ideally from context
          showOriginationToggle={true}
        />
      )}

      {isStructuringFormOpen && (
        <StructuringOperationForm
          onClose={() => {
            setIsStructuringFormOpen(false);
            setStructuringToEdit(null);
          }}
          onSave={handleSaveStructuringOperation}
          initialData={structuringToEdit}
        />
      )}



      <Modal 
          isOpen={isAddingRisk || !!editingRisk} 
          onClose={() => {
              setIsAddingRisk(false);
              setEditingRisk(null);
          }} 
          title={editingRisk ? "Editar Risco" : "Adicionar Risco ao Grupo"}
      >
          <RiskForm 
              initialData={editingRisk || undefined}
              onClose={() => {
                  setIsAddingRisk(false);
                  setEditingRisk(null);
              }}
              onSave={handleSaveRisk}
          />
      </Modal>

      <Modal isOpen={!!selectedRecentChange} onClose={() => setSelectedRecentChange(null)} title="Detalhes da Alteração">
          {selectedRecentChange && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="font-bold text-gray-800 dark:text-gray-200">{selectedRecentChange.entity} - {selectedRecentChange.action}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{new Date(selectedRecentChange.timestamp).toLocaleString('pt-BR')}</span>
                  </div>
                  <div>
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Usuário</p>
                      <p className="text-gray-800 dark:text-gray-200">{selectedRecentChange.user}</p>
                  </div>
                  {selectedRecentChange.operationName && (
                      <div>
                          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Operação Relacionada</p>
                          <p className="text-gray-800 dark:text-gray-200">{selectedRecentChange.operationName}</p>
                      </div>
                  )}
                  <div>
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Mudanças Detalhadas</p>
                      <div className="mt-2 text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700 break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedRecentChange.details.replace(/\n/g, '<br/>') }} />
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={!!selectedEventForDetails} onClose={() => setSelectedEventForDetails(null)} title="Detalhes do Evento">
          {selectedEventForDetails && (
              <div className="space-y-4">
                  <div>
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2 bg-gray-50 dark:bg-gray-700 p-2 rounded-t-md">Informações Principais</h4>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Título</p>
                              <p className="text-gray-800 dark:text-gray-200">{selectedEventForDetails.title}</p>
                          </div>
                          <div>
                              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Tipo de Evento</p>
                              <p className="text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                  {selectedEventForDetails.type}
                                  {selectedEventForDetails.isOrigination && <span className="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800">Originação</span>}
                              </p>
                          </div>
                          <div>
                              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Data e Hora</p>
                              <p className="text-gray-800 dark:text-gray-200">{new Date(selectedEventForDetails.date).toLocaleString('pt-BR')}</p>
                          </div>
                          <div>
                              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Registrado por</p>
                              <p className="text-gray-800 dark:text-gray-200">{selectedEventForDetails.registeredBy}</p>
                          </div>
                          {selectedEventForDetails.operationName && (
                              <div className="col-span-2">
                                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Operação</p>
                                  <p className="text-gray-800 dark:text-gray-200">{selectedEventForDetails.operationName}</p>
                              </div>
                          )}
                      </div>
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2 bg-gray-50 dark:bg-gray-700 p-2 rounded-t-md mt-4">Descrição e Revisão</h4>
                      <p className="text-gray-800 dark:text-gray-200 mt-2 text-sm whitespace-pre-wrap break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.description }} />
                  </div>
                  {(selectedEventForDetails.attentionPoints && selectedEventForDetails.attentionPoints !== '<p></p>') && (
                      <div className="mt-4 p-4 bg-orange-50 border border-orange-200 dark:bg-gray-800 dark:border-orange-500 rounded-md">
                          <h4 className="font-bold text-orange-800 dark:text-orange-400 border-b border-orange-200 dark:border-gray-700 pb-2 mb-2 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              Pontos de Atenção
                          </h4>
                          <div className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap ml-2 break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedEventForDetails.attentionPoints }} />
                      </div>
                  )}
                  {selectedEventForDetails.nextSteps && (
                      <div>
                          <h4 className="font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2 bg-gray-50 dark:bg-gray-700 p-2 rounded-t-md mt-4">Próximos Passos</h4>
                          <p className="text-gray-800 dark:text-gray-200 mt-2 text-sm">{selectedEventForDetails.nextSteps}</p>
                      </div>
                  )}
              </div>
          )}
      </Modal>

    </div>
  );
};

export default EconomicGroupDetailsPage;
