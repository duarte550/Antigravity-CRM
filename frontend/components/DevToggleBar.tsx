
import React, { useState } from 'react';
import { useAuth, MOCK_USERS } from '../contexts/MockAuthContext';
import type { Role } from '../types';
import { Select } from './UI';

// ─────────────────────────────────────────────────────────
// Role labels (pt-BR) for display
// ─────────────────────────────────────────────────────────
const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  diretor_presidente: 'Diretor Presidente',
  gestor: 'Gestor',
  risco: 'Risco',
  analista: 'Analista',
  comum: 'Usuário Comum',
};

const ALL_ROLES: Role[] = ['administrador', 'diretor_presidente', 'gestor', 'risco', 'analista', 'comum'];

const PROFILE_KEYS = Object.keys(MOCK_USERS);

// ─────────────────────────────────────────────────────────
// Component — only visible in dev mode
// ─────────────────────────────────────────────────────────
const DevToggleBar: React.FC = () => {
  const isDev = import.meta.env.DEV;
  const {
    user,
    setActiveProfile,
    toggleRole,
    isAdmin,
    isEntraIdEnabled,
    setEntraIdEnabled,
  } = useAuth();

  const [expanded, setExpanded] = useState(false);

  if (!isDev) return null;

  const currentProfileKey =
    PROFILE_KEYS.find(k => MOCK_USERS[k].id === user.id) || 'administrador';

  return (
    <div
      id="dev-toggle-bar"
      className="fixed bottom-0 left-0 right-0 z-[9999] transition-all duration-300"
    >
      {/* Collapsed mini-bar */}
      {!expanded && (
        <button
          id="dev-bar-expand"
          onClick={() => setExpanded(true)}
          className="absolute bottom-2 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg
                     bg-gray-800/90 dark:bg-gray-700/90 text-gray-300 text-[10px] font-mono
                     border border-gray-700 dark:border-gray-600
                     hover:bg-gray-700 dark:hover:bg-gray-600 backdrop-blur-sm shadow-lg
                     transition-all duration-200 hover:scale-105"
        >
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          DEV · {user.nome} ({user.roles.map(r => ROLE_LABELS[r]).join(', ')})
        </button>
      )}

      {/* Expanded bar */}
      {expanded && (
        <div className="bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-md border-t border-gray-700 dark:border-gray-600 shadow-2xl">
          <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-4 text-xs text-gray-300">
            {/* Profile selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap">
                Perfil Mock:
              </span>
              <Select
                id="dev-profile-select"
                value={currentProfileKey}
                onChange={(e) => setActiveProfile(e.target.value)}
                className="!w-40 !py-1 !px-2 !text-xs !bg-gray-800 !border-gray-700 !text-gray-200"
              >
                {PROFILE_KEYS.map(key => (
                  <option key={key} value={key}>
                    {MOCK_USERS[key].nome}
                  </option>
                ))}
              </Select>
            </div>

            {/* Current roles (multi-toggle chips) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap mr-1">
                Roles:
              </span>
              {ALL_ROLES.map(role => {
                const isActive = user.roles.includes(role);
                return (
                  <button
                    key={role}
                    id={`dev-role-toggle-${role}`}
                    onClick={() => toggleRole(role)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-600/80 text-white border-blue-500 shadow-sm shadow-blue-500/20'
                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>

            {/* Separator */}
            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* EntraID Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap">
                EntraID:
              </span>
              <button
                id="dev-entra-id-toggle"
                onClick={() => {
                  if (isAdmin) setEntraIdEnabled(!isEntraIdEnabled);
                }}
                disabled={!isAdmin}
                title={!isAdmin ? 'Apenas Administradores podem alterar' : undefined}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  isEntraIdEnabled
                    ? 'bg-green-500'
                    : 'bg-gray-600'
                } ${!isAdmin ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    isEntraIdEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className={`text-[10px] font-mono ${isEntraIdEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                {isEntraIdEnabled ? 'Ligado' : 'Desligado'}
              </span>
            </div>

            {/* Spacer & collapse */}
            <div className="flex-1" />

            {/* Status badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 border border-gray-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] text-gray-400 font-mono">
                {user.nome}
              </span>
            </div>

            <button
              id="dev-bar-collapse"
              onClick={() => setExpanded(false)}
              className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              title="Recolher barra dev"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevToggleBar;
