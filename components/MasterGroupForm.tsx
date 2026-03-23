import React, { useState } from 'react';
import { MasterGroup, Rating, ratingOptions } from '../types';
import Modal from './Modal';
import { Label, Input, FormRow, Select } from './UI';

interface MasterGroupFormProps {
  onClose: () => void;
  onSave: (data: Omit<MasterGroup, 'id' | 'operations' | 'structuringOperations' | 'contacts' | 'events'>) => void;
  initialData?: MasterGroup | null;
}

const MasterGroupForm: React.FC<MasterGroupFormProps> = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [sector, setSector] = useState(initialData?.sector || '');
  const [rating, setRating] = useState<Rating | ''>(initialData?.rating || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({ name, sector, rating: rating as Rating });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? "Editar Master Grupo" : "Novo Master Grupo"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="sector">Setor</Label>
            <Input id="sector" type="text" value={sector} onChange={e => setSector(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rating">Rating</Label>
            <Select id="rating" value={rating} onChange={e => setRating(e.target.value as Rating)}>
              <option value="">Selecione...</option>
              {ratingOptions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
        </FormRow>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {isSubmitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Salvando...</>
            ) : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MasterGroupForm;
