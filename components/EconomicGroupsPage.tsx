import React, { useState, useEffect } from 'react';
import { Page, EconomicGroup } from '../types';
import EconomicGroupForm from './EconomicGroupForm';

interface EconomicGroupsPageProps {
  onNavigate: (page: Page, id?: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const EconomicGroupsPage: React.FC<EconomicGroupsPageProps> = ({ onNavigate, apiUrl, showToast }) => {
  const [economicGroups, setEconomicGroups] = useState<EconomicGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterRating, setFilterRating] = useState('');
  const [filterMasterGroup, setFilterMasterGroup] = useState('');

  useEffect(() => {
    fetchEconomicGroups();
  }, []);

  const fetchEconomicGroups = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/api/economic-groups`);
      if (!response.ok) throw new Error('Falha ao buscar grupos econômicos');
      const data = await response.json();
      setEconomicGroups(data);
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar Grupos Econômicos', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEconomicGroup = async (data: Omit<EconomicGroup, 'id' | 'operations' | 'structuringOperations' | 'events' | 'recentChanges' | 'ratingHistory' | 'risks'>) => {
    try {
      const response = await fetch(`${apiUrl}/api/economic-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Falha ao criar grupo econômico');
      
      await fetchEconomicGroups();
      showToast('Grupo Econômico criado com sucesso', 'success');
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Erro ao criar Grupo Econômico', 'error');
    }
  };

  const filteredEconomicGroups = economicGroups.filter(eg => {
    const matchesSearch = eg.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = filterSector ? eg.sector === filterSector : true;
    const matchesRating = filterRating ? eg.rating === filterRating : true;
    const matchesMasterGroup = filterMasterGroup ? eg.masterGroupName === filterMasterGroup : true;
    return matchesSearch && matchesSector && matchesRating && matchesMasterGroup;
  });

  const uniqueSectors = Array.from(new Set(economicGroups.map(eg => eg.sector).filter(Boolean))) as string[];
  const uniqueRatings = Array.from(new Set(economicGroups.map(eg => eg.rating).filter(Boolean))) as string[];
  const uniqueMasterGroups = Array.from(new Set(economicGroups.map(eg => eg.masterGroupName).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Grupos Econômicos</h1>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Grupo Econômico
        </button>
      </div>

      <div className="flex flex-col flex-wrap lg:flex-nowrap sm:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full overflow-x-auto">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <select
          value={filterMasterGroup}
          onChange={e => setFilterMasterGroup(e.target.value)}
          className="min-w-[150px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos Master Grupos</option>
          {uniqueMasterGroups.map(mg => (
            <option key={mg} value={mg}>{mg}</option>
          ))}
        </select>

        <select
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          className="min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os Setores</option>
          {uniqueSectors.map(sector => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
        
        <select
          value={filterRating}
          onChange={e => setFilterRating(e.target.value)}
          className="min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os Ratings</option>
          {uniqueRatings.map(rating => (
            <option key={rating} value={rating}>{rating}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEconomicGroups.map(eg => (
            <div 
              key={eg.id} 
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
              onClick={() => onNavigate(Page.ECONOMIC_GROUP_DETAIL, eg.id)}
            >
              <div>
                 <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">{eg.name}</h3>
                 <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate hover:text-clip" title={eg.masterGroupName}>
                    {eg.masterGroupName ? `Master: ${eg.masterGroupName}` : 'Sem Master Grupo'}
                 </p>
                 {eg.sector && (
                   <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                     {eg.sector}
                   </span>
                 )}
              </div>
              <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                 <p>Rating: <span className="font-medium text-gray-700 dark:text-gray-300">{eg.rating || 'N/A'}</span></p>
              </div>
            </div>
          ))}
          {filteredEconomicGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
              Nenhum Grupo Econômico encontrado.
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <EconomicGroupForm
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveEconomicGroup}
          apiUrl={apiUrl}
        />
      )}
    </div>
  );
};

export default EconomicGroupsPage;
