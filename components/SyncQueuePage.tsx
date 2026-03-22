
import React from 'react';
import type { Operation } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
}

interface SyncQueuePageProps {
  queue: Operation[];
  genericQueue?: SyncQueueItem[];
  isSyncing: boolean;
  failedOperations: {id: number, error: string}[];
}

const SyncQueuePage: React.FC<SyncQueuePageProps> = ({ queue, genericQueue, isSyncing, failedOperations }) => {
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return format(new Date(timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Fila de Sincronização</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Acompanhe as alterações pendentes que estão sendo enviadas para o Databricks.
          </p>
        </div>
        {isSyncing && (
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full animate-pulse border border-blue-200 dark:border-blue-800 shadow-sm">
            <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
            Sincronizando...
          </div>
        )}
      </div>

      {failedOperations.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg">
          <h3 className="text-sm font-bold text-red-800 dark:text-red-200">Falhas na Sincronização:</h3>
          <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside">
            {failedOperations.map((fail) => (
              <li key={fail.id}>Operação ID {fail.id}: {fail.error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Operação</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Última Alteração Local</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {queue.length === 0 && (!genericQueue || genericQueue.length === 0) ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Nenhuma alteração pendente na fila.
                  </td>
                </tr>
              ) : (
                <>
                {queue.map((op, index) => (
                  <tr key={`main-${op.id}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{op.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{op.area}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(op.lastUpdated)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        index === 0 && isSyncing 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {index === 0 && isSyncing ? 'Processando Databricks...' : 'Aguardando'}
                      </span>
                    </td>
                  </tr>
                ))}
                {genericQueue?.map((item, index) => {
                  const isFallbackProc = index === 0 && isSyncing; 
                  return (
                  <tr key={`gen-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{item.payload?.name || 'Operação Estruturada'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">API: {item.url.split('/api/')[1] || 'URL'} ({item.method})</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        isFallbackProc
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                      }`}>
                        {isFallbackProc ? 'Sincronizando...' : 'Fila Genérica'}
                      </span>
                    </td>
                  </tr>
                )})}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-4 rounded-r-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Importante:</strong> As alterações são salvas localmente no seu navegador e enviadas para o servidor em segundo plano. 
              Não limpe o cache do navegador ou feche a aba se houver muitas alterações pendentes para garantir que tudo seja sincronizado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncQueuePage;
