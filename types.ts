
export interface Project {
  id: number;
  name: string;
}

export interface Guarantee {
  id: number;
  name: string;
}

export interface Covenants {
  ltv: number | null;
  dscr: number | null;
}

export interface DefaultMonitoring {
  news: boolean;
  fiiReport: boolean;
  operationalInfo: boolean;
  receivablesPortfolio: boolean;
  monthlyConstructionReport: boolean;
  monthlyCommercialInfo: boolean;
  speDfs: boolean;
}

export interface Event {
  id: number;
  date: string; // ISO string
  type: string;
  title: string;
  description: string;
  registeredBy?: string;
  nextSteps?: string;
  completedTaskId?: string;
  attentionPoints?: string;
  ourAttendees?: string;
  operationAttendees?: string;
  isOrigination?: boolean;
  operationName?: string;
  structuringOperationStageId?: number;
}

export type TaskPriority = 'Baixa' | 'Média' | 'Alta' | 'Urgente';

export interface TaskRule {
  id: number;
  name: string;
  frequency: 'Pontual' | 'Diário' | 'Semanal' | 'Quinzenal' | 'Mensal' | 'Trimestral' | 'Semestral' | 'Anual' | 'Sem Prazo';
  startDate: string | null; // ISO string
  endDate: string | null; // ISO string
  description: string;
  priority?: TaskPriority;
  structuringOperationStageId?: number;
}

export enum TaskStatus {
  PENDING = 'Pendente',
  OVERDUE = 'Atrasada',
  COMPLETED = 'Concluída'
}

export interface Task {
  id: string; // e.g., "op1-rule2-2024-08-15"
  operationId?: number;
  structuringOperationId?: number;
  ruleId: number;
  ruleName: string;
  dueDate?: string; // ISO string
  status: TaskStatus;
  priority?: TaskPriority;
  notes?: string;
}

export type Rating = 'A4' | 'Baa1' | 'Baa3' | 'Baa4' | 'Ba1' | 'Ba4' | 'Ba5' | 'Ba6' | 'B1' | 'B2' | 'B3' | 'B4' | 'C1' | 'C2' | 'C3';
export const ratingOptions: Rating[] = ['A4', 'Baa1', 'Baa3', 'Baa4', 'Ba1', 'Ba4', 'Ba5', 'Ba6', 'B1', 'B2', 'B3','B4', 'C1', 'C2', 'C3'];

export enum WatchlistStatus {
  VERDE = 'Verde',
  AMARELO = 'Amarelo',
  ROSA = 'Rosa',
  VERMELHO = 'Vermelho',
}

export enum Sentiment {
    POSITIVO = 'Positivo',
    NEUTRO = 'Neutro',
    NEGATIVO = 'Negativo'
}

export const segmentoOptions = [
    'Permuta',
    'Financiamento Construção',
    'Asset Finance',
    'Asset Finance - FII',
    'Crédito Corporativo',
    'Crédito Corporativo - Carteira',
    'Infra'
];

export type Area = 'CRI' | 'Capital Solutions';
export const areaOptions: Area[] = ['CRI', 'Capital Solutions'];

export interface RatingHistoryEntry {
    id: number;
    date: string; // ISO string
    ratingOperation: Rating;
    ratingGroup: Rating;
    ratingMasterGroup?: Rating;
    watchlist: WatchlistStatus;
    sentiment: Sentiment;
    eventId: number;
}

export interface OperationRisk {
  id: number;
  title: string;
  description?: string;
  severity: 'Baixa' | 'Média' | 'Alta';
  createdAt: string;
  updatedAt: string;
}

export type OperationStatus = 'Ativa' | 'Legado';

export interface Operation {
  id: number;
  name: string;
  area: Area;
  masterGroupId?: number;
  masterGroupName?: string;
  economicGroupId?: number;
  economicGroupName?: string;
  projects: Project[];
  operationType: string;
  guarantees: Guarantee[];
  maturityDate: string; // ISO string
  responsibleAnalyst: string;
  structuringAnalyst?: string;
  reviewFrequency: string;
  callFrequency: string;
  dfFrequency: string;
  segmento: string;
  defaultMonitoring: DefaultMonitoring;
  covenants: Covenants;
  events: Event[];
  taskRules: TaskRule[];
  ratingOperation: Rating;
  ratingGroup: Rating;
  ratingMasterGroup: Rating;
  watchlist: WatchlistStatus;
  ratingHistory: RatingHistoryEntry[];
  tasks: Task[]; // Now provided by the backend
  contacts?: Contact[];
  taskExceptions?: string[];
  overdueCount: number; // Now provided by the backend
  nextReviewGerencial?: string | null; // ISO string
  nextReviewPolitica?: string | null; // ISO string
  nextReviewGerencialTask?: Task | null;
  nextReviewPoliticaTask?: Task | null;
  notes?: string;
  estimatedDate?: string; // ISO string
  description?: string | null;
  risks?: OperationRisk[];
  status?: OperationStatus;
  lastUpdated?: number;
  movedToLegacyDate?: string; // ISO string
}

export interface AuditLog {
    id: number;
    timestamp: string; // ISO string
    user_name: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity_type: string;
    entity_id: number | string;
    details: string;
}

export interface OperationReviewNote {
    operation_id: number;
    notes: string;
}

export interface ChangeRequest {
  id: number;
  title: string;
  description: string;
  requester: string;
  status: 'pending' | 'completed';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface PatchNote {
  id: number;
  version: string;
  date: string; // ISO string
  title: string;
  description: string;
  changes: string[]; // List of changes in this version
}

export enum Page {
  OVERVIEW = 'overview',
  DETAIL = 'detail',
  TASKS = 'tasks',
  CREDIT_REVIEWS = 'credit_reviews',
  AUDIT_LOG = 'audit_log',
  WATCHLIST = 'watchlist',
  ANALYST_HUB = 'analyst_hub',
  CHANGE_LOG = 'change_log',
  LEGACY = 'legacy',
  SYNC_QUEUE = 'sync_queue',
  MASTER_GROUPS = 'master_groups',
  MASTER_GROUP_DETAIL = 'master-group-detail',
  ECONOMIC_GROUPS = 'economic_groups',
  ECONOMIC_GROUP_DETAIL = 'economic-group-detail',
  ORIGINATION_PIPELINE = 'origination-pipeline',
  STRUCTURING_OPERATION_DETAIL = 'structuring-operation-detail',
}

export interface Contact {
  id: number;
  operationId?: number;
  masterGroupId?: number;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface StructuringOperationSeries {
  id?: number;
  name: string;
  rate?: string;
  indexer?: string;
  volume?: number;
  fund?: string;
}

export interface StructuringOperationStage {
  id?: number;
  name: string;
  order_index: number;
  isCompleted: boolean;
}

export interface StructuringOperation {
  id: number;
  masterGroupId: number;
  masterGroupName?: string;
  economicGroupId?: number;
  economicGroupName?: string;
  name: string;
  area?: Area;
  originator?: string;
  modality?: string;
  createdAt?: string;
  stage: string;
  liquidationDate?: string;
  series?: StructuringOperationSeries[];
  recentEvents?: Event[];
  risk?: string;
  temperature?: string;
  analyst?: string;
  stages?: StructuringOperationStage[];
  isActive?: boolean;
  taskRules?: TaskRule[];
  tasks?: Task[];
  contacts?: Contact[];
  taskExceptions?: string[];
}

export interface EconomicGroup {
  id: number;
  masterGroupId: number;
  masterGroupName?: string;
  name: string;
  sector?: string;
  rating?: Rating;
  operations?: Partial<Operation>[];
  structuringOperations?: StructuringOperation[];
  events?: Event[];
  recentChanges?: {
    id: number;
    operationId: number;
    operationName: string;
    timestamp: string;
    user: string;
    action: string;
    entity: string;
    details: string;
  }[];
  ratingHistory?: RatingHistoryEntry[];
  risks?: OperationRisk[];
  createdAt?: string;
}

export interface MasterGroup {
  id: number;
  name: string;
  sector?: string;
  rating?: Rating;
  economicGroups?: EconomicGroup[];
  operations?: Partial<Operation>[];
  structuringOperations?: StructuringOperation[];
  contacts?: Contact[];
  events?: Event[];
  recentChanges?: {
    id: number;
    operationId: number;
    operationName: string;
    timestamp: string;
    user: string;
    action: string;
    entity: string;
    details: string;
  }[];
  ratingHistory?: RatingHistoryEntry[];
  risks?: OperationRisk[];
}
