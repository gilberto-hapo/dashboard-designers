import { isOverdue, isDueToday, isDueTomorrow, isBlocked, buildDesigners, type AdjustmentEntry, type DesignTask, type Stage } from './data';

export interface FrenteInfo {
  totalProxima1Semana: number;
  concluidasProxima1Semana: number;
  totalProximas2Semanas: number;
  concluidasAdiantado: number;
  pendentes: number;
  marcoSemanas: number;
  marcoTotal: number;
  marcoConcluidas: number;
  marcoPendentes: number;
  marcoPercentual: number;
  marcoAnteriorCompleto: boolean;
  marcoTarefasPendentes: DesignTask[];
  metaDiaria: number;
  metaSustentacaoDiaria: number;
  metaRecuperacaoDiaria: number;
  ritmoRecenteDiario: number;
  tempoMedioConclusaoDias: number | null;
  diasDeFrenteAtual: number;
  percentual: number;
  previsaoMetaDiaria: string | null;
  tarefasPendentes: DesignTask[];
}

export interface FrenteGeralInfo {
  totalAberto: number;
  concluidasAdiantado: number;
  pendentes: number;
  percentual: number;
}

export interface DesignerInsight {
  nome: string;
  cor: string;
  avatar: string;
  totalAtivas: number;
  vencidas: number;
  paraHoje: number;
  paraManha: number;
  bloqueadas: number;
  concluidasPeriodo: {
    mesAtual: number;
    semanaAtual: number;
    hoje: number;
  };
  emExecucao: number;
  cargaHoras: number;
  horasGastas: number;
  prioridades: PriorityInsight[];
  quantidadePrioridades: number;
  acompanhamento: {
    validacaoCliente: number;
    direcaoArte: number;
    tarefasValidacaoCliente: DesignTask[];
    tarefasDirecaoArte: DesignTask[];
  };
  atrasados: {
    quantidade: number;
    tarefas: DesignTask[];
  };
  pipeline: {
    total: number;
    principalEtapa: Stage | null;
    principalEtapaLabel: string | null;
    principalEtapaCount: number;
    porEtapa: { stage: Stage; label: string; count: number }[];
  };
  observacoes: DesignerObservation[];
  referenciasClientes: DesignerClientReference[];
  frente: FrenteInfo;
  frenteGeral: FrenteGeralInfo;
  materiais: {
    tipo: string;
    quantidade: number;
    tempoMedioDias: number | null;
  }[];
  clientesCarteira: {
    cliente: string;
    quantidade: number;
  }[];
}

export interface DesignerObservation {
  tone: 'info';
  message: string;
  projection: string;
}

export interface DesignerClientReference {
  tone: 'success' | 'warning';
  cliente: string;
  activeCount: number;
  executionCount: number;
  overdueCount: number;
  blockedCount: number;
  validationCriticalCount: number;
  frontPendingCount: number;
  message?: string;
  highlight?: string;
}

export interface PriorityInsight {
  task: DesignTask;
  score: number;
  actionLabel: string;
  helperLabel: string;
  dueLabel: string;
  tone: 'danger' | 'warning' | 'primary' | 'muted' | 'success';
}

export interface DashboardInsights {
  totalAtivas: number;
  totalAFazer: number;
  totalVencidas: number;
  totalHoje: number;
  totalBloqueadas: number;
  totalConcluidas: number;
  comparativoConcluidasMesAtual: {
    direction: 'up' | 'down' | 'neutral';
    difference: number;
    previousTotal: number;
  };
  porDesigner: DesignerInsight[];
  clientesAtencao: ClienteAtencaoItem[];
  clientScores: ClientScoreInsight[];
  alertas: AlertItem[];
  porEtapa: { stage: Stage; label: string; count: number }[];
  porTipo: { tipo: string; count: number }[];
  gargalos: BottleneckInsight[];
  gargaloOperacional: {
    etapas: {
      stage: Stage;
      label: string;
      count: number;
      share: number;
      comparison?: StageFlowComparison | null;
    }[];
    title: string;
    impact: string;
    recommendation: string;
  };
}

export interface StageFlowComparison {
  direction: 'up' | 'down' | 'neutral';
  difference: number;
  rawDifference: number;
  baselineAverage: number;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  tooltip: string;
}

export interface ClientScoreInsight {
  cliente: string;
  responsavel: string;
  score: number;
  classificacao: 'Muito fluido' | 'Saudável' | 'Sensível' | 'Crítico';
  principalFator: 'Demora na validação' | 'Muito retrabalho' | 'Entrega mais demorada' | 'Fluxo travado' | 'Operação fluida';
  resumo: string;
  postsMes: number | null;
  mediaPostsCriadosMes: number | null;
  totalTarefas: number;
  tarefasAtivas: number;
  tempoMedioValidacaoDias: number | null;
  validacaoAberta: number;
  validacaoCritica: number;
  bloqueadas: number;
  atrasadas: number;
  percentualRetrabalho: number;
  tempoMedioConclusaoDias: number | null;
  indiceValidacao: number;
  indiceImpactoFluxo: number;
  amostraConcluida: number;
  amostraValidacao: number;
}

export interface BottleneckInsight {
  id: 'validacao' | 'fazer' | 'frente' | 'material';
  title: string;
  impact: string;
  action: string;
  priority: number;
}

const BOTTLENECK_STAGES: Stage[] = ['executando', 'direcao_arte', 'montagem', 'validacao', 'aprovado_programacao'];

export interface ClienteAtencaoItem {
  cliente: string;
  designers: string[];
  score: number;
  prioridadeOrdem?: number;
  totalAtivas: number;
  correcaoCount: number;
  validacaoCount: number;
  validacaoCriticaCount: number;
  bloqueadoCount: number;
  atrasadoCount: number;
  venceHojeOuAmanhaCount: number;
  venceEmTresDiasCount: number;
  nivelAtencao: 'alta' | 'monitorar' | 'acompanhar';
  acaoSugerida: string;
  resumo: string;
  etapaCounts: {
    fazer: number;
    executando: number;
    direcaoArte: number;
    montagem: number;
    validacao: number;
    aprovadoProgramacao: number;
  };
  frente: {
    totalProximas2Semanas: number;
    concluidasProximas2Semanas: number;
    pendentesProximas2Semanas: number;
    percentual: number;
    status: 'critica' | 'atencao' | 'estavel';
    orientacao: string;
    tarefasPendentes: DesignTask[];
  };
  tarefasCorrecao: DesignTask[];
  tarefasValidacaoCritica: DesignTask[];
  tarefasBloqueadas: DesignTask[];
  tarefasAtrasadas: DesignTask[];
}

export interface AlertItem {
  type: 'danger' | 'warning' | 'info';
  message: string;
  highlight?: string;
  designer?: string;
  priority: number;
}

const FRONT_WINDOW_DAYS = 14;
const CLIENT_NEXT_WINDOW_DAYS = 15;
const HISTORY_WINDOW_DAYS = 30;
const PIPELINE_STAGES: Stage[] = ['fazer', 'executando', 'direcao_arte', 'montagem', 'validacao', 'aprovado_programacao'];
const PIPELINE_STAGE_LABELS: Record<Stage, string> = {
  fazer: 'Fazer',
  executando: 'Executando',
  direcao_arte: 'Dir. Arte',
  montagem: 'Montagem',
  validacao: 'Validação',
  aprovado_programacao: 'Aprovado',
  concluido: 'Concluído',
};

function getTaskPrimaryDesigner(task: DesignTask): string {
  return String(task.responsavelCliente || task.designerResponsavel1 || task.responsavel || '')
    .split(/[;,/]+/)
    .map((value) => value.trim())
    .find((value) => Boolean(value) && value !== 'Sem designer') || 'Sem designer';
}

function countBusinessDaysBetween(start: Date, daysAhead: number): number {
  const limit = new Date(start);
  limit.setDate(limit.getDate() + daysAhead);

  let businessDays = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= limit) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return businessDays;
}

function countBusinessDaysInRange(start: Date, end: Date): number {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);

  let businessDays = 0;
  while (cursor <= limit) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return businessDays;
}

function addBusinessDays(start: Date, businessDays: number): Date {
  const result = new Date(start);
  result.setHours(0, 0, 0, 0);

  let remaining = Math.max(0, businessDays);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return result;
}

function getDateKey(date: Date): string {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized.toISOString().slice(0, 10);
}

function getStartOfCurrentWeek(referenceDate: Date): Date {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  const dayOfWeek = start.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysSinceMonday);

  return start;
}

function isDateInRange(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

function getPreviousBusinessDayKeys(referenceDate: Date, count: number): string[] {
  const cursor = new Date(referenceDate);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);

  const keys: string[] = [];
  while (keys.length < count) {
    if (isBusinessDay(cursor)) {
      keys.push(getDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return keys.reverse();
}

function buildStageFlowComparison(
  stage: Stage,
  currentCount: number,
  tasks: DesignTask[],
  now: Date,
): StageFlowComparison | null {
  const recentBusinessDayKeys = getPreviousBusinessDayKeys(now, 7);
  const countsByDay = new Map(recentBusinessDayKeys.map((key) => [key, 0]));

  tasks.forEach((task) => {
    const entryDate =
      stage === 'validacao'
        ? task.entrouValidacaoEm
        : task.concluidoEm;

    if (!entryDate) {
      return;
    }

    const key = getDateKey(entryDate);
    if (countsByDay.has(key)) {
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }
  });

  const baselineAverage = recentBusinessDayKeys.length > 0
    ? recentBusinessDayKeys.reduce((sum, key) => sum + (countsByDay.get(key) ?? 0), 0) / recentBusinessDayKeys.length
    : 0;
  const rawDifference = currentCount - baselineAverage;
  const roundedDifference = Math.round(Math.abs(rawDifference));
  const isNeutral = Math.abs(rawDifference) < 0.5;

  let direction: StageFlowComparison['direction'] = 'neutral';
  let tone: StageFlowComparison['tone'] = 'muted';

  if (!isNeutral) {
    direction = rawDifference > 0 ? 'up' : 'down';

    if (stage === 'validacao') {
      tone = rawDifference > 0 ? 'danger' : 'success';
    } else if (stage === 'concluido') {
      tone = rawDifference > 0 ? 'success' : 'warning';
    } else {
      tone = rawDifference > 0 ? 'warning' : 'success';
    }
  }

  const baselineLabel = baselineAverage.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const tooltip = stage === 'validacao'
    ? `Comparação com a média diária de entradas em Validação nos últimos 7 dias úteis (${baselineLabel}).`
    : `Comparação com a média diária desta fase nos últimos 7 dias úteis (${baselineLabel}).`;

  return {
    direction,
    difference: roundedDifference,
    rawDifference,
    baselineAverage,
    tone,
    tooltip,
  };
}

function calculateCoveredFrontDays(tasks: DesignTask[], start: Date, daysAhead: number): number {
  const totalByDate = new Map<string, number>();
  const concludedByDate = new Map<string, number>();

  for (const task of tasks) {
    const key = getDateKey(task.dataVencimento);
    totalByDate.set(key, (totalByDate.get(key) ?? 0) + 1);

    if (task.stage === 'concluido') {
      concludedByDate.set(key, (concludedByDate.get(key) ?? 0) + 1);
    }
  }

  let coveredDays = 0;
  let cumulativeTotal = 0;
  let cumulativeConcluded = 0;

  for (let offset = 0; offset <= daysAhead; offset++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + offset);
    const key = getDateKey(currentDate);

    cumulativeTotal += totalByDate.get(key) ?? 0;
    cumulativeConcluded += concludedByDate.get(key) ?? 0;

    if (cumulativeConcluded < cumulativeTotal) {
      break;
    }

    coveredDays = offset;
  }

  return coveredDays;
}

function buildFrontMilestone(tasks: DesignTask[], now: Date) {
  const milestoneWeeks = [2, 3, 4, 5, 6, 7, 8];
  let firstMilestone = {
    weeks: 2,
    total: 0,
    concluded: 0,
    pending: 0,
    percent: 100,
    pendingTasks: [] as DesignTask[],
  };

  for (const weeks of milestoneWeeks) {
    const limit = new Date(now);
    limit.setDate(limit.getDate() + weeks * 7);

    const milestoneTasks = tasks.filter((task) => task.dataVencimento >= now && task.dataVencimento <= limit);
    const pendingTasks = milestoneTasks
      .filter((task) => task.stage !== 'concluido')
      .sort((left, right) => left.dataVencimento.getTime() - right.dataVencimento.getTime());
    const concluded = milestoneTasks.length - pendingTasks.length;
    const milestone = {
      weeks,
      total: milestoneTasks.length,
      concluded,
      pending: pendingTasks.length,
      percent: milestoneTasks.length > 0 ? Math.round((concluded / milestoneTasks.length) * 100) : 100,
      pendingTasks,
    };

    if (weeks === 2) {
      firstMilestone = milestone;
    }

    if (pendingTasks.length > 0) {
      return {
        ...milestone,
        previousComplete: weeks > 2,
      };
    }
  }

  return {
    ...firstMilestone,
    weeks: 8,
    previousComplete: true,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateCycleDays(task: DesignTask): number | null {
  if (!task.criadoEm || !task.concluidoEm) {
    return null;
  }

  if (task.concluidoEm < task.criadoEm) {
    return null;
  }

  return Math.max(1, countBusinessDaysInRange(task.criadoEm, task.concluidoEm));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatOneDecimal(value: number): string {
  return roundOneDecimal(value).toFixed(1);
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function getDaysUntilDue(task: DesignTask, now: Date): number {
  const due = new Date(task.dataVencimento);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function hasTag(task: DesignTask, fragments: string[]): boolean {
  return task.statusTags.some((tag) => fragments.some((fragment) => tag.includes(fragment)));
}

function buildPriorityInsight(task: DesignTask, now: Date): PriorityInsight {
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  const dueTomorrow = isDueTomorrow(task);
  const blocked = isBlocked(task);
  const daysUntilDue = getDaysUntilDue(task, now);
  const hasCorrection = hasTag(task, ['CORRE']);
  const hasApproved = hasTag(task, ['APROVADO']);
  const hasCorrected = hasTag(task, ['CORRIGIDO']);

  let score = 0;
  let actionLabel = 'Monitorar';
  let helperLabel = 'Acompanhar andamento';
  let tone: PriorityInsight['tone'] = 'primary';

  if (overdue) score += 120;
  else if (dueToday) score += 90;
  else if (dueTomorrow) score += 60;
  else if (daysUntilDue <= 3) score += 35;

  let dueLabel = '';
  if (overdue) {
    dueLabel = `${Math.abs(daysUntilDue)}d atrasado`;
  } else if (dueToday) {
    dueLabel = 'vence hoje';
  } else if (dueTomorrow) {
    dueLabel = 'vence amanhã';
  } else {
    dueLabel = `vence em ${Math.max(daysUntilDue, 0)}d`;
  }

  if (blocked) {
    score -= 30;
    actionLabel = 'Aguardando cliente';
    helperLabel = 'Falta material ou resposta';
    tone = 'muted';
  } else if (task.stage === 'executando') {
    score += 80;
    actionLabel = 'Foco agora';
    helperLabel = overdue || dueToday ? 'Entrega crítica em execução' : 'Produção em andamento';
    tone = overdue || dueToday ? 'danger' : 'primary';
  } else if (task.stage === 'direcao_arte') {
    if (hasCorrection) {
      score += 70;
      actionLabel = 'Corrigir';
      helperLabel = 'Direção de arte pediu ajuste';
      tone = dueToday || overdue ? 'danger' : 'warning';
    } else if (hasApproved) {
      score -= 10;
      actionLabel = 'Aguardando avançar';
      helperLabel = 'Já aprovado pela direção';
      tone = 'success';
    } else if (hasCorrected) {
      score -= 5;
      actionLabel = 'Com direção de arte';
      helperLabel = 'Aguardando nova análise';
      tone = 'muted';
    } else {
      score -= 15;
      actionLabel = 'Com direção de arte';
      helperLabel = 'Fora da mão do designer';
      tone = 'muted';
    }
  } else if (task.stage === 'montagem') {
    score += 45;
    actionLabel = 'Montar apresentacao';
    helperLabel = 'Preparar apresentação';
    tone = dueToday || overdue ? 'warning' : 'primary';
  } else if (task.stage === 'validacao') {
    if (overdue || daysUntilDue <= 1) {
      score += 65;
      actionLabel = 'Cobrar cliente';
      helperLabel = 'Validação crítica pelo prazo';
      tone = 'danger';
    } else if (daysUntilDue <= 3) {
      score += 50;
      actionLabel = 'Monitorar cliente';
      helperLabel = 'Prazo próximo do vencimento';
      tone = 'warning';
    } else {
      score += 20;
      actionLabel = 'Aguardar retorno';
      helperLabel = 'Cliente validando apresentação';
      tone = 'muted';
    }
  } else if (task.stage === 'aprovado_programacao') {
    score += 5;
    actionLabel = 'Quase concluido';
    helperLabel = 'Aguardando programação';
    tone = 'success';
  } else if (task.stage === 'fazer') {
    score += daysUntilDue <= 3 ? 45 : 15;
    actionLabel = daysUntilDue <= 3 ? 'Puxar backlog' : 'Backlog';
    helperLabel = daysUntilDue <= 3 ? 'Entrar em produção logo' : 'Ainda não iniciado';
    tone = daysUntilDue <= 3 ? 'warning' : 'muted';
  }

  return {
    task,
    score,
    actionLabel,
    helperLabel,
    dueLabel,
    tone,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizePenalty(value: number, min: number, max: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  if (max <= min) {
    return value <= min ? 0 : fallback;
  }

  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function isDesignerActionableTask(task: DesignTask): boolean {
  if (task.stage === 'executando' || task.stage === 'fazer' || task.stage === 'montagem') {
    return true;
  }

  if (task.stage === 'direcao_arte') {
    return hasTag(task, ['CORRE']);
  }

  return false;
}

function hasActiveProductionContract(task: DesignTask): boolean {
  return (
    task.clienteAtivo === true
    && typeof task.clientePostsMes === 'number'
    && task.clientePostsMes > 0
  );
}

function buildDesignerClientReferences(tasks: DesignTask[], now: Date): DesignerClientReference[] {
  const byClient = new Map<string, DesignTask[]>();

  for (const task of tasks) {
    const clientName = String(task.parceiro || 'Sem parceiro').trim();
    if (!clientName || clientName === 'Sem parceiro') continue;

    if (!byClient.has(clientName)) {
      byClient.set(clientName, []);
    }
    byClient.get(clientName)?.push(task);
  }

  const clientSummaries = [...byClient.entries()].map(([cliente, clientTasks]) => {
    const activeTasks = clientTasks.filter((task) => task.stage !== 'concluido');
    const overdueCount = activeTasks.filter(isOverdue).length;
    const blockedCount = activeTasks.filter(isBlocked).length;
    const validationCriticalCount = activeTasks.filter((task) => {
      if (task.stage !== 'validacao') return false;
      return isOverdue(task) || getDaysUntilDue(task, now) <= 2;
    }).length;
    const executionCount = activeTasks.filter((task) => task.stage === 'executando').length;
    const frontPendingCount = activeTasks.filter((task) => getDaysUntilDue(task, now) <= 14).length;
    const activeCount = activeTasks.length;

    const attentionScore =
      overdueCount * 5 +
      blockedCount * 4 +
      validationCriticalCount * 5 +
      Math.max(0, frontPendingCount - executionCount);

    const healthyScore =
      executionCount * 3 +
      Math.max(0, activeCount - blockedCount - overdueCount) -
      validationCriticalCount * 2 -
      blockedCount * 3 -
      overdueCount * 3;

    return {
      cliente,
      activeCount,
      executionCount,
      overdueCount,
      blockedCount,
      validationCriticalCount,
      frontPendingCount,
      attentionScore,
      healthyScore,
    };
  }).filter((item) => item.activeCount > 0);

  const references: DesignerClientReference[] = [];

  const healthyCandidates = [...clientSummaries]
    .filter(
      (item) =>
        item.overdueCount === 0 &&
        item.blockedCount === 0 &&
        item.validationCriticalCount === 0 &&
        (
          item.executionCount > 0 ||
          item.activeCount <= 3 ||
          item.frontPendingCount <= Math.max(2, Math.ceil(item.activeCount * 0.4))
        ),
    )
    .sort((a, b) => {
      if (b.healthyScore !== a.healthyScore) return b.healthyScore - a.healthyScore;
      if (a.frontPendingCount !== b.frontPendingCount) return a.frontPendingCount - b.frontPendingCount;
      return b.executionCount - a.executionCount;
    });

  const healthyClient = healthyCandidates[0] ?? [...clientSummaries]
    .filter((item) => item.overdueCount === 0 && item.blockedCount === 0)
    .sort((a, b) => {
      if (b.healthyScore !== a.healthyScore) return b.healthyScore - a.healthyScore;
      if (a.validationCriticalCount !== b.validationCriticalCount) return a.validationCriticalCount - b.validationCriticalCount;
      return a.frontPendingCount - b.frontPendingCount;
    })[0];

  if (healthyClient) {
    references.push({
      tone: 'success',
      cliente: healthyClient.cliente,
      activeCount: healthyClient.activeCount,
      executionCount: healthyClient.executionCount,
      overdueCount: healthyClient.overdueCount,
      blockedCount: healthyClient.blockedCount,
      validationCriticalCount: healthyClient.validationCriticalCount,
      frontPendingCount: healthyClient.frontPendingCount,
    });
  }

  const alertCandidates = [...clientSummaries]
    .filter((item) => item.attentionScore > 0)
    .sort((a, b) => {
      if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
      if (b.validationCriticalCount !== a.validationCriticalCount) return b.validationCriticalCount - a.validationCriticalCount;
      return b.overdueCount - a.overdueCount;
    });

  const fallbackAlertClient = [...clientSummaries]
    .filter((item) => item.cliente !== healthyClient?.cliente)
    .sort((a, b) => {
      if (b.validationCriticalCount !== a.validationCriticalCount) return b.validationCriticalCount - a.validationCriticalCount;
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      if (b.blockedCount !== a.blockedCount) return b.blockedCount - a.blockedCount;
      if (b.frontPendingCount !== a.frontPendingCount) return b.frontPendingCount - a.frontPendingCount;
      return b.activeCount - a.activeCount;
    })[0];

  const alertClient = alertCandidates[0] ?? fallbackAlertClient;

  if (alertClient && alertClient.cliente !== healthyClient?.cliente) {
    references.push({
      tone: 'warning',
      cliente: alertClient.cliente,
      activeCount: alertClient.activeCount,
      executionCount: alertClient.executionCount,
      overdueCount: alertClient.overdueCount,
      blockedCount: alertClient.blockedCount,
      validationCriticalCount: alertClient.validationCriticalCount,
      frontPendingCount: alertClient.frontPendingCount,
    });
  }

  return references;
}

function normalizeClientKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTextKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeMaterialType(value: string) {
  const normalized = normalizeTextKey(value);
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function belongsToDesigner(adjustment: AdjustmentEntry, designerName: string) {
  const normalizedDesigner = normalizeTextKey(designerName);
  if (!normalizedDesigner) return false;

  const owner = normalizeTextKey(adjustment.responsavel || '');
  const creator = normalizeTextKey(adjustment.criadoPor || '');
  return owner.includes(normalizedDesigner) || creator.includes(normalizedDesigner);
}

function buildClientScoreInsights(tasks: DesignTask[], adjustmentCountsByClient: Record<string, number>, now: Date): ClientScoreInsight[] {
  const byClient = new Map<string, DesignTask[]>();

  for (const task of tasks) {
    const clientName = String(task.parceiro || 'Sem parceiro').trim();
    if (!clientName || clientName === 'Sem parceiro') continue;

    if (!byClient.has(clientName)) {
      byClient.set(clientName, []);
    }
    byClient.get(clientName)?.push(task);
  }

  const rawItems = [...byClient.entries()]
    .map(([cliente, clientTasks]) => {
      const clientMetaTask = clientTasks.find((task) => task.clienteAtivo !== null || task.clientePostsMes !== undefined);
      const clienteAtivo = clientMetaTask?.clienteAtivo ?? null;
      const postsMes = clientMetaTask?.clientePostsMes ?? null;
      if (clienteAtivo !== true) {
        return null;
      }

      if (postsMes === null || postsMes <= 0) {
        return null;
      }

      const tarefasAtivas = clientTasks.filter((task) => task.stage !== 'concluido');
      const tarefasConcluidas = clientTasks.filter((task) => task.stage === 'concluido');
      const tarefasComCriacao = clientTasks
        .map((task) => task.criadoEm)
        .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
      const mediaPostsCriadosMes = (() => {
        if (tarefasComCriacao.length === 0) return null;
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const previousMonth = previousMonthDate.getMonth();
        const previousMonthYear = previousMonthDate.getFullYear();

        const createdInWindow = tarefasComCriacao.filter((date) => (
          (date.getMonth() === currentMonth && date.getFullYear() === currentYear)
          || (date.getMonth() === previousMonth && date.getFullYear() === previousMonthYear)
        )).length;

        return roundOneDecimal(createdInWindow / 2);
      })();
      const concluidasComDatas = tarefasConcluidas.filter((task) => task.criadoEm && task.concluidoEm);
      const tempoMedioConclusaoDiasRaw = average(
        concluidasComDatas
          .map(calculateCycleDays)
          .filter((value): value is number => value !== null),
      );
      const validacoesComTempo = clientTasks
        .map((task) => task.tempoValidacaoDias)
        .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
      const tempoMedioValidacaoDiasRaw = average(validacoesComTempo);

      const ajustesReais = adjustmentCountsByClient[normalizeClientKey(cliente)] ?? 0;
      const tarefasValidacao = tarefasAtivas.filter((task) => task.stage === 'validacao');
      const validacaoCritica = tarefasValidacao.filter((task) => {
        const daysUntilDue = getDaysUntilDue(task, now);
        return isOverdue(task) || daysUntilDue <= 2;
      }).length;
      const bloqueadas = tarefasAtivas.filter(isBlocked).length;
      const atrasadas = tarefasAtivas.filter(isOverdue).length;
      const responsavelPrincipal = clientTasks
        .map((task) => task.responsavelCliente || task.responsavel)
        .find(Boolean) || 'Sem responsável';

      const activeBase = Math.max(tarefasAtivas.length, 1);
      const validationPressure = roundOneDecimal(
        (tarefasValidacao.length + validacaoCritica * 1.5 + bloqueadas * 0.5) / activeBase,
      );
      const flowImpact = roundOneDecimal(
        (atrasadas * 2 + validacaoCritica * 1.5 + bloqueadas) / activeBase,
      );
      const reworkRate = roundOneDecimal((ajustesReais / Math.max(clientTasks.length, 1)) * 100);

      return {
        cliente,
        responsavel: responsavelPrincipal,
        postsMes,
        mediaPostsCriadosMes,
        totalTarefas: clientTasks.length,
        tarefasAtivas: tarefasAtivas.length,
        tempoMedioValidacaoDias: tempoMedioValidacaoDiasRaw ? roundOneDecimal(tempoMedioValidacaoDiasRaw) : null,
        validacaoAberta: tarefasValidacao.length,
        validacaoCritica,
        bloqueadas,
        atrasadas,
        percentualRetrabalho: reworkRate,
        tempoMedioConclusaoDias: tempoMedioConclusaoDiasRaw ? roundOneDecimal(tempoMedioConclusaoDiasRaw) : null,
        indiceValidacao: validationPressure,
        indiceImpactoFluxo: flowImpact,
        amostraConcluida: concluidasComDatas.length,
        amostraValidacao: validacoesComTempo.length,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const validationValues = rawItems.map((item) => item.indiceValidacao);
  const flowValues = rawItems.map((item) => item.indiceImpactoFluxo);
  const reworkValues = rawItems.map((item) => item.percentualRetrabalho);
  const validationTimeValues = rawItems
    .map((item) => item.tempoMedioValidacaoDias)
    .filter((value): value is number => value !== null);
  const cycleValues = rawItems
    .map((item) => item.tempoMedioConclusaoDias)
    .filter((value): value is number => value !== null);

  const validationMin = Math.min(...validationValues, 0);
  const validationMax = Math.max(...validationValues, 1);
  const flowMin = Math.min(...flowValues, 0);
  const flowMax = Math.max(...flowValues, 1);
  const reworkMin = Math.min(...reworkValues, 0);
  const reworkMax = Math.max(...reworkValues, 1);
  const validationTimeMin = validationTimeValues.length > 0 ? Math.min(...validationTimeValues) : 0;
  const validationTimeMax = validationTimeValues.length > 0 ? Math.max(...validationTimeValues) : 1;
  const cycleMin = cycleValues.length > 0 ? Math.min(...cycleValues) : 0;
  const cycleMax = cycleValues.length > 0 ? Math.max(...cycleValues) : 1;

  return rawItems
    .map((item) => {
      const validationPressurePenalty = normalizePenalty(item.indiceValidacao, validationMin, validationMax, 25);
      const validationTimePenalty = item.tempoMedioValidacaoDias !== null
        ? normalizePenalty(item.tempoMedioValidacaoDias, validationTimeMin, validationTimeMax, 35)
        : 35;
      const validationPenalty = roundOneDecimal((validationPressurePenalty * 0.45) + (validationTimePenalty * 0.55));
      const reworkPenalty = normalizePenalty(item.percentualRetrabalho, reworkMin, reworkMax, 25);
      const cyclePenalty = item.tempoMedioConclusaoDias !== null
        ? normalizePenalty(item.tempoMedioConclusaoDias, cycleMin, cycleMax, 35)
        : 35;
      const flowPenalty = normalizePenalty(item.indiceImpactoFluxo, flowMin, flowMax, 25);

      const score = Math.round(
        clamp(
          100 - (
            validationPenalty * 0.35 +
            reworkPenalty * 0.2 +
            cyclePenalty * 0.25 +
            flowPenalty * 0.2
          ),
          0,
          100,
        ),
      );

      const penalties = [
        { key: 'validation', value: validationPenalty },
        { key: 'rework', value: reworkPenalty },
        { key: 'cycle', value: cyclePenalty },
        { key: 'flow', value: flowPenalty },
      ].sort((a, b) => b.value - a.value);

      let resumo = 'Conta com bom ritmo, pouca fricção e impacto baixo no fluxo.';
      if (score >= 85 || (penalties[0]?.value ?? 0) < 15) {
        resumo = 'Conta fluindo bem, com aprovações e entregas em um ritmo saudável.';
      } else if (penalties[0]?.key === 'validation') {
        resumo = item.validacaoCritica > 0
          ? 'As aprovações estão demorando mais e isso já começa a apertar o andamento da conta.'
          : 'O tempo de aprovação desta conta está acima do restante da carteira.';
      } else if (penalties[0]?.key === 'rework' && item.percentualRetrabalho > 0) {
        resumo = 'Essa conta está pedindo mais ajustes do que o normal, o que puxa o score para baixo.';
      } else if (penalties[0]?.key === 'cycle' && item.tempoMedioConclusaoDias !== null) {
        resumo = 'As entregas dessa conta estão levando mais tempo para fechar do que a média.';
      } else if (penalties[0]?.key === 'flow' && (item.atrasadas > 0 || item.bloqueadas > 0)) {
        resumo = 'A conta já gera pressão no fluxo, com pendências que travam ou atrasam a produção.';
      }

      let classificacao: ClientScoreInsight['classificacao'] = 'Crítico';
      if (score >= 80) classificacao = 'Muito fluido';
      else if (score >= 65) classificacao = 'Saudável';
      else if (score >= 45) classificacao = 'Sensível';

      let principalFator: ClientScoreInsight['principalFator'] = 'Operação fluida';
      if (score < 85 && (penalties[0]?.value ?? 0) >= 15) {
        if (penalties[0]?.key === 'validation') principalFator = 'Demora na validação';
        else if (penalties[0]?.key === 'rework') principalFator = 'Muito retrabalho';
        else if (penalties[0]?.key === 'cycle') principalFator = 'Entrega mais demorada';
        else if (penalties[0]?.key === 'flow') principalFator = 'Fluxo travado';
      }

      return {
        ...item,
        score,
        classificacao,
        principalFator,
        resumo,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (b.indiceImpactoFluxo !== a.indiceImpactoFluxo) return b.indiceImpactoFluxo - a.indiceImpactoFluxo;
      return b.tarefasAtivas - a.tarefasAtivas;
    });
}

function buildClientAttentionItems(tasks: DesignTask[], now: Date): ClienteAtencaoItem[] {
  const byClient = new Map<string, DesignTask[]>();
  const inTwoWeeks = new Date(now);
  inTwoWeeks.setDate(inTwoWeeks.getDate() + FRONT_WINDOW_DAYS);

  for (const task of tasks) {
    const key = String(task.parceiro || 'Sem parceiro').trim();
    if (!byClient.has(key)) {
      byClient.set(key, []);
    }
    byClient.get(key)?.push(task);
  }

  return [...byClient.entries()]
    .map(([cliente, clientTasks]) => {
      const activeClientTasks = clientTasks.filter((task) => task.stage !== 'concluido');
      const tarefasFrente = clientTasks
        .filter((task) => task.dataVencimento >= now && task.dataVencimento <= inTwoWeeks)
        .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      const tarefasFrentePendentes = tarefasFrente.filter((task) => task.stage !== 'concluido');
      const totalFrente = tarefasFrente.length;
      const concluidasFrente = tarefasFrente.filter((task) => task.stage === 'concluido').length;
      const pendentesFrente = tarefasFrentePendentes.length;
      const percentualFrente = totalFrente > 0 ? Math.round((concluidasFrente / totalFrente) * 100) : 100;

      let frenteStatus: ClienteAtencaoItem['frente']['status'] = 'estavel';
      let frenteOrientacao = 'A frente desta conta está saudável nos próximos 14 dias.';

      if (pendentesFrente >= 6 || (pendentesFrente >= 3 && percentualFrente < 40)) {
        frenteStatus = 'critica';
        frenteOrientacao = 'A frente desta conta está crítica e precisa entrar na prioridade do designer.';
      } else if (pendentesFrente >= 3 || percentualFrente < 70) {
        frenteStatus = 'atencao';
        frenteOrientacao = 'A frente desta conta pede atenção e vale acelerar a produção.';
      }

      const tarefasCorrecao = activeClientTasks
        .filter((task) => task.stage === 'direcao_arte' && hasTag(task, ['CORRE']))
        .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      const correcaoCount = tarefasCorrecao.length;
      const validacaoTasks = activeClientTasks.filter((task) => task.stage === 'validacao');
      const validacaoCount = validacaoTasks.length;
      const tarefasValidacaoCritica = validacaoTasks
        .filter((task) => {
          const daysUntilDue = getDaysUntilDue(task, now);
          return isOverdue(task) || daysUntilDue <= 2;
        })
        .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      const validacaoCriticaCount = tarefasValidacaoCritica.length;
      const tarefasBloqueadas = activeClientTasks
        .filter(isBlocked)
        .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      const bloqueadoCount = tarefasBloqueadas.length;
      const tarefasAtrasadas = activeClientTasks
        .filter(isOverdue)
        .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      const atrasadoCount = tarefasAtrasadas.length;
      const venceHojeOuAmanhaCount = activeClientTasks.filter((task) => {
        const daysUntilDue = getDaysUntilDue(task, now);
        return daysUntilDue >= 0 && daysUntilDue <= 1;
      }).length;
      const venceEmTresDiasCount = activeClientTasks.filter((task) => {
        const daysUntilDue = getDaysUntilDue(task, now);
        return daysUntilDue >= 0 && daysUntilDue <= 3;
      }).length;

      const score =
        correcaoCount * 4 +
        validacaoCriticaCount * 5 +
        validacaoCount * 2 +
        bloqueadoCount * 3 +
        atrasadoCount * 4 +
        venceHojeOuAmanhaCount * 4 +
        venceEmTresDiasCount * 2 +
        (frenteStatus === 'critica' ? 6 : frenteStatus === 'atencao' ? 3 : 0);
      const primaryDesigner = clientTasks.find((task) =>
        Boolean(task.responsavelCliente) && task.responsavelCliente !== 'Sem designer'
      )?.responsavelCliente;
      const designers = primaryDesigner
        ? [primaryDesigner]
        : [...new Set(
          activeClientTasks
            .map((task) => task.responsavel)
            .filter((name) => Boolean(name) && name !== 'Sem designer'),
        )];

      let nivelAtencao: ClienteAtencaoItem['nivelAtencao'] = 'acompanhar';
      let acaoSugerida = 'Acompanhe essa conta mais de perto nos próximos dias e antecipe o que puder para evitar correria no prazo.';

      if (frenteStatus === 'critica') {
        nivelAtencao = 'alta';
        acaoSugerida = 'Organize a produção dessa conta agora e comece pelo que vence antes para ganhar fôlego na frente.';
      } else if (validacaoCriticaCount >= 2 || atrasadoCount >= 2) {
        nivelAtencao = 'alta';
        acaoSugerida = 'Cobrar o retorno do cliente hoje pode destravar a conta. Depois, reorganize as pendências pela ordem de urgência.';
      } else if (correcaoCount >= 2) {
        nivelAtencao = 'alta';
        acaoSugerida = 'Revise as correções dessa conta, consolide os ajustes e adiante com a direção de arte o que já estiver claro.';
      } else if (bloqueadoCount >= 2) {
        nivelAtencao = 'monitorar';
        acaoSugerida = 'Cobrar os materiais que faltam agora ajuda a destravar a produção. Enquanto isso, deixe pronta a próxima etapa.';
      } else if (validacaoCount >= 3) {
        nivelAtencao = 'monitorar';
        acaoSugerida = 'Acompanhe as validações em aberto e antecipe a cobrança antes de o prazo apertar.';
      } else if (correcaoCount >= 1) {
        nivelAtencao = 'monitorar';
        acaoSugerida = 'Conduza as correções dessa conta mais de perto para reduzir retrabalho nas próximas peças.';
      }

      const resumoPartes: string[] = [];
      if (pendentesFrente > 0) resumoPartes.push(`${pendentesFrente} pendente(s) na frente`);
      if (correcaoCount > 0) resumoPartes.push(`${correcaoCount} com correção`);
      if (validacaoCriticaCount > 0) resumoPartes.push(`${validacaoCriticaCount} em validação crítica`);
      else if (validacaoCount > 0) resumoPartes.push(`${validacaoCount} em validação`);
      if (bloqueadoCount > 0) resumoPartes.push(`${bloqueadoCount} bloqueado(s)`);
      if (atrasadoCount > 0) resumoPartes.push(`${atrasadoCount} atrasado(s)`);

      return {
        cliente,
        designers,
        score,
        totalAtivas: activeClientTasks.length,
        correcaoCount,
        validacaoCount,
        validacaoCriticaCount,
        bloqueadoCount,
        atrasadoCount,
        venceHojeOuAmanhaCount,
        venceEmTresDiasCount,
        nivelAtencao,
        acaoSugerida,
        resumo: resumoPartes.join(' - '),
        etapaCounts: {
          fazer: activeClientTasks.filter((task) => task.stage === 'fazer').length,
          executando: activeClientTasks.filter((task) => task.stage === 'executando').length,
          direcaoArte: activeClientTasks.filter((task) => task.stage === 'direcao_arte').length,
          montagem: activeClientTasks.filter((task) => task.stage === 'montagem').length,
          validacao: activeClientTasks.filter((task) => task.stage === 'validacao').length,
          aprovadoProgramacao: activeClientTasks.filter((task) => task.stage === 'aprovado_programacao').length,
        },
        frente: {
          totalProximas2Semanas: totalFrente,
          concluidasProximas2Semanas: concluidasFrente,
          pendentesProximas2Semanas: pendentesFrente,
          percentual: percentualFrente,
          status: frenteStatus,
          orientacao: frenteOrientacao,
          tarefasPendentes: tarefasFrentePendentes,
        },
        tarefasCorrecao,
        tarefasValidacaoCritica,
        tarefasBloqueadas,
        tarefasAtrasadas,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.atrasadoCount !== a.atrasadoCount) return b.atrasadoCount - a.atrasadoCount;
      if (b.validacaoCriticaCount !== a.validacaoCriticaCount) return b.validacaoCriticaCount - a.validacaoCriticaCount;
      if (b.correcaoCount !== a.correcaoCount) return b.correcaoCount - a.correcaoCount;
      return b.bloqueadoCount - a.bloqueadoCount;
    })
    .map((item, index) => ({
      ...item,
      prioridadeOrdem: index + 1,
    }))
    .slice(0, 6);
}

export function computeInsights(
  tasks: DesignTask[],
  designerNames: string[],
  adjustmentCountsByClient: Record<string, number> = {},
  adjustments: AdjustmentEntry[] = [],
): DashboardInsights {
  const ativas = tasks.filter((t) => t.stage !== 'concluido');
  const concluidas = tasks.filter((t) => t.stage === 'concluido');
  const vencidas = ativas.filter(isOverdue);
  const hoje = ativas.filter(isDueToday);
  const bloqueadas = ativas.filter(isBlocked);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentDayOfMonth = now.getDate();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const currentMonthStart = new Date(currentYear, currentMonth, 1);
  const currentWeekStart = getStartOfCurrentWeek(now);
  const concluidasMesAtual = concluidas.filter((task) => {
    if (!task.concluidoEm) return false;
    return task.concluidoEm.getMonth() === currentMonth && task.concluidoEm.getFullYear() === currentYear;
  });
  const previousMonthReference = new Date(currentYear, currentMonth - 1, 1);
  const previousMonth = previousMonthReference.getMonth();
  const previousMonthYear = previousMonthReference.getFullYear();
  const previousMonthLastDay = new Date(previousMonthYear, previousMonth + 1, 0).getDate();
  const previousPeriodEndDay = Math.min(currentDayOfMonth, previousMonthLastDay);
  const concluidasMesmoPeriodoMesAnterior = concluidas.filter((task) => {
    if (!task.concluidoEm) return false;
    return (
      task.concluidoEm.getMonth() === previousMonth &&
      task.concluidoEm.getFullYear() === previousMonthYear &&
      task.concluidoEm.getDate() <= previousPeriodEndDay
    );
  });
  const diferencaConcluidasMesAtual = concluidasMesAtual.length - concluidasMesmoPeriodoMesAnterior.length;
  const direcaoComparativoConcluidas = diferencaConcluidasMesAtual > 0
    ? 'up'
    : diferencaConcluidasMesAtual < 0
      ? 'down'
      : 'neutral';

  const inTwoWeeks = new Date(now);
  inTwoWeeks.setDate(inTwoWeeks.getDate() + FRONT_WINDOW_DAYS);
  const inFifteenDays = new Date(now);
  inFifteenDays.setDate(inFifteenDays.getDate() + CLIENT_NEXT_WINDOW_DAYS);

  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - HISTORY_WINDOW_DAYS);

  const clientScores = buildClientScoreInsights(tasks, adjustmentCountsByClient, now);
  const activeDesignerNames = [...new Set(
    clientScores
      .map((item) => String(item.responsavel || '').trim())
      .filter((name) => Boolean(name) && name !== 'Sem responsável' && name !== 'Sem designer'),
  )];
  const designers = buildDesigners(activeDesignerNames.length > 0 ? activeDesignerNames : designerNames);

  const businessDaysFront = countBusinessDaysBetween(now, FRONT_WINDOW_DAYS);
  const businessDaysHistory = countBusinessDaysInRange(historyStart, now);
  const teamRecentPaceValues = designers
    .map((designer) => {
      const designerCompletedRecently = concluidas.filter(
        (task) =>
          hasActiveProductionContract(task)
          && getTaskPrimaryDesigner(task) === designer.nome
          && task.concluidoEm
          && task.concluidoEm >= historyStart
          && task.concluidoEm <= now,
      );
      const rawPace = businessDaysHistory > 0 ? designerCompletedRecently.length / businessDaysHistory : 0;
      return roundOneDecimal(rawPace);
    })
    .filter((value) => value > 0);
  const teamRecentPaceFloor = Math.max(
    1,
    Math.ceil(
      teamRecentPaceValues.length > 0
        ? teamRecentPaceValues.reduce((sum, value) => sum + value, 0) / teamRecentPaceValues.length
        : 1,
    ),
  );

  const porDesigner: DesignerInsight[] = designers.map((designer) => {
    const allDesignerTasks = tasks.filter((task) => getTaskPrimaryDesigner(task) === designer.nome);
    const activeProductionDesignerTasks = allDesignerTasks.filter(hasActiveProductionContract);
    const minhas = ativas.filter((task) => getTaskPrimaryDesigner(task) === designer.nome);
    const minhasConcluidas = concluidas.filter((task) => getTaskPrimaryDesigner(task) === designer.nome);
    const vencidasD = minhas.filter(isOverdue);
    const hojeD = minhas.filter(isDueToday);
    const manhaD = minhas.filter(isDueTomorrow);
    const bloqueadasD = minhas.filter(isBlocked);
    const execD = minhas.filter((t) => t.stage === 'executando');
    const concluidasPeriodo = {
      mesAtual: minhasConcluidas.filter((task) => isDateInRange(task.concluidoEm, currentMonthStart, todayEnd)).length,
      semanaAtual: minhasConcluidas.filter((task) => isDateInRange(task.concluidoEm, currentWeekStart, todayEnd)).length,
      hoje: minhasConcluidas.filter((task) => isDateInRange(task.concluidoEm, now, todayEnd)).length,
    };

    const inOneWeek = new Date(now);
    inOneWeek.setDate(inOneWeek.getDate() + 7);
    const proxima1Semana = activeProductionDesignerTasks.filter((t) => t.dataVencimento >= now && t.dataVencimento <= inOneWeek);
    const proximas2Semanas = activeProductionDesignerTasks.filter((t) => t.dataVencimento >= now && t.dataVencimento <= inTwoWeeks);
    const frenteGeralTasks = activeProductionDesignerTasks.filter((t) => t.dataVencimento >= now);
    const concluidasProxima1Semana = proxima1Semana.filter((t) => t.stage === 'concluido').length;
    const totalProxima1Semana = proxima1Semana.length;
    const concluidasAdiantado = proximas2Semanas.filter((t) => t.stage === 'concluido').length;
    const totalProximas = proximas2Semanas.length;
    const pendentes = totalProximas - concluidasAdiantado;
    const diasDeFrente = calculateCoveredFrontDays(proximas2Semanas, now, FRONT_WINDOW_DAYS);
    const frenteGeralConcluidas = frenteGeralTasks.filter((t) => t.stage === 'concluido').length;
    const frenteGeralTotal = frenteGeralTasks.length;
    const frenteGeralPendentes = frenteGeralTasks.filter((t) => t.stage !== 'concluido').length;

    const concluidasRecentes = minhasConcluidas.filter((t) => (
      hasActiveProductionContract(t)
      && t.concluidoEm
      && t.concluidoEm >= historyStart
      && t.concluidoEm <= now
    ));
    const ritmoRecenteDiarioBruto = businessDaysHistory > 0 ? concluidasRecentes.length / businessDaysHistory : 0;
    const ritmoRecenteDiario = roundOneDecimal(ritmoRecenteDiarioBruto);

    const temposDeCiclo = concluidasRecentes
      .map(calculateCycleDays)
      .filter((value): value is number => value !== null);

    const tempoMedioConclusaoDiasRaw = average(temposDeCiclo);
    const tempoMedioConclusaoDias = tempoMedioConclusaoDiasRaw ? roundOneDecimal(tempoMedioConclusaoDiasRaw) : null;

    const demandaBaseDiaria = businessDaysFront > 0 ? totalProximas / businessDaysFront : totalProximas;
    const metaRecuperacaoDiaria = businessDaysFront > 0 ? Math.ceil(pendentes / businessDaysFront) : pendentes;

    const fatorCiclo = tempoMedioConclusaoDias
      ? Math.min(1.6, Math.max(1.05, 1 + (tempoMedioConclusaoDias / FRONT_WINDOW_DAYS)))
      : 1.15;

    const metaSustentacaoDiaria = Math.max(1, Math.ceil(demandaBaseDiaria * fatorCiclo));

    const tarefasPendentes = proximas2Semanas
      .filter((t) => t.stage !== 'concluido')
      .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
    const frenteMarco = buildFrontMilestone(activeProductionDesignerTasks, now);

    const urgentesNaFrente = tarefasPendentes.filter((task) => {
      const daysUntilDue = getDaysUntilDue(task, now);
      return daysUntilDue <= 3 || isOverdue(task) || task.stage === 'executando';
    }).length;

    const actionableTasks = minhas
      .filter(hasActiveProductionContract)
      .filter(isDesignerActionableTask);
    const frentePressionada = (totalProximas > 0 && (concluidasAdiantado / totalProximas) * 100 < 40) || diasDeFrente <= 2;
    const frenteCritica = (totalProximas > 0 && (concluidasAdiantado / totalProximas) * 100 < 30) || (diasDeFrente <= 1 && pendentes >= 4);
    const bonusRecuperacao = pendentes > 0 ? frenteCritica ? 2 : frentePressionada ? 1 : 0 : 0;
    const ritmoBase = Math.max(1, Math.ceil(Math.max(ritmoRecenteDiario, 0)));
    const metaDiaria = pendentes > 0
      ? Math.max(ritmoBase, teamRecentPaceFloor, metaRecuperacaoDiaria + bonusRecuperacao)
      : 0;
    const defasagemRitmo = Math.max(0, metaDiaria - Math.max(0, ritmoRecenteDiario));

    const quantidadePrioridades = clamp(
      Math.max(
        3,
        Math.ceil(metaDiaria),
        urgentesNaFrente,
        Math.ceil(defasagemRitmo) + 2,
      ),
      3,
      Math.min(10, Math.max(actionableTasks.length, 3)),
    );

    const prioridades = actionableTasks
      .map((task) => buildPriorityInsight(task, now))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.task.dataVencimento.getTime() - b.task.dataVencimento.getTime();
      })
      .slice(0, quantidadePrioridades);

    const pipelinePorEtapa = PIPELINE_STAGES.map((stage) => ({
      stage,
      label: PIPELINE_STAGE_LABELS[stage],
      count: minhas.filter((task) => task.stage === stage).length,
    }));

    const principalEtapa = [...pipelinePorEtapa].sort((a, b) => b.count - a.count)[0];

    const diasNoRitmoRecomendado = pendentes > 0 ? Math.max(1, Math.ceil(pendentes / metaDiaria)) : 0;
    const previsaoMetaDiaria = pendentes > 0
      ? formatDateShort(addBusinessDays(now, diasNoRitmoRecomendado))
      : null;

    const frente: FrenteInfo = {
      totalProxima1Semana,
      concluidasProxima1Semana,
      totalProximas2Semanas: totalProximas,
      concluidasAdiantado,
      pendentes,
      marcoSemanas: frenteMarco.weeks,
      marcoTotal: frenteMarco.total,
      marcoConcluidas: frenteMarco.concluded,
      marcoPendentes: frenteMarco.pending,
      marcoPercentual: frenteMarco.percent,
      marcoAnteriorCompleto: frenteMarco.previousComplete,
      marcoTarefasPendentes: frenteMarco.pendingTasks,
      metaDiaria,
      metaSustentacaoDiaria,
      metaRecuperacaoDiaria,
      ritmoRecenteDiario,
      tempoMedioConclusaoDias,
      diasDeFrenteAtual: diasDeFrente,
      percentual: totalProximas > 0 ? Math.round((concluidasAdiantado / totalProximas) * 100) : 100,
      previsaoMetaDiaria,
      tarefasPendentes,
    };

    const frenteGeral: FrenteGeralInfo = {
      totalAberto: frenteGeralTotal,
      concluidasAdiantado: frenteGeralConcluidas,
      pendentes: frenteGeralPendentes,
      percentual: frenteGeralTotal > 0 ? Math.round((frenteGeralConcluidas / frenteGeralTotal) * 100) : 100,
    };
    const tasksById = new Map<string, DesignTask>();
    const tasksByClientAndTitle = new Map<string, DesignTask>();
    allDesignerTasks.forEach((task) => {
      tasksById.set(normalizeTextKey(task.id), task);
      const fallbackKey = `${normalizeTextKey(task.parceiro)}|${normalizeTextKey(task.title)}`;
      if (!tasksByClientAndTitle.has(fallbackKey)) {
        tasksByClientAndTitle.set(fallbackKey, task);
      }
    });

    const materialsMap = new Map<string, { quantity: number; cycleTimes: number[] }>();
    adjustments
      .filter((adjustment) => belongsToDesigner(adjustment, designer.nome))
      .forEach((adjustment) => {
        const rawType = normalizeMaterialType(adjustment.tipoEntrega);
        if (!rawType || normalizeTextKey(rawType) === 'ajuste') return;

        const identifierKey = normalizeTextKey(adjustment.identificador || adjustment.id || '');
        const taskByIdentifier = identifierKey ? tasksById.get(identifierKey) : null;
        const fallbackKey = `${normalizeTextKey(adjustment.cliente)}|${normalizeTextKey(adjustment.tituloDemanda || adjustment.titulo)}`;
        const matchedTask = taskByIdentifier ?? tasksByClientAndTitle.get(fallbackKey) ?? null;
        const cycleDays = matchedTask ? calculateCycleDays(matchedTask) : null;

        if (!materialsMap.has(rawType)) {
          materialsMap.set(rawType, { quantity: 0, cycleTimes: [] });
        }

        const entry = materialsMap.get(rawType)!;
        entry.quantity += 1;
        if (cycleDays !== null) {
          entry.cycleTimes.push(cycleDays);
        }
      });

    const materiaisFromAdjustments: DesignerInsight['materiais'] = [...materialsMap.entries()]
      .map(([tipo, value]) => ({
        tipo,
        quantidade: value.quantity,
        tempoMedioDias: value.cycleTimes.length > 0
          ? roundOneDecimal(value.cycleTimes.reduce((sum, current) => sum + current, 0) / value.cycleTimes.length)
          : null,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6);

    const materiaisFallback: DesignerInsight['materiais'] = (['REELS', 'FEED', 'STORY'] as const).map((tipo) => {
      const tarefasTipoConcluidas = allDesignerTasks.filter(
        (task) => task.contentType === tipo && task.stage === 'concluido',
      );
      const temposTipo = tarefasTipoConcluidas
        .map(calculateCycleDays)
        .filter((value): value is number => value !== null);
      const tempoMedioRaw = average(temposTipo);

      return {
        tipo,
        quantidade: tarefasTipoConcluidas.length,
        tempoMedioDias: tempoMedioRaw ? roundOneDecimal(tempoMedioRaw) : null,
      };
    });

    const clientesCarteira = [...new Map(
      allDesignerTasks
        .filter(
          (task) =>
            task.clienteAtivo === true
            && typeof task.clientePostsMes === 'number'
            && task.clientePostsMes > 0,
        )
        .reduce((map, task) => {
          const cliente = String(task.clienteRelacionado || task.parceiro || '').trim();
          if (!cliente) return map;
          if (!map.has(cliente)) {
            map.set(cliente, task.clientePostsMes);
          }
          return map;
        }, new Map<string, number>()),
    ).entries()]
      .map(([cliente, quantidade]) => ({ cliente, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.cliente.localeCompare(b.cliente, 'pt-BR'));

    const observacoes: DesignerObservation[] = [];
    const referenciasClientes = buildDesignerClientReferences(minhas, now);
    const frentePendente = pendentes;
    if (frentePendente > 0) {
      observacoes.push({
        tone: 'info',
        message: `Ritmo recomendado: ${formatWholeNumber(metaDiaria)} entregas por dia`,
        projection: `Previsão de frente neste ritmo: ${previsaoMetaDiaria}`,
      });
    }

    return {
      nome: designer.nome,
      cor: designer.cor,
      avatar: designer.avatar,
      totalAtivas: minhas.length,
      vencidas: vencidasD.length,
      paraHoje: hojeD.length,
      paraManha: manhaD.length,
      bloqueadas: bloqueadasD.length,
      concluidasPeriodo,
      emExecucao: execD.length,
      cargaHoras: minhas.reduce((acc, t) => acc + t.tempoEstimadoHoras, 0),
      horasGastas: minhas.reduce((acc, t) => acc + t.tempoGastoHoras, 0),
      prioridades,
      quantidadePrioridades,
      acompanhamento: {
        validacaoCliente: minhas.filter((task) => task.stage === 'validacao').length,
        direcaoArte: minhas.filter((task) => task.stage === 'direcao_arte' && !hasTag(task, ['CORRE'])).length,
        tarefasValidacaoCliente: minhas
          .filter((task) => task.stage === 'validacao')
          .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime()),
        tarefasDirecaoArte: minhas
          .filter((task) => task.stage === 'direcao_arte' && !hasTag(task, ['CORRE']))
          .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime()),
      },
      atrasados: {
        quantidade: vencidasD.length,
        tarefas: [...vencidasD].sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime()),
      },
      pipeline: {
        total: minhas.length,
        principalEtapa: principalEtapa?.count ? principalEtapa.stage : null,
        principalEtapaLabel: principalEtapa?.count ? principalEtapa.label : null,
        principalEtapaCount: principalEtapa?.count ?? 0,
        porEtapa: pipelinePorEtapa,
      },
      observacoes,
      referenciasClientes,
      frente,
      frenteGeral,
      materiais: materiaisFromAdjustments.length > 0 ? materiaisFromAdjustments : materiaisFallback,
      clientesCarteira,
    };
  });

  const alertas: AlertItem[] = [];

  vencidas.forEach((t) => {
    const dias = Math.ceil((Date.now() - t.dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
    alertas.push({
      type: 'danger',
      message: t.title,
      highlight: `Atrasado há ${dias} dias`,
      designer: t.responsavel,
      priority: 1000 + dias,
    });
  });

  const aguardandoMaterial = ativas.filter((t) => t.statusTags.includes('AGUARDANDO MATERIAL'));
  aguardandoMaterial.forEach((t) => {
    alertas.push({
      type: 'warning',
      message: t.title,
      highlight: 'Aguardando material do cliente',
      designer: t.responsavel,
      priority: 700 + Math.max(0, 14 - getDaysUntilDue(t, now)),
    });
  });

  const porEtapa = PIPELINE_STAGES.map((stage) => ({
    stage,
    label: PIPELINE_STAGE_LABELS[stage],
    count: ativas.filter((task) => task.stage === stage).length,
  }));
  const totalAFazer = porEtapa.find((item) => item.stage === 'fazer')?.count ?? 0;

  const tipos = ['FEED', 'REELS', 'STORY'] as const;
  const porTipo = tipos.map((tipo) => ({
    tipo,
    count: ativas.filter((task) => task.contentType === tipo).length,
  }));

  const clientesAtencao = buildClientAttentionItems(tasks, now);
  const recentBusinessDayKeys = getPreviousBusinessDayKeys(now, 7);
  const concludedInRecentBusinessDays = concluidas.filter((task) => {
    if (!task.concluidoEm) return false;
    return recentBusinessDayKeys.includes(getDateKey(task.concluidoEm));
  }).length;

  const etapasGargalo = BOTTLENECK_STAGES.map((stage) => {
    const etapa = porEtapa.find((item) => item.stage === stage);
    return {
      stage,
      label: PIPELINE_STAGE_LABELS[stage],
      count: etapa?.count ?? 0,
    };
  });
  const totalEtapasGargalo = etapasGargalo.reduce((sum, etapa) => sum + etapa.count, 0);
  const etapasGargaloComShare = etapasGargalo.map((etapa) => ({
    ...etapa,
    share: totalEtapasGargalo > 0 ? Math.round((etapa.count / totalEtapasGargalo) * 100) : 0,
    comparison: buildStageFlowComparison(etapa.stage, etapa.count, tasks, now),
  }));
  const etapasOperacionais = etapasGargaloComShare.filter((etapa) => etapa.stage !== 'aprovado_programacao');
  const etapaPrincipalGargalo = [...etapasOperacionais].sort((a, b) => {
    const aDelta = a.comparison?.rawDifference ?? Number.NEGATIVE_INFINITY;
    const bDelta = b.comparison?.rawDifference ?? Number.NEGATIVE_INFINITY;
    if (bDelta !== aDelta) return bDelta - aDelta;
    return b.count - a.count;
  })[0];

  let gargaloOperacionalTitle = 'Fluxo em andamento está distribuído entre as etapas';
  let gargaloOperacionalImpact = 'As demandas em andamento estão relativamente equilibradas entre Execução, Direção de Arte, Montagem e Validação.';
  let gargaloOperacionalRecommendation = 'Mantenha o avanço das etapas com vencimento mais próximo para preservar o fluxo das próximas entregas.';

  if (etapaPrincipalGargalo && etapaPrincipalGargalo.count > 0 && (etapaPrincipalGargalo.comparison?.rawDifference ?? 0) > 0) {
    if (etapaPrincipalGargalo.stage === 'executando') {
      gargaloOperacionalTitle = 'Execução está piorando e merece atenção';
      gargaloOperacionalImpact = `${etapaPrincipalGargalo.count} demandas estão em Execução, com tendência de alta acima da média recente (${Math.abs(etapaPrincipalGargalo.comparison.rawDifference).toFixed(1)} por dia).`;
      gargaloOperacionalRecommendation = 'Priorize os itens mais próximos do vencimento em Execução para evitar que essa fila cresça mais.';
    } else if (etapaPrincipalGargalo.stage === 'direcao_arte') {
      gargaloOperacionalTitle = 'Direção de Arte está piorando e merece atenção';
      gargaloOperacionalImpact = `${etapaPrincipalGargalo.count} demandas estão em Direção de Arte, acima da média recente em ${Math.abs(etapaPrincipalGargalo.comparison.rawDifference).toFixed(1)} por dia.`;
      gargaloOperacionalRecommendation = 'Destrave primeiro as peças com correção pendente para impedir acúmulo antes da Montagem.';
    } else if (etapaPrincipalGargalo.stage === 'montagem') {
      gargaloOperacionalTitle = 'Montagem está piorando e merece atenção';
      gargaloOperacionalImpact = `${etapaPrincipalGargalo.count} demandas estão em Montagem, com crescimento acima da média recente em ${Math.abs(etapaPrincipalGargalo.comparison.rawDifference).toFixed(1)} por dia.`;
      gargaloOperacionalRecommendation = 'Feche primeiro as apresentações com vencimento mais próximo para evitar retenção antes da Validação.';
    } else if (etapaPrincipalGargalo.stage === 'validacao') {
      const principaisClientesValidacao = [...new Map(
        ativas
          .filter((task) => task.stage === 'validacao')
          .reduce((map, task) => {
            const cliente = String(task.parceiro || 'Sem parceiro').trim();
            if (!cliente) return map;
            map.set(cliente, (map.get(cliente) ?? 0) + 1);
            return map;
          }, new Map<string, number>())
      ).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cliente, quantidade]) => `${cliente} (${quantidade})`);

      gargaloOperacionalTitle = 'Validação é o principal gargalo agora';
      gargaloOperacionalImpact = `${etapaPrincipalGargalo.count} demandas estão em Validação e crescendo acima da média recente em ${Math.abs(etapaPrincipalGargalo.comparison.rawDifference).toFixed(1)} por dia.`;
      gargaloOperacionalRecommendation = principaisClientesValidacao.length > 0
        ? `Os maiores volumes em validação hoje estão em ${principaisClientesValidacao.join(', ')}. Comece por essas contas para aliviar o principal ponto de retenção do fluxo.`
        : 'Acione hoje os clientes com mais itens em validação para destravar a etapa com maior retenção.';
    } else if (etapaPrincipalGargalo.stage === 'aprovado_programacao') {
      gargaloOperacionalTitle = 'Aprovação para Programação está crescendo e merece atenção';
      gargaloOperacionalImpact = `${etapaPrincipalGargalo.count} demandas estão em Aprovado p/ Programação e crescendo acima da média recente em ${Math.abs(etapaPrincipalGargalo.comparison.rawDifference).toFixed(1)} por dia.`;
      gargaloOperacionalRecommendation = 'Revise primeiro as aprovações mais antigas para evitar acúmulo antes da saída do fluxo.';
    }
  }

  return {
    totalAtivas: ativas.length,
    totalAFazer,
    totalVencidas: vencidas.length,
    totalHoje: hoje.length,
    totalBloqueadas: bloqueadas.length,
    totalConcluidas: concluidasMesAtual.length,
    comparativoConcluidasMesAtual: {
      direction: direcaoComparativoConcluidas,
      difference: Math.abs(diferencaConcluidasMesAtual),
      previousTotal: concluidasMesmoPeriodoMesAnterior.length,
    },
    porDesigner,
    clientesAtencao,
    clientScores,
    alertas: alertas.sort((a, b) => b.priority - a.priority),
    porEtapa,
    porTipo,
    gargalos: [],
    gargaloOperacional: {
      etapas: etapasGargaloComShare,
      title: gargaloOperacionalTitle,
      impact: gargaloOperacionalImpact,
      recommendation: gargaloOperacionalRecommendation,
    },
  };
}


