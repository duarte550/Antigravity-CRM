import React from 'react';
import { Page } from '../types';
import { ArrowLeft, Video } from 'lucide-react';

interface ComiteVideoPageProps {
  itemPautaId: number;
  apiUrl: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  onNavigate: (page: Page, id?: number) => void;
}

/**
 * Página de visualização de vídeo de item de pauta.
 * Redireciona para o ComiteDetailPage com o item expandido.
 * Para vídeos do Microsoft Stream, um embed pode ser adicionado aqui.
 */
const ComiteVideoPage: React.FC<ComiteVideoPageProps> = ({ itemPautaId, apiUrl, showToast, onNavigate }) => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate(Page.COMITES)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Vídeo do Item de Pauta</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Video className="w-16 h-16 mx-auto text-rose-300 dark:text-rose-700 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          Vídeo associado ao item de pauta #{itemPautaId}.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Integração com Microsoft Stream / embed de vídeo será adicionada nesta página.
        </p>
      </div>
    </div>
  );
};

export default ComiteVideoPage;
