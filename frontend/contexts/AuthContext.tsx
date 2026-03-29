
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import type { User, Role, CargoVoto } from '../types';
import { loginRequest } from '../authConfig';

// ─────────────────────────────────────────────────────────
// Mock user presets (kept for dev/fallback mode)
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
// Role → CargoVoto mapping (para votação no comitê)
// ─────────────────────────────────────────────────────────
const ROLE_TO_CARGO: Partial<Record<Role, CargoVoto>> = {
  gestor: 'gestao',
  risco: 'risco',
  diretor_presidente: 'diretoria',
};

// ─────────────────────────────────────────────────────────
// Valid roles (used for token mapping)
// ─────────────────────────────────────────────────────────
const VALID_ROLES: Role[] = ['administrador', 'risco', 'gestor', 'diretor_presidente', 'analista', 'comum'];

/**
 * Map roles from the Entra ID token's `roles` claim to our internal Role type.
 * If no valid roles are found, defaults to ['comum'] (read-only).
 */
const mapTokenRoles = (tokenRoles: string[] | undefined): Role[] => {
  const mapped = (tokenRoles || []).filter(r => VALID_ROLES.includes(r as Role)) as Role[];
  return mapped.length > 0 ? mapped : ['comum'];
};

// ─────────────────────────────────────────────────────────
// Context shape (same interface as the previous MockAuthContext)
// ─────────────────────────────────────────────────────────
export interface AuthContextValue {
  /** Currently active user */
  user: User & { roles: Role[] };

  /** Switch the active mock profile by preset key (Mock mode only) */
  setActiveProfile: (profileKey: string) => void;

  /** Toggle an individual role on/off for the current user (Mock mode only) */
  toggleRole: (role: Role) => void;

  /** Check if current user has a specific role (Admins always return true) */
  hasRole: (role: Role) => boolean;

  /** Check if current user can cast a comitê vote for the given cargo */
  canVote: (cargo: CargoVoto) => boolean;

  /** Whether the user is admin (convenience) */
  isAdmin: boolean;

  /** Whether the user is read-only (role === 'comum' without admin) */
  isReadOnly: boolean;

  /** Whether Entra ID authentication is enabled */
  isEntraIdEnabled: boolean;
  setEntraIdEnabled: (v: boolean) => void;

  /** Whether the MSAL authentication is in progress */
  isAuthenticating: boolean;

  /** Whether the user is authenticated via MSAL (only relevant when Entra ID is enabled) */
  isMsalAuthenticated: boolean;

  /** Trigger MSAL login */
  login: () => void;

  /** Trigger MSAL logout */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { instance, accounts, inProgress } = useMsal();
  const isMsalAuthenticated = useIsAuthenticated();

  // ── Whether MSAL is actually configured (Client ID present) ──
  const isMsalConfigured = !!(import.meta.env.VITE_ENTRA_CLIENT_ID);

  // ── Entra ID toggle (persisted in localStorage) ──
  // SAFETY: Never enable Entra ID if Client ID is not configured
  const [isEntraIdEnabled, setIsEntraIdEnabledState] = useState<boolean>(() => {
    if (!import.meta.env.VITE_ENTRA_CLIENT_ID) return false;
    const saved = localStorage.getItem('entra_id_enabled');
    if (saved !== null) return JSON.parse(saved);
    return false; // Default to Mock mode — admin enables Entra ID explicitly
  });

  // ── Mock state (for when Entra ID is disabled) ──
  const [mockUser, setMockUser] = useState<User & { roles: Role[] }>(() => {
    const saved = localStorage.getItem('mock_auth_profile');
    if (saved && MOCK_USERS[saved]) {
      return { ...MOCK_USERS[saved] };
    }
    return { ...MOCK_USERS.administrador };
  });

  // ── Derive current user based on mode ──
  const currentUser = useMemo<User & { roles: Role[] }>(() => {
    if (!isEntraIdEnabled) {
      return mockUser;
    }

    // Entra ID mode: extract user from MSAL account
    if (isMsalAuthenticated && accounts.length > 0) {
      const account = accounts[0];
      const claims = account.idTokenClaims as Record<string, any> | undefined;
      const tokenRoles = claims?.roles as string[] | undefined;
      const roles = mapTokenRoles(tokenRoles);

      return {
        id: account.localAccountId ? parseInt(account.localAccountId.replace(/\D/g, '').slice(0, 8) || '0', 10) : 0,
        nome: account.name || account.username || 'Usuário Microsoft',
        email: account.username || '',
        roles,
      };
    }

    // Not authenticated yet — return a placeholder (LoginPage will be shown)
    return {
      id: 0,
      nome: '',
      email: '',
      roles: ['comum'],
    };
  }, [isEntraIdEnabled, mockUser, isMsalAuthenticated, accounts]);

  // ── Mock profile management ──
  const setActiveProfile = useCallback((profileKey: string) => {
    const preset = MOCK_USERS[profileKey];
    if (!preset) return;
    setMockUser({ ...preset });
    localStorage.setItem('mock_auth_profile', profileKey);
  }, []);

  const toggleRole = useCallback((role: Role) => {
    setMockUser(prev => {
      const hasIt = prev.roles.includes(role);
      const next = hasIt
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role];
      if (next.length === 0) return prev;
      return { ...prev, roles: next };
    });
  }, []);

  // ── Entra ID toggle ──
  const setEntraIdEnabled = useCallback((v: boolean) => {
    // SAFETY: Cannot enable Entra ID without a configured Client ID
    if (v && !import.meta.env.VITE_ENTRA_CLIENT_ID) {
      console.warn('[Auth] Cannot enable Entra ID: VITE_ENTRA_CLIENT_ID is not configured');
      return;
    }
    setIsEntraIdEnabledState(v);
    localStorage.setItem('entra_id_enabled', JSON.stringify(v));
  }, []);

  // ── Role checks ──
  const isAdmin = currentUser.roles.includes('administrador');

  const hasRole = useCallback((role: Role): boolean => {
    if (currentUser.roles.includes('administrador')) return true;
    return currentUser.roles.includes(role);
  }, [currentUser.roles]);

  const canVote = useCallback((cargo: CargoVoto): boolean => {
    if (currentUser.roles.includes('administrador')) return true;
    if (currentUser.roles.length === 1 && currentUser.roles[0] === 'comum') return false;
    return currentUser.roles.some(role => ROLE_TO_CARGO[role] === cargo);
  }, [currentUser.roles]);

  const isReadOnly = useMemo(() => {
    if (isAdmin) return false;
    return currentUser.roles.length === 1 && currentUser.roles[0] === 'comum';
  }, [currentUser.roles, isAdmin]);

  const isAuthenticating = inProgress !== InteractionStatus.None;

  // ── Login / Logout ──
  const login = useCallback(() => {
    instance.loginRedirect(loginRequest).catch(err => {
      console.error('[Auth] Login failed:', err);
    });
  }, [instance]);

  const logout = useCallback(() => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    }).catch(err => {
      console.error('[Auth] Logout failed:', err);
    });
  }, [instance]);

  // ── Set active account when accounts change ──
  useEffect(() => {
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  // ── Build context value ──
  const value = useMemo<AuthContextValue>(() => ({
    user: currentUser,
    setActiveProfile,
    toggleRole,
    hasRole,
    canVote,
    isAdmin,
    isReadOnly,
    isEntraIdEnabled,
    setEntraIdEnabled,
    isAuthenticating,
    isMsalAuthenticated,
    login,
    logout,
  }), [
    currentUser, setActiveProfile, toggleRole, hasRole, canVote,
    isAdmin, isReadOnly, isEntraIdEnabled, setEntraIdEnabled,
    isAuthenticating, isMsalAuthenticated, login, logout,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────
// Hook (same name as before for drop-in compatibility)
// ─────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
