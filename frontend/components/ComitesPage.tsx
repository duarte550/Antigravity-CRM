import React, { useState, useEffect, useMemo } from 'react';
import { Page } from '../types';
import { CheckCircle, Clock, Plus, Calendar, ChevronRight, Users, FileText, Video, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

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

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Timeline de Comitês</h2>

        {filteredComites.length === 0 ? (
          <div className="text-center py-12">
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
          <>
            {/* Horizontal timeline */}
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" />

              <div className="flex items-start gap-0 overflow-x-auto pb-4 relative">
                {/* Completed comites */}
                {concluidos.slice(0, 6).reverse().map((c, idx) => (
                  <div
                    key={c.id}
                    className="flex flex-col items-center min-w-[140px] cursor-pointer group"
                    onClick={() => onNavigate(Page.COMITE_DETAIL, c.id)}
                  >
                    <div className="relative z-10 w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 border-2 border-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatShortDate(c.data)}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize mt-0.5">{c.tipo}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{c.area}</p>
                      {c.itens_count > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                          <FileText className="w-3 h-3" /> {c.itens_count}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Next active (highlighted) */}
                {proximoAtivo && (
                  <div
                    className="flex flex-col items-center min-w-[160px] cursor-pointer group"
                    onClick={() => onNavigate(Page.COMITE_DETAIL, proximoAtivo.id)}
                  >
                    <div className="relative z-10 w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 border-3 border-blue-500 flex items-center justify-center shadow-lg shadow-blue-200/50 dark:shadow-blue-900/50 animate-pulse group-hover:animate-none group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7 text-blue-500" />
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{formatDate(proximoAtivo.data)}</p>
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 capitalize mt-0.5">{proximoAtivo.tipo}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{proximoAtivo.area}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                        PRÓXIMO
                      </span>
                    </div>
                  </div>
                )}

                {/* Future ones hidden (just a hint) */}
                {agendados.length > 1 && (
                  <div className="flex flex-col items-center min-w-[100px]">
                    <div className="relative z-10 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                      <span className="text-xs text-gray-400">+{agendados.length - 1}</span>
                    </div>
                    <p className="mt-3 text-[10px] text-gray-400">futuros</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recent completed comites with próximos passos */}
      {concluidos.slice(0, 4).map(c => (
        <div
          key={c.id}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer group"
          onClick={() => onNavigate(Page.COMITE_DETAIL, c.id)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                  {c.tipo} — {c.area}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.data)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{c.itens_count} itens</span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
          </div>

          {/* Próximos passos deste comitê */}
          {c.proximos_passos && c.proximos_passos.length > 0 && (
            <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Próximos Passos</p>
              <div className="space-y-1.5">
                {c.proximos_passos.slice(0, 3).map(pp => (
                  <div key={pp.id} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${pp.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{pp.descricao}</span>
                    {pp.responsavel_nome && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{pp.responsavel_nome}</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      pp.status === 'concluido'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {pp.status === 'concluido' ? 'Concluído' : 'Pendente'}
                    </span>
                  </div>
                ))}
                {c.proximos_passos.length > 3 && (
                  <p className="text-[10px] text-gray-400">+ {c.proximos_passos.length - 3} mais</p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

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
