
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { User, Role, CargoVoto } from '../types';

// ─────────────────────────────────────────────────────────
// Mock user presets (one per selectable profile)
// ─────────────────────────────────────────────────────────
export const MOCK_USERS: Record<string, User & { roles: Role[] }> = {
  administrador: {
    id: 1,
    nome: 'Admin Master',
    email: 'admin@antigravity.com',
    roles: ['administrador'],
  },
  diretor_presidente: {
    id: 2,
    nome: 'Carlos Diretor',
    email: 'carlos.diretor@antigravity.com',
    roles: ['diretor_presidente'],
  },
  gestor: {
    id: 3,
    nome: 'Maria Gestora',
    email: 'maria.gestora@antigravity.com',
    roles: ['gestor'],
  },
  risco: {
    id: 4,
    nome: 'João Risco',
    email: 'joao.risco@antigravity.com',
    roles: ['risco'],
  },
  analista: {
    id: 5,
    nome: 'Ana Analista',
    email: 'ana.analista@antigravity.com',
    roles: ['analista'],
  },
  comum: {
    id: 6,
    nome: 'Pedro Comum',
    email: 'pedro.comum@antigravity.com',
    roles: ['comum'],
  },
};

// ─────────────────────────────────────────────────────────
// Mapping: Role → CargoVoto (para votação no comitê)
// ─────────────────────────────────────────────────────────
const ROLE_TO_CARGO: Partial<Record<Role, CargoVoto>> = {
  gestor: 'gestao',
  risco: 'risco',
  diretor_presidente: 'diretoria',
};

// ─────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────
export interface MockAuthContextValue {
  /** Currently active mock user */
  user: User & { roles: Role[] };

  /** Switch the active mock profile by preset key */
  setActiveProfile: (profileKey: string) => void;

  /** Toggle an individual role on/off for the current user (supports multi-role) */
  toggleRole: (role: Role) => void;

  /** Check if current user has a specific role (Admins always return true) */
  hasRole: (role: Role) => boolean;

  /** Check if current user can cast a comitê vote for the given cargo */
  canVote: (cargo: CargoVoto) => boolean;

  /** Whether the user is admin (convenience) */
  isAdmin: boolean;

  /** Whether the user is read-only (role === 'comum' without admin) */
  isReadOnly: boolean;

  /** Simulated EntraID authentication toggle (admin-only control) */
  isEntraIdEnabled: boolean;
  setEntraIdEnabled: (v: boolean) => void;
}

const MockAuthContext = createContext<MockAuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────
export const MockAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User & { roles: Role[] }>(() => {
    const saved = localStorage.getItem('mock_auth_profile');
    if (saved && MOCK_USERS[saved]) {
      return { ...MOCK_USERS[saved] };
    }
    return { ...MOCK_USERS.administrador };
  });

  const [isEntraIdEnabled, setEntraIdEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('mock_entra_id');
    return saved ? JSON.parse(saved) : false;
  });

  const setActiveProfile = useCallback((profileKey: string) => {
    const preset = MOCK_USERS[profileKey];
    if (!preset) return;
    setCurrentUser({ ...preset });
    localStorage.setItem('mock_auth_profile', profileKey);
  }, []);

  const toggleRole = useCallback((role: Role) => {
    setCurrentUser(prev => {
      const hasIt = prev.roles.includes(role);
      const next = hasIt
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role];
      // Must always have at least one role
      if (next.length === 0) return prev;
      return { ...prev, roles: next };
    });
  }, []);

  const isAdmin = currentUser.roles.includes('administrador');

  const hasRole = useCallback((role: Role): boolean => {
    if (currentUser.roles.includes('administrador')) return true;
    return currentUser.roles.includes(role);
  }, [currentUser.roles]);

  const canVote = useCallback((cargo: CargoVoto): boolean => {
    // Admin can always vote with any cargo
    if (currentUser.roles.includes('administrador')) return true;
    // Comum never votes
    if (currentUser.roles.length === 1 && currentUser.roles[0] === 'comum') return false;
    // Check if any of the user's roles maps to the requested cargo
    return currentUser.roles.some(role => ROLE_TO_CARGO[role] === cargo);
  }, [currentUser.roles]);

  const isReadOnly = useMemo(() => {
    if (isAdmin) return false;
    return currentUser.roles.length === 1 && currentUser.roles[0] === 'comum';
  }, [currentUser.roles, isAdmin]);

  const handleSetEntraId = useCallback((v: boolean) => {
    setEntraIdEnabled(v);
    localStorage.setItem('mock_entra_id', JSON.stringify(v));
  }, []);

  const value = useMemo<MockAuthContextValue>(() => ({
    user: currentUser,
    setActiveProfile,
    toggleRole,
    hasRole,
    canVote,
    isAdmin,
    isReadOnly,
    isEntraIdEnabled,
    setEntraIdEnabled: handleSetEntraId,
  }), [currentUser, setActiveProfile, toggleRole, hasRole, canVote, isAdmin, isReadOnly, isEntraIdEnabled, handleSetEntraId]);

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────
export function useAuth(): MockAuthContextValue {
  const ctx = useContext(MockAuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within a <MockAuthProvider>');
  }
  return ctx;
}

export default MockAuthContext;
