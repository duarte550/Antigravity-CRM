
import React, { useMemo, useState } from 'react';
import type { Operation, Area } from '../types';
import { Page } from '../types';
import { HomeIcon, BriefcaseIcon, ClipboardCheckIcon, HistoryIcon, BellIcon, DocumentSearchIcon, SyncIcon, ArchiveIcon } from './icons/Icons';

interface SidebarProps {
  operations: Operation[];
  currentPage: Page;
  selectedOperationId: number | null;
  onNavigate: (page: Page, operationId?: number) => void;
  onSyncRules: () => void;
  selectedArea: Area | 'Mixed';
  syncQueueCount: number;
}

const Sidebar: React.FC<SidebarProps> = ({ operations, currentPage, selectedOperationId, onNavigate, onSyncRules, selectedArea, syncQueueCount }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});

  const filteredOperationsList = useMemo(() => {
    let list = operations.filter(op => op.status !== 'Legado');
    if (selectedArea !== 'Mixed') {
      list = list.filter(op => op.area === selectedArea);
    }
    if (searchTerm) {
      list = list.filter(op => op.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [operations, selectedArea, searchTerm]);

  const groupedOperations = useMemo(() => {
    return filteredOperationsList.reduce((acc, op) => {
      const area = op.area || 'CRI';
      if (!acc[area]) {
        acc[area] = [];
      }
      acc[area].push(op);
      return acc;
    }, {} as Record<Area, Operation[]>);
  }, [filteredOperationsList]);

  const toggleArea = (area: string) => {
    setCollapsedAreas(prev => ({ ...prev, [area]: !prev[area] }));
  };

  const NavLink: React.FC<{
    onClick: () => void;
    isActive: boolean;
    children: React.ReactNode;
    isSubItem?: boolean;
    className?: string;
  }> = ({ onClick, isActive, children, isSubItem = false, className = '' }) => (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 rounded-md transition-all duration-200 ${
        isSubItem ? 'pl-9 pr-2 py-1.5 text-xs' : 'px-4 py-2'
      } ${
        isActive
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="w-64 bg-white dark:bg-gray-900 text-gray-800 dark:text-white flex flex-col h-screen border-r border-gray-200 dark:border-gray-800 shadow-xl transition-colors duration-200">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 text-gray-900 dark:text-white">
          <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
          Navegação
        </h2>
      </div>
      
      <nav className="flex-1 flex flex-col min-h-0">
        <div className="p-3 space-y-1">
          <NavLink
            onClick={() => onNavigate(Page.OVERVIEW)}
            isActive={currentPage === Page.OVERVIEW}
          >
            <HomeIcon className="w-5 h-5" />
            <span className="font-medium">Resumo Geral</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.CARTEIRA_COMPLETA)}
            isActive={currentPage === Page.CARTEIRA_COMPLETA}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
            <span className="font-medium">Carteira Completa</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.ANALYST_HUB)}
            isActive={currentPage === Page.ANALYST_HUB}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="font-medium">Hub do Analista</span>
          </NavLink>



          <NavLink
            onClick={() => onNavigate(Page.TASKS)}
            isActive={currentPage === Page.TASKS}
          >
            <ClipboardCheckIcon className="w-5 h-5" />
            <span className="font-medium">Tarefas</span>
          </NavLink>
          
          <NavLink
            onClick={() => onNavigate(Page.CREDIT_REVIEWS)}
            isActive={currentPage === Page.CREDIT_REVIEWS}
          >
            <DocumentSearchIcon className="w-5 h-5" />
            <span className="font-medium">Revisões</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.WATCHLIST)}
            isActive={currentPage === Page.WATCHLIST}
          >
            <BellIcon className="w-5 h-5" />
            <span className="font-medium">Watchlist</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.COMITES)}
            isActive={currentPage === Page.COMITES || currentPage === Page.COMITE_DETAIL}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="font-medium">Comitês</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.MASTER_GROUPS)}
            isActive={currentPage === Page.MASTER_GROUPS}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            <span className="font-medium">Master Grupos</span>
          </NavLink>

          <NavLink
            onClick={() => onNavigate(Page.ECONOMIC_GROUPS)}
            isActive={currentPage === Page.ECONOMIC_GROUPS}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <span className="font-medium">Grupos Econômicos</span>
          </NavLink>
        </div>

        <div className="px-4 py-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar operação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md py-1.5 pl-3 pr-8 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 transition-colors duration-200"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
          {Object.keys(groupedOperations).sort().map(area => (
            <div key={area} className="mt-4 first:mt-2">
              <button 
                onClick={() => toggleArea(area)}
                className="w-full flex items-center justify-between px-2 mb-1 group"
              >
                <h3 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                  {area}
                </h3>
                <span className={`text-[10px] text-gray-400 dark:text-gray-600 transition-transform duration-200 ${collapsedAreas[area] ? '-rotate-90' : ''}`}>
                  ▼
                </span>
              </button>
              
              {!collapsedAreas[area] && (
                <div className="space-y-0.5">
                  {groupedOperations[area as Area].map(op => (
                    <NavLink
                      key={op.id}
                      onClick={() => onNavigate(Page.DETAIL, op.id)}
                      isActive={currentPage === Page.DETAIL && selectedOperationId === op.id}
                      isSubItem
                    >
                      <BriefcaseIcon className="w-3.5 h-3.5 opacity-70" />
                      <span className="truncate">{op.name}</span>
                    </NavLink>
                  ))}
                  {groupedOperations[area as Area].length === 0 && (
                    <p className="pl-9 text-[10px] text-gray-500 dark:text-gray-600 italic py-1">Nenhuma operação</p>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {Object.keys(groupedOperations).length === 0 && (
            <div className="mt-8 text-center px-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma operação encontrada para "{searchTerm}"</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-2 transition-colors duration-200">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onNavigate(Page.AUDIT_LOG)}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md text-[9px] font-medium transition-all border ${
                currentPage === Page.AUDIT_LOG
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40'
                  : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
              }`}
              title="Auditoria"
            >
              <HistoryIcon className="w-4 h-4" />
              <span>Auditoria</span>
            </button>
            <button
              onClick={() => onNavigate(Page.CHANGE_LOG)}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md text-[9px] font-medium transition-all border ${
                currentPage === Page.CHANGE_LOG
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40'
                  : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
              }`}
              title="Mudanças"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              <span>Mudanças</span>
            </button>
            <button
              onClick={() => onNavigate(Page.LEGACY)}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md text-[9px] font-medium transition-all border ${
                currentPage === Page.LEGACY
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40'
                  : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
              }`}
              title="Legado"
            >
              <ArchiveIcon className="w-4 h-4" />
              <span>Legado</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onSyncRules}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[10px] font-medium text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all border border-blue-500/20"
              title="Sincronizar Regras"
            >
              <SyncIcon className="w-4 h-4" />
              <span>Regras</span>
            </button>
            
            <button
              onClick={() => onNavigate(Page.SYNC_QUEUE)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[10px] font-medium transition-all border relative ${
                currentPage === Page.SYNC_QUEUE
                  ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 border-amber-500/40'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700'
              }`}
              title="Fila de Sincronização"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Fila</span>
              {syncQueueCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-sm animate-pulse">
                  {syncQueueCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;