import React from 'react';

interface ComitesPageProps {
  // Props serão expandidas na Fase 6
}

/**
 * Placeholder para a página de Comitês (Timeline geral).
 * Será implementada na Fase 6 com timeline, filtros por área,
 * e resumo dos últimos 4 comitês.
 */
const ComitesPage: React.FC<ComitesPageProps> = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
        Comitês
      </h1>
      <p className="text-gray-500 dark:text-gray-400">
        Página em construção — será implementada na Fase 6.
      </p>
    </div>
  );
};

export default ComitesPage;
