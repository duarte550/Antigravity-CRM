import React, { useState, useEffect } from 'react';
import { Page, MasterGroup } from '../types';
import MasterGroupForm from './MasterGroupForm';

interface MasterGroupsPageProps {
  onNavigate: (page: Page, id?: number) => void;
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const MasterGroupsPage: React.FC<MasterGroupsPageProps> = ({ onNavigate, apiUrl, showToast }) => {
  const [masterGroups, setMasterGroups] = useState<MasterGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterRating, setFilterRating] = useState('');

  useEffect(() => {
    fetchMasterGroups();
  }, []);

  const fetchMasterGroups = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/api/master-groups`);
      if (!response.ok) throw new Error('Failed to fetch master groups');
      const data = await response.json();
      setMasterGroups(data);
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar Master Grupos', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMasterGroup = async (data: Omit<MasterGroup, 'id' | 'operations' | 'structuringOperations' | 'contacts' | 'events'>) => {
    try {
      const response = await fetch(`${apiUrl}/api/master-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to create master group');
      
      await fetchMasterGroups();
      showToast('Master Grupo criado com sucesso', 'success');
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Erro ao criar Master Grupo', 'error');
    }
  };

  const filteredMasterGroups = masterGroups.filter(mg => {
    const matchesSearch = mg.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = filterSector ? mg.sector === filterSector : true;
    const matchesRating = filterRating ? mg.rating === filterRating : true;
    return matchesSearch && matchesSector && matchesRating;
  });

  const uniqueSectors = Array.from(new Set(masterGroups.map(mg => mg.sector).filter(Boolean))) as string[];
  const uniqueRatings = Array.from(new Set(masterGroups.map(mg => mg.rating).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Master Grupos</h1>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Master Grupo
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex-1 relative">
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
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os Setores</option>
          {uniqueSectors.map(sector => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
        
        <select
          value={filterRating}
          onChange={e => setFilterRating(e.target.value)}
          className="w-full sm:w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          {filteredMasterGroups.map(mg => (
            <div 
              key={mg.id} 
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onNavigate(Page.MASTER_GROUP_DETAIL, mg.id)}
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{mg.name}</h3>
              {mg.sector && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {mg.sector}
                </span>
              )}
              <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                <p>Rating: {mg.rating || 'N/A'}</p>
              </div>
            </div>
          ))}
          {filteredMasterGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
              Nenhum Master Grupo encontrado.
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <MasterGroupForm
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveMasterGroup}
        />
      )}
    </div>
  );
};

export default MasterGroupsPage;
