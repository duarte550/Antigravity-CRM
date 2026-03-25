
import React, { useState, useEffect, useMemo } from 'react';
import type { AuditLog } from '../types';
import { fetchApi } from '../utils/api';

interface AuditLogPageProps {
    apiUrl: string;
    setIsRefreshing: (isRefreshing: boolean) => void;
}

const AuditLogPage: React.FC<AuditLogPageProps> = ({ apiUrl, setIsRefreshing }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [userFilter, setUserFilter] = useState('All');
    const [actionFilter, setActionFilter] = useState('All');
    const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

    useEffect(() => {
        const fetchLogs = async () => {
            setIsLoading(true);
            setIsRefreshing(true);
            try {
                const response = await fetchApi(`${apiUrl}/api/audit_logs`, { credentials: 'include' });
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                const data: AuditLog[] = await response.json();
                setLogs(data);
            } catch (err) {
                 if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError("An unknown network error occurred.");
                }
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        };
        fetchLogs();
    }, [apiUrl]);
    
    const uniqueUsers = useMemo(() => ['All', ...new Set(logs.map(log => log.user_name))], [logs]);
    const uniqueActions = useMemo(() => ['All', ...new Set(logs.map(log => log.action))], [logs]);

    const filteredLogs = useMemo(() => {
        return logs
            .filter(log => userFilter === 'All' || log.user_name === userFilter)
            .filter(log => actionFilter === 'All' || log.action === actionFilter)
            .filter(log => {
                if (!dateFilter.start && !dateFilter.end) return true;
                const logDate = new Date(log.timestamp);
                logDate.setHours(0,0,0,0);
                const startDate = dateFilter.start ? new Date(dateFilter.start) : null;
                const endDate = dateFilter.end ? new Date(dateFilter.end) : null;
                if(startDate) startDate.setHours(0,0,0,0);
                if(endDate) endDate.setHours(0,0,0,0);

                if (startDate && logDate < startDate) return false;
                if (endDate && logDate > endDate) return false;
                return true;
            });
    }, [logs, userFilter, actionFilter, dateFilter]);

    const getActionBadge = (action: AuditLog['action']) => {
        const styles = {
            CREATE: 'bg-green-100 text-green-800',
            UPDATE: 'bg-yellow-100 text-yellow-800',
            DELETE: 'bg-red-100 text-red-800',
        };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[action]}`}>{action}</span>;
    };

    if (isLoading) return <div className="text-center p-8">Carregando logs...</div>;
    if (error) return <div className="text-center p-8 text-red-600">Erro ao carregar logs: {error}</div>;

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Log de Auditoria</h2>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label htmlFor="user-filter" className="text-sm font-medium text-gray-700">Usuário</label>
                    <select id="user-filter" value={userFilter} onChange={e => setUserFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm">
                        {uniqueUsers.map(user => <option key={user} value={user}>{user}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="action-filter" className="text-sm font-medium text-gray-700">Ação</label>
                    <select id="action-filter" value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm">
                        {uniqueActions.map(action => <option key={action} value={action}>{action}</option>)}
                    </select>
                </div>
                 <div>
                    <label htmlFor="start-date-filter" className="text-sm font-medium text-gray-700">De</label>
                    <input type="date" id="start-date-filter" value={dateFilter.start} onChange={e => setDateFilter(prev => ({...prev, start: e.target.value}))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"/>
                </div>
                 <div>
                    <label htmlFor="end-date-filter" className="text-sm font-medium text-gray-700">Até</label>
                    <input type="date" id="end-date-filter" value={dateFilter.end} onChange={e => setDateFilter(prev => ({...prev, end: e.target.value}))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"/>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entidade</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{log.user_name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getActionBadge(log.action)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <span className="font-semibold">{log.entity_type}</span> (ID: {log.entity_id})
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{log.details}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredLogs.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        Nenhum log encontrado para os filtros selecionados.
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogPage;
