
import React, { useState, useEffect } from 'react';
import type { Event } from '../types';
import Modal from './Modal';
import { Label, Input, Select, FormRow } from './UI';
import RichTextEditor from './RichTextEditor';

interface EventFormProps {
  onClose: () => void;
  onSave: (eventData: Omit<Event, 'id'>, id?: number) => void;
  analystName: string;
  prefilledTitle?: string;
  initialData?: Event | null;
  showOriginationToggle?: boolean;
  defaultIsOrigination?: boolean;
}

const EventForm: React.FC<EventFormProps> = ({ onClose, onSave, analystName, prefilledTitle = '', initialData = null, showOriginationToggle = false, defaultIsOrigination = false }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('Call Mensal');
  const [customType, setCustomType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [registeredBy, setRegisteredBy] = useState(analystName);
  const [nextSteps, setNextSteps] = useState('');
  const [attentionPoints, setAttentionPoints] = useState('');
  const [ourAttendees, setOurAttendees] = useState('');
  const [operationAttendees, setOperationAttendees] = useState('');
  const [isOrigination, setIsOrigination] = useState(defaultIsOrigination);

  const isEditing = !!initialData;
  const eventTypes = ['Call Mensal', 'Reunião', 'Visita Técnica', 'Análise de Carteira', 'Outro'];

  useEffect(() => {
    if (isEditing) {
        setDate(new Date(initialData.date).toISOString().split('T')[0]);
        setTitle(initialData.title);
        setDescription(initialData.description);
        setRegisteredBy(initialData.registeredBy);
        setNextSteps(initialData.nextSteps);
        setAttentionPoints(initialData.attentionPoints || '');
        setOurAttendees(initialData.ourAttendees || '');
        setOperationAttendees(initialData.operationAttendees || '');
        setIsOrigination(initialData.isOrigination ?? defaultIsOrigination);
        if (eventTypes.includes(initialData.type)) {
            setType(initialData.type);
        } else {
            setType('Outro');
            setCustomType(initialData.type);
        }
    } else {
      setTitle(prefilledTitle);
      setRegisteredBy(analystName);
      setIsOrigination(defaultIsOrigination);
    }
  }, [initialData, isEditing, prefilledTitle, analystName, defaultIsOrigination]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const eventData = {
      date: new Date(date + 'T12:00:00').toISOString(),
      type: type === 'Outro' ? customType : type,
      title,
      description,
      registeredBy,
      nextSteps,
      attentionPoints,
      ourAttendees,
      operationAttendees,
      isOrigination,
    };
    onSave(eventData, initialData?.id);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEditing ? "Editar Evento" : "Adicionar Novo Evento"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow>
            <div>
                <Label htmlFor="date">Data</Label>
                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div>
                <Label htmlFor="registeredBy">Analista Responsável</Label>
                <Input id="registeredBy" type="text" value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} required />
            </div>
        </FormRow>

        <FormRow>
             <div>
                <Label htmlFor="type">Tipo de Evento</Label>
                 <Select id="type" value={type} onChange={e => setType(e.target.value)}>
                    {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
            </div>
            {type === 'Outro' ? (
                <div>
                    <Label htmlFor="customType">Especifique o Tipo</Label>
                    <Input id="customType" type="text" value={customType} onChange={e => setCustomType(e.target.value)} required />
                </div>
            ) : <div />}
        </FormRow>

        {showOriginationToggle && (
            <FormRow>
                <div className="flex items-center mt-4">
                    <input
                        id="isOrigination"
                        type="checkbox"
                        checked={isOrigination}
                        onChange={(e) => setIsOrigination(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-700"
                    />
                    <label htmlFor="isOrigination" className="ml-2 block text-sm text-gray-900 dark:text-gray-200">
                        Evento de Originação / Estruturação
                    </label>
                </div>
            </FormRow>
        )}
        
        <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>

        {(type === 'Call Mensal' || type === 'Reunião') && (
            <FormRow>
                <div>
                    <Label htmlFor="ourAttendees">Presentes (Nossa Empresa)</Label>
                    <Input 
                        id="ourAttendees" 
                        type="text" 
                        value={ourAttendees} 
                        onChange={e => setOurAttendees(e.target.value)} 
                        placeholder="Ex: João, Maria..."
                    />
                </div>
                <div>
                    <Label htmlFor="operationAttendees">Presentes (Empresa da Operação)</Label>
                    <Input 
                        id="operationAttendees" 
                        type="text" 
                        value={operationAttendees} 
                        onChange={e => setOperationAttendees(e.target.value)} 
                        placeholder="Ex: José, Ana..."
                    />
                </div>
            </FormRow>
        )}

        <div>
            <Label htmlFor="description">Descrição</Label>
            <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="h-48"
            />
        </div>
        <div>
            <Label htmlFor="nextSteps">Próximos Passos</Label>
            <RichTextEditor 
                value={nextSteps} 
                onChange={setNextSteps} 
                className="h-32"
            />
        </div>
        <div>
            <Label htmlFor="attentionPoints">Pontos de Atenção</Label>
            <RichTextEditor 
                value={attentionPoints} 
                onChange={setAttentionPoints} 
                className="h-32"
            />
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            {isEditing ? 'Salvar Alterações' : 'Salvar Evento'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EventForm;
