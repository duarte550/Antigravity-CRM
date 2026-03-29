import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Page } from '../types';
import { CheckCircle, Clock, Plus, Calendar, ChevronRight, Users, FileText, Video, AlertCircle, ArrowRight, Loader2, ArrowLeft, ArrowUpRight, Download, Search, X } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, CarouselApi } from '@/components/ui/carousel';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://antigravity-crm-two.vercel.app';

interface ComiteListItem {
  id: number;
  comite_rule_id: number;
  data: string;
  status: string;
  ata_gerada_em?: string | null;
  tipo?: string;
  area?: string;
  dia_da_semana?: string;
  horario?: string;
  itens_count: number;
  itens_titulos?: string[];
  proximos_passos: { id: number; descricao: string; responsavel_nome?: string; status: string; item_titulo?: string }[];
}

interface ComiteRule {
  id: number;
  tipo: string;
  area?: string;
  dia_da_semana?: string;
  horario?: string;
  ativo?: boolean;
}

interface ComitesPageProps {
  apiUrl: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  onNavigate: (page: Page, id?: number) => void;
}

interface PautaOperation {
  id: number;
  name: string;
  area?: string;
  master_group_name?: string;
  is_structuring: boolean;
  pipeline_stage?: string;
}

const AREAS = ['CRI', 'Capital Solutions', 'Mixed'];
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

const ComitesPage: React.FC<ComitesPageProps> = ({ apiUrl, showToast, pushToGenericQueue, onNavigate }) => {
  const [comites, setComites] = useState<ComiteListItem[]>([]);
  const [rules, setRules] = useState<ComiteRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  
  // State for Add Item
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    comite_id: 0,
    titulo: '',
    descricao: '',
    tipo: 'presencial',
    prioridade: 'normal',
    tipo_caso: 'geral',
    video_url: '',
    video_duracao: '',
    operation_id: null as number | null,
  });

  // Operations for Pauta (Revisão / Aprovação)
  const [pautaOpsAtivas, setPautaOpsAtivas] = useState<PautaOperation[]>([]);
  const [pautaOpsEstruturacao, setPautaOpsEstruturacao] = useState<PautaOperation[]>([]);
  const [isLoadingOps, setIsLoadingOps] = useState(false);
  const [opsSearchQuery, setOpsSearchQuery] = useState('');
  const [showNewStructuringForm, setShowNewStructuringForm] = useState(false);
  const [newStructuringOp, setNewStructuringOp] = useState({ name: '', area: 'CRI' });
  const [isSavingStructuring, setIsSavingStructuring] = useState(false);

  // Form state for new rule
  const [newRule, setNewRule] = useState({ tipo: 'investimento', area: 'CRI', dia_da_semana: 'Segunda', horario: '10:00' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [comitesRes, rulesRes] = await Promise.all([
        fetch(`${apiUrl}/api/comite/comites`),
        fetch(`${apiUrl}/api/comite/rules`),
      ]);
      if (comitesRes.ok) setComites(await comitesRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
    } catch (e) {
      console.error('Error fetching comites:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredComites = useMemo(() => {
    if (selectedArea === 'all') return comites;
    return comites.filter(c => c.area === selectedArea);
  }, [comites, selectedArea]);

  // Separate: concluidos (past), agendado (next active)
  const concluidos = useMemo(() =>
    filteredComites.filter(c => c.status === 'concluido').sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    [filteredComites]
  );
  const agendados = useMemo(() =>
    filteredComites.filter(c => c.status === 'agendado').sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()),
    [filteredComites]
  );
  const proximoAtivo = agendados[0] || null;

  const comitesCarrossel = useMemo(() => {
    const arr = [...concluidos.slice().reverse()];
    if (proximoAtivo) {
      arr.push(proximoAtivo);
    }
    return arr;
  }, [concluidos, proximoAtivo]);

  // Handle Carousel focus on load
  useEffect(() => {
    if (carouselApi && comitesCarrossel.length > 0) {
      // Scroll to the "next committee" if it exists (which is at the end of the array)
      const targetIndex = proximoAtivo ? comitesCarrossel.length - 1 : comitesCarrossel.length - 1;
      // Use setTimeout to ensure Embla is fully initialized
      setTimeout(() => {
        carouselApi.scrollTo(targetIndex, true);
      }, 100);
    }
  }, [carouselApi, comitesCarrossel.length, proximoAtivo]);

  const fetchPautaOperations = async () => {
    if (pautaOpsAtivas.length > 0 || isLoadingOps) return;
    setIsLoadingOps(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/operations-for-pauta`);
      if (res.ok) {
        const data = await res.json();
        setPautaOpsAtivas(data.ativas || []);
        setPautaOpsEstruturacao(data.estruturacao || []);
      }
    } catch (e) {
      console.error('Error fetching operations for pauta:', e);
    } finally {
      setIsLoadingOps(false);
    }
  };

  const handleCreateStructuringOp = async () => {
    if (!newStructuringOp.name.trim() || isSavingStructuring) return;
    setIsSavingStructuring(true);
    try {
      const res = await fetch(`${apiUrl}/api/structuring-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStructuringOp.name,
          area: newStructuringOp.area,
          stage: 'Conversa Inicial',
          masterGroupId: 1,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const newOp: PautaOperation = {
          id: created.id,
          name: created.name,
          area: created.area,
          is_structuring: true,
          pipeline_stage: 'Conversa Inicial',
        };
        setPautaOpsEstruturacao(prev => [...prev, newOp]);
        setNewItem(prev => ({ ...prev, operation_id: created.id }));
        setShowNewStructuringForm(false);
        setNewStructuringOp({ name: '', area: 'CRI' });
        showToast('Operação em estruturação criada!', 'success');
      } else {
        showToast('Erro ao criar operação', 'error');
      }
    } catch (e) {
      showToast('Erro ao criar operação', 'error');
    } finally {
      setIsSavingStructuring(false);
    }
  };

  const handleAddItem = async () => {
    // Validation: revisão/aprovação require an operation
    if (newItem.tipo_caso !== 'geral' && !newItem.operation_id) {
      showToast('Selecione uma operação para itens de revisão ou aprovação', 'error');
      return;
    }
    if (!newItem.titulo || !newItem.comite_id || isSavingItem) return;
    setIsSavingItem(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${newItem.comite_id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          criador_user_id: 1,
          criador_nome: 'Usuário',
        }),
      });
      if (res.ok) {
        showToast('Item adicionado à pauta!', 'success');
        setShowAddItemModal(false);
        setNewItem({ comite_id: 0, titulo: '', descricao: '', tipo: 'presencial', prioridade: 'normal', tipo_caso: 'geral', video_url: '', video_duracao: '', operation_id: null });
        fetchData();
      } else {
        showToast('Erro ao adicionar item', 'error');
      }
    } catch (e) {
      showToast('Erro ao adicionar item', 'error');
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleDownloadAta = async (id: number) => {
    showToast(`Gerando Ata do Comitê...`, 'success');
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${id}/relatorio`);
      if (res.ok) {
        const data = await res.json();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(data.html);
          win.document.close();
        }
      } else {
        showToast('Erro ao gerar ata', 'error');
      }
    } catch (e) {
      showToast('Erro ao gerar ata', 'error');
    }
  };

  const handleCreateRule = async () => {
    if (isSavingRule) return;
    setIsSavingRule(true);

    // Optimistic: add rule to local state immediately
    const optimisticRule: ComiteRule = {
      id: -Date.now(),
      tipo: newRule.tipo,
      area: newRule.area,
      dia_da_semana: newRule.dia_da_semana,
      horario: newRule.horario,
      ativo: true,
    };
    setRules(prev => [...prev, optimisticRule]);
    setShowNewRuleModal(false);
    showToast('Regra criada!', 'success');

    try {
      const res = await fetch(`${apiUrl}/api/comite/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (res.ok) {
        const serverRule = await res.json();
        // Replace optimistic entry with server data
        setRules(prev => prev.map(r => r.id === optimisticRule.id ? serverRule : r));
        setNewRule({ tipo: 'investimento', area: 'CRI', dia_da_semana: 'Segunda', horario: '10:00' });
        // Refresh comites to pick up auto-generated next comitê
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao criar regra', 'error');
        // Rollback optimistic
        setRules(prev => prev.filter(r => r.id !== optimisticRule.id));
      }
    } catch (e) {
      showToast('Erro ao criar regra', 'error');
      setRules(prev => prev.filter(r => r.id !== optimisticRule.id));
    } finally {
      setIsSavingRule(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const activeRules = rules.filter(r => r.ativo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Carregando comitês...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Comitês</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestão de comitês de investimento e monitoramento</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewRuleModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 shadow-sm transition-colors border border-transparent dark:border-blue-500"
          >
            <Calendar className="w-4 h-4" />
            Nova Regra
          </button>
        </div>
      </div>

      <Carousel
        setApi={setCarouselApi}
        opts={{
          align: 'start',
          dragFree: true,
        }}
        className="w-full relative mt-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          {/* Area Tabs */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            <button
              onClick={() => setSelectedArea('all')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                selectedArea === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Todos
            </button>
            {AREAS.map(area => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  selectedArea === area
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {comitesCarrossel.length > 0 && (
              <>
                <CarouselPrevious className="relative inset-0 transform-none h-10 w-10 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white" />
                <CarouselNext className="relative inset-0 transform-none h-10 w-10 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white" />
              </>
            )}
          </div>
        </div>

        {/* Active Rules Summary */}
        {activeRules.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {activeRules.filter(r => selectedArea === 'all' || r.area === selectedArea).map(rule => (
              <div key={rule.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className={`w-2 h-2 rounded-full ${rule.tipo === 'investimento' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize truncate">{rule.tipo} — {rule.area}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{rule.dia_da_semana} · {rule.horario}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Carrossel de Comitês Content */}
        {comitesCarrossel.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <Calendar className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Os comitês serão gerados automaticamente baseados nas suas regras e agendamentos.</p>
          </div>
        ) : (
          <CarouselContent className="-ml-4">
              {comitesCarrossel.map((c) => {
                const isProximo = c.status === 'agendado';
                
                return (
                  <CarouselItem key={c.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3 py-2">
                    <Card className={`h-full min-h-[580px] flex flex-col transition-all duration-300 rounded-2xl border-[#9CA3AF] dark:border-gray-600 ${isProximo ? 'bg-slate-50 border-2 shadow-[8px_8px_16px_-4px_rgba(0,0,0,0.1)] dark:bg-slate-800 dark:shadow-[8px_8px_16px_-4px_rgba(0,0,0,0.4)]' : 'bg-gray-50 border shadow-[4px_4px_10px_-2px_rgba(0,0,0,0.05)] hover:shadow-[6px_6px_12px_-3px_rgba(0,0,0,0.08)] dark:bg-gray-800'}`}>
                      <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 rounded-t-2xl">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${isProximo ? 'bg-blue-100 border-blue-500 text-blue-600 dark:bg-blue-900/60 dark:text-blue-300' : 'bg-emerald-100 border-emerald-500 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300'}`}>
                              {isProximo ? <Clock className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </div>
                            <div>
                              <CardTitle className="text-lg font-bold capitalize text-gray-900 dark:text-white">
                                {c.tipo} — {c.area}
                              </CardTitle>
                              <CardDescription className="text-sm font-medium mt-0.5 dark:text-gray-400">
                                {formatDate(c.data)} {c.horario ? `às ${c.horario}` : ''}
                              </CardDescription>
                            </div>
                          </div>
                          {isProximo && (
                            <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-blue-700 bg-blue-100 rounded-full dark:bg-blue-500/20 dark:text-blue-200 uppercase animate-pulse">
                              PRÓXIMO
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="flex-1 pt-5 pb-5">
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                            <FileText className="w-4 h-4 text-gray-400" /> Principais Pautas
                          </div>
                          {(c.itens_titulos && c.itens_titulos.length > 0) ? (
                            <ul className="list-disc pl-9 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                              {c.itens_titulos.slice(0, 5).map((titulo, i) => (
                                <li key={i} className="line-clamp-1 truncate" title={titulo}>{titulo}</li>
                              ))}
                              {c.itens_titulos.length > 5 && (
                                <li className="text-xs text-gray-400 italic">+ {c.itens_titulos.length - 5} itens</li>
                              )}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 pl-6 italic">Nenhum item na pauta</p>
                          )}
                          {isProximo && (
                            <div className="mt-3 pl-6">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewItem(prev => ({ ...prev, comite_id: c.id }));
                                  setOpsSearchQuery('');
                                  setShowNewStructuringForm(false);
                                  setShowAddItemModal(true);
                                  fetchPautaOperations();
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 px-2.5 py-1.5 rounded-md transition-colors border border-blue-100 dark:border-blue-900/50 shadow-sm"
                              >
                                <Plus className="w-3.5 h-3.5" /> Adicionar na Pauta
                              </button>
                            </div>
                          )}
                        </div>

                        <hr className="my-5 mx-8 border-gray-200 dark:border-white/10" />

                        <div>
                          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                            <CheckCircle className="w-4 h-4 text-gray-400" /> Tarefas & Decisões
                          </div>
                          {c.proximos_passos && c.proximos_passos.length > 0 ? (
                            <div className="space-y-2.5 pl-2">
                              {c.proximos_passos.slice(0, 3).map(pp => (
                                <div key={pp.id} className="flex flex-col gap-0.5 bg-gray-50 dark:bg-white/5 p-2 rounded-md border border-gray-100 dark:border-white/10">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${pp.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-200 line-clamp-2 leading-tight">{pp.descricao}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-1 pl-4">
                                     <span className="text-[10px] text-gray-500 dark:text-gray-400">{pp.responsavel_nome || 'Sem responsável'}</span>
                                     <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-full ${
                                      pp.status === 'concluido'
                                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20'
                                        : 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/20'
                                    }`}>
                                      {pp.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {c.proximos_passos.length > 3 && (
                                <p className="text-xs text-center font-medium text-gray-400 pt-1">+ {c.proximos_passos.length - 3} tarefas ocultas</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 pl-6 italic">Sem tarefas adicionais geradas.</p>
                          )}
                        </div>
                      </CardContent>

                      <CardFooter className="pt-0 pb-4 px-4 flex gap-2 w-full mt-auto">
                        <Button 
                          className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm border-0 dark:bg-blue-600 dark:hover:bg-blue-700 font-semibold transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(Page.COMITE_DETAIL, c.id);
                          }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Abrir Comitê
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="flex-1 text-xs bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-white font-medium shadow-sm transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadAta(c.id);
                          }}
                        >
                          <Download className="w-3.5 h-3.5 mr-1" /> Baixar Ata
                        </Button>
                      </CardFooter>
                    </Card>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
        )}
      </Carousel>


      {/* ─── Modal: Adicionar Item na Pauta ─── */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddItemModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Adicionar Item na Pauta</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
                <input value={newItem.titulo} onChange={e => setNewItem({ ...newItem, titulo: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Título do item" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                <textarea value={newItem.descricao} onChange={e => setNewItem({ ...newItem, descricao: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" rows={3} placeholder="Descrição detalhada..." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={newItem.tipo} onChange={e => setNewItem({ ...newItem, tipo: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="presencial">Presencial</option>
                    <option value="video">Vídeo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridade</label>
                  <select value={newItem.prioridade} onChange={e => setNewItem({ ...newItem, prioridade: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caso</label>
                  <select value={newItem.tipo_caso} onChange={e => setNewItem({ ...newItem, tipo_caso: e.target.value, operation_id: e.target.value === 'geral' ? null : newItem.operation_id })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="geral">Geral</option>
                    <option value="aprovacao">Aprovação</option>
                    <option value="revisao">Revisão</option>
                  </select>
                </div>
              </div>

              {/* ─── Operation Selector (required for revisão / aprovação) ─── */}
              {(newItem.tipo_caso === 'revisao' || newItem.tipo_caso === 'aprovacao') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Operação Vinculada <span className="text-red-500">*</span>
                    <span className="text-xs font-normal text-gray-400 ml-1">
                      ({newItem.tipo_caso === 'revisao' ? 'somente ativas' : 'ativas ou em estruturação'})
                    </span>
                  </label>

                  {/* Selected operation badge */}
                  {newItem.operation_id && (() => {
                    const selectedOp = [...pautaOpsAtivas, ...pautaOpsEstruturacao].find(op => op.id === newItem.operation_id);
                    return selectedOp ? (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20">
                        <div className={`w-2 h-2 rounded-full ${selectedOp.is_structuring ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{selectedOp.name}</span>
                        {selectedOp.is_structuring && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-semibold">Estruturação</span>
                        )}
                        <button
                          onClick={() => setNewItem(prev => ({ ...prev, operation_id: null }))}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    ) : null;
                  })()}

                  {/* Search & list */}
                  {!newItem.operation_id && (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          value={opsSearchQuery}
                          onChange={e => setOpsSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400"
                          placeholder="Buscar operação por nome..."
                        />
                      </div>

                      {isLoadingOps ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                          <span className="ml-2 text-sm text-gray-400">Carregando operações...</span>
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                          {(() => {
                            const filteredAtivas = pautaOpsAtivas.filter(op =>
                              op.name.toLowerCase().includes(opsSearchQuery.toLowerCase()) ||
                              (op.master_group_name || '').toLowerCase().includes(opsSearchQuery.toLowerCase())
                            );
                            const filteredEstruturas = newItem.tipo_caso === 'aprovacao'
                              ? pautaOpsEstruturacao.filter(op =>
                                  op.name.toLowerCase().includes(opsSearchQuery.toLowerCase()) ||
                                  (op.master_group_name || '').toLowerCase().includes(opsSearchQuery.toLowerCase())
                                )
                              : [];

                            if (filteredAtivas.length === 0 && filteredEstruturas.length === 0) {
                              return <div className="px-3 py-4 text-center"><p className="text-sm text-gray-400">Nenhuma operação encontrada</p></div>;
                            }

                            return (
                              <>
                                {filteredAtivas.length > 0 && (
                                  <>
                                    <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 sticky top-0 z-10">
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Operações Ativas ({filteredAtivas.length})</span>
                                    </div>
                                    {filteredAtivas.map(op => (
                                      <button key={`a-${op.id}`} onClick={() => { setNewItem(prev => ({ ...prev, operation_id: op.id })); setOpsSearchQuery(''); }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                        <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{op.name}</span>
                                        {op.area && <span className="text-[10px] text-gray-400">{op.area}</span>}
                                      </button>
                                    ))}
                                  </>
                                )}
                                {filteredEstruturas.length > 0 && (
                                  <>
                                    <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 sticky top-0 z-10">
                                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Em Estruturação ({filteredEstruturas.length})</span>
                                    </div>
                                    {filteredEstruturas.map(op => (
                                      <button key={`s-${op.id}`} onClick={() => { setNewItem(prev => ({ ...prev, operation_id: op.id })); setOpsSearchQuery(''); }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                        <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                                        <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{op.name}</span>
                                        {op.pipeline_stage && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded">{op.pipeline_stage}</span>}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* Create new structuring op */}
                      {newItem.tipo_caso === 'aprovacao' && (
                        <div className="mt-2">
                          {!showNewStructuringForm ? (
                            <button onClick={() => setShowNewStructuringForm(true)} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                              <Plus className="w-3.5 h-3.5" /> Criar nova operação em estruturação
                            </button>
                          ) : (
                            <div className="p-3 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Nova Operação em Estruturação</p>
                              <input value={newStructuringOp.name} onChange={e => setNewStructuringOp(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Nome da operação..." autoFocus />
                              <div className="flex gap-2">
                                <select value={newStructuringOp.area} onChange={e => setNewStructuringOp(prev => ({ ...prev, area: e.target.value }))} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                                  <option value="CRI">CRI</option>
                                  <option value="Capital Solutions">Capital Solutions</option>
                                </select>
                                <button onClick={handleCreateStructuringOp} disabled={!newStructuringOp.name.trim() || isSavingStructuring} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1">
                                  {isSavingStructuring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Criar
                                </button>
                                <button onClick={() => { setShowNewStructuringForm(false); setNewStructuringOp({ name: '', area: 'CRI' }); }} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {newItem.tipo === 'video' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Vídeo</label>
                    <input value={newItem.video_url} onChange={e => setNewItem({ ...newItem, video_url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duração</label>
                    <input value={newItem.video_duracao} onChange={e => setNewItem({ ...newItem, video_duracao: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="15:30" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddItemModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleAddItem} disabled={!newItem.titulo || isSavingItem || (newItem.tipo_caso !== 'geral' && !newItem.operation_id)} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {isSavingItem && <Loader2 className="w-4 h-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ─── Modal: Nova Regra ─── */}
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewRuleModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nova Regra de Comitê</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select value={newRule.tipo} onChange={e => setNewRule({ ...newRule, tipo: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                  <option value="investimento">Investimento</option>
                  <option value="monitoramento">Monitoramento</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Área</label>
                <select value={newRule.area} onChange={e => setNewRule({ ...newRule, area: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dia da Semana</label>
                <select value={newRule.dia_da_semana} onChange={e => setNewRule({ ...newRule, dia_da_semana: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                  {DIAS_SEMANA.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Horário</label>
                <input value={newRule.horario} onChange={e => setNewRule({ ...newRule, horario: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="10:00" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewRuleModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleCreateRule} disabled={isSavingRule} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                {isSavingRule && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar Regra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComitesPage;
