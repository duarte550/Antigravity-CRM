import React, { useState, useEffect, useMemo } from 'react';
import { Page } from '../types';
import type { CargoVoto } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckCircle, Clock, ArrowLeft, Loader2, ExternalLink, Video,
  ThumbsUp, ThumbsDown, MessageCircle, Calendar, Users, Filter,
  ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react';

interface Voto {
  id: number;
  item_pauta_id: number;
  user_id?: number;
  user_nome?: string;
  tipo_voto: string;
  cargo_voto?: string;
  comentario?: string;
  created_at?: string;
}

interface AprovacaoItem {
  id: number;
  comite_id: number;
  titulo: string;
  descricao?: string;
  tipo: string;
  video_url?: string;
  video_duracao?: string;
  prioridade: string;
  operation_id?: number;
  operation_name?: string;
  tipo_caso: string;
  criador_nome?: string;
  created_at?: string;
  comite_data: string;
  comite_status: string;
  comite_tipo: string;
  comite_area?: string;
  comite_dia_semana?: string;
  comite_horario?: string;
  votos: Voto[];
  meu_voto?: Voto | null;
  total_votos: number;
  votos_aprovado: number;
  votos_reprovado: number;
  votos_discussao: number;
}

interface MinhasAprovacoesPageProps {
  apiUrl: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  onNavigate: (page: Page, id?: number) => void;
}

const MinhasAprovacoesPage: React.FC<MinhasAprovacoesPageProps> = ({
  apiUrl, showToast, pushToGenericQueue, onNavigate
}) => {
  const [aprovacoes, setAprovacoes] = useState<AprovacaoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [voteComments, setVoteComments] = useState<Record<number, string>>({});
  const [filterArea, setFilterArea] = useState<string>('all');

  const { user: authUser, canVote, hasRole } = useAuth();
  const userId = authUser.id;
  const userName = authUser.nome;

  const VOTING_CARGOS: CargoVoto[] = ['gestao', 'risco', 'diretoria'];
  const userCanVote = VOTING_CARGOS.some(cargo => canVote(cargo));

  const getUserCargoVoto = (): CargoVoto | undefined => {
    if (hasRole('diretor_presidente')) return 'diretoria';
    if (hasRole('gestor')) return 'gestao';
    if (hasRole('risco')) return 'risco';
    return undefined;
  };

  useEffect(() => { fetchAprovacoes(); }, [userId]);

  const fetchAprovacoes = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/aprovacoes?user_id=${userId}`);
      if (res.ok) setAprovacoes(await res.json());
    } catch (e) {
      console.error('Error fetching aprovacoes:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const pendentes = useMemo(() => {
    let items = aprovacoes.filter(a => !a.meu_voto);
    if (filterArea !== 'all') items = items.filter(a => a.comite_area === filterArea);
    return items;
  }, [aprovacoes, filterArea]);

  const concluidas = useMemo(() => {
    let items = aprovacoes.filter(a => !!a.meu_voto);
    if (filterArea !== 'all') items = items.filter(a => a.comite_area === filterArea);
    return items;
  }, [aprovacoes, filterArea]);

  const areas = useMemo(() => {
    const set = new Set(aprovacoes.map(a => a.comite_area).filter(Boolean));
    return Array.from(set) as string[];
  }, [aprovacoes]);

  const handleVote = async (itemId: number, tipoVoto: string) => {
    if (!userCanVote) {
      showToast('Você não tem permissão para votar.', 'error');
      return;
    }
    const cargoVoto = getUserCargoVoto();
    const comentario = voteComments[itemId] || '';

    const newVoto: Voto = {
      id: Date.now(), item_pauta_id: itemId, user_id: userId, user_nome: userName,
      tipo_voto: tipoVoto, cargo_voto: cargoVoto, comentario, created_at: new Date().toISOString(),
    };

    // Optimistic
    setAprovacoes(prev => prev.map(a => {
      if (a.id !== itemId) return a;
      const filteredVotos = a.votos.filter(v => v.user_id !== userId);
      const newVotos = [...filteredVotos, newVoto];
      return {
        ...a,
        votos: newVotos,
        meu_voto: newVoto,
        total_votos: newVotos.length,
        votos_aprovado: newVotos.filter(v => v.tipo_voto === 'aprovado').length,
        votos_reprovado: newVotos.filter(v => v.tipo_voto === 'reprovado').length,
        votos_discussao: newVotos.filter(v => v.tipo_voto === 'discussao').length,
      };
    }));
    setVoteComments(prev => ({ ...prev, [itemId]: '' }));

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/votos`, 'POST', {
      user_id: userId, user_nome: userName, tipo_voto: tipoVoto,
      cargo_voto: cargoVoto, comentario,
    });
    showToast(`Voto registrado: ${tipoVoto === 'aprovado' ? 'Aprovado' : tipoVoto === 'reprovado' ? 'Reprovado' : 'Discussão'}`, 'success');
  };

  const toggleExpand = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const formatDateTime = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return d; }
  };

  const VotoBadge: React.FC<{ tipo: string }> = ({ tipo }) => {
    const map: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
      aprovado: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Aprovado', icon: <ThumbsUp className="w-3 h-3" /> },
      reprovado: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Reprovado', icon: <ThumbsDown className="w-3 h-3" /> },
      discussao: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Discussão', icon: <MessageCircle className="w-3 h-3" /> },
    };
    const s = map[tipo] || map.discussao;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  const renderAprovacaoCard = (item: AprovacaoItem, isPendente: boolean) => {
    const isExpanded = expandedItems.has(item.id);
    const isComiteFuturo = item.comite_status === 'agendado';

    return (
      <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-xl border transition-all duration-200 overflow-hidden ${
        isPendente
          ? 'border-blue-200 dark:border-blue-800 shadow-sm hover:shadow-md'
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        {/* Header */}
        <div
          className={`px-5 py-4 cursor-pointer transition-colors ${
            isExpanded ? 'bg-gray-50 dark:bg-gray-700/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'
          }`}
          onClick={() => toggleExpand(item.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.titulo}</h3>
                  {item.tipo === 'video' && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                      <Video className="w-3 h-3" /> {item.video_duracao || 'Vídeo'}
                    </span>
                  )}
                  {item.meu_voto && <VotoBadge tipo={item.meu_voto.tipo_voto} />}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {item.operation_name && (
                    <span className="font-medium text-blue-600 dark:text-blue-400">{item.operation_name}</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(item.comite_data)}
                  </span>
                  <span className="capitalize">{item.comite_tipo} — {item.comite_area}</span>
                  {isComiteFuturo && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full uppercase">
                      Agendado
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Vote summary pills */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {item.votos_aprovado > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  <ThumbsUp className="w-2.5 h-2.5" /> {item.votos_aprovado}
                </span>
              )}
              {item.votos_reprovado > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                  <ThumbsDown className="w-2.5 h-2.5" /> {item.votos_reprovado}
                </span>
              )}
              {item.votos_discussao > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <MessageCircle className="w-2.5 h-2.5" /> {item.votos_discussao}
                </span>
              )}
              {item.total_votos === 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">Sem votos</span>
              )}
            </div>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-4">
            {/* Descrição */}
            {item.descricao && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Descrição</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.descricao}</p>
              </div>
            )}

            {/* Links */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onNavigate(Page.COMITE_DETAIL, item.comite_id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 px-3 py-1.5 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir Comitê
              </button>
              {item.tipo === 'video' && item.video_url && (
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 px-3 py-1.5 rounded-lg transition-colors border border-rose-200 dark:border-rose-800"
                >
                  <Video className="w-3.5 h-3.5" /> Assistir Vídeo
                </a>
              )}
            </div>

            {/* Votos existentes */}
            {item.votos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Votos ({item.total_votos})
                </p>
                <div className="space-y-1.5">
                  {item.votos.map(v => (
                    <div key={v.id} className="flex items-center gap-2 text-xs">
                      <VotoBadge tipo={v.tipo_voto} />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{v.user_nome}</span>
                      {v.cargo_voto && (
                        <span className="text-gray-400 dark:text-gray-500 capitalize">({v.cargo_voto})</span>
                      )}
                      {v.comentario && (
                        <span className="text-gray-500 dark:text-gray-400 italic truncate max-w-[200px]">— {v.comentario}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voting area */}
            {userCanVote && (
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {item.meu_voto ? 'Alterar meu voto' : 'Registrar meu voto'}
                </p>
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={voteComments[item.id] || ''}
                    onChange={e => setVoteComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Comentário opcional sobre o voto..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleVote(item.id, 'aprovado')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                        item.meu_voto?.tipo_voto === 'aprovado'
                          ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300 dark:ring-emerald-700'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" /> Aprovar
                    </button>
                    <button
                      onClick={() => handleVote(item.id, 'reprovado')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                        item.meu_voto?.tipo_voto === 'reprovado'
                          ? 'bg-red-600 text-white shadow-md ring-2 ring-red-300 dark:ring-red-700'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40'
                      }`}
                    >
                      <ThumbsDown className="w-4 h-4" /> Reprovar
                    </button>
                    <button
                      onClick={() => handleVote(item.id, 'discussao')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                        item.meu_voto?.tipo_voto === 'discussao'
                          ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300 dark:ring-amber-700'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4" /> Discussão
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Carregando aprovações...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate(Page.COMITES)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Minhas Aprovações</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Casos para aprovação em comitês de investimento
            </p>
          </div>
        </div>
        {/* Area filter */}
        {areas.length > 1 && (
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setFilterArea('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filterArea === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              Todos
            </button>
            {areas.map(area => (
              <button
                key={area}
                onClick={() => setFilterArea(area)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  filterArea === area
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendentes.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pendentes</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{concluidas.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Votadas</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{aprovacoes.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          </div>
        </div>
      </div>

      {/* Pendentes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pendentes de Voto</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold">
            {pendentes.length}
          </span>
        </div>
        {pendentes.length === 0 ? (
          <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma aprovação pendente 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendentes.map(item => renderAprovacaoCard(item, true))}
          </div>
        )}
      </div>

      {/* Concluídas */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Já Votadas</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
            {concluidas.length}
          </span>
        </div>
        {concluidas.length === 0 ? (
          <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <AlertCircle className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum voto registrado ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {concluidas.map(item => renderAprovacaoCard(item, false))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MinhasAprovacoesPage;
