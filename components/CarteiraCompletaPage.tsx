import React from 'react';

interface CarteiraCompletaPageProps {
  // Props serão expandidas na Fase 5
}

/**
 * Placeholder para a página de Carteira Completa.
 * Será implementada na Fase 5 com KPIs, volumes por analista,
 * número de revisões, watchlist e atrasos.
 */
const CarteiraCompletaPage: React.FC<CarteiraCompletaPageProps> = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
        Carteira Completa
      </h1>
      <p className="text-gray-500 dark:text-gray-400">
        Página em construção — será implementada na Fase 5.
      </p>
    </div>
  );
};

export default CarteiraCompletaPage;
