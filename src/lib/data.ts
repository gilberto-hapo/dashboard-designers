export type ContentType = 'FEED' | 'REELS' | 'STORY';
export type StatusTag =
  | 'CORREÇÃO'
  | 'AGUARDANDO MATERIAL'
  | 'AGUARDANDO FEEDBACK'
  | 'APROVADO'
  | 'CORRIGIDO'
  | 'DATA COMEMORATIVA';
export type Stage =
  | 'fazer'
  | 'executando'
  | 'direcao_arte'
  | 'montagem'
  | 'validacao'
  | 'aprovado_programacao'
  | 'concluido';

export interface DesignTask {
  id: string;
  contentType: ContentType;
  statusTags: StatusTag[];
  title: string;
  parceiro: string;
  calendario?: string;
  clienteRelacionado?: string;
  linkDrive?: string;
  linkCalendarioEditorial?: string;
  responsavel: string;
  responsavelHistorico?: string;
  responsavelCliente?: string;
  designerResponsavel1?: string;
  dataVencimento: Date;
  stage: Stage;
  tempoEstimadoHoras: number;
  tempoGastoHoras: number;
  criadoEm?: Date | null;
  concluidoEm?: Date | null;
  dataNaFaseAtual?: Date | null;
  entrouExecutandoEm?: Date | null;
  entrouMontagemEm?: Date | null;
  entrouValidacaoEm?: Date | null;
  tempoValidacaoDias?: number | null;
  tempoAprovadoProgramacaoDias?: number | null;
  teveAjustes?: boolean;
  registroAjustes?: string;
  clienteAtivo?: boolean | null;
  clientePostsMes?: number | null;
}

export interface AdjustmentEntry {
  id: string;
  identificador: string;
  tipoEntrega: string;
  cliente: string;
  criadoPor?: string;
  responsavel?: string;
  titulo: string;
  tituloDemanda: string;
  board: string;
  motivoAjuste: string;
  classificacaoExecucao: string;
  linkDrive: string;
  criadoEm?: Date | null;
  atualizadoEm?: Date | null;
}

export interface Designer {
  id: string;
  nome: string;
  cor: string;
  avatar: string;
}

const designerColors = [
  '#E67E22', '#9B59B6', '#1ABC9C', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#8E44AD',
];

export function buildDesigners(names: string[]): Designer[] {
  return names.map((nome, i) => ({
    id: String(i + 1),
    nome,
    cor: designerColors[i % designerColors.length],
    avatar: nome.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
  }));
}

export function isOverdue(task: DesignTask): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return task.dataVencimento < today && task.stage !== 'concluido';
}

export function isDueToday(task: DesignTask): boolean {
  const today = new Date();
  return task.dataVencimento.toDateString() === today.toDateString() && task.stage !== 'concluido';
}

export function isDueTomorrow(task: DesignTask): boolean {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return task.dataVencimento.toDateString() === tomorrow.toDateString() && task.stage !== 'concluido';
}

export function isBlocked(task: DesignTask): boolean {
  return task.statusTags.includes('AGUARDANDO MATERIAL') || task.statusTags.includes('AGUARDANDO FEEDBACK');
}

export function getDesignerColor(nome: string, designers: Designer[]): string {
  return designers.find((d) => d.nome === nome)?.cor ?? '#888';
}

export function getDesignerAvatar(nome: string, designers: Designer[]): string {
  return designers.find((d) => d.nome === nome)?.avatar ?? nome.charAt(0);
}

export const stageLabels: Record<Stage, string> = {
  fazer: 'Fazer',
  executando: 'Executando',
  direcao_arte: 'Direção de Arte',
  montagem: 'Montagem',
  validacao: 'Validação do Cliente',
  aprovado_programacao: 'Aprovado p/ Programação',
  concluido: 'Concluído',
};
