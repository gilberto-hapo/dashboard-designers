import { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchGoalfyStatisticsData,
  getCachedGoalfyStatisticsData,
  type GoalfyStatisticsPayload,
} from '@/lib/goalfy';
import { type AdjustmentEntry, type DesignTask } from '@/lib/data';
import type { DesignerInsight } from '@/lib/insights';
import { getHistoricalMonthProductionTarget } from '@/lib/statisticsTargets';
import { getMonthlyProductionTarget } from './ProductionRhythmPanel';

const MONTH_TARGET_STORAGE_KEY = 'hapo:statistics-month-target-snapshots:v2';

type MonthTargetSnapshots = {
  locked: Record<string, number>;
  drafts: Record<string, number>;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

export function getStatisticsCurrentMonth() {
  return monthKey(new Date());
}

export function getStatisticsMonthLabel(value: string, currentMonth = getStatisticsCurrentMonth()) {
  if (value === currentMonth) return 'Mês atual';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseMonthKey(value));
}

function previousMonthKey(value: string) {
  const date = parseMonthKey(value);
  date.setMonth(date.getMonth() - 1);
  return monthKey(date);
}

function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function normalizeMonthTarget(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function readMonthTargetSnapshots(): MonthTargetSnapshots {
  if (typeof window === 'undefined') {
    return { locked: {}, drafts: {} };
  }

  try {
    const raw = window.localStorage.getItem(MONTH_TARGET_STORAGE_KEY);
    if (!raw) return { locked: {}, drafts: {} };
    const parsed = JSON.parse(raw) as Partial<MonthTargetSnapshots>;

    return {
      locked: parsed.locked && typeof parsed.locked === 'object' ? parsed.locked : {},
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
    };
  } catch {
    return { locked: {}, drafts: {} };
  }
}

function writeMonthTargetSnapshots(snapshots: MonthTargetSnapshots) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(MONTH_TARGET_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Snapshot persistence is best-effort.
  }
}

function closePastMonthTargetSnapshots(snapshots: MonthTargetSnapshots, currentMonth: string) {
  let changed = false;
  const next: MonthTargetSnapshots = {
    locked: { ...snapshots.locked },
    drafts: { ...snapshots.drafts },
  };

  Object.entries(snapshots.drafts).forEach(([targetMonth, target]) => {
    if (compareMonthKeys(targetMonth, currentMonth) >= 0 || next.locked[targetMonth]) {
      return;
    }

    next.locked[targetMonth] = normalizeMonthTarget(target);
    changed = true;
  });

  return changed ? next : snapshots;
}

function getMonthEnd(value: string) {
  const monthDate = parseMonthKey(value);
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getStatisticsMonthOptions(_rawData: GoalfyStatisticsPayload | null) {
  const current = monthKey(new Date());
  const previous = previousMonthKey(current);
  const beforePrevious = previousMonthKey(previous);
  return [current, previous, beforePrevious];
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function countBusinessDays(start: Date, end: Date) {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);
  let total = 0;

  while (cursor <= limit) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function cycleDays(task: GoalfyStatisticsPayload['tasks'][number]) {
  if (!task.criadoEm || !task.concluidoEm) return null;
  if (task.concluidoEm < task.criadoEm) return null;
  return Math.max(1, countBusinessDays(task.criadoEm, task.concluidoEm));
}

function hasActiveProductionContract(task: GoalfyStatisticsPayload['tasks'][number]) {
  return (
    task.clienteAtivo === true
    && typeof task.clientePostsMes === 'number'
    && task.clientePostsMes > 0
  );
}

function productionCycleDays(task: GoalfyStatisticsPayload['tasks'][number]) {
  if (!task.entrouExecutandoEm || !task.entrouMontagemEm) return null;
  if (task.entrouMontagemEm < task.entrouExecutandoEm) return null;
  return Math.max(1, countBusinessDays(task.entrouExecutandoEm, task.entrouMontagemEm));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeLookupValue(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function buildTaskReferenceKey(client: string, title: string) {
  return `${normalizeLookupValue(client)}|${normalizeLookupValue(title)}`;
}

function normalizeMaterialType(value: string) {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return '';
  const normalizedLabel = normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  if (normalized === 'estatico') return 'Estático';
  if (normalized === 'video') return 'Vídeo';
  return normalizedLabel;
}

function getMaterialOrderWeight(tipo: string) {
  const normalized = normalizeLookupValue(tipo);
  if (normalized === 'estatico') return 0;
  if (normalized === 'video') return 1;
  if (normalized === 'carrossel') return 2;
  return 10;
}

function isOfficialProductionDesigner(name: string, availableDesigners: string[]) {
  const normalizedName = String(name || '').trim();
  return Boolean(normalizedName) && availableDesigners.includes(normalizedName);
}

function buildHistoricalResponsibleIndex(rawData: GoalfyStatisticsPayload, selectedMonth: string) {
  const monthEnd = getMonthEnd(selectedMonth);
  const responsibleByIdentifier = new Map<string, string>();
  const responsibleByTaskKey = new Map<string, string>();
  const officialDesigners = rawData.designers || [];

  rawData.adjustments
    .filter((adjustment) => Boolean(adjustment.criadoPor || adjustment.responsavel) && Boolean(adjustment.cliente))
    .sort((a, b) => {
      const aTime = a.criadoEm?.getTime() ?? 0;
      const bTime = b.criadoEm?.getTime() ?? 0;
      return aTime - bTime;
    })
    .forEach((adjustment) => {
      if (adjustment.criadoEm && adjustment.criadoEm > monthEnd) return;

      const identifierKey = normalizeLookupValue(adjustment.identificador);
      const taskKey = buildTaskReferenceKey(
        String(adjustment.cliente || ''),
        String(adjustment.tituloDemanda || adjustment.titulo || ''),
      );
      const responsible = String(adjustment.criadoPor || adjustment.responsavel || '').trim();
      if (!responsible || !isOfficialProductionDesigner(responsible, officialDesigners)) return;

      if (identifierKey) {
        responsibleByIdentifier.set(identifierKey, responsible);
      }
      if (!taskKey || taskKey === '|') return;
      responsibleByTaskKey.set(taskKey, responsible);
    });

  return {
    responsibleByIdentifier,
    responsibleByTaskKey,
  };
}

function resolveDesignerForTask(
  task: GoalfyStatisticsPayload['tasks'][number],
  _selectedMonth: string,
  responsibleIndex: ReturnType<typeof buildHistoricalResponsibleIndex>,
  availableDesigners: string[],
) {
  const identifierKey = normalizeLookupValue(task.id);
  const taskKey = buildTaskReferenceKey(String(task.parceiro || ''), String(task.title || ''));
  const historicalResponsible =
    responsibleIndex.responsibleByIdentifier.get(identifierKey)
    || responsibleIndex.responsibleByTaskKey.get(taskKey);
  if (historicalResponsible) return historicalResponsible;

  const fallbackResponsible = [
    task.responsavelCliente,
    task.designerResponsavel1,
    task.responsavel,
  ]
    .map((value) => String(value || '').trim())
    .find((value) => isOfficialProductionDesigner(value, availableDesigners));

  if (fallbackResponsible) return fallbackResponsible;
  return '';
}

function getTaskPrimaryProductionDesigner(task: DesignTask) {
  return String(task.responsavelCliente || task.designerResponsavel1 || task.responsavel || '')
    .split(/[;,/]+/)
    .map((value) => value.trim())
    .find((value) => Boolean(value) && value !== 'Sem designer') || '';
}

function formatCycleTime(value: number | null) {
  if (value === null) return 'sem base';
  if (value <= 1) return '1 dia útil';
  return `${value.toFixed(1)} dias úteis`;
}

function buildMonthSeries(rawData: GoalfyStatisticsPayload, selectedMonth: string, monthTarget: number) {
  const monthStart = parseMonthKey(selectedMonth);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const today = new Date();
  const isCurrentMonth = selectedMonth === monthKey(today);
  const effectiveEnd = isCurrentMonth ? today : monthEnd;
  const safeEffectiveEnd = effectiveEnd > monthEnd ? monthEnd : effectiveEnd;

  const completedInMonth = rawData.tasks.filter((task) => {
    if (!task.concluidoEm) return false;
    return monthKey(task.concluidoEm) === selectedMonth;
  });

  const completedByDay = new Map<string, number>();
  completedInMonth.forEach((task) => {
    if (!task.concluidoEm) return;
    const key = task.concluidoEm.toISOString().slice(0, 10);
    completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
  });

  const totalBusinessDays = countBusinessDays(monthStart, monthEnd);
  const elapsedBusinessDays = Math.max(1, countBusinessDays(monthStart, safeEffectiveEnd));
  const pace = completedInMonth.length / elapsedBusinessDays;
  const projectedClose = Math.round(pace * totalBusinessDays);
  const dailyTarget = totalBusinessDays > 0 ? monthTarget / totalBusinessDays : 0;

  const chartData: Array<{
    dateKey: string;
    label: string;
    fullLabel: string;
    actual: number | null;
    projected: number;
    target: number;
    isCurrentPoint: boolean;
  }> = [];

  const cursor = new Date(monthStart);
  let cumulativeActual = 0;
  let businessDayIndex = 0;
  let currentPointKey = '';

  while (cursor <= monthEnd) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      businessDayIndex += 1;
      const key = cursor.toISOString().slice(0, 10);
      const dayCompleted = completedByDay.get(key) ?? 0;
      const inVisibleActualWindow = cursor <= safeEffectiveEnd;

      if (inVisibleActualWindow) {
        cumulativeActual += dayCompleted;
        currentPointKey = key;
      }

      chartData.push({
        dateKey: key,
        label: formatShortDate(cursor),
        fullLabel: formatFullDate(cursor),
        actual: inVisibleActualWindow ? cumulativeActual : null,
        projected: Number((pace * businessDayIndex).toFixed(1)),
        target: Number((dailyTarget * businessDayIndex).toFixed(1)),
        isCurrentPoint: key === currentPointKey && inVisibleActualWindow,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const lastActualPoint = [...chartData].reverse().find((point) => point.actual !== null) ?? null;
  const previousMonth = previousMonthKey(selectedMonth);
  const previousCompleted = rawData.tasks.filter((task) => {
    if (!task.concluidoEm) return false;
    return monthKey(task.concluidoEm) === previousMonth;
  }).length;

  const comparison = completedInMonth.length - previousCompleted;

  return {
    completed: completedInMonth.length,
    pace,
    projectedClose,
    targetClose: monthTarget,
    comparison,
    chartData,
    currentPointKey: lastActualPoint?.dateKey ?? '',
    currentPointLabel: lastActualPoint?.fullLabel ?? '',
    currentPointActual: lastActualPoint?.actual ?? 0,
    currentPointProjected: lastActualPoint?.projected ?? 0,
  };
}

function formatDelta(value: number) {
  if (value === 0) return 'sem variação';
  return value > 0 ? `+${value}` : String(value);
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; dataKey?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const actual = payload.find((entry) => entry.dataKey === 'actual')?.value;
  const projected = payload.find((entry) => entry.dataKey === 'projected')?.value;
  const target = payload.find((entry) => entry.dataKey === 'target')?.value;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11131d]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Entregas acumuladas</span>
          <span className="text-sm font-semibold text-white">{actual ?? '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Projeção no ritmo atual</span>
          <span className="text-sm font-semibold text-[#8f7dff]">{projected ?? '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Meta acumulada</span>
          <span className="text-sm font-semibold text-[#f59e0b]">{target ?? '-'}</span>
        </div>
      </div>
    </div>
  );
}

function describeMetaPosition(projectedClose: number, targetClose: number) {
  const difference = projectedClose - targetClose;
  const tolerance = Math.max(6, Math.round(targetClose * 0.03));

  if (difference > tolerance) return 'acima da meta';
  if (difference < -tolerance) return 'com espaço para ganhar mais ritmo';
  return 'muito perto da meta';
}

function buildChartSummary(series: ReturnType<typeof buildMonthSeries>, selectedMonth: string) {
  const monthDate = parseMonthKey(selectedMonth);
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(monthDate);
  const relationToGoal = describeMetaPosition(series.projectedClose, series.targetClose);
  const isCurrentMonth = selectedMonth === getStatisticsCurrentMonth();

  if (isCurrentMonth) {
    if (relationToGoal === 'com espaço para ganhar mais ritmo') {
      return `Em ${monthLabel}, o mês soma ${series.completed} entregas e ainda pode ganhar mais ritmo até o fechamento.`;
    }

    return `Em ${monthLabel}, o mês soma ${series.completed} entregas e segue ${relationToGoal}.`;
  }

  if (relationToGoal === 'com espaço para ganhar mais ritmo') {
    return `Em ${monthLabel}, o mês fechou com ${series.completed} entregas e deixou espaço para acelerar no próximo ciclo.`;
  }

  return `Em ${monthLabel}, o mês fechou com ${series.completed} entregas e terminou ${relationToGoal}.`;
}

function buildSpeedInsights(rawData: GoalfyStatisticsPayload, selectedMonth: string) {
  const responsibleIndex = buildHistoricalResponsibleIndex(rawData, selectedMonth);
  const officialDesigners = rawData.designers || [];

  const completedInMonth = rawData.tasks.filter((task) => {
    if (!task.concluidoEm) return false;
    if (!hasActiveProductionContract(task)) return false;
    return monthKey(task.concluidoEm) === selectedMonth;
  });

  const completedWithCycle = completedInMonth
    .map((task) => ({
      task,
      cycle: cycleDays(task),
      designer: resolveDesignerForTask(task, selectedMonth, responsibleIndex, officialDesigners),
    }))
    .filter((item): item is {
      task: GoalfyStatisticsPayload['tasks'][number];
      cycle: number;
      designer: string;
    } => item.cycle !== null);

  const fastestDelivery = [...completedWithCycle]
    .sort((a, b) => a.cycle - b.cycle || a.task.dataVencimento.getTime() - b.task.dataVencimento.getTime())[0] ?? null;

  const byClient = new Map<string, number[]>();
  const byDesigner = new Map<string, number[]>();

  completedWithCycle.forEach(({ task, cycle, designer }) => {
    const clientKey = String(task.parceiro || '').trim();
    const designerKey = String(designer || '').trim();

    if (clientKey) {
      if (!byClient.has(clientKey)) byClient.set(clientKey, []);
      byClient.get(clientKey)?.push(cycle);
    }

    if (designerKey) {
      if (!byDesigner.has(designerKey)) byDesigner.set(designerKey, []);
      byDesigner.get(designerKey)?.push(cycle);
    }
  });

  const clientAverages = [...byClient.entries()]
    .map(([name, cycles]) => ({
      name,
      sample: cycles.length,
      average: average(cycles),
    }))
    .filter((item) => item.sample >= 3 && item.average !== null)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0) || b.sample - a.sample || a.name.localeCompare(b.name, 'pt-BR'));

  const designerAverages = [...byDesigner.entries()]
    .map(([name, cycles]) => ({
      name,
      sample: cycles.length,
      average: average(cycles),
    }))
    .filter((item) => item.sample >= 3 && item.average !== null)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0) || b.sample - a.sample || a.name.localeCompare(b.name, 'pt-BR'));

  const validationByClient = new Map<string, number[]>();
  const validationByDesigner = new Map<string, number[]>();
  completedInMonth.forEach((task) => {
    if (typeof task.tempoValidacaoDias !== 'number' || !Number.isFinite(task.tempoValidacaoDias)) return;
    const clientKey = String(task.parceiro || '').trim();
    const designerKey = resolveDesignerForTask(task, selectedMonth, responsibleIndex, officialDesigners);
    if (!clientKey) return;
    if (!validationByClient.has(clientKey)) validationByClient.set(clientKey, []);
    validationByClient.get(clientKey)?.push(Math.max(1, task.tempoValidacaoDias));
    if (designerKey) {
      if (!validationByDesigner.has(designerKey)) validationByDesigner.set(designerKey, []);
      validationByDesigner.get(designerKey)?.push(Math.max(1, task.tempoValidacaoDias));
    }
  });

  const validationAverages = [...validationByClient.entries()]
    .map(([name, values]) => ({
      name,
      sample: values.length,
      average: average(values),
    }))
    .filter((item) => item.sample >= 3 && item.average !== null)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0) || b.sample - a.sample || a.name.localeCompare(b.name, 'pt-BR'));

  const designerValidationAverages = [...validationByDesigner.entries()]
    .map(([name, values]) => ({
      name,
      sample: values.length,
      average: average(values),
    }))
    .filter((item) => item.sample >= 3 && item.average !== null)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0) || b.sample - a.sample || a.name.localeCompare(b.name, 'pt-BR'));

  const designerConsistency = [...byDesigner.entries()]
    .map(([name, cycles]) => {
      const avg = average(cycles);
      if (cycles.length < 3 || avg === null) return null;
      const variance = average(cycles.map((cycle) => Math.abs(cycle - avg)));
      return {
        name,
        sample: cycles.length,
        deviation: variance,
      };
    })
    .filter((item): item is { name: string; sample: number; deviation: number | null } => item !== null && item.deviation !== null)
    .sort((a, b) => (a.deviation ?? 0) - (b.deviation ?? 0));

  const adjustmentsInMonth = rawData.adjustments.filter((adjustment) => {
    if (!adjustment.criadoEm) return false;
    return monthKey(adjustment.criadoEm) === selectedMonth;
  });

  const adjustmentsByClient = new Map<string, number>();
  const adjustmentsByReason = new Map<string, number>();

  adjustmentsInMonth.forEach((adjustment) => {
    const clientKey = String(adjustment.cliente || '').trim();
    const reasonKey = String(adjustment.motivoAjuste || '').trim();

    if (clientKey) {
      adjustmentsByClient.set(clientKey, (adjustmentsByClient.get(clientKey) ?? 0) + 1);
    }

    if (reasonKey) {
      adjustmentsByReason.set(reasonKey, (adjustmentsByReason.get(reasonKey) ?? 0) + 1);
    }
  });

  const topAdjustmentClient = [...adjustmentsByClient.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null;

  const topAdjustmentReason = [...adjustmentsByReason.entries()]
    .map(([reason, total]) => ({ reason, total }))
    .sort((a, b) => b.total - a.total || a.reason.localeCompare(b.reason, 'pt-BR'))[0] ?? null;

  return {
    fastestDelivery,
    smoothestClient: clientAverages[0] ?? null,
    slowestClient: clientAverages[clientAverages.length - 1] ?? null,
    fastestDesigner: designerAverages[0] ?? null,
    fastestValidationClient: validationAverages[0] ?? null,
    fastestValidationDesigner: designerValidationAverages[0] ?? null,
    overallAverage: average(completedWithCycle.map((item) => item.cycle)),
  };
}

function buildPeriodHighlights(rawData: GoalfyStatisticsPayload, selectedMonth: string) {
  const responsibleIndex = buildHistoricalResponsibleIndex(rawData, selectedMonth);
  const officialDesigners = rawData.designers || [];

  const completedInMonth = rawData.tasks.filter((task) => {
    if (!task.concluidoEm) return false;
    return monthKey(task.concluidoEm) === selectedMonth;
  });

  const completedByDesigner = new Map<string, number>();
  const completedByClient = new Map<string, number>();

  completedInMonth.forEach((task) => {
    const clientKey = String(task.parceiro || '').trim();
    const designerKey = resolveDesignerForTask(task, selectedMonth, responsibleIndex, officialDesigners);

    if (designerKey) {
      completedByDesigner.set(designerKey, (completedByDesigner.get(designerKey) ?? 0) + 1);
    }

    if (clientKey) {
      completedByClient.set(clientKey, (completedByClient.get(clientKey) ?? 0) + 1);
    }
  });

  const adjustmentsInMonth = rawData.adjustments.filter((adjustment) => {
    if (!adjustment.criadoEm) return false;
    return monthKey(adjustment.criadoEm) === selectedMonth;
  });

  const adjustmentsByClient = new Map<string, number>();
  const adjustmentsByReason = new Map<string, number>();

  adjustmentsInMonth.forEach((adjustment) => {
    const clientKey = String(adjustment.cliente || '').trim();
    const reasonKey = String(adjustment.motivoAjuste || '').trim();

    if (clientKey) {
      adjustmentsByClient.set(clientKey, (adjustmentsByClient.get(clientKey) ?? 0) + 1);
    }

    if (reasonKey) {
      adjustmentsByReason.set(reasonKey, (adjustmentsByReason.get(reasonKey) ?? 0) + 1);
    }
  });

  return {
    topCompletedDesigner: [...completedByDesigner.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null,
    topCompletedClient: [...completedByClient.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null,
    topAdjustmentClient: [...adjustmentsByClient.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null,
    topAdjustmentReason: [...adjustmentsByReason.entries()]
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total || a.reason.localeCompare(b.reason, 'pt-BR'))[0] ?? null,
  };
}

function buildFrontHighlight(rawData: GoalfyStatisticsPayload, selectedMonth: string) {
  const today = new Date();
  const selectedMonthDate = parseMonthKey(selectedMonth);
  const selectedMonthEnd = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const referenceDate = selectedMonth === monthKey(today) ? today : selectedMonthEnd;
  const frontEnd = new Date(referenceDate);
  frontEnd.setDate(frontEnd.getDate() + 14);

  const frontTasks = rawData.tasks.filter((task) => (
    hasActiveProductionContract(task)
    && task.dataVencimento >= referenceDate
    && task.dataVencimento <= frontEnd
  ));

  const designerCounts = new Map<string, number>();

  frontTasks.forEach((task) => {
    const designerKey = getTaskPrimaryProductionDesigner(task);
    if (!designerKey) return;
    designerCounts.set(designerKey, (designerCounts.get(designerKey) ?? 0) + 1);
  });

  const topDesigner = [...designerCounts.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null;

  return topDesigner
    ? {
        nome: topDesigner.name,
        frente: {
          totalProximas2Semanas: topDesigner.total,
        },
      }
    : null;
}

function buildCurrentFrontHighlight(designers: DesignerInsight[]) {
  const topDesigner = [...designers]
    .filter((designer) => designer.frente.totalProximas2Semanas > 0)
    .sort((a, b) => (
      b.frente.concluidasAdiantado - a.frente.concluidasAdiantado
      || b.frente.percentual - a.frente.percentual
      || b.frente.totalProximas2Semanas - a.frente.totalProximas2Semanas
      || a.nome.localeCompare(b.nome, 'pt-BR')
    ))[0] ?? null;

  return topDesigner
    ? {
        nome: topDesigner.nome,
        frente: {
          totalProximas2Semanas: topDesigner.frente.totalProximas2Semanas,
          concluidasAdiantado: topDesigner.frente.concluidasAdiantado,
        },
      }
    : null;
}

function buildProducedMaterialsByType(rawData: GoalfyStatisticsPayload, selectedMonth: string) {
  const responsibleIndex = buildHistoricalResponsibleIndex(rawData, selectedMonth);
  const officialDesigners = rawData.designers || [];
  const tasksConcludedInMonth = rawData.tasks.filter((task) => (
    task.concluidoEm && monthKey(task.concluidoEm) === selectedMonth
  ));

  const taskByIdentifier = new Map<string, GoalfyStatisticsPayload['tasks'][number]>();
  const taskByClientAndTitle = new Map<string, GoalfyStatisticsPayload['tasks'][number]>();
  tasksConcludedInMonth.forEach((task) => {
    const identifierKey = normalizeLookupValue(task.id);
    if (identifierKey) {
      taskByIdentifier.set(identifierKey, task);
    }

    const taskKey = buildTaskReferenceKey(String(task.parceiro || ''), String(task.title || ''));
    if (taskKey !== '|' && !taskByClientAndTitle.has(taskKey)) {
      taskByClientAndTitle.set(taskKey, task);
    }
  });

  const designerMaterialMap = new Map<
    string,
    Map<string, { quantity: number; cycleTimes: number[]; matchedKeys: Set<string> }>
  >();
  rawData.adjustments
    .filter((adjustment) => adjustment.criadoEm && monthKey(adjustment.criadoEm) === selectedMonth)
    .forEach((adjustment) => {
      const tipo = normalizeMaterialType(adjustment.tipoEntrega);
      if (!tipo || normalizeLookupValue(tipo) === 'ajuste') return;

      const identifierKey = normalizeLookupValue(adjustment.identificador || adjustment.id || '');
      const byIdentifier = identifierKey ? taskByIdentifier.get(identifierKey) : null;
      const fallbackKey = buildTaskReferenceKey(
        String(adjustment.cliente || ''),
        String(adjustment.tituloDemanda || adjustment.titulo || ''),
      );
      const matchedTask = byIdentifier || taskByClientAndTitle.get(fallbackKey) || null;
      if (!matchedTask) return;
      const designer = resolveDesignerForTask(matchedTask, selectedMonth, responsibleIndex, officialDesigners);
      if (!designer) return;

      if (!designerMaterialMap.has(designer)) {
        designerMaterialMap.set(designer, new Map());
      }
      const materialsForDesigner = designerMaterialMap.get(designer)!;
      if (!materialsForDesigner.has(tipo)) {
        materialsForDesigner.set(tipo, { quantity: 0, cycleTimes: [], matchedKeys: new Set<string>() });
      }

      const entry = materialsForDesigner.get(tipo)!;
      const taskUniqueKey = normalizeLookupValue(matchedTask.id) || fallbackKey;
      if (entry.matchedKeys.has(taskUniqueKey)) return;

      entry.matchedKeys.add(taskUniqueKey);
      entry.quantity += 1;
      const cycle = productionCycleDays(matchedTask);
      if (cycle !== null) {
        entry.cycleTimes.push(cycle);
      }
    });

  const materialDesignerMap = new Map<
    string,
    Array<{
      designer: string;
      quantidade: number;
      tempoMedioDias: number | null;
    }>
  >();

  [...designerMaterialMap.entries()].forEach(([designer, materials]) => {
    [...materials.entries()].forEach(([tipo, entry]) => {
      if (!materialDesignerMap.has(tipo)) {
        materialDesignerMap.set(tipo, []);
      }

      materialDesignerMap.get(tipo)?.push({
        designer,
        quantidade: entry.quantity,
        tempoMedioDias: average(entry.cycleTimes),
      });
    });
  });

  return [...materialDesignerMap.entries()]
    .map(([tipo, designers]) => {
      const teamAverage = average(
        designers
          .map((item) => item.tempoMedioDias)
          .filter((value): value is number => value !== null),
      );

      return {
        tipo,
        designers: [...designers].sort((a, b) => {
          const aValue = a.tempoMedioDias ?? Number.POSITIVE_INFINITY;
          const bValue = b.tempoMedioDias ?? Number.POSITIVE_INFINITY;
          if (aValue !== bValue) return aValue - bValue;
          return a.designer.localeCompare(b.designer, 'pt-BR');
        }),
        teamAverage,
        total: designers.reduce((sum, item) => sum + item.quantidade, 0),
      };
    })
    .sort((a, b) => {
      const weightDiff = getMaterialOrderWeight(a.tipo) - getMaterialOrderWeight(b.tipo);
      if (weightDiff !== 0) return weightDiff;
      return b.total - a.total || a.tipo.localeCompare(b.tipo, 'pt-BR');
    });
}

type StatisticsPanelProps = {
  selectedMonth: string;
  dataVersion: number;
  tasks: DesignTask[];
  designers: string[];
  designerFronts?: DesignerInsight[];
  adjustments: AdjustmentEntry[];
};

export function StatisticsPanel({
  selectedMonth,
  dataVersion,
  tasks,
  designers,
  designerFronts = [],
  adjustments,
}: StatisticsPanelProps) {
  const [rawData, setRawData] = useState<GoalfyStatisticsPayload | null>(null);
  const [isStatisticsLoading, setIsStatisticsLoading] = useState(true);
  const [monthTargetSnapshots, setMonthTargetSnapshots] = useState<MonthTargetSnapshots>(() => (
    readMonthTargetSnapshots()
  ));
  const dashboardRawData = useMemo<GoalfyStatisticsPayload>(() => ({
    tasks,
    designers,
    adjustments,
  }), [tasks, designers, adjustments]);

  useEffect(() => {
    let isActive = true;

    const loadStatisticsData = async () => {
      const hasDashboardData = dashboardRawData.tasks.length > 0;

      if (hasDashboardData && isActive) {
        setRawData(dashboardRawData);
        setIsStatisticsLoading(false);
      } else if (!rawData) {
        setIsStatisticsLoading(true);
      }

      try {
        const fetched = await fetchGoalfyStatisticsData();
        if (isActive) {
          setRawData(fetched);
          setIsStatisticsLoading(false);
        }
      } catch {
        const cached = await getCachedGoalfyStatisticsData();

        if (cached && isActive && !hasDashboardData) {
          setRawData(cached.data);
        }

        if (isActive) {
          setIsStatisticsLoading(false);
        }
      }
    };

    void loadStatisticsData();

    return () => {
      isActive = false;
    };
  }, [dashboardRawData, dataVersion]);

  const dynamicMonthTarget = useMemo(() => {
    const target = getMonthlyProductionTarget(rawData?.tasks ?? []);
    return normalizeMonthTarget(target);
  }, [rawData]);

  const currentStatisticsMonth = useMemo(() => getStatisticsCurrentMonth(), []);

  const historicalSelectedMonthTarget = useMemo(() => {
    if (!rawData || compareMonthKeys(selectedMonth, currentStatisticsMonth) >= 0) {
      return null;
    }

    return getHistoricalMonthProductionTarget(rawData.tasks, selectedMonth);
  }, [currentStatisticsMonth, rawData, selectedMonth]);

  useEffect(() => {
    if (!rawData) return;

    setMonthTargetSnapshots((current) => {
      const closedSnapshots = closePastMonthTargetSnapshots(current, currentStatisticsMonth);
      const next: MonthTargetSnapshots = {
        locked: { ...closedSnapshots.locked },
        drafts: { ...closedSnapshots.drafts },
      };

      next.drafts[currentStatisticsMonth] = dynamicMonthTarget;

      if (
        selectedMonth !== currentStatisticsMonth
        && compareMonthKeys(selectedMonth, currentStatisticsMonth) < 0
        && !next.locked[selectedMonth]
      ) {
        next.locked[selectedMonth] = normalizeMonthTarget(
          next.drafts[selectedMonth] ?? historicalSelectedMonthTarget ?? dynamicMonthTarget,
        );
      }

      const unchanged = JSON.stringify(current) === JSON.stringify(next);
      if (unchanged) return current;

      writeMonthTargetSnapshots(next);
      return next;
    });
  }, [currentStatisticsMonth, dynamicMonthTarget, historicalSelectedMonthTarget, rawData, selectedMonth]);

  const monthTarget = useMemo(() => {
    if (selectedMonth === currentStatisticsMonth) {
      return dynamicMonthTarget;
    }

    if (compareMonthKeys(selectedMonth, currentStatisticsMonth) < 0) {
      return normalizeMonthTarget(
        monthTargetSnapshots.locked[selectedMonth]
          ?? monthTargetSnapshots.drafts[selectedMonth]
          ?? historicalSelectedMonthTarget
          ?? dynamicMonthTarget,
      );
    }

    return dynamicMonthTarget;
  }, [currentStatisticsMonth, dynamicMonthTarget, historicalSelectedMonthTarget, monthTargetSnapshots, selectedMonth]);

  const series = useMemo(() => {
    if (!rawData) return null;
    return buildMonthSeries(rawData, selectedMonth, monthTarget);
  }, [rawData, selectedMonth, monthTarget]);
  const speedInsights = useMemo(() => {
    if (!rawData) return null;
    return buildSpeedInsights(rawData, selectedMonth);
  }, [rawData, selectedMonth]);
  const periodHighlights = useMemo(() => {
    if (!rawData) return null;
    return buildPeriodHighlights(rawData, selectedMonth);
  }, [rawData, selectedMonth]);
  const frontHighlight = useMemo(() => {
    if (!rawData) return null;
    if (selectedMonth === currentStatisticsMonth && designerFronts.length > 0) {
      return buildCurrentFrontHighlight(designerFronts);
    }
    return buildFrontHighlight(rawData, selectedMonth);
  }, [currentStatisticsMonth, designerFronts, rawData, selectedMonth]);
  const chartSummary = useMemo(() => {
    if (!series) return 'Ritmo de entregas do mês';
    return buildChartSummary(series, selectedMonth);
  }, [selectedMonth, series]);
  const projectionRelation = useMemo(() => {
    if (!series) return 'muito perto da meta';
    return describeMetaPosition(series.projectedClose, series.targetClose);
  }, [series]);
  const ProjectionIcon = useMemo(() => {
    if (projectionRelation === 'acima da meta') return TrendingUp;
    if (projectionRelation === 'com espaço para ganhar mais ritmo') return TrendingDown;
    return Minus;
  }, [projectionRelation]);

  if (isStatisticsLoading) {
    return (
      <section className="rounded-[28px] border border-border/60 bg-card/70 p-8">
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Montando o ritmo do período...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!series) {
    return (
      <section className="rounded-[28px] border border-border/60 bg-card/70 p-8">
        <p className="text-sm text-muted-foreground">
          Ainda não foi possível montar a leitura de entregas deste período.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0f1118] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] md:p-8 xl:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,84,255,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.10),transparent_30%)]" />
        <div className="relative space-y-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-[#8f7dff]" />
                Ritmo de Entregas do Período
              </div>
              <div className="space-y-3">
                <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-tight text-white md:text-[2.2rem] xl:text-[2.35rem]">
                  {chartSummary}
                </h2>
              </div>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Entregas</p>
                <p className="mt-3 text-3xl font-semibold text-white">{series.completed}</p>
                <p className="mt-2 text-xs text-slate-400">Total concluído no recorte.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Média/dia</p>
                <p className="mt-3 text-3xl font-semibold text-white">{series.pace.toFixed(1)}</p>
                <p className="mt-2 text-xs text-slate-400">Média por dia útil.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Projeção</p>
                <p className="mt-3 flex items-center gap-2 text-3xl font-semibold text-white">
                  {series.projectedClose}
                  <ProjectionIcon className="h-5 w-5 text-[#8f7dff]" />
                </p>
                <p className="mt-2 text-xs text-slate-400">Meta: {series.targetClose}.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[#121521]/75 p-4 md:p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-white">Como o mês está caminhando</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDelta(series.comparison)} em relação ao mês anterior. Último ponto visível: {series.currentPointLabel || 'sem data'}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  Entregas acumuladas
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#8f7dff]" />
                  Projeção no ritmo atual
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                  Meta acumulada
                </span>
              </div>
            </div>

            <div className="h-[360px] w-full md:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.chartData} margin={{ top: 12, right: 12, left: -14, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(143,125,255,0.2)', strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#f8fafc"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#ffffff', stroke: '#0f1118', strokeWidth: 2 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke="#8f7dff"
                    strokeWidth={2.5}
                    strokeDasharray="6 6"
                    dot={false}
                    activeDot={{ r: 4, fill: '#8f7dff', stroke: '#0f1118', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#f59e0b"
                    strokeWidth={1.75}
                    strokeDasharray="3 5"
                    dot={false}
                    activeDot={{ r: 4, fill: '#f59e0b', stroke: '#0f1118', strokeWidth: 2 }}
                  />
                  {series.currentPointKey ? (
                    <ReferenceDot
                      x={series.chartData.find((point) => point.dateKey === series.currentPointKey)?.label}
                      y={series.currentPointActual}
                      r={4}
                      fill="#ffffff"
                      stroke="#8f7dff"
                      strokeWidth={2}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {speedInsights ? (
        <section className="rounded-[32px] border border-border/60 bg-card/80 p-6 md:p-8 xl:p-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Velocidade do fluxo
            </p>
            <h3 className="text-2xl font-semibold leading-tight text-foreground md:text-[2rem]">
              Onde o mês correu mais leve e onde ele pediu mais tempo.
            </h3>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.fastestDelivery
                          ? formatCycleTime(speedInsights.fastestDelivery.cycle).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.fastestDelivery
                          ? formatCycleTime(speedInsights.fastestDelivery.cycle).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    Entrega relâmpago
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.fastestDelivery?.task.title || 'Sem destaque claro neste recorte'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.fastestDelivery
                      ? `${speedInsights.fastestDelivery.task.parceiro} teve a entrega mais rápida do período, concluída por ${speedInsights.fastestDelivery.designer} em ${formatCycleTime(speedInsights.fastestDelivery.cycle)}.`
                      : 'Ainda não houve base suficiente para destacar uma entrega mais ágil.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.smoothestClient
                          ? formatCycleTime(speedInsights.smoothestClient.average).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.smoothestClient
                          ? formatCycleTime(speedInsights.smoothestClient.average).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                    Entrega mais rápida
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.smoothestClient?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.smoothestClient
                      ? `Foi a empresa com o menor tempo médio de entrega no período, em ${formatCycleTime(speedInsights.smoothestClient.average)}.`
                      : 'Este recorte ainda não teve volume suficiente para apontar a empresa com entregas mais rápidas.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.slowestClient
                          ? formatCycleTime(speedInsights.slowestClient.average).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.slowestClient
                          ? formatCycleTime(speedInsights.slowestClient.average).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Entrega mais demorada
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.slowestClient?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.slowestClient
                      ? `Foi a empresa com o maior tempo médio de entrega no período, em ${formatCycleTime(speedInsights.slowestClient.average)}.`
                      : 'Ainda não há amostra suficiente para apontar a empresa com entregas mais demoradas.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.fastestDesigner
                          ? formatCycleTime(speedInsights.fastestDesigner.average).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.fastestDesigner
                          ? formatCycleTime(speedInsights.fastestDesigner.average).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                    Designer mais ágil
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.fastestDesigner?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.fastestDesigner
                      ? `Foi quem entregou mais rápido neste período, com média de ${formatCycleTime(speedInsights.fastestDesigner.average)} por entrega.`
                      : 'Ainda não há volume suficiente para comparar o tempo de entrega entre designers neste período.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.fastestValidationClient
                          ? formatCycleTime(speedInsights.fastestValidationClient.average).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.fastestValidationClient
                          ? formatCycleTime(speedInsights.fastestValidationClient.average).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Validação mais ágil
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.fastestValidationClient?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.fastestValidationClient
                      ? `Foi a empresa com aprovação mais rápida no período, em média ${formatCycleTime(speedInsights.fastestValidationClient.average)}.`
                      : 'Ainda não há base suficiente para comparar o tempo de aprovação entre empresas.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-5">
              <div className="grid min-h-[148px] grid-cols-[120px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {speedInsights.fastestValidationDesigner
                          ? formatCycleTime(speedInsights.fastestValidationDesigner.average).split(' ')[0]
                          : '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        {speedInsights.fastestValidationDesigner
                          ? formatCycleTime(speedInsights.fastestValidationDesigner.average).split(' ').slice(1).join(' ')
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                    Aprovação mais rápida
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {speedInsights.fastestValidationDesigner?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {speedInsights.fastestValidationDesigner
                      ? `Foi quem teve o menor tempo médio de aprovação neste período, em ${formatCycleTime(speedInsights.fastestValidationDesigner.average)}.`
                      : 'Ainda não há base suficiente para comparar o tempo de aprovação entre designers.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="hidden rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                Cliente com mais ajustes
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {periodHighlights?.topAdjustmentClient?.name || 'Sem base suficiente'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {periodHighlights?.topAdjustmentClient
                  ? `Foi a empresa com mais ajustes registrados neste período, com ${periodHighlights.topAdjustmentClient.total} ${periodHighlights.topAdjustmentClient.total === 1 ? 'ajuste' : 'ajustes'}.`
                  : 'Ainda não há ajustes suficientes neste recorte para destacar uma empresa.'}
              </p>
            </article>

            <article className="hidden rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                Ajuste mais comum
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {periodHighlights?.topAdjustmentReason?.reason || 'Sem base suficiente'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {periodHighlights?.topAdjustmentReason
                  ? `Foi o motivo que mais apareceu nos ajustes do período, com ${periodHighlights.topAdjustmentReason.total} ${periodHighlights.topAdjustmentReason.total === 1 ? 'registro' : 'registros'}.`
                  : 'Ainda não há registros suficientes para apontar o motivo de ajuste mais frequente.'}
              </p>
            </article>
          </div>
        </section>
      ) : null}

      {periodHighlights ? (
        <section className="rounded-[32px] border border-border/60 bg-card/80 p-6 md:p-8 xl:p-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Destaques do período
            </p>
            <h3 className="text-2xl font-semibold leading-tight text-foreground md:text-[2rem]">
              Quem mais puxou o mês e o que mais marcou este recorte.
            </h3>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="h-full rounded-[28px] border border-primary/20 bg-primary/5 p-5 xl:row-span-2">
              <div className="grid h-full min-h-[180px] grid-cols-[148px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-4xl font-semibold text-foreground md:text-5xl">
                        {periodHighlights.topCompletedDesigner?.total ?? '--'}
                      </span>
                      <span className="mt-2 text-sm font-medium text-muted-foreground/85">
                        entregas
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-full flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Quem mais puxou o mês
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground md:text-4xl">
                    {periodHighlights.topCompletedDesigner?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-4 max-w-xl text-sm text-muted-foreground">
                    {periodHighlights.topCompletedDesigner
                      ? `Foi quem mais concluiu entregas neste período, com ${periodHighlights.topCompletedDesigner.total} ${periodHighlights.topCompletedDesigner.total === 1 ? 'entrega finalizada' : 'entregas finalizadas'}.`
                      : 'Ainda não há volume suficiente neste recorte para destacar quem mais concluiu entregas.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-orange-400/20 bg-orange-400/5 p-5">
              <div className="grid h-full min-h-[148px] grid-cols-[132px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {periodHighlights.topAdjustmentClient?.total ?? '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        ajustes
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-full flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                    Conta com mais ajustes
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {periodHighlights.topAdjustmentClient?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {periodHighlights.topAdjustmentClient
                      ? `Foi a empresa com mais ajustes registrados neste período, com ${periodHighlights.topAdjustmentClient.total} ${periodHighlights.topAdjustmentClient.total === 1 ? 'ajuste' : 'ajustes'}.`
                      : 'Ainda não há ajustes suficientes neste recorte para destacar uma empresa.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
              <div className="grid h-full min-h-[148px] grid-cols-[132px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {periodHighlights.topCompletedClient?.total ?? '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        entregas
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-full flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                    Conta com mais entregas
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {periodHighlights.topCompletedClient?.name || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {periodHighlights.topCompletedClient
                      ? `Foi a empresa com mais entregas concluídas neste período, somando ${periodHighlights.topCompletedClient.total} ${periodHighlights.topCompletedClient.total === 1 ? 'entrega' : 'entregas'}.`
                      : 'Ainda não há volume suficiente neste recorte para destacar uma conta.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-5">
              <div className="grid h-full min-h-[148px] grid-cols-[132px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {periodHighlights.topAdjustmentReason?.total ?? '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        registros
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-full flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                    Ajuste mais comum
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {periodHighlights.topAdjustmentReason?.reason || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {periodHighlights.topAdjustmentReason
                      ? `Foi o motivo de ajuste que mais apareceu neste período, com ${periodHighlights.topAdjustmentReason.total} ${periodHighlights.topAdjustmentReason.total === 1 ? 'registro' : 'registros'}.`
                      : 'Ainda não há base suficiente para destacar o motivo de ajuste mais comum.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5">
              <div className="grid h-full min-h-[148px] grid-cols-[132px_1fr] gap-5">
                <div className="flex h-full">
                  <div className="flex h-full min-h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span className="text-3xl font-semibold text-foreground">
                        {frontHighlight?.frente.totalProximas2Semanas ?? '--'}
                      </span>
                      <span className="mt-1 text-sm font-medium text-muted-foreground/85">
                        entregas
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-full flex-col justify-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                    Maior frente hoje
                  </p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {frontHighlight?.nome || 'Sem base suficiente'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {frontHighlight
                      ? `É quem está com mais entregas na frente dos próximos 14 dias, somando ${frontHighlight.frente.totalProximas2Semanas} entregas previstas.`
                      : 'Ainda não há base suficiente para destacar quem está com a maior frente neste momento.'}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>
      ) : null}


    </section>
  );
}
