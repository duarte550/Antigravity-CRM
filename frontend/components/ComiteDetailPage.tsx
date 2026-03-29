import React, { useState, useEffect, useMemo } from 'react';
import { Page } from '../types';
import {
  ChevronDown, ChevronRight, CheckCircle, Clock, Video, Users, Plus,
  MessageSquare, ThumbsUp, AlertCircle, ArrowLeft, FileText, Send,
  Eye, EyeOff, Loader2, Lock, Download
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://antigravity-crm-two.vercel.app';

// ─── Local interfaces (API snake_case) ───
interface Secao { id: number; comite_id: number; nome: string; ordem: number; is_default?: boolean }
interface Comentario { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; texto: string; parent_comment_id?: number; created_at?: string; likes: number }
interface Voto { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; tipo_voto: string; cargo_voto?: string; comentario?: string; created_at?: string }
interface VideoAsst { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; assistido?: boolean }
interface ProxPasso { id: number; item_pauta_id?: number; comite_id?: number; descricao: string; responsavel_user_id?: number; responsavel_nome?: string; status: string; created_at?: string }
interface Item {
  id: number; comite_id: number; secao_id?: number; titulo: string; descricao?: string;
  criador_user_id?: number; criador_nome?: string; tipo: string; video_url?: string; video_duracao?: string;
  prioridade: string; operation_id?: number; tipo_caso?: string; created_at?: string;
  comentarios: Comentario[]; votos: Voto[]; videos_assistidos: VideoAsst[]; proximos_passos: ProxPasso[];
}
interface ComiteDetail {
  id: number; comite_rule_id: number; data: string; status: string; ata_gerada_em?: string;
  rule?: { id: number; tipo: string; area?: string; dia_da_semana?: string; horario?: string };
  secoes: Secao[]; itens: Item[]; proximos_passos_gerais?: ProxPasso[];
}

interface ComiteDetailPageProps {
  comiteId: number;
  apiUrl: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  onNavigate: (page: Page, id?: number) => void;
}

const PRIO_COLORS: Record<string, string> = {
  urgente: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
  alta: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  normal: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600',
};

const PRIO_DOT: Record<string, string> = {
  urgente: 'bg-red-500',
  alta: 'bg-amber-500',
  normal: 'bg-gray-400',
};

const ComiteDetailPage: React.FC<ComiteDetailPageProps> = ({ comiteId, apiUrl, showToast, pushToGenericQueue, onNavigate }) => {
  const [comite, setComite] = useState<ComiteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSecoes, setExpandedSecoes] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [newPPTexts, setNewPPTexts] = useState<Record<number, string>>({});
  const [showAddSecaoInput, setShowAddSecaoInput] = useState(false);
  const [newSecaoNome, setNewSecaoNome] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const mockUserId = 1;
  const mockUserName = 'Usuário';

  useEffect(() => {
    fetchDetail();
  }, [comiteId]);

  // Expand all sections by default
  useEffect(() => {
    if (comite) {
      setExpandedSecoes(new Set(comite.secoes.map(s => s.id)));
    }
  }, [comite?.id]);

  const fetchDetail = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}`);
      if (res.ok) setComite(await res.json());
    } catch (e) {
      console.error('Error fetching comite detail:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSecao = (id: number) => {
    setExpandedSecoes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleItem = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isConcluido = comite?.status === 'concluido';

  // ─── Actions ───
  const handleAddComment = async (itemId: number) => {
    const texto = commentTexts[itemId]?.trim();
    if (!texto || isConcluido) return;

    const newComment: Comentario = {
      id: Date.now(), item_pauta_id: itemId, user_id: mockUserId, user_nome: mockUserName,
      texto, created_at: new Date().toISOString(), likes: 0,
    };

    // Optimistic update
    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i =>
          i.id === itemId ? { ...i, comentarios: [...i.comentarios, newComment] } : i
        ),
      };
    });
    setCommentTexts(prev => ({ ...prev, [itemId]: '' }));

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/comentarios`, 'POST', {
      user_id: mockUserId, user_nome: mockUserName, texto,
    });
  };

  const handleToggleLike = async (comentarioId: number, itemId: number) => {
    if (isConcluido) return;
    pushToGenericQueue(`${apiUrl}/api/comite/comentarios/${comentarioId}/like`, 'POST', { user_id: mockUserId });
    // Optimistic toggle
    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i =>
          i.id === itemId ? {
            ...i,
            comentarios: i.comentarios.map(c =>
              c.id === comentarioId ? { ...c, likes: c.likes + 1 } : c
            )
          } : i
        ),
      };
    });
  };

  const handleVote = async (itemId: number, tipoVoto: string) => {
    if (isConcluido) return;
    const newVoto: Voto = {
      id: Date.now(), item_pauta_id: itemId, user_id: mockUserId, user_nome: mockUserName,
      tipo_voto: tipoVoto, created_at: new Date().toISOString(),
    };

    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i =>
          i.id === itemId ? {
            ...i,
            votos: [...i.votos.filter(v => v.user_id !== mockUserId), newVoto]
          } : i
        ),
      };
    });

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/votos`, 'POST', {
      user_id: mockUserId, user_nome: mockUserName, tipo_voto: tipoVoto, cargo_voto: 'risco',
    });
  };

  const handleToggleVideo = async (itemId: number) => {
    if (isConcluido) return;
    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/video-assistido`, 'POST', {
      user_id: mockUserId, user_nome: mockUserName,
    });

    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i => {
          if (i.id !== itemId) return i;
          const existing = i.videos_assistidos.find(v => v.user_id === mockUserId);
          if (existing) {
            return { ...i, videos_assistidos: i.videos_assistidos.map(v => v.user_id === mockUserId ? { ...v, assistido: !v.assistido } : v) };
          }
          return { ...i, videos_assistidos: [...i.videos_assistidos, { id: Date.now(), item_pauta_id: itemId, user_id: mockUserId, user_nome: mockUserName, assistido: true }] };
        }),
      };
    });
  };

  const handleAddProximoPasso = async (itemId: number) => {
    const descricao = newPPTexts[itemId]?.trim();
    if (!descricao || isConcluido) return;

    const newPP: ProxPasso = {
      id: Date.now(), item_pauta_id: itemId, comite_id: comiteId, descricao,
      responsavel_user_id: mockUserId, responsavel_nome: mockUserName, status: 'pendente',
      created_at: new Date().toISOString(),
    };

    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i =>
          i.id === itemId ? { ...i, proximos_passos: [...i.proximos_passos, newPP] } : i
        ),
      };
    });
    setNewPPTexts(prev => ({ ...prev, [itemId]: '' }));

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/proximos-passos`, 'POST', {
      descricao, responsavel_user_id: mockUserId, responsavel_nome: mockUserName,
    });
  };

  const handleAddSecao = async () => {
    if (!newSecaoNome.trim() || isConcluido) return;
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}/secoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: newSecaoNome }),
      });
      if (res.ok) {
        const secao = await res.json();
        setComite(prev => prev ? { ...prev, secoes: [...prev.secoes, secao] } : prev);
        setExpandedSecoes(prev => new Set([...prev, secao.id]));
        setNewSecaoNome('');
        setShowAddSecaoInput(false);
        showToast('Seção adicionada!', 'success');
      }
    } catch (e) {
      showToast('Erro ao adicionar seção', 'error');
    }
  };

  const handleCompletarComite = async () => {
    if (isConcluido) return;
    setIsCompleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}/completar`, { method: 'POST' });
      if (res.ok) {
        showToast('Comitê concluído! Ata gerada.', 'success');
        fetchDetail();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao completar', 'error');
      }
    } catch (e) {
      showToast('Erro ao completar comitê', 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleGetRelatorio = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}/relatorio`);
      if (res.ok) {
        const data = await res.json();
        // Open HTML in new window
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(data.html);
          win.document.close();
        }
      }
    } catch (e) {
      showToast('Erro ao gerar relatório', 'error');
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const formatTime = (d: string) => {
    try { return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };
  const timeAgo = (d?: string) => {
    if (!d) return '';
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Carregando comitê...</span>
      </div>
    );
  }

  if (!comite) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Comitê não encontrado.</p>
        <button onClick={() => onNavigate(Page.COMITES)} className="mt-3 text-blue-600 hover:underline text-sm">Voltar</button>
      </div>
    );
  }

  const itemsBySecao = (secaoId: number) => comite.itens.filter(i => i.secao_id === secaoId);
  const unassignedItems = comite.itens.filter(i => !i.secao_id);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white capitalize">
                Comitê de {comite.rule?.tipo} — {comite.rule?.area}
              </h1>
              {isConcluido ? (
                <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
                  <Lock className="w-3 h-3" /> Concluído
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                  Agendado
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(comite.data)} · {comite.rule?.dia_da_semana} · {comite.rule?.horario}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGetRelatorio}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            Relatório
          </button>
          {!isConcluido && (
            <button
              onClick={handleCompletarComite}
              disabled={isCompleting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Completar Comitê
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Itens', value: comite.itens.length, icon: FileText, color: 'text-blue-500' },
          { label: 'Comentários', value: comite.itens.reduce((s, i) => s + i.comentarios.length, 0), icon: MessageSquare, color: 'text-indigo-500' },
          { label: 'Votos', value: comite.itens.reduce((s, i) => s + i.votos.length, 0), icon: Users, color: 'text-purple-500' },
          { label: 'Vídeos', value: comite.itens.filter(i => i.tipo === 'video').length, icon: Video, color: 'text-rose-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sections (Accordion) */}
      {comite.secoes.map(secao => {
        const secaoItems = itemsBySecao(secao.id);
        const isExpanded = expandedSecoes.has(secao.id);

        return (
          <div key={secao.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Section header */}
            <button
              onClick={() => toggleSecao(secao.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{secao.nome}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {secaoItems.length} {secaoItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
            </button>

            {/* Section items */}
            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-700">
                {secaoItems.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum item nesta seção</p>
                  </div>
                ) : (
                  secaoItems.map(item => {
                    const isItemExpanded = expandedItems.has(item.id);
                    const watchedCount = item.videos_assistidos.filter(v => v.assistido).length;
                    const myVote = item.votos.find(v => v.user_id === mockUserId);

                    return (
                      <div key={item.id} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                        {/* Item collapsed header */}
                        <button
                          onClick={() => toggleItem(item.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                        >
                          <div className={`w-2 h-2 rounded-full ${PRIO_DOT[item.prioridade] || PRIO_DOT.normal}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.titulo}</span>
                              {item.prioridade !== 'normal' && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase border ${PRIO_COLORS[item.prioridade]}`}>
                                  {item.prioridade}
                                </span>
                              )}
                              {item.tipo === 'video' && (
                                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                                  <Video className="w-3 h-3" /> {item.video_duracao || 'Vídeo'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[11px] text-gray-400">{item.criador_nome}</span>
                              {item.comentarios.length > 0 && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                                  <MessageSquare className="w-3 h-3" /> {item.comentarios.length}
                                </span>
                              )}
                              {item.tipo === 'video' && watchedCount > 0 && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                                  <Eye className="w-3 h-3" /> {watchedCount}
                                </span>
                              )}
                            </div>
                          </div>
                          {isItemExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>

                        {/* Item expanded content */}
                        {isItemExpanded && (
                          <div className="px-5 pb-4 space-y-4 bg-gray-50/50 dark:bg-gray-800/50">
                            {/* Description */}
                            {item.descricao && (
                              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.descricao}</p>
                              </div>
                            )}

                            {/* Video section */}
                            {item.tipo === 'video' && (
                              <div className="p-3 bg-rose-50 dark:bg-rose-900/10 rounded-lg border border-rose-200 dark:border-rose-800">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Video className="w-4 h-4 text-rose-500" />
                                    <a href={item.video_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline">
                                      Assistir Vídeo
                                    </a>
                                    {item.video_duracao && <span className="text-xs text-gray-400">({item.video_duracao})</span>}
                                  </div>
                                  {!isConcluido && (
                                    <button
                                      onClick={() => handleToggleVideo(item.id)}
                                      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-colors ${
                                        item.videos_assistidos.find(v => v.user_id === mockUserId)?.assistido
                                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
                                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
                                      }`}
                                    >
                                      {item.videos_assistidos.find(v => v.user_id === mockUserId)?.assistido
                                        ? <><Eye className="w-3 h-3" /> Assistido</>
                                        : <><EyeOff className="w-3 h-3" /> Marcar assistido</>
                                      }
                                    </button>
                                  )}
                                </div>
                                {watchedCount > 0 && (
                                  <div className="flex items-center gap-1 mt-2">
                                    <span className="text-[11px] text-gray-500">Assistiram:</span>
                                    {item.videos_assistidos.filter(v => v.assistido).map(v => (
                                      <span key={v.id} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[10px] font-semibold text-blue-700 dark:text-blue-400" title={v.user_nome}>
                                        {v.user_nome?.[0]?.toUpperCase() || '?'}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Votes (for aprovacao/revisao tipo_caso) */}
                            {(item.tipo_caso === 'aprovacao' || item.tipo_caso === 'revisao') && (
                              <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-2">
                                  {item.tipo_caso === 'aprovacao' ? 'Votação de Aprovação' : 'Votação de Revisão'}
                                </p>
                                <div className="flex items-center gap-3 mb-3">
                                  {[
                                    { key: 'aprovado', label: '✅ Aprovar', color: 'bg-emerald-600 hover:bg-emerald-700' },
                                    { key: 'reprovado', label: '❌ Reprovar', color: 'bg-red-600 hover:bg-red-700' },
                                    { key: 'discussao', label: '💬 Discussão', color: 'bg-amber-600 hover:bg-amber-700' },
                                  ].map(v => (
                                    <button
                                      key={v.key}
                                      onClick={() => handleVote(item.id, v.key)}
                                      disabled={isConcluido}
                                      className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 ${
                                        myVote?.tipo_voto === v.key ? `${v.color} ring-2 ring-offset-2 dark:ring-offset-gray-800` : `${v.color} opacity-70`
                                      }`}
                                    >
                                      {v.label}
                                    </button>
                                  ))}
                                </div>
                                {item.votos.length > 0 && (
                                  <div className="space-y-1">
                                    {item.votos.map(v => (
                                      <div key={v.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{v.user_nome}</span>
                                        <span>votou</span>
                                        <span className={`font-semibold ${
                                          v.tipo_voto === 'aprovado' ? 'text-emerald-600' : v.tipo_voto === 'reprovado' ? 'text-red-600' : 'text-amber-600'
                                        }`}>
                                          {v.tipo_voto === 'aprovado' ? '✅ Aprovado' : v.tipo_voto === 'reprovado' ? '❌ Reprovado' : '💬 Discussão'}
                                        </span>
                                        {v.comentario && <span className="text-gray-400 italic">— {v.comentario}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Comments feed */}
                            <div>
                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                                Comentários ({item.comentarios.length})
                              </p>
                              {item.comentarios.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nenhum comentário ainda.</p>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                  {item.comentarios.map(c => (
                                    <div key={c.id} className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">{c.user_nome?.[0]?.toUpperCase() || '?'}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{c.user_nome}</span>
                                          <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                                        </div>
                                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{c.texto}</p>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleLike(c.id, item.id); }}
                                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 transition-colors p-1"
                                      >
                                        <ThumbsUp className="w-3 h-3" />
                                        {c.likes > 0 && c.likes}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* New comment input */}
                              {!isConcluido && (
                                <div className="flex items-center gap-2 mt-2">
                                  <input
                                    value={commentTexts[item.id] || ''}
                                    onChange={e => setCommentTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddComment(item.id)}
                                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                                    placeholder="Escrever comentário..."
                                  />
                                  <button
                                    onClick={() => handleAddComment(item.id)}
                                    disabled={!commentTexts[item.id]?.trim()}
                                    className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Próximos passos */}
                            <div>
                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                                Próximos Passos ({item.proximos_passos.length})
                              </p>
                              {item.proximos_passos.map(pp => (
                                <div key={pp.id} className="flex items-center gap-2 py-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${pp.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{pp.descricao}</span>
                                  <span className="text-[10px] text-gray-400">{pp.responsavel_nome}</span>
                                </div>
                              ))}
                              {!isConcluido && (
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    value={newPPTexts[item.id] || ''}
                                    onChange={e => setNewPPTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddProximoPasso(item.id)}
                                    className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                                    placeholder="Novo próximo passo..."
                                  />
                                  <button onClick={() => handleAddProximoPasso(item.id)} disabled={!newPPTexts[item.id]?.trim()} className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-xs">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add section button */}
      {!isConcluido && (
        <div className="flex justify-center">
          {showAddSecaoInput ? (
            <div className="flex items-center gap-2">
              <input
                value={newSecaoNome}
                onChange={e => setNewSecaoNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSecao()}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Nome da seção..."
                autoFocus
              />
              <button onClick={handleAddSecao} className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Adicionar</button>
              <button onClick={() => { setShowAddSecaoInput(false); setNewSecaoNome(''); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSecaoInput(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Seção
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ComiteDetailPage;
