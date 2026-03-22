
import React, { useState } from 'react';
import type { Operation, Event, Rating, Sentiment } from '../types';
import { ratingOptions, WatchlistStatus, Sentiment as SentimentEnum } from '../types';
import Modal from './Modal';
import RichTextEditor from './RichTextEditor';

interface WatchlistChangeFormProps {
  operation: Operation;
  onClose: () => void;
  onSave: (data: { watchlist: WatchlistStatus, ratingOp: Rating, ratingGroup: Rating, sentiment: Sentiment, event: Omit<Event, 'id'>}) => void;
  initialData?: {
      watchlist: WatchlistStatus;
      ratingOp: Rating;
      ratingGroup: Rating;
      sentiment: Sentiment;
      event: Event;
  };
}

const Label: React.FC<{htmlFor: string; children: React.ReactNode}> = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{children}</label>;
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => <select {...props} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />;
const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => <textarea {...props} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />;
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => <input {...props} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />;


const WatchlistChangeForm: React.FC<WatchlistChangeFormProps> = ({ operation, onClose, onSave, initialData }) => {
  const [watchlist, setWatchlist] = useState(initialData?.watchlist || operation.watchlist);
  const [ratingOp, setRatingOp] = useState(initialData?.ratingOp || operation.ratingOperation);
  const [ratingGroup, setRatingGroup] = useState(initialData?.ratingGroup || operation.ratingGroup);
  const [description, setDescription] = useState(initialData?.event.description || '');
  const [changeDate, setChangeDate] = useState(initialData?.event.date ? new Date(initialData.event.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [nextSteps, setNextSteps] = useState(initialData?.event.nextSteps || '');
  const [sentiment, setSentiment] = useState<Sentiment>(initialData?.sentiment || SentimentEnum.NEUTRO);
  const [attentionPoints, setAttentionPoints] = useState(initialData?.event.attentionPoints || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const event: Omit<Event, 'id'> = {
        // FIX: Add mid-day time to avoid UTC shift issues
        date: new Date(changeDate + 'T12:00:00').toISOString(),
        type: 'Mudança de Watchlist',
        title: `Alteração de Watchlist para ${watchlist}`,
        description,
        registeredBy: operation.responsibleAnalyst,
        nextSteps: nextSteps,
        attentionPoints: attentionPoints,
    };

    onSave({ watchlist, ratingOp, ratingGroup, sentiment, event });
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? "Editar Alteração" : "Alterar Watchlist e Ratings"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
            <Label htmlFor="watchlist-date">Data da Alteração</Label>
            <Input id="watchlist-date" type="date" value={changeDate} onChange={e => setChangeDate(e.target.value)} required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="watchlist-new-status">Novo Status Watchlist</Label>
                <Select id="watchlist-new-status" value={watchlist} onChange={e => setWatchlist(e.target.value as WatchlistStatus)}>
                    {Object.values(WatchlistStatus).map(w => <option key={w} value={w}>{w}</option>)}
                </Select>
            </div>
             <div>
                <Label htmlFor="review-sentiment">Sentimento da Alteração</Label>
                <Select id="review-sentiment" value={sentiment} onChange={e => setSentiment(e.target.value as Sentiment)}>
                    {Object.values(SentimentEnum).map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="rating-op-update">Rating Operação (Opcional)</Label>
                <Select id="rating-op-update" value={ratingOp} onChange={e => setRatingOp(e.target.value as Rating)}>
                    {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
            </div>
            <div>
                <Label htmlFor="rating-group-update">Rating Grupo (Opcional)</Label>
                <Select id="rating-group-update" value={ratingGroup} onChange={e => setRatingGroup(e.target.value as Rating)}>
                    {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
            </div>
        </div>

        <div>
            <Label htmlFor="change-description">Descrição / Motivo da Alteração</Label>
            <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="h-48" 
            />
        </div>
        
        <div>
            <Label htmlFor="change-next-steps">Próximos Passos</Label>
            <RichTextEditor 
                value={nextSteps} 
                onChange={setNextSteps} 
                className="h-32" 
            />
        </div>

        <div>
            <Label htmlFor="attention-points">Pontos de Atenção</Label>
            <RichTextEditor 
                value={attentionPoints} 
                onChange={setAttentionPoints} 
                className="h-32" 
            />
        </div>

        <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">Salvar Alteração</button>
        </div>
      </form>
    </Modal>
  );
};

export default WatchlistChangeForm;
