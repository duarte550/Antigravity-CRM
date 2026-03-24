
import React, { useState, useEffect } from 'react';
import type { DefaultMonitoring, Rating, Area, Operation, MasterGroup } from '../types';
import { WatchlistStatus, ratingOptions, segmentoOptions, areaOptions } from '../types';
import Modal from './Modal';
import { Label, Input, Select, FormRow } from './UI';
import RichTextEditor from './RichTextEditor';

interface OperationFormProps {
  onClose: () => void;
  onSave: (operationData: any) => void;
  initialData?: Operation;
  seedData?: Partial<Operation> & { structuringOperationId?: number; guaranteesString?: string };
}

const defaultMonitoringInitial: DefaultMonitoring = {
  news: false,
  fiiReport: false,
  operationalInfo: false,
  receivablesPortfolio: false,
  monthlyConstructionReport: false,
  monthlyCommercialInfo: false,
  speDfs: false,
};

interface CheckboxProps {
    name: keyof DefaultMonitoring;
    label: string;
    checked: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}
const Checkbox: React.FC<CheckboxProps> = ({ name, label, checked, onChange }) => (
    <div className="flex items-center">
        <input id={name} name={name} type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-700" />
        <label htmlFor={name} className="ml-2 block text-sm text-gray-900 dark:text-gray-200">{label}</label>
    </div>
);


const OperationForm: React.FC<OperationFormProps> = ({ onClose, onSave, initialData, seedData }) => {
  const [name, setName] = useState(initialData?.name || seedData?.name || '');
  const [area, setArea] = useState<Area>(initialData?.area || seedData?.area || 'CRI');
  const [masterGroupId, setMasterGroupId] = useState<number | ''>(initialData?.masterGroupId || seedData?.masterGroupId || '');
  const [economicGroupId, setEconomicGroupId] = useState<number | 'new' | ''>(initialData?.economicGroupId || '');
  const [newEGName, setNewEGName] = useState('');
  const [masterGroups, setMasterGroups] = useState<MasterGroup[]>([]);
  const [projects, setProjects] = useState(initialData?.projects?.map(p => p.name).join(', ') || seedData?.projects?.map(p => p.name).join(', ') || '');
  const [operationType, setOperationType] = useState(initialData?.operationType || seedData?.operationType || 'CRI');
  const [guarantees, setGuarantees] = useState(initialData?.guarantees?.map(g => g.name).join(', ') || seedData?.guaranteesString || '');
  
  useEffect(() => {
    const fetchMasterGroups = async () => {
      try {
        const response = await fetch('https://crmcri-flask.onrender.com/api/master-groups');
        if (response.ok) {
          const data = await response.json();
          setMasterGroups(data);
        }
      } catch (error) {
        console.error('Failed to fetch master groups', error);
      }
    };
    fetchMasterGroups();
  }, []);

  // Format date for input type="date" (YYYY-MM-DD)
  const formatDate = (isoDate?: string | null) => {
      if (!isoDate) return '';
      return new Date(isoDate).toISOString().split('T')[0];
  };

  const [maturityDate, setMaturityDate] = useState(formatDate(initialData?.maturityDate) || formatDate(seedData?.maturityDate));
  const [responsibleAnalyst, setResponsibleAnalyst] = useState(initialData?.responsibleAnalyst || seedData?.responsibleAnalyst || '');
  const [reviewFrequency, setReviewFrequency] = useState(initialData?.reviewFrequency || seedData?.reviewFrequency || 'Trimestral');
  const [callFrequency, setCallFrequency] = useState(initialData?.callFrequency || seedData?.callFrequency || 'Mensal');
  const [dfFrequency, setDfFrequency] = useState(initialData?.dfFrequency || seedData?.dfFrequency || 'Trimestral');
  const [segmento, setSegmento] = useState(initialData?.segmento || seedData?.segmento || segmentoOptions[0]);
  const [defaultMonitoring, setDefaultMonitoring] = useState<DefaultMonitoring>(initialData?.defaultMonitoring || seedData?.defaultMonitoring || defaultMonitoringInitial);

  const [ratingOperation, setRatingOperation] = useState<Rating>(initialData?.ratingOperation || seedData?.ratingOperation || 'Baa3');
  const [ratingGroup, setRatingGroup] = useState<Rating>(initialData?.ratingGroup || seedData?.ratingGroup || 'Baa1');
  const [watchlist, setWatchlist] = useState<WatchlistStatus>(initialData?.watchlist || seedData?.watchlist || WatchlistStatus.VERDE);
  const [notes, setNotes] = useState(initialData?.notes || seedData?.notes || '');

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setDefaultMonitoring(prev => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const newOperationData = {
      ...initialData, // Keep existing ID and other fields if editing
      ...(seedData ? { structuringOperationId: seedData.structuringOperationId } : {}),
      name,
      area,
      masterGroupId: masterGroupId === '' ? null : Number(masterGroupId),
      economicGroupId: economicGroupId === '' ? null : economicGroupId === 'new' ? 'new' : Number(economicGroupId),
      newEGName: economicGroupId === 'new' ? newEGName : undefined,
      projects: projects.split(',').map((p, i) => ({ id: i, name: p.trim() })).filter(p => p.name),
      operationType,
      guarantees: guarantees.split(',').map((g, i) => ({ id: i, name: g.trim() })).filter(g => g.name),
      maturityDate: maturityDate ? new Date(maturityDate + 'T12:00:00').toISOString() : null,
      responsibleAnalyst,
      reviewFrequency,
      callFrequency,
      dfFrequency,
      segmento,
      defaultMonitoring,
      ratingOperation,
      ratingGroup,
      watchlist,
      notes,
      covenants: initialData?.covenants || seedData?.covenants || { ltv: null, dscr: null }, 
    };
    onSave(newOperationData);
    onClose();
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? "Editar Operação" : "Adicionar Nova Operação"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow>
          <div>
            <Label htmlFor="name">Nome da Operação</Label>
            <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="area">Área de Negócio</Label>
            <Select id="area" value={area} onChange={e => setArea(e.target.value as Area)} required>
                {areaOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="masterGroupId">Master Grupo</Label>
            <Select id="masterGroupId" value={masterGroupId} onChange={e => {
                setMasterGroupId(e.target.value ? Number(e.target.value) : '');
                setEconomicGroupId(''); // reset EG when MG changes
            }}>
                <option value="">Nenhum</option>
                {masterGroups.map(mg => <option key={mg.id} value={mg.id}>{mg.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="economicGroupId">Grupo Econômico</Label>
            <div className="flex gap-2">
                <Select id="economicGroupId" value={economicGroupId} onChange={e => setEconomicGroupId(e.target.value === 'new' ? 'new' : (e.target.value ? Number(e.target.value) : ''))} required={!!masterGroupId} disabled={!masterGroupId}>
                    <option value="">Nenhum</option>
                    {masterGroups.find(mg => mg.id === masterGroupId)?.economicGroups?.map((eg: any) => <option key={eg.id} value={eg.id}>{eg.name}</option>)}
                    <option value="new">+ Criar Novo Grupo</option>
                </Select>
                {economicGroupId === 'new' && (
                    <Input placeholder="Nome do Grupo" value={newEGName} onChange={e => setNewEGName(e.target.value)} required />
                )}
            </div>
            {!masterGroupId && <p className="text-xs text-gray-500 mt-1">Selecione um Master Grupo primeiro.</p>}
          </div>
        </FormRow>

        <FormRow>
            <div>
                <Label htmlFor="projects">Projetos (separados por vírgula)</Label>
                <Input id="projects" type="text" value={projects} onChange={e => setProjects(e.target.value)} />
            </div>
             <div>
                <Label htmlFor="guarantees">Garantias (separadas por vírgula)</Label>
                <Input id="guarantees" type="text" value={guarantees} onChange={e => setGuarantees(e.target.value)} />
            </div>
        </FormRow>

        <FormRow>
          <div>
            <Label htmlFor="operationType">Tipo de Operação</Label>
            <Select id="operationType" value={operationType} onChange={e => setOperationType(e.target.value)}>
                <option>CRI</option>
                <option>CRA</option>
                <option>FIDC</option>
                <option>Debênture</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="segmento">Segmento</Label>
            <Select id="segmento" value={segmento} onChange={e => setSegmento(e.target.value)}>
                {segmentoOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </FormRow>
        <FormRow>
            <div>
                <Label htmlFor="maturityDate">Data de Vencimento</Label>
                <Input id="maturityDate" type="date" value={maturityDate} onChange={e => setMaturityDate(e.target.value)} required />
            </div>
             <div>
                <Label htmlFor="responsibleAnalyst">Analista Responsável</Label>
                <Input id="responsibleAnalyst" type="text" value={responsibleAnalyst} onChange={e => setResponsibleAnalyst(e.target.value)} required />
            </div>
        </FormRow>

         {!initialData && (
            <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <Label htmlFor="ratingOperation">Rating Operação</Label>
                        <Select id="ratingOperation" value={ratingOperation} onChange={e => setRatingOperation(e.target.value as Rating)}>
                            {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="ratingGroup">Rating Grupo Econômico</Label>
                        <Select id="ratingGroup" value={ratingGroup} onChange={e => setRatingGroup(e.target.value as Rating)}>
                            {ratingOptions.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="watchlist">Farol Watchlist</Label>
                        <Select id="watchlist" value={watchlist} onChange={e => setWatchlist(e.target.value as WatchlistStatus)}>
                            {Object.values(WatchlistStatus).map(w => <option key={w} value={w}>{w}</option>)}
                        </Select>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <Label htmlFor="reviewFrequency">Frequência de Revisão</Label>
                        <Select id="reviewFrequency" value={reviewFrequency} onChange={e => setReviewFrequency(e.target.value)}>
                            <option>Mensal</option>
                            <option>Trimestral</option>
                            <option>Semestral</option>
                            <option>Anual</option>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="callFrequency">Frequência de Calls</Label>
                        <Select id="callFrequency" value={callFrequency} onChange={e => setCallFrequency(e.target.value)}>
                            <option>Semanal</option>
                            <option>Quinzenal</option>
                            <option>Mensal</option>
                            <option>Trimestral</option>
                            <option>Semestral</option>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="dfFrequency">Frequência DFs & Dívida</Label>
                        <Select id="dfFrequency" value={dfFrequency} onChange={e => setDfFrequency(e.target.value)}>
                            <option>Mensal</option>
                            <option>Trimestral</option>
                            <option>Semestral</option>
                            <option>Anual</option>
                        </Select>
                    </div>
                </div>
                
                <div>
                    <Label htmlFor="">Monitoramentos Padrão</Label>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border dark:border-gray-700 rounded-md">
                        <Checkbox name="news" label="Monitorar Notícias" checked={defaultMonitoring.news} onChange={handleCheckboxChange} />
                        <Checkbox name="fiiReport" label="Verificar Relatório FII" checked={defaultMonitoring.fiiReport} onChange={handleCheckboxChange} />
                        <Checkbox name="operationalInfo" label="Info Operacional" checked={defaultMonitoring.operationalInfo} onChange={handleCheckboxChange} />
                        <Checkbox name="receivablesPortfolio" label="Carteira de Recebíveis" checked={defaultMonitoring.receivablesPortfolio} onChange={handleCheckboxChange} />
                        <Checkbox name="monthlyConstructionReport" label="Relatório Mensal de Obra" checked={defaultMonitoring.monthlyConstructionReport} onChange={handleCheckboxChange} />
                        <Checkbox name="monthlyCommercialInfo" label="Info Comercial Mensal" checked={defaultMonitoring.monthlyCommercialInfo} onChange={handleCheckboxChange} />
                        <Checkbox name="speDfs" label="DFs da SPE" checked={defaultMonitoring.speDfs} onChange={handleCheckboxChange} />
                    </div>
                </div>
            </>
         )}

        <div className="mt-6">
            <Label htmlFor="operation-notes">Notas / Observações Gerais</Label>
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
                <RichTextEditor 
                    value={notes} 
                    onChange={setNotes} 
                    className="h-32 mb-12"
                />
            </div>
        </div>

        <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">Salvar Operação</button>
        </div>
      </form>
    </Modal>
  );
};

export default OperationForm;
