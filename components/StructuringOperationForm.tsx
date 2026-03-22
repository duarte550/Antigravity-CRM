import React, { useState } from 'react';
import { StructuringOperation, StructuringOperationSeries } from '../types';
import Modal from './Modal';
import { Label, Input, Select, FormRow } from './UI';

interface StructuringOperationFormProps {
  onClose: () => void;
  onSave: (data: Omit<StructuringOperation, 'id' | 'masterGroupId' | 'masterGroupName'> & { masterGroupId?: number }) => void;
  initialData?: StructuringOperation | null;
  masterGroups?: { id: number, name: string }[];
  onOpenNewMasterGroup?: () => void;
}

const STAGES = ['Conversa Inicial', 'Term Sheet', 'Due Diligence', 'Aprovação', 'Liquidação'];
const INDEXERS = ['CDI', 'IPCA', 'IGPM', 'Pré', 'Outro'];

const StructuringOperationForm: React.FC<StructuringOperationFormProps> = ({ onClose, onSave, initialData, masterGroups, onOpenNewMasterGroup }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(initialData?.name || '');
  const [stage, setStage] = useState(initialData?.stage || STAGES[0]);
  const [liquidationDate, setLiquidationDate] = useState(initialData?.liquidationDate ? new Date(initialData.liquidationDate).toISOString().split('T')[0] : '');
  const [masterGroupNameInput, setMasterGroupNameInput] = useState<string>(
    initialData?.masterGroupName || (masterGroups && masterGroups.length > 0 ? masterGroups[0].name : '')
  );
  const [risk, setRisk] = useState(initialData?.risk || 'High Yield');
  const [temperature, setTemperature] = useState(initialData?.temperature || 'Morno');
  const [initialVolume, setInitialVolume] = useState<number | ''>('');
  const [initialIndexer, setInitialIndexer] = useState<string>(INDEXERS[0]);

  const [series, setSeries] = useState<StructuringOperationSeries[]>(
    initialData?.series && initialData.series.length > 0
      ? initialData.series
      : [{ name: 'Série Única', rate: '', indexer: INDEXERS[0], volume: undefined, fund: '' }]
  );

  const handleSeriesChange = (index: number, field: keyof StructuringOperationSeries, value: string | number | undefined) => {
    const newSeries = [...series];
    newSeries[index] = { ...newSeries[index], [field]: value };
    setSeries(newSeries);
  };

  const addSeries = () => {
    setSeries([...series, { name: `Série ${series.length + 1}`, rate: '', indexer: INDEXERS[0], volume: undefined, fund: '' }]);
  };

  const removeSeries = (index: number) => {
    if (series.length > 1) {
      const newSeries = [...series];
      newSeries.splice(index, 1);
      setSeries(newSeries);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Find master group id from input name
    const selectedMg = masterGroups?.find(mg => mg.name === masterGroupNameInput);
    const masterGroupId = selectedMg?.id;

    if (!initialData && masterGroups && !masterGroupId) {
      alert("Por favor, selecione um Master Group válido da lista ou crie um novo.");
      return;
    }

    const payloadSeries = !initialData && initialVolume !== ''
      ? [{ name: 'A Definir', rate: '', indexer: initialIndexer, volume: Number(initialVolume) * 1000000, fund: '' }]
      : series;

    setIsSubmitting(true);
    try {
      await onSave({
        name,
        stage,
        risk,
        temperature,
        liquidationDate: liquidationDate ? new Date(liquidationDate + 'T12:00:00').toISOString() : undefined,
        series: payloadSeries,
        ...(masterGroups && !initialData && masterGroupId && { masterGroupId }),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? "Editar Operação" : "Nova Operação em Estruturação"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {masterGroups && !initialData && (
          <FormRow>
            <div className="flex-[3]">
              <Label htmlFor="masterGroup">Master Group (Cliente) <span className="font-normal text-xs text-blue-500">(Busque pelo nome)</span></Label>
              <div className="flex gap-2">
                <Input
                  id="masterGroupInput"
                  list="masterGroupsDataList"
                  value={masterGroupNameInput}
                  onChange={e => setMasterGroupNameInput(e.target.value)}
                  placeholder="Digite para buscar..."
                  required
                />
                <datalist id="masterGroupsDataList">
                  {masterGroups.map(mg => <option key={mg.id} value={mg.name} />)}
                </datalist>
                {onOpenNewMasterGroup && (
                  <button
                    type="button"
                    onClick={onOpenNewMasterGroup}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 rounded text-sm font-medium whitespace-nowrap transition-colors"
                  >
                    + Novo
                  </button>
                )}
              </div>
            </div>
          </FormRow>
        )}
        <FormRow>
          <div>
            <Label htmlFor="name">Nome da Operação</Label>
            <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="stage">Estágio</Label>
            <Select id="stage" value={stage} onChange={e => setStage(e.target.value)}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="risk">Risco</Label>
            <Select id="risk" value={risk} onChange={e => setRisk(e.target.value)}>
              <option value="High Grade">High Grade</option>
              <option value="Middle Market">Middle Market</option>
              <option value="High Yield">High Yield</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="temperature">Temperatura</Label>
            <Select id="temperature" value={temperature} onChange={e => setTemperature(e.target.value)}>
              <option value="Quente">Quente</option>
              <option value="Morno">Morno</option>
              <option value="Frio">Frio</option>
            </Select>
          </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="liquidationDate">Data de Liquidação (Prevista)</Label>
            <Input id="liquidationDate" type="date" value={liquidationDate} onChange={e => setLiquidationDate(e.target.value)} />
          </div>
          {!initialData && (
            <React.Fragment>
              <div>
                <Label htmlFor="initialIndexer">Indexador</Label>
                <Select id="initialIndexer" value={initialIndexer} onChange={e => setInitialIndexer(e.target.value)}>
                  {INDEXERS.map(i => <option key={i} value={i}>{i}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="initialVolume">Volume Previsto (R$ milhões)</Label>
                <Input id="initialVolume" type="number" step="0.01" value={initialVolume} onChange={e => setInitialVolume(e.target.value ? Number(e.target.value) : '')} placeholder="Ex: 50" />
              </div>
            </React.Fragment>
          )}
        </FormRow>

        {initialData && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">Séries / Dívidas</h3>
              <button
                type="button"
                onClick={addSeries}
                className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-md font-medium transition-colors"
              >
                + Adicionar Série
              </button>
            </div>

            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {series.map((s, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3 relative">
                  {series.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSeries(idx)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                      title="Remover Série"
                    >
                      ×
                    </button>
                  )}

                  <FormRow>
                    <div>
                      <Label htmlFor={`name-${idx}`}>Nome da Série</Label>
                      <Input type="text" value={s.name} onChange={e => handleSeriesChange(idx, 'name', e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor={`fund-${idx}`}>Fundo</Label>
                      <Input type="text" value={s.fund || ''} onChange={e => handleSeriesChange(idx, 'fund', e.target.value)} />
                    </div>
                  </FormRow>

                  <FormRow>
                    <div>
                      <Label htmlFor={`volume-${idx}`}>Volume (R$)</Label>
                      <Input type="number" step="0.01" value={s.volume || ''} onChange={e => handleSeriesChange(idx, 'volume', parseFloat(e.target.value) || undefined)} />
                    </div>
                  </FormRow>

                  <FormRow>
                    <div>
                      <Label htmlFor={`indexer-${idx}`}>Indexador</Label>
                      <Select value={s.indexer || INDEXERS[0]} onChange={e => handleSeriesChange(idx, 'indexer', e.target.value)}>
                        {INDEXERS.map(i => <option key={i} value={i}>{i}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`rate-${idx}`}>Taxa</Label>
                      <Input type="text" value={s.rate || ''} onChange={e => handleSeriesChange(idx, 'rate', e.target.value)} placeholder="Ex: + 2.5%" />
                    </div>
                  </FormRow>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StructuringOperationForm;
