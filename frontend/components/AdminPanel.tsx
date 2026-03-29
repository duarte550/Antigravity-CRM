
import React, { useState } from 'react';
import { useAuth, MOCK_USERS } from '../contexts/AuthContext';
import type { Role } from '../types';
import { Select } from './UI';
import { X, Shield, Users, ToggleLeft, ToggleRight, LogOut, Info, ChevronDown, ChevronUp } from 'lucide-react';

// ─────────────────────────────────────────────────────────
// Role labels (pt-BR)
// ─────────────────────────────────────────────────────────
const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  diretor_presidente: 'Diretor Presidente',
  gestor: 'Gestor',
  risco: 'Risco',
  analista: 'Analista',
  comum: 'Usuário Comum',
};

const ROLE_COLORS: Record<Role, string> = {
  administrador: 'bg-red-500/20 text-red-300 border-red-500/30',
  diretor_presidente: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  gestor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  risco: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  analista: 'bg-green-500/20 text-green-300 border-green-500/30',
  comum: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const ALL_ROLES: Role[] = ['administrador', 'diretor_presidente', 'gestor', 'risco', 'analista', 'comum'];
const PROFILE_KEYS = Object.keys(MOCK_USERS);

// ─────────────────────────────────────────────────────────
// AdminPanel Modal
// ─────────────────────────────────────────────────────────
interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const {
    user,
    setActiveProfile,
    toggleRole,
    isAdmin,
    isEntraIdEnabled,
    setEntraIdEnabled,
    isMsalAuthenticated,
    logout,
  } = useAuth();

  const [mockSectionOpen, setMockSectionOpen] = useState(!isEntraIdEnabled);

  if (!isOpen) return null;

  const currentProfileKey =
    PROFILE_KEYS.find(k => MOCK_USERS[k].id === user.id) || 'administrador';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-700/60 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Painel Administrador</h2>
              <p className="text-xs text-gray-400">Gerenciamento de autenticação e roles</p>
            </div>
          </div>
          <button
            id="admin-panel-close"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Section 1: Currently Logged-in User ── */}
          <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-gray-200">Usuário Atual</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Nome</span>
                <span className="text-gray-200 font-medium">{user.nome || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Email</span>
                <span className="text-gray-200 font-medium">{user.email || '—'}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-gray-400">Roles</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {user.roles.map(role => (
                    <span
                      key={role}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_COLORS[role]}`}
                    >
                      {ROLE_LABELS[role]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Modo</span>
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${isEntraIdEnabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {isEntraIdEnabled ? 'Microsoft Entra ID' : 'Mock (Desenvolvimento)'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section 2: Entra ID Toggle ── */}
          <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-sm font-semibold text-gray-200">Microsoft Entra ID</span>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {isEntraIdEnabled
                      ? 'Autenticação real ativa — tokens Microsoft obrigatórios'
                      : 'Modo Mock ativo — sem autenticação real necessária'
                    }
                  </p>
                </div>
              </div>
              <button
                id="admin-entra-toggle"
                onClick={() => {
                  if (isAdmin) setEntraIdEnabled(!isEntraIdEnabled);
                }}
                disabled={!isAdmin}
                title={!isAdmin ? 'Apenas Administradores podem alterar' : undefined}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${
                  isEntraIdEnabled
                    ? 'bg-gradient-to-r from-green-500 to-emerald-400 shadow-lg shadow-green-500/20'
                    : 'bg-gray-600'
                } ${!isAdmin ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                    isEntraIdEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Logout button (only when Entra ID is active and authenticated) */}
            {isEntraIdEnabled && isMsalAuthenticated && (
              <button
                id="admin-logout-btn"
                onClick={logout}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair da conta Microsoft
              </button>
            )}
          </div>

          {/* ── Section 3: Mock Mode Controls (collapsible, only when Mock is active) ── */}
          <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 overflow-hidden">
            <button
              onClick={() => setMockSectionOpen(!mockSectionOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-700/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-gray-200">Controles de Mock</span>
                {isEntraIdEnabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-400">Desativado</span>
                )}
              </div>
              {mockSectionOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {mockSectionOpen && (
              <div className={`px-4 pb-4 space-y-4 ${isEntraIdEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* Profile selector */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                    Perfil Mock
                  </label>
                  <Select
                    id="admin-mock-profile"
                    value={currentProfileKey}
                    onChange={(e) => setActiveProfile(e.target.value)}
                    className="!bg-gray-700 !border-gray-600 !text-gray-200"
                  >
                    {PROFILE_KEYS.map(key => (
                      <option key={key} value={key}>
                        {MOCK_USERS[key].nome} — {MOCK_USERS[key].roles.map(r => ROLE_LABELS[r]).join(', ')}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Role toggles */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider font-semibold">
                    Roles Ativas
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ROLES.map(role => {
                      const isActive = user.roles.includes(role);
                      return (
                        <button
                          key={role}
                          id={`admin-role-toggle-${role}`}
                          onClick={() => toggleRole(role)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ${
                            isActive
                              ? ROLE_COLORS[role] + ' shadow-sm'
                              : 'bg-gray-700/50 text-gray-500 border-gray-600 hover:border-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
