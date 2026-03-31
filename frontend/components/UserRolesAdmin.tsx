import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';
import { Role } from '../types';
import { Select, Input } from './UI';
import { UserCog, Loader2, Plus } from 'lucide-react';
import { API_BASE } from '../utils/api';

const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  diretor_presidente: 'Diretor Presidente',
  gestor: 'Gestor',
  risco: 'Risco',
  analista: 'Analista',
  comum: 'Usuário Comum',
};

const ALL_ROLES: Role[] = ['administrador', 'diretor_presidente', 'gestor', 'risco', 'analista', 'comum'];

interface DbUserRole {
  email: string;
  roles: Role[];
  updated_at: string;
}

export const UserRolesAdmin: React.FC = () => {
  const { isEntraIdEnabled, isAdmin } = useAuth();
  const { instance, accounts } = useMsal();
  const [users, setUsers] = useState<DbUserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('comum');
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    const activeAccount = instance.getActiveAccount() || accounts[0];
    if (activeAccount) {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          ...loginRequest,
          account: activeAccount,
        });
        if (tokenResponse.idToken) {
          headers['Authorization'] = `Bearer ${tokenResponse.idToken}`;
        }
      } catch (err) {
        console.warn('[UserRolesAdmin] Could not acquire token silently:', err);
      }
    }
    return headers;
  }, [instance, accounts]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/user-roles`, {
        headers: authHeaders,
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isEntraIdEnabled && isAdmin) {
      fetchUsers();
    }
  }, [isEntraIdEnabled, isAdmin, fetchUsers]);

  const handleUpdateRole = async (email: string, roles: Role[]) => {
    try {
      setSavingEmail(email);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/user-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ email, roles })
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch(err) {
      console.error(err);
    } finally {
      setSavingEmail(null);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    await handleUpdateRole(newEmail.trim().toLowerCase(), [newRole]);
    setNewEmail('');
    setNewRole('comum');
  };

  if (!isEntraIdEnabled || !isAdmin) return null;

  return (
    <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 p-4">
      <div className="flex items-center gap-2 mb-4">
        <UserCog className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold text-gray-200">Gerenciamento de Acessos (Databricks)</span>
      </div>

      <form onSubmit={handleAddUser} className="flex gap-2 mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1 font-semibold">Novo E-mail do Funcionário</label>
          <Input 
            value={newEmail} 
            onChange={(e) => setNewEmail(e.target.value)} 
            placeholder="usuario@empresa.com" 
            className="!bg-gray-800 !py-1.5 !text-sm"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs text-gray-400 mb-1 font-semibold">Nível de Acesso</label>
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className="!bg-gray-800 !py-2 !text-sm">
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </div>
        <button type="submit" disabled={!newEmail || savingEmail === newEmail} className="h-9 w-9 flex-shrink-0 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition border border-green-500/30 flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center p-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {users.map(u => (
            <div key={u.email} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/80 border border-gray-700/50 hover:border-gray-600 transition-colors">
              <span className="text-sm text-gray-200 truncate w-1/2 font-medium" title={u.email}>{u.email}</span>
              <div className="flex items-center gap-3 w-1/2 justify-end">
                {savingEmail === u.email && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />}
                <Select
                  value={u.roles[0] || 'comum'}
                  onChange={(e) => handleUpdateRole(u.email, [e.target.value as Role])}
                  disabled={savingEmail === u.email}
                  className="!w-36 !py-1 !px-2 !text-xs !bg-gray-900 border-gray-600 focus:border-purple-500/50"
                >
                  {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="text-center text-xs text-gray-500 py-4">Nenhum privilégio especial cadastrado. Todos são "Comum".</div>}
        </div>
      )}
    </div>
  );
};
