import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
} from 'lucide-react';
import {
  isDueToday,
  isDueTomorrow,
  isOverdue,
  stageLabels,
  type DesignTask,
} from '@/lib/data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';

type AgendaPanelProps = {
  tasks: DesignTask[];
  selectedMonth: string;
  selectedDesigner: string;
  selectedClient: string;
  onEditCustomRange?: () => void;
  customRange?: {
    start: Date | null;
    end: Date | null;
  };
};

type MonthCell = {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  tasks: DesignTask[];
};

type MonthView = {
  date: Date;
  label: string;
  total: number;
  concluded: number;
  pending: number;
  overdue: number;
  today: number;
  tomorrow: number;
  validation: number;
  weeks: MonthCell[][];
};

type TrendTone = {
  icon: typeof ArrowRight;
  className: string;
  label: string;
};

type StatusTone = {
  label: string;
  className: string;
  accent: string;
  hoverClass: string;
  tooltipClass: string;
};

type AgendaMonthOption = {
  value: string;
  label: string;
};

type StageFilterOption = {
  stage: DesignTask['stage'] | 'todos';
  label: string;
};

export const AGENDA_NEXT_15_DAYS_VALUE = 'next-15-days';
export const AGENDA_CUSTOM_RANGE_VALUE = 'custom-range';

const STAGE_FILTER_OPTIONS: StageFilterOption[] = [
  { stage: 'fazer', label: 'Criação Textual' },
  { stage: 'executando', label: 'Criação das Artes' },
  { stage: 'direcao_arte', label: 'Direção de Arte' },
  { stage: 'montagem', label: 'Montagem da Apresentação' },
  { stage: 'validacao', label: 'Validação do Cliente' },
  { stage: 'aprovado_programacao', label: 'Aprovado p/ Programação' },
  { stage: 'concluido', label: 'Concluído' },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function sameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function normalizeDate(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value?: Date | null) {
  if (!value) return 'Não informado';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function formatDateOnly(value?: Date | null) {
  if (!value) return 'Não informado';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(value);
}

function formatDateLong(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function formatDaysAgo(value: Date) {
  const now = new Date();
  const diffMs = now.getTime() - value.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'há 1 dia';
  return `há ${diffDays} dias`;
}

type TaskHistoryStep = {
  label: string;
  value: Date;
};

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthValue(value: string) {
  if (value === AGENDA_NEXT_15_DAYS_VALUE || value === AGENDA_CUSTOM_RANGE_VALUE) {
    return startOfMonth(new Date());
  }

  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return startOfMonth(new Date());
  }

  return new Date(year, Math.max(0, month - 1), 1);
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function matchesLabel(value: string, selected: string) {
  if (selected === 'Todos') return true;

  const normalizedValue = normalizeText(value);
  const normalizedSelected = normalizeText(selected);

  if (!normalizedValue || !normalizedSelected) return false;
  if (normalizedValue === normalizedSelected) return true;
  return normalizedValue.includes(normalizedSelected) || normalizedSelected.includes(normalizedValue);
}

export type ClienteContato = {
  nome: string;
  designer: string | null;
  copywriter: string | null;
};

export async function fetchClientesContatos(): Promise<ClienteContato[]> {
  const response = await fetch('/api/clientes', { credentials: 'include' });
  const body = await response.json().catch(() => null);
  if (!response.ok) return [];
  return (body?.clients || []) as ClienteContato[];
}

function getTaskClient(task: DesignTask) {
  return task.clienteRelacionado?.trim() || task.parceiro?.trim() || 'Sem cliente';
}

export function getClienteContatoForTask(task: DesignTask, clientesContatos: ClienteContato[]) {
  const taskClient = getTaskClient(task);
  const exactMatch = clientesContatos.find(
    (cliente) => normalizeText(cliente.nome) === normalizeText(taskClient),
  );
  if (exactMatch) return exactMatch;

  // O nome do cliente na task pode vir com sufixo (ex: "Porto Itapoá -
  // Julho/2026"), enquanto o cadastro tem só o nome puro (ex: "Porto
  // Itapoá") — cai para match parcial nesse caso.
  return clientesContatos.find((cliente) => matchesLabel(taskClient, cliente.nome)) || null;
}

function matchesDesigner(task: DesignTask, selected: string, clientesContatos: ClienteContato[]) {
  if (selected === 'Todos') return true;

  const designer = getClienteContatoForTask(task, clientesContatos)?.designer || '';
  return matchesLabel(designer, selected);
}

function getTaskTagLabels(task: DesignTask) {
  const labels = [task.contentType, ...(task.statusTags || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return [...new Set(labels)];
}

function getTaskHistorySteps(task: DesignTask): TaskHistoryStep[] {
  const steps: TaskHistoryStep[] = [];

  if (task.criadoEm) {
    steps.push({ label: 'Card criado em', value: task.criadoEm });
  }

  if (task.entrouExecutandoEm) {
    steps.push({ label: 'Entrou em Executando em', value: task.entrouExecutandoEm });
  }

  if (task.entrouMontagemEm) {
    steps.push({ label: 'Entrou em Montagem em', value: task.entrouMontagemEm });
  }

  if (task.entrouValidacaoEm) {
    steps.push({ label: 'Entrou em Validação do Cliente em', value: task.entrouValidacaoEm });
  }

  if (task.concluidoEm && task.stage === 'concluido') {
    steps.push({ label: 'Concluído em', value: task.concluidoEm });
  }

  return steps;
}

function getTaskHistoryLabel(step: TaskHistoryStep) {
  return `${step.label} ${formatDateLong(step.value)} (${formatDaysAgo(step.value)})`;
}

function getAgendaMonthOptions(anchorDate: Date = new Date()): AgendaMonthOption[] {
  const base = startOfMonth(anchorDate);

  return [
    {
      value: AGENDA_NEXT_15_DAYS_VALUE,
      label: 'Próximos 15 dias',
    },
    {
      value: monthValue(base),
      label: 'Mês atual',
    },
    {
      value: AGENDA_CUSTOM_RANGE_VALUE,
      label: 'Intervalo customizado',
    },
  ];
}

export function getSelectedPeriodRange(selectedMonth: string, customRange?: { start: Date | null; end: Date | null }) {
  if (selectedMonth === AGENDA_NEXT_15_DAYS_VALUE) {
    const start = normalizeDate(new Date());
    const end = normalizeDate(addDays(start, 14));
    return {
      start,
      end,
      label: 'próximos 15 dias',
    };
  }

  if (selectedMonth === AGENDA_CUSTOM_RANGE_VALUE) {
    const today = normalizeDate(new Date());
    const defaultEnd = normalizeDate(addDays(today, 29));
    const start = customRange?.start ? normalizeDate(customRange.start) : today;
    const endCandidate = customRange?.end ? normalizeDate(customRange.end) : defaultEnd;
    const end = endCandidate >= start ? endCandidate : start;

    return {
      start,
      end,
      label: `de ${formatDateLong(start)} a ${formatDateLong(end)}`,
    };
  }

  const monthDate = parseMonthValue(selectedMonth);
  return {
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
    label: monthLabel(monthDate),
  };
}

function getPeriodTitle(selectedMonth: string) {
  if (selectedMonth === AGENDA_NEXT_15_DAYS_VALUE) {
    return 'Próximos 15 dias';
  }

  if (selectedMonth === AGENDA_CUSTOM_RANGE_VALUE) {
    return 'Intervalo customizado';
  }

  return monthLabel(parseMonthValue(selectedMonth));
}

export function getAgendaCurrentMonth() {
  return monthValue(startOfMonth(new Date()));
}

export function getAgendaMonthOptionsList(anchorDate: Date = new Date()) {
  return getAgendaMonthOptions(anchorDate);
}

function weekdayShortLabels() {
  const base = new Date(2026, 5, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(current);
  });
}

function statusTone(task: DesignTask): StatusTone {
  if (task.stage === 'concluido') {
    return {
      label: 'Concluído',
      className: 'border-zinc-500/20 bg-zinc-900 text-zinc-200',
      accent: 'bg-zinc-300',
      hoverClass: 'hover:border-zinc-400/30 hover:bg-zinc-800',
      tooltipClass: 'border-zinc-500/45 bg-[#151821] text-white',
    };
  }

  switch (task.stage) {
    case 'fazer':
      return {
        label: 'Criação Textual',
        className: 'border-red-500/70 bg-red-950 text-red-50',
        accent: 'bg-red-400',
        hoverClass: 'hover:border-red-400/90 hover:bg-red-900',
        tooltipClass: 'border-red-500/55 bg-[#151821] text-white',
      };
    case 'validacao':
      return {
        label: 'Validação',
        className: 'border-sky-400/70 bg-sky-950 text-sky-50',
        accent: 'bg-sky-300',
        hoverClass: 'hover:border-sky-300/90 hover:bg-sky-900',
        tooltipClass: 'border-sky-400/55 bg-[#151821] text-white',
      };
    case 'executando':
      return {
        label: 'Criação das Artes',
        className: 'border-yellow-300/70 bg-yellow-700/55 text-yellow-50',
        accent: 'bg-yellow-300',
        hoverClass: 'hover:border-yellow-200/90 hover:bg-yellow-600/65',
        tooltipClass: 'border-yellow-300/55 bg-[#151821] text-white',
      };
    case 'direcao_arte':
      return {
        label: 'Direção de Arte',
        className: 'border-purple-500/70 bg-purple-950 text-purple-50',
        accent: 'bg-purple-400',
        hoverClass: 'hover:border-purple-400/90 hover:bg-purple-900',
        tooltipClass: 'border-purple-500/55 bg-[#151821] text-white',
      };
    case 'montagem':
      return {
        label: 'Montagem',
        className: 'border-orange-400/95 bg-[rgb(182_75_0_/_35%)] text-orange-50',
        accent: 'bg-orange-500',
        hoverClass: 'hover:border-orange-300/100 hover:bg-[rgb(182_75_0_/_45%)]',
        tooltipClass: 'border-orange-400/70 bg-[#151821] text-white',
      };
    case 'aprovado_programacao':
      return {
        label: 'Aprovado p/ Programação',
        className: 'border-lime-400/70 bg-lime-950 text-lime-50',
        accent: 'bg-lime-300',
        hoverClass: 'hover:border-lime-300/90 hover:bg-lime-900',
        tooltipClass: 'border-lime-400/55 bg-[#151821] text-white',
      };
    default:
      return {
        label: stageLabels[task.stage],
        className: 'border-zinc-400/25 bg-zinc-900 text-zinc-200',
        accent: 'bg-zinc-300',
        hoverClass: 'hover:border-zinc-300/35 hover:bg-zinc-800',
        tooltipClass: 'border-zinc-500/45 bg-[#151821] text-white',
      };
  }
}

function buildMonthView(
  monthDate: Date,
  tasks: DesignTask[],
  today: Date,
  selectedDesigner: string,
  selectedClient: string,
  selectedStages: Array<DesignTask['stage']>,
  clientesContatos: ClienteContato[],
  periodStart: Date = startOfMonth(monthDate),
  periodEnd: Date = endOfMonth(monthDate),
): MonthView {
  const visibleStart = new Date(periodStart);
  visibleStart.setDate(periodStart.getDate() - mondayIndex(periodStart));
  const visibleEnd = new Date(periodEnd);
  visibleEnd.setDate(periodEnd.getDate() + (6 - mondayIndex(periodEnd)));

  const tasksInMonth = tasks
    .filter((task) => task.dataVencimento >= periodStart && task.dataVencimento <= periodEnd)
    .filter((task) => matchesDesigner(task, selectedDesigner, clientesContatos))
    .filter((task) => matchesLabel(getTaskClient(task), selectedClient))
    .filter((task) => selectedStages.length === 0 || selectedStages.includes(task.stage))
    .slice()
    .sort((left, right) => {
      const timeDiff = left.dataVencimento.getTime() - right.dataVencimento.getTime();
      if (timeDiff !== 0) return timeDiff;
      return getTaskClient(left).localeCompare(getTaskClient(right), 'pt-BR');
    });

  const tasksByDay = new Map<string, DesignTask[]>();
  tasksInMonth.forEach((task) => {
    const key = normalizeDate(task.dataVencimento).toISOString().slice(0, 10);
    if (!tasksByDay.has(key)) tasksByDay.set(key, []);
    tasksByDay.get(key)?.push(task);
  });

  const weeks: MonthCell[][] = [];
  let cursor = new Date(visibleStart);

  while (cursor <= visibleEnd) {
    const week: MonthCell[] = [];

    for (let index = 0; index < 7; index += 1) {
      const day = normalizeDate(cursor);
      const key = day.toISOString().slice(0, 10);
      week.push({
        date: new Date(day),
        inMonth: day >= periodStart && day <= periodEnd,
        isToday: sameDay(day, today),
        tasks: tasksByDay.get(key) || [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  return {
    date: monthDate,
    label: monthLabel(monthDate),
    total: tasksInMonth.length,
    concluded: tasksInMonth.filter((task) => task.stage === 'concluido').length,
    pending: tasksInMonth.filter((task) => task.stage !== 'concluido').length,
    overdue: tasksInMonth.filter((task) => isOverdue(task)).length,
    today: tasksInMonth.filter((task) => isDueToday(task)).length,
    tomorrow: tasksInMonth.filter((task) => isDueTomorrow(task)).length,
    validation: tasksInMonth.filter((task) => task.stage === 'validacao').length,
    weeks,
  };
}

function getTrendTone(current: number, previous: number): TrendTone {
  const difference = current - previous;

  if (difference > 0) {
    return {
      icon: ArrowUpRight,
      className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
      label: `+${difference}`,
    };
  }

  if (difference < 0) {
    return {
      icon: ArrowDownRight,
      className: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
      label: `${difference}`,
    };
  }

  return {
    icon: ArrowRight,
    className: 'border-border/70 bg-background/60 text-muted-foreground',
    label: '0',
  };
}

function formatCriticalDeadlineSummary(overdue: number, dueSoon: number) {
  const parts: string[] = [];

  if (overdue > 0) {
    parts.push(`${overdue} atrasado${overdue === 1 ? '' : 's'}`);
  }

  if (dueSoon > 0) {
    parts.push(
      dueSoon === 1
        ? '1 vence hoje ou amanha'
        : `${dueSoon} vencem hoje ou amanha`,
    );
  }

  if (parts.length === 0) {
    return 'Nenhum item critico no prazo';
  }

  return parts.join(' + ');
}

type AgendaTaskGroup = {
  key: string;
  client: string;
  tasks: DesignTask[];
};

function buildAgendaTaskGroups(tasks: DesignTask[]): AgendaTaskGroup[] {
  const groups: AgendaTaskGroup[] = [];
  const groupByKey = new Map<string, AgendaTaskGroup>();

  tasks.forEach((task) => {
    const client = getTaskClient(task);
    const key = `${client}|${task.stage}`;
    const existing = groupByKey.get(key);
    if (existing) {
      existing.tasks.push(task);
      return;
    }
    const group: AgendaTaskGroup = { key, client, tasks: [task] };
    groupByKey.set(key, group);
    groups.push(group);
  });

  return groups;
}

function AgendaTaskButton({
  task,
  onClick,
}: {
  task: DesignTask;
  onClick: () => void;
}) {
  const tone = statusTone(task);

  return (
    <button
      type="button"
      aria-label={`${task.title} - ${tone.label}`}
      onClick={onClick}
      className={`group relative w-full rounded-lg border px-2 py-1.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md ${tone.className} ${tone.hoverClass}`}
    >
      <div className={`pointer-events-none absolute left-2 bottom-[calc(100%+0.45rem)] z-30 rounded-xl border px-3 py-1.5 text-[10px] font-semibold tracking-[0.01em] opacity-0 shadow-[0_14px_32px_rgba(0,0,0,0.42)] transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100 ${tone.tooltipClass}`}>
        {tone.label}
      </div>
      <div className="flex items-start gap-1.5">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone.accent}`} />
        <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">{task.title}</p>
      </div>
    </button>
  );
}

function AgendaTaskGroupCard({
  group,
  onTaskClick,
}: {
  group: AgendaTaskGroup;
  onTaskClick: (task: DesignTask) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (group.tasks.length === 1 || expanded) {
    return (
      <>
        {group.tasks.map((task) => (
          <AgendaTaskButton key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
        {group.tasks.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full rounded-lg border border-dashed border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Recolher
          </button>
        )}
      </>
    );
  }

  const tone = statusTone(group.tasks[0]);

  return (
    <button
      type="button"
      aria-label={`${group.client} - ${group.tasks.length} posts - ${tone.label}`}
      onClick={() => setExpanded(true)}
      className={`group relative w-full rounded-lg border px-2 py-1.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md ${tone.className} ${tone.hoverClass}`}
    >
      <div className={`pointer-events-none absolute left-2 bottom-[calc(100%+0.45rem)] z-30 rounded-xl border px-3 py-1.5 text-[10px] font-semibold tracking-[0.01em] opacity-0 shadow-[0_14px_32px_rgba(0,0,0,0.42)] transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100 ${tone.tooltipClass}`}>
        {tone.label}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.accent}`} />
        <p className="line-clamp-1 flex-1 text-[11px] font-semibold leading-snug text-foreground">{group.client}</p>
        <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
          {group.tasks.length}
        </span>
      </div>
    </button>
  );
}

function AgendaDayCell({
  cell,
  onTaskClick,
}: {
  cell: MonthCell;
  onTaskClick: (task: DesignTask) => void;
}) {
  const taskGroups = useMemo(() => buildAgendaTaskGroups(cell.tasks), [cell.tasks]);
  const monthDividerLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(cell.date)
    .replace('.', '')
    .toUpperCase();

  return (
    <div
      className={`min-h-[138px] rounded-xl border p-2 transition-colors ${
        cell.inMonth
          ? 'border-border/70 bg-card/60'
          : 'border-border/30 bg-muted/20 opacity-60'
      } ${cell.isToday ? 'border-primary/40 ring-1 ring-primary/25' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        {cell.isToday ? (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/25">
            {cell.date.getDate()}
          </span>
        ) : (
          <span className="text-sm font-semibold text-foreground">
            {cell.date.getDate()}
          </span>
        )}
        <span className="px-0.5 text-[10px] font-semibold tracking-[0.08em] text-zinc-500/70">
          {monthDividerLabel}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {taskGroups.map((group) => (
          <AgendaTaskGroupCard key={group.key} group={group} onTaskClick={onTaskClick} />
        ))}
      </div>
    </div>
  );
}

export function AgendaPanel({
  tasks,
  selectedMonth,
  selectedDesigner,
  selectedClient,
  onEditCustomRange,
  customRange,
}: AgendaPanelProps) {
  const today = useMemo(() => normalizeDate(new Date()), []);
  const monthDate = useMemo(() => parseMonthValue(selectedMonth), [selectedMonth]);
  const periodRange = useMemo(
    () => getSelectedPeriodRange(selectedMonth, customRange),
    [selectedMonth, customRange],
  );
  const allPeriodRange = useMemo(() => periodRange, [periodRange]);
  const [selectedStages, setSelectedStages] = useState<Array<DesignTask['stage']>>([]);
  const [selectedTask, setSelectedTask] = useState<DesignTask | null>(null);
  const [clientesContatos, setClientesContatos] = useState<ClienteContato[]>([]);

  useEffect(() => {
    fetchClientesContatos().then(setClientesContatos);
  }, []);

  const toggleStage = (stage: DesignTask['stage']) => {
    setSelectedStages((current) => (
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage]
    ));
  };

  const clearStageFilter = () => {
    setSelectedStages([]);
  };

  const month = useMemo(
    () => buildMonthView(
      monthDate,
      tasks,
      today,
      selectedDesigner,
      selectedClient,
      selectedStages,
      clientesContatos,
      allPeriodRange.start,
      allPeriodRange.end,
    ),
    [monthDate, tasks, today, selectedDesigner, selectedClient, selectedStages, clientesContatos, allPeriodRange.end, allPeriodRange.start],
  );
  const previousPeriod = useMemo(() => {
    if (selectedMonth === AGENDA_NEXT_15_DAYS_VALUE) {
      const start = addDays(periodRange.start, -15);
      const end = addDays(periodRange.start, -1);
      return buildMonthView(monthDate, tasks, today, selectedDesigner, selectedClient, selectedStages, clientesContatos, start, end);
    }

    const previousMonthDate = addMonths(monthDate, -1);
    return buildMonthView(previousMonthDate, tasks, today, selectedDesigner, selectedClient, selectedStages, clientesContatos, undefined, undefined);
  }, [monthDate, periodRange.start, selectedClient, selectedDesigner, selectedMonth, selectedStages, clientesContatos, tasks, today]);
  const weekdays = weekdayShortLabels();
  const totalTrend = getTrendTone(month.total, previousPeriod.total);
  const concludedTrend = getTrendTone(month.concluded, previousPeriod.concluded);
  const pendingTrend = getTrendTone(month.pending, previousPeriod.pending);
  const overdueTrend = getTrendTone(month.overdue, previousPeriod.overdue);
  const criticalDeadlineCount = month.overdue + month.today + month.tomorrow;
  const previousCriticalDeadlineCount = previousPeriod.overdue + previousPeriod.today + previousPeriod.tomorrow;
  const criticalDeadlineTrend = getTrendTone(criticalDeadlineCount, previousCriticalDeadlineCount);
  const periodTitle = getPeriodTitle(selectedMonth);
  const TotalTrendIcon = totalTrend.icon;
  const ConcludedTrendIcon = concludedTrend.icon;
  const PendingTrendIcon = pendingTrend.icon;
  const CriticalDeadlineTrendIcon = criticalDeadlineTrend.icon;
  const dueSoonCount = month.today + month.tomorrow;
  const criticalDeadlineSummary = formatCriticalDeadlineSummary(month.overdue, dueSoonCount);

  return (
    <section className="w-full space-y-6">
      {selectedMonth === AGENDA_CUSTOM_RANGE_VALUE ? (
        <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
          <div className="flex items-center justify-between gap-3">
            <p>
              Período: <span className="font-semibold capitalize">{periodRange.label}</span>
            </p>
            <button
              type="button"
              onClick={onEditCustomRange}
              className="rounded-lg border border-primary/35 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10"
            >
              Editar período
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Conteudos no periodo</p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">{month.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">{periodTitle}</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${totalTrend.className}`}>
              <TotalTrendIcon className="h-3.5 w-3.5" />
              {totalTrend.label}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Concluidos</p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">{month.concluded}</p>
              <p className="mt-1 text-xs text-muted-foreground">{month.pending} ainda em aberto</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${concludedTrend.className}`}>
              <ConcludedTrendIcon className="h-3.5 w-3.5" />
              {concludedTrend.label}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Em aberto</p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">{month.pending}</p>
              <p className="mt-1 text-xs text-muted-foreground">{month.validation} em validacao</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${pendingTrend.className}`}>
              <PendingTrendIcon className="h-3.5 w-3.5" />
              {pendingTrend.label}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Atenção no prazo</p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">{criticalDeadlineCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">{criticalDeadlineSummary}</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${criticalDeadlineTrend.className}`}>
              <CriticalDeadlineTrendIcon className="h-3.5 w-3.5" />
              {criticalDeadlineTrend.label}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {STAGE_FILTER_OPTIONS.map((option) => {
          const isActive = selectedStages.includes(option.stage);
          const toneClass =
            option.stage === 'fazer'
              ? 'border-red-400/35 bg-red-950 text-red-100 hover:border-red-300/55 hover:bg-red-900'
              : option.stage === 'executando'
                ? 'border-yellow-300/55 bg-yellow-700/55 text-yellow-100 hover:border-yellow-200/75 hover:bg-yellow-600/65'
                : option.stage === 'direcao_arte'
                  ? 'border-purple-500/35 bg-purple-950 text-purple-100 hover:border-purple-400/55 hover:bg-purple-900'
                : option.stage === 'montagem'
                    ? 'border-orange-400/95 bg-[rgb(182_75_0_/_35%)] text-orange-50 hover:border-orange-300/100 hover:bg-[rgb(182_75_0_/_45%)]'
                    : option.stage === 'validacao'
                      ? 'border-sky-400/35 bg-sky-950 text-sky-100 hover:border-sky-300/55 hover:bg-sky-900'
                      : option.stage === 'aprovado_programacao'
                        ? 'border-lime-400/35 bg-lime-950 text-lime-100 hover:border-lime-300/55 hover:bg-lime-900'
                        : 'border-zinc-400/25 bg-zinc-900 text-zinc-300 hover:border-zinc-300/40 hover:bg-zinc-800';

          const dotClass =
            option.stage === 'fazer'
              ? 'bg-red-500'
              : option.stage === 'executando'
                ? 'bg-yellow-300'
                : option.stage === 'direcao_arte'
                  ? 'bg-purple-500'
                  : option.stage === 'montagem'
                    ? 'bg-orange-500'
                    : option.stage === 'validacao'
                      ? 'bg-sky-400'
                      : option.stage === 'aprovado_programacao'
                        ? 'bg-lime-400'
                        : 'bg-zinc-300';

          return (
            <button
              key={option.stage}
              type="button"
              aria-pressed={isActive}
              onClick={() => toggleStage(option.stage)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${toneClass} ${isActive ? 'ring-2 ring-inset ring-primary/35' : ''}`}
            >
              <span className={`h-2 w-2 rounded-full ${dotClass}`} />
              {option.label}
              {isActive ? <Check className="h-3 w-3" /> : null}
            </button>
          );
        })}
        {selectedStages.length > 0 ? (
          <button
            type="button"
            onClick={clearStageFilter}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/80 hover:text-foreground"
          >
            Limpar seleção
          </button>
        ) : null}
      </div>

      {month.total === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-background/50 p-5 text-sm text-muted-foreground">
          Nenhuma entrega encontrada para o mês e filtros selecionados.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-border/60 bg-background/40">
        <div className="grid grid-cols-7 gap-1 border-b border-border/60 bg-card/50 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {weekdays.map((weekday) => (
            <span key={weekday} className="text-center font-semibold">
              {weekday}
            </span>
          ))}
        </div>

        <div className="space-y-1.5 px-2 py-2">
          {month.weeks.map((week, weekIndex) => (
            <div key={`${month.label}-${weekIndex}`} className="grid grid-cols-7 gap-1.5">
              {week.map((cell) => (
                <AgendaDayCell
                  key={cell.date.toISOString()}
                  cell={cell}
                  onTaskClick={(task) => setSelectedTask(task)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 px-3 py-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 px-3 py-2">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {month.concluded} concluídas
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="h-3.5 w-3.5" />
              {month.total} entregas no período
            </span>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogPortal>
          <DialogOverlay className="bg-black/35 backdrop-blur-[2px]" />
          <DialogContent className="max-w-[560px] overflow-hidden rounded-[28px] border border-border/70 bg-card p-0 shadow-2xl">
            {selectedTask ? (
              <>
                <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-5 text-left">
                  {(() => {
                    const tone = statusTone(selectedTask);
                    const statusPillClass =
                      selectedTask.stage === 'concluido'
                        ? 'border-zinc-400/15 bg-zinc-400/5 text-zinc-200'
                        : selectedTask.stage === 'fazer'
                          ? 'border-red-400/25 bg-red-400/10 text-red-100'
                        : selectedTask.stage === 'validacao'
                            ? 'border-sky-400/25 bg-sky-400/10 text-sky-100'
                            : selectedTask.stage === 'executando'
                              ? 'border-yellow-300/40 bg-yellow-700/40 text-yellow-100'
                              : selectedTask.stage === 'direcao_arte'
                                ? 'border-purple-500/25 bg-purple-500/10 text-purple-100'
                                : selectedTask.stage === 'montagem'
                                  ? 'border-orange-400/75 bg-[rgb(182_75_0_/_35%)] text-orange-50'
                                  : 'border-lime-400/25 bg-lime-400/10 text-lime-100';

                    const dotClass =
                      selectedTask.stage === 'fazer'
                        ? 'bg-red-500'
                        : selectedTask.stage === 'executando'
                          ? 'bg-yellow-300'
                          : selectedTask.stage === 'direcao_arte'
                            ? 'bg-purple-500'
                            : selectedTask.stage === 'montagem'
                              ? 'bg-orange-300'
                              : selectedTask.stage === 'validacao'
                                ? 'bg-sky-400'
                                : selectedTask.stage === 'aprovado_programacao'
                                  ? 'bg-lime-400'
                                  : 'bg-zinc-300';

                    return (
                      <span
                        className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusPillClass}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                        {tone.label}
                      </span>
                    );
                  })()}
                  <DialogTitle id="calendar-task-modal-title" className="pr-8 text-lg font-semibold text-foreground">
                    {selectedTask.title}
                  </DialogTitle>
                  
                  <div className="space-y-0">
                    {(() => {
                      const clienteContato = getClienteContatoForTask(selectedTask, clientesContatos);
                      const designerNome =
                        clienteContato?.designer
                        || selectedTask.responsavel
                        || selectedTask.responsavelCliente
                        || selectedTask.designerResponsavel1
                        || 'Não informado';

                      return (
                        <>
                          <p className="text-sm font-medium text-muted-foreground">
                            Designer Responsável: <span className="text-foreground">{designerNome}</span>
                          </p>
                          {clienteContato?.copywriter ? (
                            <p className="text-sm font-medium text-muted-foreground">
                              Copywriter Dedicado: <span className="text-foreground">{clienteContato.copywriter}</span>
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                    <p className="hidden font-medium text-muted-foreground">
                      Cliente: <span className="text-foreground">{getTaskClient(selectedTask)}</span>
                    </p>
                    <p className="hidden font-medium text-muted-foreground">
                      Vencimento: <span className="text-foreground">{formatDateOnly(selectedTask.dataVencimento)}</span>
                    </p>
                    <p className="hidden font-medium text-muted-foreground">
                      Fase atual desde: <span className="text-foreground">{formatDateTime(selectedTask.dataNaFaseAtual)}</span>
                    </p>
                  </div>
                </DialogHeader>

                <div className="space-y-3 px-6 pb-5 pt-5">
                  {getTaskTagLabels(selectedTask).length > 0 ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {getTaskTagLabels(selectedTask).map((label) => (
                          <span
                            key={label}
                            className="inline-flex items-center rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-sm font-medium text-muted-foreground">
                    Cliente:{' '}
                    <span className="text-foreground">
                      {getClienteContatoForTask(selectedTask, clientesContatos)?.nome || getTaskClient(selectedTask)}
                    </span>
                  </p>
                  {selectedTask.calendario ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      Calendário: <span className="text-foreground">{selectedTask.calendario}</span>
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-muted-foreground">
                    Vencimento: <span className="text-foreground">{formatDateOnly(selectedTask.dataVencimento)}</span>
                  </p>
                  <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Histórico das fases
                    </p>
                    <div className="mt-3 space-y-2">
                      {getTaskHistorySteps(selectedTask).map((step) => (
                        <div key={`${step.label}-${step.value.toISOString()}`} className="flex items-start gap-2 text-sm">
                          <span className="mt-1 h-2 w-2 rounded-full bg-primary/80" />
                          <span className="text-muted-foreground">
                            {getTaskHistoryLabel(step)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedTask.linkDrive ? (
                    <div className="pt-2">
                      <a
                        href={selectedTask.linkDrive}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-primary/30 bg-primary/12 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/18"
                      >
                        Link do Drive
                      </a>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </section>
  );
}


