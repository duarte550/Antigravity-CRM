import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Page } from '../types';
import { CheckCircle, Clock, Plus, Calendar, ChevronRight, Users, FileText, Video, AlertCircle, ArrowRight, Loader2, ArrowLeft, ArrowUpRight, Download } from 'lucide-react';
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

const AREAS = ['CRI', 'Capital Solutions', 'Mixed'];
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

const ComitesPage: React.FC<ComitesPageProps> = ({ apiUrl, showToast, pushToGenericQueue, onNavigate }) => {
  const [comites, setComites] = useState<ComiteListItem[]>([]);
  const [rules, setRules] = useState<ComiteRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showNewComiteModal, setShowNewComiteModal] = useState(false);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  // Form state for new item
  const [newItem, setNewItem] = useState({
    comite_id: 0,
    titulo: '',
    descricao: '',
    tipo: 'presencial',
    prioridade: 'normal',
    tipo_caso: 'geral',
    video_url: '',
    video_duracao: '',
  });

  // Form state for new comite
  const [newComite, setNewComite] = useState({ comite_rule_id: 0, data: '' });

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

  const handleDownloadAta = (id: number) => {
    showToast(`Baixando Ata do Comitê #${id}...`, 'success');
    // Implementação mockada de PDF
    setTimeout(() => {
      showToast(`Ata baixada com sucesso!`, 'success');
    }, 1500);
  };

  const handleAddItem = async () => {
    if (!newItem.titulo || !newItem.comite_id) return;
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
        setNewItem({ comite_id: 0, titulo: '', descricao: '', tipo: 'presencial', prioridade: 'normal', tipo_caso: 'geral', video_url: '', video_duracao: '' });
        fetchData();
      }
    } catch (e) {
      showToast('Erro ao adicionar item', 'error');
    }
  };

  const handleCreateComite = async () => {
    if (!newComite.comite_rule_id || !newComite.data) return;
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComite),
      });
      if (res.ok) {
        showToast('Comitê criado!', 'success');
        setShowNewComiteModal(false);
        setNewComite({ comite_rule_id: 0, data: '' });
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao criar comitê', 'error');
      }
    } catch (e) {
      showToast('Erro ao criar comitê', 'error');
    }
  };

  const handleCreateRule = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/comite/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (res.ok) {
        showToast('Regra criada!', 'success');
        setShowNewRuleModal(false);
        setNewRule({ tipo: 'investimento', area: 'CRI', dia_da_semana: 'Segunda', horario: '10:00' });
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao criar regra', 'error');
      }
    } catch (e) {
      showToast('Erro ao criar regra', 'error');
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
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Nova Regra
          </button>
          <button
            onClick={() => setShowNewComiteModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Comitê
          </button>
          <button
            onClick={() => setShowAddItemModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Adicionar Item na Pauta
          </button>
        </div>
      </div>

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

      {/* Active Rules Summary */}
      {activeRules.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Carrossel de Comitês */}
      <div className="w-full relative mt-8">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Linha do Tempo de Comitês</h2>
          <div className="flex gap-2">
            <CarouselPrevious className="relative inset-0 transform-none h-10 w-10 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white" />
            <CarouselNext className="relative inset-0 transform-none h-10 w-10 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white" />
          </div>
        </div>
        
        {comitesCarrossel.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <Calendar className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhum comitê encontrado para os filtros selecionados.</p>
            <button
              onClick={() => setShowNewComiteModal(true)}
              className="mt-3 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
            >
              Criar primeiro comitê
            </button>
          </div>
        ) : (
          <Carousel
            setApi={setCarouselApi}
            opts={{
              align: 'start',
              dragFree: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {comitesCarrossel.map((c) => {
                const isProximo = c.status === 'agendado';
                const uniquePautas = Array.from(new Set(c.proximos_passos?.map(pp => pp.item_titulo).filter(Boolean)));
                
                return (
                  <CarouselItem key={c.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                    <Card className={`h-full flex flex-col border-2 transition-all duration-300 ${isProximo ? 'border-blue-500 shadow-lg shadow-blue-500/10 dark:bg-gray-800/80 scale-[1.02]' : 'border-gray-200 dark:border-gray-700 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                      <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 rounded-t-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${isProximo ? 'bg-blue-100 border-blue-500 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-emerald-100 border-emerald-500 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>
                              {isProximo ? <Clock className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </div>
                            <div>
                              <CardTitle className="text-lg font-bold capitalize text-gray-900 dark:text-white">
                                {c.tipo} — {c.area}
                              </CardTitle>
                              <CardDescription className="text-sm font-medium mt-0.5">
                                {formatDate(c.data)} {c.horario ? `às ${c.horario}` : ''}
                              </CardDescription>
                            </div>
                          </div>
                          {isProximo && (
                            <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-blue-700 bg-blue-100 rounded-full dark:bg-blue-900/60 dark:text-blue-300 uppercase animate-pulse">
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
                          {uniquePautas.length > 0 ? (
                            <ul className="list-disc pl-9 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              {uniquePautas.map((p, i) => (
                                <li key={i} className="line-clamp-1 truncate" title={p as string}>{p as string}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-500 pl-6 italic">{c.itens_count} itens na pauta</p>
                          )}
                        </div>

                        <hr className="my-5 mx-8 border-gray-200 dark:border-gray-700/80" />

                        <div>
                          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                            <CheckCircle className="w-4 h-4 text-gray-400" /> Tarefas & Decisões
                          </div>
                          {c.proximos_passos && c.proximos_passos.length > 0 ? (
                            <div className="space-y-2.5 pl-2">
                              {c.proximos_passos.slice(0, 3).map(pp => (
                                <div key={pp.id} className="flex flex-col gap-0.5 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-md border border-gray-100 dark:border-gray-800">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${pp.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2 leading-tight">{pp.descricao}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-1 pl-4">
                                     <span className="text-[10px] text-gray-500">{pp.responsavel_nome || 'Sem responsável'}</span>
                                     <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-full ${
                                      pp.status === 'concluido'
                                        ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30'
                                        : 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30'
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
                            <p className="text-sm text-gray-500 dark:text-gray-500 pl-6 italic">Sem tarefas adicionais geradas.</p>
                          )}
                        </div>
                      </CardContent>

                      <CardFooter className="pt-0 pb-4 px-4 flex gap-2 w-full mt-auto">
                        <Button 
                          variant="outline" 
                          className="flex-1 text-xs border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(Page.COMITE_DETAIL, c.id);
                          }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Abrir Comitê
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="flex-1 text-xs"
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
          </Carousel>
        )}
      </div>

      {/* ─── Modal: Adicionar Item na Pauta ─── */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddItemModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Adicionar Item na Pauta</h2>

            {/* Select comitê */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comitê</label>
              <select
                value={newItem.comite_id}
                onChange={e => setNewItem({ ...newItem, comite_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value={0}>Selecionar comitê...</option>
                {agendados.map(c => (
                  <option key={c.id} value={c.id}>{formatDate(c.data)} — {c.tipo} ({c.area})</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
              <input
                value={newItem.titulo}
                onChange={e => setNewItem({ ...newItem, titulo: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="Título do item"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
              <textarea
                value={newItem.descricao}
                onChange={e => setNewItem({ ...newItem, descricao: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                rows={3}
                placeholder="Descrição detalhada..."
              />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select
                  value={newItem.tipo}
                  onChange={e => setNewItem({ ...newItem, tipo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="presencial">Presencial</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridade</label>
                <select
                  value={newItem.prioridade}
                  onChange={e => setNewItem({ ...newItem, prioridade: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caso</label>
                <select
                  value={newItem.tipo_caso}
                  onChange={e => setNewItem({ ...newItem, tipo_caso: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="geral">Geral</option>
                  <option value="aprovacao">Aprovação</option>
                  <option value="revisao">Revisão</option>
                </select>
              </div>
            </div>

            {newItem.tipo === 'video' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Vídeo</label>
                  <input
                    value={newItem.video_url}
                    onChange={e => setNewItem({ ...newItem, video_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duração</label>
                  <input
                    value={newItem.video_duracao}
                    onChange={e => setNewItem({ ...newItem, video_duracao: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="15:30"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddItemModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItem.titulo || !newItem.comite_id}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Novo Comitê ─── */}
      {showNewComiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewComiteModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Novo Comitê</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Regra</label>
              <select
                value={newComite.comite_rule_id}
                onChange={e => setNewComite({ ...newComite, comite_rule_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value={0}>Selecionar regra...</option>
                {activeRules.map(r => (
                  <option key={r.id} value={r.id}>{r.tipo} — {r.area} ({r.dia_da_semana})</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
              <input
                type="datetime-local"
                value={newComite.data}
                onChange={e => setNewComite({ ...newComite, data: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewComiteModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleCreateComite} disabled={!newComite.comite_rule_id || !newComite.data} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">Criar</button>
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
              <button onClick={handleCreateRule} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Criar Regra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComitesPage;
