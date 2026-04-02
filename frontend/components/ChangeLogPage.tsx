
import React, { useState, useEffect } from 'react';
import type { ChangeRequest, PatchNote } from '../types';
import { Label, Input } from './UI';
import RichTextEditor from './RichTextEditor';
import Modal from './Modal';
import { PlusIcon, CheckCircleIcon, ClockIcon, HistoryIcon, MessageSquareIcon } from './icons/Icons';
import { fetchApi } from '../utils/api';
import { wrapWithEncoding } from '../utils/wafEncoding';

interface ChangeLogPageProps {
    apiUrl: string;
    showToast: (message: string, type: 'success' | 'error') => void;
    setIsSyncing: (isSyncing: boolean) => void;
    setIsRefreshing: (isRefreshing: boolean) => void;
}

const ChangeLogPage: React.FC<ChangeLogPageProps> = ({ apiUrl, showToast, setIsSyncing, setIsRefreshing }) => {
    const [requests, setRequests] = useState<ChangeRequest[]>([]);
    const [patchNotes, setPatchNotes] = useState<PatchNote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
    const [newRequest, setNewRequest] = useState({ title: '', description: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        setIsRefreshing(true);
        try {
            const [reqRes, patchRes] = await Promise.all([
                fetchApi(`${apiUrl}/api/change-requests`, { credentials: 'include' }),
                fetchApi(`${apiUrl}/api/patch-notes`, { credentials: 'include' })
            ]);
    
            if (reqRes.ok) setRequests(await reqRes.json());
            if (patchRes.ok) setPatchNotes(await patchRes.json());
        } catch (error) {
            console.error("Error fetching change log data:", error);
            showToast("Erro ao carregar dados do log de mudanças.", "error");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [apiUrl]);

    const handleAddRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setIsSyncing(true);
        try {
            const response = await fetchApi(`${apiUrl}/api/change-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wrapWithEncoding({
                    title: newRequest.title,
                    description: newRequest.description,
                    requester: 'Usuário Atual',
                }, ['description'])),
                credentials: 'include'
            });

            if (response.ok) {
                const saved = await response.json();
                // Map backend fields to frontend-friendly names if needed, or just use them
                const newReq: ChangeRequest = {
                    id: saved.id,
                    title: newRequest.title,
                    description: newRequest.description,
                    requester: 'Usuário Atual',
                    status: 'pending',
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt
                };
                setRequests(prev => [newReq, ...prev]);
                setIsModalOpen(false);
                setNewRequest({ title: '', description: '' });
                showToast("Solicitação enviada com sucesso!", "success");
            } else {
                throw new Error("Falha ao salvar solicitação");
            }
        } catch (error) {
            console.error("Error adding change request:", error);
            showToast("Erro ao enviar solicitação.", "error");
        } finally {
            setIsSubmitting(false);
            setIsSyncing(false);
        }
    };

    const handleToggleComplete = async (request: ChangeRequest) => {
        const newStatus = request.status === 'completed' ? 'pending' : 'completed';
        const updated = { 
            ...request, 
            status: newStatus as 'pending' | 'completed',
        };
        
        // Optimistic update
        setRequests(prev => prev.map(r => r.id === request.id ? updated : r));

        try {
            const response = await fetchApi(`${apiUrl}/api/change-requests/${request.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
                credentials: 'include'
            });

            if (!response.ok) throw new Error("Falha ao atualizar status");
            showToast(`Solicitação marcada como ${newStatus === 'completed' ? 'concluída' : 'pendente'}.`, "success");
        } catch (error) {
            console.error("Error updating change request:", error);
            // Rollback
            setRequests(prev => prev.map(r => r.id === request.id ? request : r));
            showToast("Erro ao atualizar status da solicitação.", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <p className="text-gray-500 animate-pulse">Carregando log de mudanças...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Solicitações e Melhorias</h2>
                    <p className="text-gray-500">Acompanhe as mudanças recentes e sugira novas funcionalidades.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium"
                >
                    <PlusIcon className="w-5 h-5" />
                    Nova Solicitação
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Change Requests Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                        <MessageSquareIcon className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-700 uppercase tracking-wider text-sm">Pedidos de Melhoria</h3>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {requests.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 italic">
                                Nenhuma solicitação pendente.
                            </div>
                        ) : (
                            requests.map(req => (
                                <div key={req.id} className={`p-4 transition-colors ${req.status === 'completed' ? 'bg-gray-50 opacity-75' : 'hover:bg-blue-50/30'}`}>
                                    <div className="flex items-start gap-3">
                                        <button 
                                            onClick={() => handleToggleComplete(req)}
                                            className={`mt-1 flex-shrink-0 transition-colors ${req.status === 'completed' ? 'text-green-600' : 'text-gray-300 hover:text-blue-500'}`}
                                            title={req.status === 'completed' ? "Marcar como pendente" : "Marcar como concluído"}
                                        >
                                            {req.status === 'completed' ? (
                                                <CheckCircleIcon className="w-6 h-6" />
                                            ) : (
                                                <div className="w-6 h-6 border-2 border-current rounded-full" />
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedRequest(req)} role="button">
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className={`font-bold text-gray-800 truncate ${req.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                                                    {req.title}
                                                </h4>
                                                <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">
                                                    {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            <div 
                                                className={`text-sm text-gray-600 prose prose-sm max-w-none break-words overflow-hidden ${req.status === 'completed' ? 'text-gray-400' : ''}`}
                                                dangerouslySetInnerHTML={{ __html: req.description }}
                                            />
                                            <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                                                <span>Por: {req.requester}</span>
                                                {req.status === 'completed' && req.updatedAt && (
                                                    <span className="text-green-600">Concluído em: {new Date(req.updatedAt).toLocaleDateString('pt-BR')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Patch Notes Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5 text-green-600" />
                        <h3 className="font-bold text-gray-700 uppercase tracking-wider text-sm">Patch Notes (Mudanças Recentes)</h3>
                    </div>
                    <div className="p-6 space-y-8 max-h-[600px] overflow-y-auto">
                        {patchNotes.length === 0 ? (
                            <div className="text-center text-gray-400 italic py-8">
                                Nenhum registro de mudança encontrado.
                            </div>
                        ) : (
                            patchNotes.map(note => (
                                <div key={note.id} className="relative pl-8 border-l-2 border-gray-100 pb-2">
                                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-green-500" />
                                    <div className="mb-2">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                v{note.version}
                                            </span>
                                            <span className="text-xs text-gray-400 font-medium">
                                                {new Date(note.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-800">{note.title}</h4>
                                    </div>
                                    <div 
                                        className="text-sm text-gray-600 mb-4 prose prose-sm max-w-none break-words overflow-hidden"
                                        dangerouslySetInnerHTML={{ __html: note.description }}
                                    />
                                    {note.changes && note.changes.length > 0 && (
                                        <ul className="space-y-2">
                                            {note.changes.map((change, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                                                    <span className="text-green-500 mt-1">•</span>
                                                    <span>{change}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>

            {/* New Request Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Solicitação de Melhoria">
                <form onSubmit={handleAddRequest} className="space-y-4">
                    <div>
                        <Label htmlFor="req-title">Título da Solicitação</Label>
                        <Input 
                            id="req-title" 
                            type="text" 
                            placeholder="Ex: Adicionar filtro por analista na página de tarefas"
                            value={newRequest.title}
                            onChange={e => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="req-desc">Descrição Detalhada</Label>
                        <RichTextEditor 
                            value={newRequest.description}
                            onChange={val => setNewRequest(prev => ({ ...prev, description: val }))}
                            className="h-48"
                            placeholder="Explique o que você gostaria que fosse mudado ou adicionado..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button 
                            type="button" 
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !newRequest.title}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-bold shadow-sm disabled:bg-blue-300"
                        >
                            {isSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* View Full Request Modal */}
            {selectedRequest && (
                <Modal isOpen={true} onClose={() => setSelectedRequest(null)} title="Detalhes da Solicitação">
                    <div className="space-y-4">
                        <div className="flex justify-between items-start">
                            <h3 className="text-xl font-bold text-gray-800">{selectedRequest.title}</h3>
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${selectedRequest.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {selectedRequest.status === 'completed' ? 'Concluída' : 'Pendente'}
                            </span>
                        </div>
                        <div className="text-sm text-gray-500">
                            <p>Solicitado por: <strong>{selectedRequest.requester}</strong> em {new Date(selectedRequest.createdAt).toLocaleDateString('pt-BR')}</p>
                            {selectedRequest.status === 'completed' && selectedRequest.updatedAt && (
                                <p>Concluída em: {new Date(selectedRequest.updatedAt).toLocaleDateString('pt-BR')}</p>
                            )}
                        </div>
                        <div 
                            className="p-4 bg-gray-50 border border-gray-100 rounded-lg prose prose-sm max-w-none text-gray-700 break-words overflow-hidden"
                            dangerouslySetInnerHTML={{ __html: selectedRequest.description }}
                        />
                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button 
                                onClick={() => setSelectedRequest(null)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ChangeLogPage;
