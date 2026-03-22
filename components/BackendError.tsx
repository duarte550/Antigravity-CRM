
import React from 'react';
import { WarningIcon } from './icons/Icons';

interface BackendErrorProps {
  errorMessage: string;
  onRetry: () => void;
}

const BackendError: React.FC<BackendErrorProps> = ({ errorMessage, onRetry }) => {
  return (
    <div className="flex justify-center items-center h-full p-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-8 rounded-lg shadow-lg max-w-lg text-center" role="alert">
        <div className="flex justify-center mb-4">
          <WarningIcon className="w-12 h-12 text-red-400 dark:text-red-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Erro de Conexão com o Back-end</h2>
        <p className="mb-4">
          Não foi possível carregar os dados da aplicação. Isso geralmente ocorre porque o servidor back-end não está em execução.
        </p>
        <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded-md text-left text-sm mb-6">
            <p className="font-semibold">Como resolver:</p>
            <ol className="list-decimal list-inside mt-1 space-y-1">
                <li>Abra um novo terminal.</li>
                <li>Navegue até a pasta <strong>backend</strong> do projeto.</li>
                <li>Execute o comando: <code className="bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 font-mono p-1 rounded">flask run</code></li>
                <li>Após o servidor iniciar, clique no botão abaixo para tentar novamente.</li>
            </ol>
        </div>
        
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">Detalhe do erro: {errorMessage}</p>

        <button
          onClick={onRetry}
          className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-red-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
};

export default BackendError;
