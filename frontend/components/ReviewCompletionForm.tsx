
import React, { useState } from 'react';
import type { Task, Operation, Event, Rating, Sentiment } from '../types';
import { ratingOptions, Sentiment as SentimentEnum } from '../types';
import Modal from './Modal';
import { Label, Input, Select } from './UI';
import RichTextEditor from './RichTextEditor';

interface ReviewCompletionFormProps {
  task: Task;
  operation: Operation;
  onClose: () => void;
  onSave: (data: { event: Omit<Event, 'id'>, ratingOp: Rating, ratingGroup: Rating, ratingMasterGroup: Rating, sentiment: Sentiment, videoUrl: string }) => Promise<void>;
}

const ReviewCompletionForm: React.FC<ReviewCompletionFormProps> = ({ task, operation, onClose, onSave }) => {
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [ratingOp, setRatingOp] = useState(operation.ratingOperation);
  const [ratingGroup, setRatingGroup] = useState(operation.ratingGroup);
  const [ratingMasterGroup, setRatingMasterGroup] = useState<Rating>(operation.ratingMasterGroup || ('B' as Rating));
  const [sentiment, setSentiment] = useState<Sentiment>(SentimentEnum.NEUTRO);
  const [description, setDescription] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [attentionPoints, setAttentionPoints] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const event: Omit<Event, 'id'> = {
      // Data da conclusão REAL que será usada no evento histórico e no início do próximo ciclo
      date: new Date(completionDate + 'T12:00:00').toISOString(),
      type: 'Revisão Periódica',
      title: `Conclusão: Revisão de crédito - ${operation.name}`, // Base do título (App.tsx completa)
      description,
      registeredBy: operation.responsibleAnalyst,
      nextSteps,
      attentionPoints,
    };

    try {
        // Aguarda o processo de salvamento (App.tsx gerencia a persistência)
        await onSave({ event, ratingOp, ratingGroup, ratingMasterGroup, sentiment, videoUrl: videoUrl.trim() });
    } catch (err) {
        setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={isSubmitting ? () => {} : onClose} title={`Concluir ${task.ruleName}: ${operation.name}`}>
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-300">
        <p className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <strong>Nota:</strong> O ciclo de revisões (Gerencial e Política) será reiniciado a partir da data de conclusão selecionada.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
            <Label htmlFor="review-completion-date">Data da Conclusão Real (Data da Análise)</Label>
            <Input id="review-completion-date" type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} required disabled={isSubmitting} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
                <Label htmlFor="review-rating-op">Rating Operação</Label>
                <Select id="review-rating-op" value={ratingOp} onChange={e => setRatingOp(e.target.value as Rating)} disabled={isSubmitting}>
                    {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
            </div>
            <div>
                <Label htmlFor="review-rating-group">Rating Grupo</Label>
                <Select id="review-rating-group" value={ratingGroup} onChange={e => setRatingGroup(e.target.value as Rating)} disabled={isSubmitting}>
                    {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
            </div>
            <div>
                <Label htmlFor="review-rating-master-group">Rating Master Group</Label>
                <Select id="review-rating-master-group" value={ratingMasterGroup} onChange={e => setRatingMasterGroup(e.target.value as Rating)} disabled={isSubmitting}>
                    {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
            </div>
            <div>
                <Label htmlFor="review-sentiment">Sentimento</Label>
                <Select id="review-sentiment" value={sentiment} onChange={e => setSentiment(e.target.value as Sentiment)} disabled={isSubmitting}>
                    {Object.values(SentimentEnum).map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
            </div>
        </div>

        <div>
            <Label htmlFor="review-description">Resumo da Revisão</Label>
            <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="h-48"
            />
        </div>
        <div>
            <Label htmlFor="review-next-steps">Próximos Passos</Label>
            <RichTextEditor 
                value={nextSteps} 
                onChange={setNextSteps} 
                className="h-32"
            />
        </div>
        <div>
            <Label htmlFor="review-attention-points">Pontos de Atenção</Label>
            <RichTextEditor 
                value={attentionPoints} 
                onChange={setAttentionPoints} 
                className="h-32"
            />
        </div>

        <div>
            <Label htmlFor="review-video-url">URL do Vídeo da Revisão (Opcional)</Label>
            <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <Input
                    id="review-video-url"
                    type="url"
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    placeholder="https://web.microsoftstream.com/video/..."
                    disabled={isSubmitting}
                />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                Se preenchido, o item será criado como vídeo na pauta do comitê.
            </p>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t dark:border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" disabled={isSubmitting}>Cancelar</button>
          <button 
            type="submit" 
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 dark:disabled:bg-green-800 font-bold shadow-sm transition-all" 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
                <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando no Databricks...
                </>
            ) : 'Concluir Revisão'}
            </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReviewCompletionForm;
