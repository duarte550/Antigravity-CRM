import React from 'react';

interface ComiteDetailPageProps {
  comiteId: number;
  // Props serão expandidas na Fase 6
}

/**
 * Placeholder para a página de Comitê Específico.
 * Será implementada na Fase 6 com pauta sanfonada, comentários,
 * votação e geração de atas.
 */
const ComiteDetailPage: React.FC<ComiteDetailPageProps> = ({ comiteId }) => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
        Comitê #{comiteId}
      </h1>
      <p className="text-gray-500 dark:text-gray-400">
        Página em construção — será implementada na Fase 6.
      </p>
    </div>
  );
};

export default ComiteDetailPage;
