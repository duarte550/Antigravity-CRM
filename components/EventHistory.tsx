
import React, { useState, useMemo } from 'react';
import type { Event } from '../types';
import { PlusCircleIcon, PencilIcon, DownloadIcon, ArrowUpIcon, ArrowDownIcon } from './icons/Icons';

interface EventHistoryProps {
  events: Event[];
  onAddEvent: () => void;
  onEditEvent: (event: Event) => void;
  onDownloadEvent: (event: Event) => void;
  dateFilter: { start: string; end: string };
  onDateFilterChange: (filter: { start: string; end: string }) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  personFilter: string;
  onPersonFilterChange: (person: string) => void;
  uniqueEventTypes: string[];
  uniqueRegisteredBy: string[];
  onViewDetails: (event: Event) => void;
  eventRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
}

const EventHistory: React.FC<EventHistoryProps> = ({
  events,
  onAddEvent,
  onEditEvent,
  onDownloadEvent,
  dateFilter,
  onDateFilterChange,
  typeFilter,
  onTypeFilterChange,
  personFilter,
  onPersonFilterChange,
  uniqueEventTypes,
  uniqueRegisteredBy,
  onViewDetails,
  eventRefs,
}) => {
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedEvents = useMemo(() => {
      return [...events].sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      });
  }, [events, sortDirection]);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg dark:border dark:border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Histórico de Eventos</h3>
        <button onClick={onAddEvent} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <PlusCircleIcon className="w-5 h-5" /> Adicionar Evento
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="start-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">De:</label>
            <input type="date" id="start-date" value={dateFilter.start} onChange={e => onDateFilterChange({ ...dateFilter, start: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="end-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Até:</label>
            <input type="date" id="end-date" value={dateFilter.end} onChange={e => onDateFilterChange({ ...dateFilter, end: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="type-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo:</label>
            <select id="type-filter" value={typeFilter} onChange={e => onTypeFilterChange(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500">
              {uniqueEventTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="person-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Responsável:</label>
            <select id="person-filter" value={personFilter} onChange={e => onPersonFilterChange(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500">
              {uniqueRegisteredBy.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        <div className="grid grid-cols-5 gap-4 px-4 py-2 bg-gray-100 dark:bg-gray-700/50 rounded-t-lg text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
            <div 
              className="flex items-center gap-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            >
                Data {sortDirection === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
            </div>
            <div>Tipo</div>
            <div className="col-span-2">Título</div>
            <div className="text-right">Ações</div>
        </div>
        {sortedEvents.map(event => (
          <div key={event.id} ref={el => { if (el) eventRefs.current[event.id] = el; }} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-all duration-300 bg-white dark:bg-gray-800">
            <div className="grid grid-cols-5 gap-4 items-center">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(event.date).toLocaleDateString('pt-BR')}</div>
              <div className="text-sm text-gray-800 dark:text-gray-200">
                <span className="font-semibold">{event.type}</span>
                {event.isOrigination && <span className="ml-2 text-[10px] uppercase font-bold tracking-wider bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800 px-1.5 py-0.5 rounded">Originação</span>}
              </div>
              <div className="col-span-2 text-sm text-gray-800 dark:text-gray-200 font-medium">{event.title}</div>
              <div className="text-right flex items-center justify-end gap-2">
                <button onClick={() => onEditEvent(event)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar Evento">
                  <PencilIcon className="w-5 h-5" />
                </button>
                <button onClick={() => onDownloadEvent(event)} className="text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors" title="Baixar Evento como .txt">
                  <DownloadIcon className="w-5 h-5" />
                </button>
                <button onClick={() => onViewDetails(event)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-semibold ml-2 transition-colors">
                  Ver mais
                </button>
              </div>
            </div>
          </div>
        ))}
        {sortedEvents.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-12">Nenhum evento encontrado para os filtros selecionados.</p>}
      </div>
    </div>
  );
};

export default EventHistory;
