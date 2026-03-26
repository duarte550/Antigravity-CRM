import React, { useState } from 'react';
import { Operation, LitigationComment } from '../types';
import RichTextEditor from './RichTextEditor';
import { fetchApi } from '../utils/api';
import { Users, Plus, Edit2, Trash2 } from 'lucide-react';

interface Props {
    operation: Operation;
    onUpdateOperation: (updatedOperation: Operation, syncToBackend?: boolean) => void;
    apiUrl?: string;
    showToast?: (message: string, type: 'success' | 'error') => void;
    setIsSyncing?: (isSyncing: boolean) => void;
}

const LitigationCommentsSection: React.FC<Props> = ({ 
    operation, 
    onUpdateOperation, 
    apiUrl = '', 
    showToast = () => {}, 
    setIsSyncing = () => {} 
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingComment, setEditingComment] = useState<LitigationComment | null>(null);
    const [commentText, setCommentText] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        setIsSyncing(true);
        try {
            const endpoint = editingComment 
                ? `${apiUrl}/api/operations/${operation.id}/litigation-comments/${editingComment.id}`
                : `${apiUrl}/api/operations/${operation.id}/litigation-comments`;
            
            const method = editingComment ? 'PUT' : 'POST';
            
            const response = await fetchApi(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: commentText, userName: 'Analista' }),
            });
            
            if (response.ok) {
                const updatedOp = await response.json();
                onUpdateOperation(updatedOp, false);
                setIsAdding(false);
                setEditingComment(null);
                setCommentText('');
                showToast(editingComment ? 'Comentário atualizado!' : 'Comentário adicionado!', 'success');
            } else {
                showToast('Erro ao salvar comentário.', 'error');
            }
        } catch (error) {
            console.error('Error saving litigation comment:', error);
            showToast('Erro ao salvar comentário.', 'error');
        } finally {
            setIsSaving(false);
            setIsSyncing(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja remover este comentário?')) return;
        setIsSyncing(true);
        try {
            const response = await fetchApi(`${apiUrl}/api/operations/${operation.id}/litigation-comments/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                const updatedOp = await response.json();
                onUpdateOperation(updatedOp, false);
                showToast('Comentário removido.', 'success');
            } else {
                showToast('Erro ao remover comentário.', 'error');
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
            showToast('Erro ao remover.', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mt-6 w-full h-full" id="litigation-comments">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Users className="w-5 h-5 text-red-600 dark:text-red-400" />
                    Comentários Advogado de Litígio
                </h3>
                {(!isAdding && !editingComment) && (
                    <button 
                        onClick={() => {
                            setCommentText('');
                            setIsAdding(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> Novo Comentário
                    </button>
                )}
            </div>
            
            {(isAdding || editingComment) ? (
                <div className="space-y-4 border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <RichTextEditor 
                        value={commentText} 
                        onChange={setCommentText} 
                        className="min-h-[150px] bg-white dark:bg-gray-900" 
                    />
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => {
                                setIsAdding(false);
                                setEditingComment(null);
                            }}
                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={isSaving || !commentText.trim()}
                            className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 font-medium"
                        >
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {operation.litigationComments && operation.litigationComments.length > 0 ? (
                        operation.litigationComments.map(comment => (
                            <div key={comment.id} className="p-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {new Date(comment.createdAt).toLocaleDateString('pt-BR')} - {comment.userName || 'Sistema'}
                                    </span>
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => {
                                                setEditingComment(comment);
                                                setCommentText(comment.description);
                                            }} 
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(comment.id)} 
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div 
                                    className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                                    dangerouslySetInnerHTML={{ __html: comment.description }}
                                />
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic text-sm text-center py-4">Nenhum histórico de comentário registrado.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default LitigationCommentsSection;
