import React from 'react';

interface ComiteVideoPageProps {
  itemPautaId: number;
  // Props serão expandidas na Fase 7
}

/**
 * Placeholder para a página de Vídeo do Comitê (estilo YouTube).
 * Será implementada na Fase 7 com player MS Stream, sidebar de riscos/ratings,
 * votação tríplice e threading de comentários.
 */
const ComiteVideoPage: React.FC<ComiteVideoPageProps> = ({ itemPautaId }) => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
        Visualização de Vídeo — Item #{itemPautaId}
      </h1>
      <p className="text-gray-500 dark:text-gray-400">
        Página em construção — será implementada na Fase 7.
      </p>
    </div>
  );
};

export default ComiteVideoPage;
