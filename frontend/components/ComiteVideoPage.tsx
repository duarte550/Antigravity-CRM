import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Page } from '../types';
import type { CargoVoto } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Video, Eye, EyeOff, ThumbsUp, Send, MessageSquare,
  AlertTriangle, Shield, TrendingUp, Clock, CheckCircle, XCircle,
  MessageCircle, ChevronDown, ChevronRight, Loader2, CornerDownRight,
  AlertCircle, Star, Users, ExternalLink
} from 'lucide-react';



// ─── Types for enriched data ───
interface VotoHistorico {
  tipo_voto_anterior?: string;
  tipo_voto_novo: string;
  changed_at: string;
}

interface Voto {
  id: number;
  item_pauta_id: number;
  user_id?: number;
  user_nome?: string;
  tipo_voto: string;
  cargo_voto?: string;
  comentario?: string;
  created_at?: string;
  updated_at?: string;
  historico?: VotoHistorico[];
}

interface Comentario {
  id: number;
  item_pauta_id: number;
  user_id?: number;
  user_nome?: string;
  texto: string;
  parent_comment_id?: number;
  created_at?: string;
  likes: number;
  liked_by_me?: boolean;
}

interface OperationRisk {
  id: number;
  title: string;
  description?: string;
  severity: string;
  created_at?: string;
}

interface OperationData {
  id: number;
  name: string;
  area?: string;
  rating_operation?: string;
  watchlist?: string;
  status?: string;
  risks: OperationRisk[];
  latest_rating?: {
    rating_operation?: string;
    rating_group?: string;
    watchlist?: string;
    sentiment?: string;
    date?: string;
  };
}

interface FarolData {
  status: 'pendente' | 'aprovado' | 'reprovado' | 'discussao';
  votos: Voto[];
}

interface VideoAsst {
  id: number;
  item_pauta_id: number;
  user_id?: number;
  user_nome?: string;
  assistido?: boolean;
}

interface ItemFull {
  item: {
    id: number;
    comite_id: number;
    secao_id?: number;
    titulo: string;
    descricao?: string;
    criador_user_id?: number;
    criador_nome?: string;
    tipo: string;
    video_url?: string;
    video_duracao?: string;
    prioridade: string;
    operation_id?: number;
    tipo_caso?: string;
    created_at?: string;
  };
  comite: {
    id: number;
    data: string;
    status: string;
    rule?: {
      tipo: string;
      area: string;
      dia_da_semana?: string;
      horario?: string;
    };
  };
  comentarios: Comentario[];
  votos: Voto[];
  farois: Record<string, FarolData>;
  videos_assistidos: VideoAsst[];
  proximos_passos: any[];
  operation?: OperationData;
}

interface ComiteVideoPageProps {
  itemPautaId: number;
  comiteId: number;
  apiUrl: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  pushToGenericQueue: (url: string, method: string, payload: any) => void;
  onNavigate: (page: Page, id?: number) => void;
}

// ─── Helpers ───
const formatDate = (d?: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const timeAgo = (d?: string) => {
  if (!d) return '';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const buildStreamEmbedUrl = (url?: string): string | null => {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Microsoft Stream (classic) — only embed if it's a real embed URL already
    if (hostname.includes('microsoftstream.com') || hostname.includes('web.microsoftstream.com')) {
      if (url.includes('/embed/')) return url;
      // Classic Stream watch URL → embed URL
      if (url.includes('/video/')) return url.replace('/video/', '/embed/video/');
      return null; // Can't safely embed other Stream URL patterns
    }

    // Microsoft Stream on SharePoint (new) — uses sharepoint.com with /_layouts/15/embed.aspx
    if (hostname.includes('sharepoint.com')) {
      if (url.includes('/_layouts/15/embed.aspx')) return url;
      if (url.includes('/stream/video/')) return url; // SharePoint stream player
      return null; // Generic SharePoint links aren't embeddable
    }

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      const ytId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
      if (ytId) return `https://www.youtube.com/embed/${ytId[1]}`;
      return null;
    }

    // Vimeo
    if (hostname.includes('vimeo.com')) {
      const vimeoId = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      if (vimeoId) return `https://player.vimeo.com/video/${vimeoId[1]}`;
      return null;
    }

    // Loom
    if (hostname.includes('loom.com')) {
      if (url.includes('/embed/')) return url;
      const loomId = url.match(/loom\.com\/share\/([\w]+)/);
      if (loomId) return `https://www.loom.com/embed/${loomId[1]}`;
      return null;
    }

    // Direct video files (mp4, webm, etc.) — these won't work well in iframes
    if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
      return null; // These are handled by a <video> element, not iframe
    }

    // URLs that already look like embeds
    if (url.includes('/embed') || url.includes('iframe')) return url;

    // Unknown URL — don't attempt iframe embed to avoid cross-origin errors
    return null;
  } catch {
    // Invalid URL
    return null;
  }
};


// ─── Farol (Traffic Light) Component ───
const FarolIndicator: React.FC<{
  label: string;
  data: FarolData;
  icon: React.ReactNode;
}> = ({ label, data, icon }) => {
  const colorMap: Record<string, { bg: string; ring: string; text: string; glow: string }> = {
    aprovado: { bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', glow: 'shadow-emerald-500/25' },
    reprovado: { bg: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600 dark:text-red-400', glow: 'shadow-red-500/25' },
    discussao: { bg: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-600 dark:text-amber-400', glow: 'shadow-amber-500/25' },
    pendente: { bg: 'bg-gray-300 dark:bg-gray-600', ring: 'ring-gray-300/30', text: 'text-gray-500 dark:text-gray-400', glow: '' },
  };
  const statusLabels: Record<string, string> = {
    aprovado: '✅ Aprovado',
    reprovado: '❌ Reprovado',
    discussao: '💬 Em Discussão',
    pendente: '⏳ Pendente',
  };

  const colors = colorMap[data.status] || colorMap.pendente;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center space-y-3">
      {/* Traffic light circle */}
      <div className="flex justify-center">
        <div className={`w-12 h-12 rounded-full ${colors.bg} ${colors.glow} shadow-lg ring-4 ${colors.ring} flex items-center justify-center transition-all duration-500`}>
          {icon}
        </div>
      </div>

      {/* Label */}
      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold ${colors.text}`}>{statusLabels[data.status]}</p>

      {/* Voters below */}
      {data.votos.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          {data.votos.map(v => (
            <div key={v.id} className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{v.user_nome}</span>
              {v.comentario && (
                <p className="italic text-gray-400 dark:text-gray-500 mt-0.5">"{v.comentario}"</p>
              )}
              <p className="text-[10px] text-gray-400">{timeAgo(v.updated_at || v.created_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 italic pt-2 border-t border-gray-100 dark:border-gray-700">
          Ninguém votou ainda
        </p>
      )}
    </div>
  );
};

// ─── Threaded Comment Component ───
const CommentThread: React.FC<{
  comment: Comentario;
  replies: Comentario[];
  allComments: Comentario[];
  onLike: (commentId: number) => void;
  onReply: (parentId: number) => void;
  replyingTo: number | null;
  replyText: string;
  setReplyText: (text: string) => void;
  onSubmitReply: () => void;
  isConcluido: boolean;
}> = ({ comment, replies, allComments, onLike, onReply, replyingTo, replyText, setReplyText, onSubmitReply, isConcluido }) => {
  const [showReplies, setShowReplies] = useState(true);

  return (
    <div className="group">
      <div className="flex items-start gap-2.5 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-[11px] font-bold text-white">{comment.user_nome?.[0]?.toUpperCase() || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-900 dark:text-white">{comment.user_nome}</span>
            <span className="text-[10px] text-gray-400">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{comment.texto}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onLike(comment.id)}
              className={`flex items-center gap-1 text-[11px] transition-colors ${
                comment.liked_by_me
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-400 hover:text-blue-500'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              {comment.likes > 0 && comment.likes}
            </button>
            {!isConcluido && (
              <button
                onClick={() => onReply(comment.id)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                <CornerDownRight className="w-3 h-3" />
                Responder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reply input */}
      {replyingTo === comment.id && !isConcluido && (
        <div className="ml-10 mt-2 flex items-center gap-2">
          <input
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSubmitReply()}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
            placeholder={`Respondendo a ${comment.user_nome}...`}
            autoFocus
          />
          <button
            onClick={onSubmitReply}
            disabled={!replyText.trim()}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline py-1"
          >
            {showReplies ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}
          </button>
          {showReplies && replies.map(reply => (
            <CommentThread
              key={reply.id}
              comment={reply}
              replies={allComments.filter(c => c.parent_comment_id === reply.id)}
              allComments={allComments}
              onLike={onLike}
              onReply={onReply}
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              onSubmitReply={onSubmitReply}
              isConcluido={isConcluido}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════

const ComiteVideoPage: React.FC<ComiteVideoPageProps> = ({
  itemPautaId,
  comiteId,
  apiUrl,
  showToast,
  pushToGenericQueue,
  onNavigate,
}) => {
  const [data, setData] = useState<ItemFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [voteComment, setVoteComment] = useState('');
  const [showVoteCommentFor, setShowVoteCommentFor] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);

  const { user: authUser, canVote, hasRole } = useAuth();
  const mockUserId = authUser.id;
  const mockUserName = authUser.nome;

  const VOTING_CARGOS: CargoVoto[] = ['gestao', 'risco', 'diretoria'];
  const userCanVote = VOTING_CARGOS.some(cargo => canVote(cargo));

  const getUserCargoVoto = (): CargoVoto | undefined => {
    if (hasRole('diretor_presidente')) return 'diretoria';
    if (hasRole('gestor')) return 'gestao';
    if (hasRole('risco')) return 'risco';
    return undefined;
  };

  // ─── Fetch enriched data ───
  useEffect(() => {
    setIframeError(false);
    fetchData();
  }, [itemPautaId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/itens/${itemPautaId}/full?user_id=${mockUserId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        showToast('Erro ao carregar dados do item', 'error');
      }
    } catch (e) {
      console.error('Error fetching item full:', e);
      showToast('Erro de conexão', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const isConcluido = data?.comite?.status === 'concluido';
  const isAprovacao = data?.item?.tipo_caso === 'aprovacao';

  // ─── Handlers ───
  const handleVote = (tipoVoto: string) => {
    if (isConcluido || !userCanVote) return;

    // Show comment prompt for reprovado/discussao
    if (tipoVoto !== 'aprovado') {
      setShowVoteCommentFor(tipoVoto);
      return;
    }

    submitVote(tipoVoto, '');
  };

  const submitVote = (tipoVoto: string, comentario: string) => {
    const cargoVoto = getUserCargoVoto();

    const newVoto: Voto = {
      id: Date.now(),
      item_pauta_id: itemPautaId,
      user_id: mockUserId,
      user_nome: mockUserName,
      tipo_voto: tipoVoto,
      cargo_voto: cargoVoto,
      comentario,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const filteredVotos = prev.votos.filter(v => v.user_id !== mockUserId);
      const updatedVotos = [...filteredVotos, newVoto];

      // Recompute farois
      const newFarois: Record<string, FarolData> = {};
      for (const cargo of ['gestao', 'risco', 'diretoria']) {
        const cargoVotos = updatedVotos.filter(v => v.cargo_voto === cargo);
        if (!cargoVotos.length) {
          newFarois[cargo] = { status: 'pendente', votos: [] };
        } else {
          const hasReprovado = cargoVotos.some(v => v.tipo_voto === 'reprovado');
          const hasDiscussao = cargoVotos.some(v => v.tipo_voto === 'discussao');
          const allAprovado = cargoVotos.every(v => v.tipo_voto === 'aprovado');
          let status: FarolData['status'] = 'pendente';
          if (hasReprovado) status = 'reprovado';
          else if (hasDiscussao) status = 'discussao';
          else if (allAprovado) status = 'aprovado';
          newFarois[cargo] = { status, votos: cargoVotos };
        }
      }

      return { ...prev, votos: updatedVotos, farois: newFarois };
    });

    setShowVoteCommentFor(null);
    setVoteComment('');

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemPautaId}/votos`, 'POST', {
      user_id: mockUserId,
      user_nome: mockUserName,
      tipo_voto: tipoVoto,
      cargo_voto: cargoVoto,
      comentario,
    });
  };

  const handleToggleVideo = () => {
    if (isConcluido) return;
    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemPautaId}/video-assistido`, 'POST', {
      user_id: mockUserId,
      user_nome: mockUserName,
    });

    setData(prev => {
      if (!prev) return prev;
      const existing = prev.videos_assistidos.find(v => v.user_id === mockUserId);
      let newVideos;
      if (existing) {
        newVideos = prev.videos_assistidos.map(v =>
          v.user_id === mockUserId ? { ...v, assistido: !v.assistido } : v
        );
      } else {
        newVideos = [...prev.videos_assistidos, {
          id: Date.now(),
          item_pauta_id: itemPautaId,
          user_id: mockUserId,
          user_nome: mockUserName,
          assistido: true,
        }];
      }
      return { ...prev, videos_assistidos: newVideos };
    });
  };

  const handleAddComment = async (parentId?: number) => {
    const texto = parentId ? replyText.trim() : commentText.trim();
    if (!texto || isConcluido) return;

    const tempId = Date.now();
    const newComment: Comentario = {
      id: tempId,
      item_pauta_id: itemPautaId,
      user_id: mockUserId,
      user_nome: mockUserName,
      texto,
      parent_comment_id: parentId,
      created_at: new Date().toISOString(),
      likes: 0,
      liked_by_me: false,
    };

    // Optimistic UI update
    setData(prev => {
      if (!prev) return prev;
      return { ...prev, comentarios: [...prev.comentarios, newComment] };
    });

    if (parentId) {
      setReplyText('');
      setReplyingTo(null);
    } else {
      setCommentText('');
    }

    // Use direct fetch (not queue) so we get the real DB id back.
    // This prevents parent_comment_id mismatches for replies after page reload.
    try {
      const res = await fetch(`${apiUrl}/api/comite/itens/${itemPautaId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: mockUserId,
          user_nome: mockUserName,
          texto,
          parent_comment_id: parentId || null,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        // Replace the optimistic temp id with the real DB id
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            comentarios: prev.comentarios.map(c =>
              c.id === tempId ? { ...c, id: saved.id } : c
            ),
          };
        });
      }
    } catch (e) {
      console.error('Error saving comment:', e);
    }
  };

  const handleToggleLike = (commentId: number) => {
    if (isConcluido) return;
    pushToGenericQueue(`${apiUrl}/api/comite/comentarios/${commentId}/like`, 'POST', { user_id: mockUserId });

    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        comentarios: prev.comentarios.map(c => {
          if (c.id !== commentId) return c;
          const wasLiked = c.liked_by_me;
          return { ...c, likes: wasLiked ? c.likes - 1 : c.likes + 1, liked_by_me: !wasLiked };
        }),
      };
    });
  };

  // ─── Computed values ───
  const rootComments = useMemo(() =>
    (data?.comentarios || []).filter(c => !c.parent_comment_id),
    [data?.comentarios]
  );

  const myVote = useMemo(() =>
    (data?.votos || []).find(v => v.user_id === mockUserId),
    [data?.votos, mockUserId]
  );

  const myWatched = useMemo(() =>
    (data?.videos_assistidos || []).find(v => v.user_id === mockUserId)?.assistido,
    [data?.videos_assistidos, mockUserId]
  );

  const embedUrl = useMemo(() => buildStreamEmbedUrl(data?.item?.video_url), [data?.item?.video_url]);

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-6 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 aspect-video rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Item não encontrado.</p>
        <button onClick={() => onNavigate(Page.COMITE_DETAIL, comiteId)} className="mt-3 text-blue-600 hover:underline text-sm">
          Voltar ao Comitê
        </button>
      </div>
    );
  }

  const { item, comite, comentarios, votos, farois, videos_assistidos, operation } = data;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate(Page.COMITE_DETAIL, data?.item?.comite_id || data?.comite?.id || comiteId)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{item.titulo}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Comitê de {comite.rule?.tipo} — {comite.rule?.area} · {formatDate(comite.data)}
            </p>
          </div>
        </div>
        {isConcluido && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
            <CheckCircle className="w-3.5 h-3.5" /> Comitê Concluído
          </span>
        )}
      </div>

      {/* ─── Main Layout: Video + Sidebar ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Video Player ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
            {item.tipo === 'video' && item.video_url ? (
              embedUrl && !iframeError ? (
                <div className="relative" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    src={embedUrl}
                    className="absolute inset-0 w-full h-full"
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                    title={item.titulo}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                    onError={() => setIframeError(true)}
                    onLoad={(e) => {
                      // Detect if the iframe loaded an error page
                      try {
                        const frame = e.currentTarget;
                        // If we can't access contentDocument, it's cross-origin (normal for embeds)
                        // But if the iframe src changed to about:blank or chrome-error, mark as failed
                        if (frame.src === 'about:blank' || frame.src.startsWith('chrome-error://')) {
                          setIframeError(true);
                        }
                      } catch {
                        // Cross-origin frame — this is expected for valid embeds, so no error
                      }
                    }}
                  />
                </div>
              ) : /\.(mp4|webm|ogg)(\?.*)?$/i.test(item.video_url) ? (
                <div className="relative" style={{ paddingTop: '56.25%' }}>
                  <video
                    src={item.video_url}
                    className="absolute inset-0 w-full h-full bg-black"
                    controls
                    controlsList="nodownload"
                    playsInline
                    title={item.titulo}
                  />
                </div>
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-center px-8">
                  <Video className="w-16 h-16 text-gray-500 mb-4" />
                  <p className="text-gray-400 text-sm mb-2">Vídeo disponível externamente</p>
                  <a
                    href={item.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir Vídeo
                  </a>
                  <p className="text-gray-600 text-xs mt-3">O vídeo será aberto no Microsoft Stream ou em uma nova aba</p>
                </div>
              )
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <Video className="w-20 h-20 text-gray-600 mb-4" />
                <p className="text-gray-500 text-lg font-medium">Vídeo não disponível</p>
                <p className="text-gray-600 text-sm mt-1">Este item não possui vídeo associado</p>
              </div>
            )}
          </div>

          {/* Video info bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              {item.video_duracao && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" /> {item.video_duracao}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Eye className="w-4 h-4" /> {videos_assistidos.filter(v => v.assistido).length} assistiram
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" /> {comentarios.length} comentários
              </span>
            </div>

            {/* Mark as Watched / Vote Controls */}
            {!isConcluido && (
              <div className="flex items-center gap-3">
                {!isAprovacao ? (
                  <button
                    onClick={handleToggleVideo}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                      myWatched
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {myWatched ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {myWatched ? 'Assistido ✓' : 'Marcar como Assistido'}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* ─── Triple Approval (Faróis) ─── */}
          {isAprovacao && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                Painel de Aprovação
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <FarolIndicator
                  label="Time de Gestão"
                  data={farois.gestao || { status: 'pendente', votos: [] }}
                  icon={<Users className="w-5 h-5 text-white" />}
                />
                <FarolIndicator
                  label="Risco"
                  data={farois.risco || { status: 'pendente', votos: [] }}
                  icon={<AlertTriangle className="w-5 h-5 text-white" />}
                />
                <FarolIndicator
                  label="Diretoria"
                  data={farois.diretoria || { status: 'pendente', votos: [] }}
                  icon={<Star className="w-5 h-5 text-white" />}
                />
              </div>
            </div>
          )}

          {/* ─── Voting Area (for approval items) ─── */}
          {isAprovacao && userCanVote && !isConcluido && (
            <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800 p-5 space-y-4">
              <h3 className="text-sm font-bold text-purple-700 dark:text-purple-400 uppercase">
                Sua Votação
              </h3>
              <div className="flex items-center gap-3">
                {[
                  { key: 'aprovado', label: '✅ Aprovar', color: 'bg-emerald-600 hover:bg-emerald-700' },
                  { key: 'reprovado', label: '❌ Reprovar', color: 'bg-red-600 hover:bg-red-700' },
                  { key: 'discussao', label: '💬 Discutir em Comitê', color: 'bg-amber-600 hover:bg-amber-700' },
                ].map(v => (
                  <button
                    key={v.key}
                    onClick={() => handleVote(v.key)}
                    className={`px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-all shadow-sm ${
                      myVote?.tipo_voto === v.key
                        ? `${v.color} ring-2 ring-offset-2 dark:ring-offset-gray-800 scale-105`
                        : `${v.color} opacity-70 hover:opacity-100`
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {/* Comment prompt for reprovado/discussao */}
              {showVoteCommentFor && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-purple-300 dark:border-purple-700 p-4 space-y-3 animate-in slide-in-from-top">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">💡 Recomendação:</span> Comente o motivo do seu voto para ajudar na discussão
                  </p>
                  <textarea
                    value={voteComment}
                    onChange={e => setVoteComment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400"
                    rows={2}
                    placeholder="Por que votou assim? (opcional)"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => submitVote(showVoteCommentFor, voteComment)}
                      className="px-4 py-1.5 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      Confirmar Voto
                    </button>
                    <button
                      onClick={() => submitVote(showVoteCommentFor, '')}
                      className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                    >
                      Votar sem comentário
                    </button>
                    <button
                      onClick={() => { setShowVoteCommentFor(null); setVoteComment(''); }}
                      className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {myVote && (
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Seu voto: <span className="font-semibold">{myVote.tipo_voto}</span>
                  {' · '}{timeAgo(myVote.updated_at || myVote.created_at)}
                  <span className="text-gray-400"> — você pode alterar seu voto a qualquer momento</span>
                </p>
              )}
            </div>
          )}

          {/* ─── Comments Section ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-500" />
              Comentários ({comentarios.length})
            </h3>

            {/* New comment input */}
            {!isConcluido && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                  <span className="text-[11px] font-bold text-white">{mockUserName[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 flex gap-2">
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                    className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Adicionar um comentário..."
                  />
                  <button
                    onClick={() => handleAddComment()}
                    disabled={!commentText.trim()}
                    className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Comments feed */}
            {rootComments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum comentário ainda. Seja o primeiro!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rootComments.map(comment => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    replies={comentarios.filter(c => c.parent_comment_id === comment.id)}
                    allComments={comentarios}
                    onLike={handleToggleLike}
                    onReply={id => { setReplyingTo(replyingTo === id ? null : id); setReplyText(''); }}
                    replyingTo={replyingTo}
                    replyText={replyText}
                    setReplyText={setReplyText}
                    onSubmitReply={() => handleAddComment(replyingTo!)}
                    isConcluido={!!isConcluido}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Sidebar ── */}
        <div className="space-y-4">
          {/* Description */}
          {item.descricao && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Descrição</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{item.descricao}</p>
            </div>
          )}

          {/* Committee Info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Comitê</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Tipo</span>
                <span className="font-medium text-gray-900 dark:text-white capitalize">{comite.rule?.tipo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Área</span>
                <span className="font-medium text-gray-900 dark:text-white">{comite.rule?.area}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Data</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatDate(comite.data)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <span className={`font-medium px-2 py-0.5 rounded text-xs ${
                  comite.status === 'concluido'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>{comite.status}</span>
              </div>
            </div>
            <button
              onClick={() => onNavigate(Page.COMITE_DETAIL, comite.id)}
              className="w-full mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
            >
              Ver Comitê Completo →
            </button>
          </div>

          {/* Operation Info */}
          {operation && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Operação Vinculada</h4>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{operation.name}</p>
              {operation.area && (
                <span className="inline-block text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
                  {operation.area}
                </span>
              )}

              {/* Rating / Watchlist / Sentiment */}
              {(operation.rating_operation || operation.watchlist) && (
                <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                  {operation.rating_operation && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Rating</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{operation.rating_operation}</span>
                    </div>
                  )}
                  {operation.watchlist && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Watchlist</span>
                      <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        operation.watchlist === 'Verde' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        operation.watchlist === 'Amarelo' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        operation.watchlist === 'Rosa' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>{operation.watchlist}</span>
                    </div>
                  )}
                  {operation.latest_rating?.sentiment && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Sentimento</span>
                      <span className={`font-semibold ${
                        operation.latest_rating.sentiment === 'Positivo' ? 'text-emerald-600' :
                        operation.latest_rating.sentiment === 'Negativo' ? 'text-red-600' : 'text-gray-600'
                      }`}>{operation.latest_rating.sentiment}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Operation Risks */}
          {operation && operation.risks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Riscos ({operation.risks.length})
              </h4>
              <div className="space-y-2">
                {operation.risks.map(risk => {
                  const severityColors: Record<string, string> = {
                    Alta: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
                    Média: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                    Baixa: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600',
                  };
                  return (
                    <div key={risk.id} className={`p-2.5 rounded-lg border text-xs ${severityColors[risk.severity] || severityColors.Baixa}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{risk.title}</span>
                        <span className="text-[10px] font-bold uppercase">{risk.severity}</span>
                      </div>
                      {risk.description && (
                        <p className="mt-1 opacity-80">{risk.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Watched by */}
          {videos_assistidos.filter(v => v.assistido).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Assistiram</h4>
              <div className="flex flex-wrap gap-2">
                {videos_assistidos.filter(v => v.assistido).map(v => (
                  <span key={v.id} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white">
                      {v.user_nome?.[0]?.toUpperCase() || '?'}
                    </span>
                    {v.user_nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Creator Info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Criado por</h4>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{item.criador_nome}</p>
            <p className="text-xs text-gray-400">{formatDate(item.created_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComiteVideoPage;
