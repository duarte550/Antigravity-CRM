import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Page } from '../types';
import type { CargoVoto } from '../types';
import { useAuth } from '../contexts/MockAuthContext';
import {
  ChevronDown, ChevronRight, CheckCircle, Clock, Video, Users, Plus,
  MessageSquare, ThumbsUp, AlertCircle, ArrowLeft, FileText, Send,
  Eye, EyeOff, Loader2, Lock, Download, CalendarDays, Flag, X, ListTodo,
  CircleDot, CheckCircle2, Circle, Search, ExternalLink
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://antigravity-crm-two.vercel.app';

// ─── Lightweight operation type for pauta selector ───
interface PautaOperation {
  id: number;
  name: string;
  area?: string;
  master_group_name?: string;
  is_structuring: boolean;
  pipeline_stage?: string;
}

// ─── Local interfaces (API snake_case) ───
interface Secao { id: number; comite_id: number; nome: string; ordem: number; is_default?: boolean }
interface Comentario { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; texto: string; parent_comment_id?: number; created_at?: string; likes: number }
interface Voto { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; tipo_voto: string; cargo_voto?: string; comentario?: string; created_at?: string }
interface VideoAsst { id: number; item_pauta_id: number; user_id?: number; user_nome?: string; assistido?: boolean }
interface ProxPasso { id: number; item_pauta_id?: number; comite_id?: number; descricao: string; responsavel_user_id?: number; responsavel_nome?: string; status: string; prazo?: string; prioridade?: string; task_rule_id?: number; created_at?: string }
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

// ─── Video duration auto-detection helpers ───
const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

const isDirectVideoUrl = (url: string): boolean => {
  return /\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i.test(url);
};

const detectVideoDuration = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!url.trim()) { resolve(null); return; }

    // 1) Direct video file — use hidden <video> element
    if (isDirectVideoUrl(url)) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      const cleanup = () => { video.src = ''; video.load(); };
      video.onloadedmetadata = () => {
        if (video.duration && isFinite(video.duration)) {
          resolve(formatDuration(video.duration));
        } else {
          resolve(null);
        }
        cleanup();
      };
      video.onerror = () => { resolve(null); cleanup(); };
      // Timeout fallback
      setTimeout(() => { resolve(null); cleanup(); }, 8000);
      video.src = url;
      return;
    }

    // 2) YouTube — try noembed (free, no API key)
    const ytId = extractYouTubeId(url);
    if (ytId) {
      // noembed doesn't return duration, but we can try the YouTube oembed endpoint
      // which also doesn't guarantee duration. Use a lightweight iframe approach instead:
      // We'll use the returnyoutubedislike API which is free, or simply skip duration for YT.
      // For now, resolve null for YouTube — duration will show when user watches.
      resolve(null);
      return;
    }

    // 3) Other URLs — can't detect
    resolve(null);
  });
};

const ComiteDetailPage: React.FC<ComiteDetailPageProps> = ({ comiteId, apiUrl, showToast, pushToGenericQueue, onNavigate }) => {
  const [comite, setComite] = useState<ComiteDetail | null>(() => {
    // Stale-while-revalidate: load from cache immediately
    try {
      const cached = localStorage.getItem(`comite_detail_${comiteId}`);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return null;
  });
  const [isLoading, setIsLoading] = useState(!comite);
  const [expandedSecoes, setExpandedSecoes] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [newPPTexts, setNewPPTexts] = useState<Record<number, string>>({});
  const [showAddSecaoInput, setShowAddSecaoInput] = useState(false);
  const [newSecaoNome, setNewSecaoNome] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // ─── Add Task Modal state (Próximos Passos) ───
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [addTaskForItemId, setAddTaskForItemId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState({
    descricao: '',
    responsavel_nome: '',
    prazo: '',
    prioridade: 'media',
  });

  // ─── Add Item Modal state ───
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemPreselectedSecaoId, setAddItemPreselectedSecaoId] = useState<number | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    secao_id: 0,
    titulo: '',
    descricao: '',
    tipo: 'presencial',
    prioridade: 'normal',
    tipo_caso: 'geral',
    video_url: '',
    video_duracao: '',
    operation_id: null as number | null,
  });

  // ─── Operations for Pauta (Revisão / Aprovação) ───
  const [pautaOpsAtivas, setPautaOpsAtivas] = useState<PautaOperation[]>([]);
  const [pautaOpsEstruturacao, setPautaOpsEstruturacao] = useState<PautaOperation[]>([]);
  const [isLoadingOps, setIsLoadingOps] = useState(false);
  const [opsSearchQuery, setOpsSearchQuery] = useState('');
  const [showNewStructuringForm, setShowNewStructuringForm] = useState(false);
  const [newStructuringOp, setNewStructuringOp] = useState({ name: '', area: 'CRI' });
  const [isSavingStructuring, setIsSavingStructuring] = useState(false);
  const [isDetectingDuration, setIsDetectingDuration] = useState(false);
  const durationDetectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user: authUser, canVote, hasRole } = useAuth();
  const mockUserId = authUser.id;
  const mockUserName = authUser.nome;

  // ─── Roles allowed to vote: gestor, risco, diretor_presidente, administrador ───
  const VOTING_CARGOS: CargoVoto[] = ['gestao', 'risco', 'diretoria'];
  const userCanVote = VOTING_CARGOS.some(cargo => canVote(cargo));

  // Derive cargo_voto from user's role for backend payload
  const getUserCargoVoto = (): CargoVoto | undefined => {
    if (hasRole('diretor_presidente')) return 'diretoria';
    if (hasRole('gestor')) return 'gestao';
    if (hasRole('risco')) return 'risco';
    return undefined;
  };

  useEffect(() => {
    fetchDetail();
  }, [comiteId]);

  // Expand all sections by default
  useEffect(() => {
    if (comite) {
      setExpandedSecoes(new Set(comite.secoes.map(s => s.id)));
    }
  }, [comite?.id]);

  // ─── Auto-detect video duration when URL changes ───
  useEffect(() => {
    if (durationDetectTimerRef.current) clearTimeout(durationDetectTimerRef.current);

    if (newItem.tipo !== 'video' || !newItem.video_url.trim()) {
      setIsDetectingDuration(false);
      return;
    }

    // Debounce 800ms so we don't fire on every keystroke
    setIsDetectingDuration(true);
    durationDetectTimerRef.current = setTimeout(async () => {
      const dur = await detectVideoDuration(newItem.video_url);
      if (dur) {
        setNewItem(prev => ({ ...prev, video_duracao: dur }));
      }
      setIsDetectingDuration(false);
    }, 800);

    return () => {
      if (durationDetectTimerRef.current) clearTimeout(durationDetectTimerRef.current);
    };
  }, [newItem.video_url, newItem.tipo]);

  const fetchDetail = async () => {
    // Only show full loading if no cached data
    if (!comite) setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}`);
      if (res.ok) {
        const data = await res.json();
        setComite(data);
        // Cache for stale-while-revalidate
        try {
          localStorage.setItem(`comite_detail_${comiteId}`, JSON.stringify(data));
        } catch { /* storage full — ignore */ }
      }
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

  // ─── Open Add Item Modal ───
  // ─── Fetch available operations for pauta ───
  const fetchPautaOperations = async () => {
    if (pautaOpsAtivas.length > 0 || isLoadingOps) return; // cache
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

  const openAddItemModal = (preselectedSecaoId?: number) => {
    setAddItemPreselectedSecaoId(preselectedSecaoId ?? null);
    setNewItem({
      secao_id: preselectedSecaoId || 0,
      titulo: '',
      descricao: '',
      tipo: 'presencial',
      prioridade: 'normal',
      tipo_caso: 'geral',
      video_url: '',
      video_duracao: '',
      operation_id: null,
    });
    setOpsSearchQuery('');
    setShowNewStructuringForm(false);
    setShowAddItemModal(true);
    fetchPautaOperations();
  };

  // ─── Create new structuring operation inline ───
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
          masterGroupId: 1, // default master group for quick-create
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

  // ─── Add Item with Optimistic UI ───
  const handleAddItem = async () => {
    // Validation: revisão/aprovação require an operation
    if (newItem.tipo_caso !== 'geral' && !newItem.operation_id) {
      showToast('Selecione uma operação para itens de revisão ou aprovação', 'error');
      return;
    }
    if (!newItem.titulo || !newItem.secao_id || isSavingItem) return;
    setIsSavingItem(true);

    const optimisticId = -Date.now();
    const now = new Date().toISOString();
    const optimisticItem: Item = {
      id: optimisticId,
      comite_id: comiteId,
      secao_id: newItem.secao_id,
      titulo: newItem.titulo,
      descricao: newItem.descricao,
      criador_user_id: mockUserId,
      criador_nome: mockUserName,
      tipo: newItem.tipo,
      video_url: newItem.video_url,
      video_duracao: newItem.video_duracao,
      prioridade: newItem.prioridade,
      operation_id: newItem.operation_id,
      tipo_caso: newItem.tipo_caso,
      created_at: now,
      comentarios: [],
      votos: [],
      videos_assistidos: [],
      proximos_passos: [],
    };

    // Optimistic: add immediately
    setComite(prev => {
      if (!prev) return prev;
      return { ...prev, itens: [...prev.itens, optimisticItem] };
    });
    setShowAddItemModal(false);
    showToast('Item adicionado à pauta!', 'success');

    // Send to backend
    try {
      const res = await fetch(`${apiUrl}/api/comite/comites/${comiteId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          criador_user_id: mockUserId,
          criador_nome: mockUserName,
        }),
      });
      if (res.ok) {
        const serverItem = await res.json();
        // Replace optimistic item with server item
        setComite(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            itens: prev.itens.map(i => i.id === optimisticId ? { ...serverItem, comentarios: [], votos: [], videos_assistidos: [], proximos_passos: [] } : i),
          };
        });
      }
    } catch (e) {
      showToast('Erro ao salvar item no servidor', 'error');
    } finally {
      setIsSavingItem(false);
    }
  };

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
    if (isConcluido || !userCanVote) return;
    const cargoVoto = getUserCargoVoto();
    const newVoto: Voto = {
      id: Date.now(), item_pauta_id: itemId, user_id: mockUserId, user_nome: mockUserName,
      tipo_voto: tipoVoto, cargo_voto: cargoVoto, created_at: new Date().toISOString(),
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
      user_id: mockUserId, user_nome: mockUserName, tipo_voto: tipoVoto, cargo_voto: cargoVoto,
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
    if (!newTask.descricao.trim() || isConcluido) return;

    const newPP: ProxPasso = {
      id: Date.now(), item_pauta_id: itemId, comite_id: comiteId,
      descricao: newTask.descricao,
      responsavel_user_id: mockUserId,
      responsavel_nome: newTask.responsavel_nome || mockUserName,
      status: 'pendente',
      prazo: newTask.prazo || undefined,
      prioridade: newTask.prioridade || 'media',
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
    setShowAddTaskModal(false);
    setNewTask({ descricao: '', responsavel_nome: '', prazo: '', prioridade: 'media' });
    showToast('Tarefa adicionada!', 'success');

    pushToGenericQueue(`${apiUrl}/api/comite/itens/${itemId}/proximos-passos`, 'POST', {
      descricao: newTask.descricao,
      responsavel_user_id: mockUserId,
      responsavel_nome: newTask.responsavel_nome || mockUserName,
      prazo: newTask.prazo || null,
      prioridade: newTask.prioridade || 'media',
    });
  };

  const handleTogglePPStatus = (itemId: number, ppId: number) => {
    if (isConcluido) return;

    let newStatus = 'pendente';
    setComite(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i =>
          i.id === itemId ? {
            ...i,
            proximos_passos: i.proximos_passos.map(pp => {
              if (pp.id === ppId) {
                newStatus = pp.status === 'concluido' ? 'pendente' : 'concluido';
                return { ...pp, status: newStatus };
              }
              return pp;
            })
          } : i
        ),
      };
    });

    // Find the pp for the queue
    const pp = comite?.itens.find(i => i.id === itemId)?.proximos_passos.find(p => p.id === ppId);
    if (pp) {
      pushToGenericQueue(`${apiUrl}/api/comite/proximos-passos/${ppId}`, 'PUT', {
        status: pp.status === 'concluido' ? 'pendente' : 'concluido',
        descricao: pp.descricao,
        responsavel_nome: pp.responsavel_nome,
        prioridade: pp.prioridade,
        prazo: pp.prazo,
      });
    }
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
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
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
      } else {
        showToast('Erro ao gerar relatório', 'error');
      }
    } catch (e) {
      showToast('Erro ao gerar relatório', 'error');
    } finally {
      setIsGeneratingReport(false);
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
      <div className="space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-16 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
        {/* Sections skeleton */}
        {[1,2,3].map(i => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 space-y-0">
              {[1,2].map(j => (
                <div key={j} className="px-5 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-56 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
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

  const PRIO_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2 };
  const itemsBySecao = (secaoId: number) =>
    comite.itens
      .filter(i => i.secao_id === secaoId)
      .sort((a, b) => {
        const prioA = PRIO_ORDER[a.prioridade] ?? 2;
        const prioB = PRIO_ORDER[b.prioridade] ?? 2;
        if (prioA !== prioB) return prioA - prioB;
        return (b.comentarios?.length || 0) - (a.comentarios?.length || 0);
      });
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
          {/* ── Add Item button at TOP ── */}
          {!isConcluido && (
            <button
              onClick={() => openAddItemModal()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar Item na Pauta
            </button>
          )}
          <button
            onClick={handleGetRelatorio}
            disabled={isGeneratingReport}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              isGeneratingReport
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 cursor-wait'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isGeneratingReport ? 'Gerando...' : 'Relatório'}
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
            <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors">
              <button
                onClick={() => toggleSecao(secao.id)}
                className="flex items-center gap-3 flex-1"
              >
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{secao.nome}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {secaoItems.length} {secaoItems.length === 1 ? 'item' : 'itens'}
                </span>
              </button>
              {/* Add item button per section */}
              {!isConcluido && (
                <button
                  onClick={(e) => { e.stopPropagation(); openAddItemModal(secao.id); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/50"
                  title={`Adicionar item em ${secao.nome}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              )}
            </div>

            {/* Section items */}
            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-700">
                {secaoItems.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum item nesta seção</p>
                    {!isConcluido && (
                      <button
                        onClick={() => openAddItemModal(secao.id)}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        + Adicionar primeiro item
                      </button>
                    )}
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
                          className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                            isItemExpanded
                              ? 'bg-gray-100/70 dark:bg-gray-700/50'
                              : 'hover:bg-gray-100/60 dark:hover:bg-gray-700/40'
                          }`}
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
                                    <button
                                      onClick={() => onNavigate(Page.COMITE_VIDEO, item.id)}
                                      className="text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline"
                                    >
                                      Abrir Player →
                                    </button>
                                    <a href={item.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1">
                                      <ExternalLink className="w-3 h-3" /> Externo
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
                                {userCanVote && (
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
                                )}
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
                                <button
                                  onClick={() => onNavigate(Page.COMITE_VIDEO, item.id)}
                                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium mt-2 flex items-center gap-1"
                                >
                                  Ver painel completo de aprovação →
                                </button>
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

                            {/* Próximos passos / Tarefas */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase flex items-center gap-1.5">
                                  <ListTodo className="w-3.5 h-3.5" />
                                  Tarefas ({item.proximos_passos.length})
                                </p>
                                {!isConcluido && (
                                  <button
                                    onClick={() => { setAddTaskForItemId(item.id); setNewTask({ descricao: '', responsavel_nome: '', prazo: '', prioridade: 'media' }); setShowAddTaskModal(true); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Nova Tarefa
                                  </button>
                                )}
                              </div>
                              {item.proximos_passos.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nenhuma tarefa ainda.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {item.proximos_passos.map(pp => {
                                    const isDone = pp.status === 'concluido';
                                    const isOverdue = pp.prazo && !isDone && new Date(pp.prazo) < new Date();
                                    const prioBadge: Record<string, { bg: string; text: string }> = {
                                      urgente: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400' },
                                      alta: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
                                      media: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
                                      baixa: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-500 dark:text-gray-400' },
                                    };
                                    const prio = prioBadge[pp.prioridade || 'media'] || prioBadge.media;

                                    return (
                                      <div key={pp.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                                        isDone
                                          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40'
                                          : isOverdue
                                            ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/40'
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                      }`}>
                                        {/* Toggle checkbox */}
                                        <button
                                          onClick={() => handleTogglePPStatus(item.id, pp.id)}
                                          disabled={isConcluido}
                                          className={`flex-shrink-0 mt-0.5 transition-colors ${
                                            isDone ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-300 dark:text-gray-600 hover:text-blue-500'
                                          }`}
                                          title={isDone ? 'Marcar como pendente' : 'Marcar como concluído'}
                                        >
                                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                                        </button>

                                        {/* Task content */}
                                        <div className="flex-1 min-w-0">
                                          <span className={`text-xs leading-relaxed ${
                                            isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'
                                          }`}>
                                            {pp.descricao}
                                          </span>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {/* Priority badge */}
                                            {pp.prioridade && pp.prioridade !== 'media' && (
                                              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold ${prio.bg} ${prio.text}`}>
                                                <Flag className="w-2.5 h-2.5" />
                                                {pp.prioridade === 'urgente' ? 'Urgente' : pp.prioridade === 'alta' ? 'Alta' : pp.prioridade === 'baixa' ? 'Baixa' : 'Média'}
                                              </span>
                                            )}
                                            {/* Due date */}
                                            {pp.prazo && (
                                              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                isDone
                                                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                                                  : isOverdue
                                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                              }`}>
                                                <CalendarDays className="w-2.5 h-2.5" />
                                                {new Date(pp.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                              </span>
                                            )}
                                            {/* Responsible */}
                                            {pp.responsavel_nome && (
                                              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                → {pp.responsavel_nome}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
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

      {/* Unassigned items (items without a section) */}
      {unassignedItems.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 bg-amber-50/50 dark:bg-amber-900/10">
            <h2 className="text-base font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Itens sem seção ({unassignedItems.length})
            </h2>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700">
            {unassignedItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div className={`w-2 h-2 rounded-full ${PRIO_DOT[item.prioridade] || PRIO_DOT.normal}`} />
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{item.titulo}</span>
                <span className="text-xs text-gray-400">{item.criador_nome}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ─── Modal: Adicionar Item na Pauta ─── */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddItemModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Adicionar Item na Pauta</h2>

            {/* Seção selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seção</label>
              <select
                value={newItem.secao_id}
                onChange={e => setNewItem({ ...newItem, secao_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value={0}>Selecionar seção...</option>
                {comite.secoes.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
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
                  onChange={e => setNewItem({ ...newItem, tipo_caso: e.target.value, operation_id: e.target.value === 'geral' ? null : newItem.operation_id })}
                  disabled={comite.rule?.tipo === 'monitoramento'}
                  className={`w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm ${comite.rule?.tipo === 'monitoramento' ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <option value="geral">Geral</option>
                  {comite.rule?.tipo !== 'monitoramento' && (
                    <>
                      <option value="aprovacao">Aprovação</option>
                      <option value="revisao">Revisão</option>
                    </>
                  )}
                </select>
                {comite.rule?.tipo === 'monitoramento' && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Comitês de monitoramento aceitam apenas itens gerais.</p>
                )}
              </div>
            </div>

            {/* ─── Operation Selector (required for revisão / aprovação) ─── */}
            {(newItem.tipo_caso === 'revisao' || newItem.tipo_caso === 'aprovacao') && (
              <div className="mb-4">
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
                      {selectedOp.master_group_name && (
                        <span className="text-xs text-gray-400">{selectedOp.master_group_name}</span>
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

                {/* Search input */}
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
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                        {/* Active Operations */}
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
                            return (
                              <div className="px-3 py-4 text-center">
                                <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma operação encontrada</p>
                              </div>
                            );
                          }

                          return (
                            <>
                              {filteredAtivas.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 sticky top-0 z-10">
                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                      Operações Ativas ({filteredAtivas.length})
                                    </span>
                                  </div>
                                  {filteredAtivas.map(op => (
                                    <button
                                      key={`ativa-${op.id}`}
                                      onClick={() => { setNewItem(prev => ({ ...prev, operation_id: op.id })); setOpsSearchQuery(''); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                      <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{op.name}</span>
                                      {op.area && <span className="text-[10px] text-gray-400 flex-shrink-0">{op.area}</span>}
                                      {op.master_group_name && <span className="text-[10px] text-gray-400 flex-shrink-0 truncate max-w-[100px]">{op.master_group_name}</span>}
                                    </button>
                                  ))}
                                </>
                              )}
                              {filteredEstruturas.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 sticky top-0 z-10">
                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                      Em Estruturação ({filteredEstruturas.length})
                                    </span>
                                  </div>
                                  {filteredEstruturas.map(op => (
                                    <button
                                      key={`struct-${op.id}`}
                                      onClick={() => { setNewItem(prev => ({ ...prev, operation_id: op.id })); setOpsSearchQuery(''); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                                      <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{op.name}</span>
                                      {op.pipeline_stage && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded flex-shrink-0">{op.pipeline_stage}</span>
                                      )}
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Create new structuring operation */}
                    {newItem.tipo_caso === 'aprovacao' && (
                      <div className="mt-2">
                        {!showNewStructuringForm ? (
                          <button
                            onClick={() => setShowNewStructuringForm(true)}
                            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Criar nova operação em estruturação
                          </button>
                        ) : (
                          <div className="p-3 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Nova Operação em Estruturação</p>
                            <input
                              value={newStructuringOp.name}
                              onChange={e => setNewStructuringOp(prev => ({ ...prev, name: e.target.value }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              placeholder="Nome da operação..."
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <select
                                value={newStructuringOp.area}
                                onChange={e => setNewStructuringOp(prev => ({ ...prev, area: e.target.value }))}
                                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              >
                                <option value="CRI">CRI</option>
                                <option value="Capital Solutions">Capital Solutions</option>
                              </select>
                              <button
                                onClick={handleCreateStructuringOp}
                                disabled={!newStructuringOp.name.trim() || isSavingStructuring}
                                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                              >
                                {isSavingStructuring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                Criar
                              </button>
                              <button
                                onClick={() => { setShowNewStructuringForm(false); setNewStructuringOp({ name: '', area: 'CRI' }); }}
                                className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                              >
                                Cancelar
                              </button>
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Vídeo</label>
                <div className="relative">
                  <input
                    value={newItem.video_url}
                    onChange={e => setNewItem({ ...newItem, video_url: e.target.value, video_duracao: '' })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm pr-28"
                    placeholder="https://exemplo.com/video.mp4"
                  />
                  {/* Duration auto-detection status */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {isDetectingDuration && (
                      <span className="flex items-center gap-1 text-[11px] text-blue-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> Detectando...
                      </span>
                    )}
                    {!isDetectingDuration && newItem.video_duracao && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                        <Clock className="w-3 h-3" /> {newItem.video_duracao}
                      </span>
                    )}
                  </div>
                </div>
                {newItem.video_url && !isDetectingDuration && !newItem.video_duracao && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Duração não detectada automaticamente. Para vídeos do YouTube a duração será exibida após assistir.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddItemModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItem.titulo || !newItem.secao_id || isSavingItem || (newItem.tipo_caso !== 'geral' && !newItem.operation_id)}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSavingItem && <Loader2 className="w-4 h-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Criar Tarefa (Próximo Passo) ─── */}
      {showAddTaskModal && addTaskForItemId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddTaskModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-blue-500" />
                Nova Tarefa
              </h2>
              <button onClick={() => setShowAddTaskModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição *</label>
                <textarea
                  value={newTask.descricao}
                  onChange={e => setNewTask({ ...newTask, descricao: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Descreva a tarefa..."
                  autoFocus
                />
              </div>

              {/* Responsible */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável</label>
                <input
                  value={newTask.responsavel_nome}
                  onChange={e => setNewTask({ ...newTask, responsavel_nome: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nome do responsável..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Due date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo</label>
                  <input
                    type="date"
                    value={newTask.prazo}
                    onChange={e => setNewTask({ ...newTask, prazo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridade</label>
                  <select
                    value={newTask.prioridade}
                    onChange={e => setNewTask({ ...newTask, prioridade: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowAddTaskModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => handleAddProximoPasso(addTaskForItemId)}
                disabled={!newTask.descricao.trim()}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComiteDetailPage;
