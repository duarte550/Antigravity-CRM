import React from 'react';
import type { Area } from '../types';
import { Page } from '../types';

interface AppHeaderProps {
  isSyncing: boolean;
  syncQueueCount: number;
  isRefreshing: boolean;
  hasOperations: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  selectedArea: Area | 'Mixed';
  onAreaChange: (area: Area | 'Mixed') => void;
  currentPage: Page;
  onNavigate: (page: Page, id?: number) => void;
  isAdmin: boolean;
  onOpenAdminPanel: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  isSyncing,
  syncQueueCount,
  isRefreshing,
  hasOperations,
  isDarkMode,
  onToggleDarkMode,
  selectedArea,
  onAreaChange,
  currentPage,
  onNavigate,
  isAdmin,
  onOpenAdminPanel,
}) => {
  return (
    <header className="relative shadow-md z-10 overflow-hidden">
      {/* Background image with blue filter */}
      <div
        className="absolute inset-0 z-0 bg-gray-200 dark:bg-gray-800"
        style={{
          backgroundImage: `url('/header-bg.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 75%',
        }}
      >
        <div className="absolute inset-0 bg-blue-900/40 dark:bg-blue-900/60"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-900/30 to-transparent dark:from-gray-900/90 dark:via-gray-900/50 dark:to-transparent"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 h-full">
        <div className="flex items-center justify-between h-24">

          {/* Left side: title + status badges */}
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white drop-shadow-md">
              CRM de Crédito Estruturado
            </h1>
            {(isSyncing || syncQueueCount > 0) && (
              <span className="flex items-center gap-2 text-xs font-semibold text-white/90 bg-white/20 px-2 py-1 rounded-full animate-pulse border border-white/30 shadow-sm backdrop-blur-md">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                Sincronizando Databricks...{syncQueueCount > 0 ? ` (${syncQueueCount} pendentes)` : ''}
              </span>
            )}
            {isRefreshing && hasOperations && (
              <span
                className="flex items-center gap-2 text-xs font-semibold text-white/90 bg-white/20 px-2 py-1 rounded-full animate-pulse border border-white/30 shadow-sm backdrop-blur-md"
                title="Atualizando dados em tempo real... Alguns itens podem estar desatualizados."
              >
                <div className="w-2 h-2 rounded-full animate-spin border-2 border-white border-t-transparent"></div>
                Atualizando...
              </span>
            )}
          </div>

          {/* Right side: controls */}
          <div className="flex items-center gap-4">
            {/* Dark mode toggle */}
            <button
              onClick={onToggleDarkMode}
              className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-all backdrop-blur-sm shadow-sm"
              title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Area filter */}
            <div className="flex items-center bg-black/20 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-inner">
              {(['CRI', 'Capital Solutions', 'Mixed'] as const).map(area => (
                <button
                  key={area}
                  onClick={() => onAreaChange(area)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                    selectedArea === area
                      ? 'bg-white text-blue-900 shadow-md scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>

            {/* Originação */}
            <button
              onClick={() => onNavigate(Page.ORIGINATION_PIPELINE)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border backdrop-blur-sm ${
                currentPage === Page.ORIGINATION_PIPELINE
                  ? 'bg-white text-blue-900 border-white shadow-md font-bold'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40 shadow-sm'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Originação
            </button>

            {/* Comitês */}
            <button
              onClick={() => onNavigate(Page.COMITES)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border backdrop-blur-sm ${
                currentPage === Page.COMITES || currentPage === Page.COMITE_DETAIL || currentPage === Page.MINHAS_APROVACOES
                  ? 'bg-white text-blue-900 border-white shadow-md font-bold'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40 shadow-sm'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Comitês
            </button>

            {/* Admin panel (role-gated) */}
            {isAdmin && (
              <button
                id="admin-panel-btn"
                onClick={onOpenAdminPanel}
                className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-all backdrop-blur-sm shadow-sm"
                title="Painel Administrador"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

export default AppHeader;
