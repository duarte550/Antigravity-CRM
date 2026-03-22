import React, { useState } from 'react';
import { MasterGroupContact } from '../types';
import Modal from './Modal';
import { Label, Input, FormRow } from './UI';

interface ContactFormProps {
  onClose: () => void;
  onSave: (data: Omit<MasterGroupContact, 'id' | 'masterGroupId'>) => void;
  initialData?: MasterGroupContact | null;
}

const ContactForm: React.FC<ContactFormProps> = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [role, setRole] = useState(initialData?.role || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, role, email, phone });
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? "Editar Contato" : "Novo Contato"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="role">Cargo</Label>
            <Input id="role" type="text" value={role} onChange={e => setRole(e.target.value)} />
          </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" type="text" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </FormRow>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
            Cancelar
          </button>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ContactForm;
