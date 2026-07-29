import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import { type DesignTask } from '@/lib/data';

type CardStatus = 'past' | 'current' | 'future' | 'month';

type RhythmCard = {
  key: string;
  label: string;
  actual: number;
  target: number;
  adherence: number | null;
  status: CardStatus;
  valueLabel: string;
  statusLabel: string;
  isFrozen?: boolean;
};

type CardTone = {
  accent: string;
  badge: string;
  panelClass: string;
  icon: typeof Gauge;
  fillColor: string;
  solidColor: string;
};

type FrozenWeekSnapshot = {
  actual: number;
  target: number;
  adherence: number | null;
  valueLabel: string;
};

const WEEK_SNAPSHOT_STORAGE_KEY = 'hapo:production-rhythm-month-period-snapshots:v1';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getEasterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month, day);
}

function isNationalHoliday(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixedHolidayKeys = new Set([
    '1-1',
    '4-21',
    '5-1',
    '9-7',
    '10-12',
    '11-2',
    '11-15',
    '11-20',
    '12-25',
  ]);

  if (fixedHolidayKeys.has(`${month}-${day}`)) return true;

  const goodFriday = addDays(getEasterDate(date.getFullYear()), -2);
  return getDateKey(date) === getDateKey(goodFriday);
}

function isWorkingDay(date: Date) {
  return isBusinessDay(date) && !isNationalHoliday(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function normalizeClientKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildMonthlyContractMap(tasks: DesignTask[]) {
  const contractMap = new Map<string, number>();

  tasks.forEach((task) => {
    const clientName = String(task.parceiro || task.clienteRelacionado || '').trim();
    const clientKey = normalizeClientKey(clientName);
    const postsMes = task.clientePostsMes;

    if (!clientKey || task.clienteAtivo !== true || typeof postsMes !== 'number' || postsMes <= 0) {
      return;
    }

    if (!contractMap.has(clientKey)) {
      contractMap.set(clientKey, postsMes);
    }
  });

  return contractMap;
}

function getMonthlyContractTotal(tasks: DesignTask[]) {
  return [...buildMonthlyContractMap(tasks).values()].reduce((sum, value) => sum + value, 0);
}

export function getMonthlyProductionTarget(tasks: DesignTask[]) {
  return Math.round(getMonthlyContractTotal(tasks) * 1.5);
}

const MONTH_PERIOD_COUNT = 4;

type MonthPeriodRange = {
  periodStart: Date;
  periodEnd: Date;
  periodDates: Date[];
};

function countWorkingDaysInMonth(year: number, month: number) {
  const cursor = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  let total = 0;

  while (cursor <= end) {
    if (isWorkingDay(cursor)) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function distributeTargetsByWorkingDays(monthlyTarget: number, periodRanges: MonthPeriodRange[]) {
  const exactTargets = periodRanges.map((range) => (
    range.periodDates.reduce((sum, date) => {
      const workingDaysInMonth = countWorkingDaysInMonth(date.getFullYear(), date.getMonth()) || 1;
      return sum + (monthlyTarget / workingDaysInMonth);
    }, 0)
  ));

  const floors = exactTargets.map((target) => Math.floor(target));
  const targetSum = Math.round(exactTargets.reduce((sum, target) => sum + target, 0));
  const remaining = targetSum - floors.reduce((sum, target) => sum + target, 0);
  const indexesByRemainder = exactTargets
    .map((target, index) => ({ index, remainder: target - Math.floor(target) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  return floors.map((target, index) => (
    indexesByRemainder.slice(0, remaining).some((item) => item.index === index)
      ? target + 1
      : target
  ));
}

function chunkDatesEvenly(dates: Date[], chunkCount: number) {
  if (chunkCount <= 0) return [];

  const baseSize = Math.floor(dates.length / chunkCount);
  const remaining = dates.length - (baseSize * chunkCount);
  let cursor = 0;

  return Array.from({ length: chunkCount }, (_, index) => {
    const chunkSize = baseSize + (index < remaining ? 1 : 0);
    const chunk = dates.slice(cursor, cursor + chunkSize);
    cursor += chunkSize;
    return chunk;
  });
}

function getMonthPeriodRanges(referenceDate: Date) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const workingDates: Date[] = [];

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    if (isWorkingDay(date)) workingDates.push(date);
  }

  return chunkDatesEvenly(workingDates, MONTH_PERIOD_COUNT).map((periodDates) => {
    return {
      periodStart: periodDates[0] ?? monthStart,
      periodEnd: periodDates[periodDates.length - 1] ?? lastDay,
      periodDates,
    };
  });
}

function getCardTone(status: CardStatus, adherence: number | null): CardTone {
  if (status === 'month') {
    return {
      accent: 'text-white',
      badge: '',
      panelClass: 'border-emerald-900/40 bg-transparent',
      icon: Gauge,
      fillColor: 'rgba(22, 163, 74, 0.10)',
      solidColor: 'rgb(22, 163, 74)',
    };
  }

  if (status === 'future') {
    return {
      accent: 'text-foreground',
      badge: 'Aguardando dados',
      panelClass: 'border-border bg-muted/20',
      icon: CalendarRange,
      fillColor: 'rgba(71, 85, 105, 0.10)',
      solidColor: 'rgb(71, 85, 105)',
    };
  }

  if (adherence !== null && adherence >= 100) {
    return {
      accent: 'text-success',
      badge: 'Meta batida',
      panelClass: 'border-success/25 bg-success/10',
      icon: TrendingUp,
      fillColor: 'rgba(22, 163, 74, 0.12)',
      solidColor: 'rgb(22, 163, 74)',
    };
  }

  if (adherence !== null && adherence >= 80) {
    return {
      accent: 'text-warning',
      badge: 'Quase l\u00e1',
      panelClass: 'border-warning/25 bg-warning/10',
      icon: TrendingUp,
      fillColor: 'rgba(245, 158, 11, 0.12)',
      solidColor: 'rgb(245, 158, 11)',
    };
  }

  return {
    accent: 'text-destructive',
    badge: 'Abaixo do alvo',
    panelClass: 'border-destructive/20 bg-destructive/10',
    icon: TrendingDown,
    fillColor: 'rgba(239, 68, 68, 0.10)',
    solidColor: 'rgb(239, 68, 68)',
  };
}

function buildRhythmCards(tasks: DesignTask[]) {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStart = new Date(year, month, 1);
  const totalTarget = getMonthlyProductionTarget(tasks);
  const periodRanges = getMonthPeriodRanges(today);
  const periodTargets = distributeTargetsByWorkingDays(totalTarget, periodRanges);

  const weekCards: RhythmCard[] = periodRanges.map(({ periodStart, periodEnd }, index) => {
    const periodTarget = periodTargets[index] ?? 0;
    const actual = tasks.filter((task) => {
      if (!task.concluidoEm) return false;
      const concludedAt = startOfDay(task.concluidoEm);
      return concludedAt >= periodStart && concludedAt <= periodEnd;
    }).length;

    const hasStarted = today >= periodStart;
    const hasEnded = today > periodEnd;
    const status: CardStatus = hasEnded ? 'past' : hasStarted ? 'current' : 'future';
    const adherence = status === 'future' ? null : (periodTarget > 0 ? Math.round((actual / periodTarget) * 100) : 0);

    let valueLabel = '';
    let statusLabel = '';

    if (status === 'future') {
      valueLabel = '0';
      statusLabel = 'Prev.';
    } else if (status === 'current') {
      valueLabel = `${adherence ?? 0}%`;
      statusLabel = 'Em andamento';
    } else {
      valueLabel = `${adherence ?? 0}%`;
      statusLabel = `Per\u00edodo ${index + 1}`;
    }

    return {
      key: periodStart.toISOString().slice(0, 10),
      label: `${formatDate(periodStart)} a ${formatDate(periodEnd)}`,
      actual,
      target: periodTarget,
      adherence,
      status,
      valueLabel,
      statusLabel,
    };
  });

  const monthActual = tasks.filter((task) => {
    if (!task.concluidoEm) return false;
    const concludedAt = startOfDay(task.concluidoEm);
    return concludedAt >= monthStart && concludedAt <= today;
  }).length;
  const monthAdherence = totalTarget > 0 ? Math.round((monthActual / totalTarget) * 100) : 0;

  const monthCard: RhythmCard = {
    key: 'month-total',
    label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(today),
    actual: monthActual,
    target: totalTarget,
    adherence: monthAdherence,
    status: 'month',
    valueLabel: `${monthAdherence}%`,
    statusLabel: 'Resumo do m\u00eas',
  };

  return {
    weekCards,
    monthCard,
  };
}

function readWeekSnapshots() {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(WEEK_SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FrozenWeekSnapshot>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWeekSnapshots(snapshots: Record<string, FrozenWeekSnapshot>) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(WEEK_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Local persistence is best-effort.
  }
}

function applyFrozenSnapshot(card: RhythmCard, snapshot: FrozenWeekSnapshot | undefined): RhythmCard {
  if (card.status !== 'past' || !snapshot) return card;

  const adherence = card.target > 0 ? Math.round((snapshot.actual / card.target) * 100) : 0;

  return {
    ...card,
    actual: snapshot.actual,
    adherence,
    valueLabel: `${adherence}%`,
    isFrozen: true,
  };
}

export function ProductionRhythmPanel({ tasks }: { tasks: DesignTask[] }) {
  const { weekCards, monthCard } = useMemo(() => buildRhythmCards(tasks), [tasks]);
  const [weekSnapshots, setWeekSnapshots] = useState<Record<string, FrozenWeekSnapshot>>(() => readWeekSnapshots());
  const displayedWeekCards = useMemo(
    () => weekCards.map((card) => applyFrozenSnapshot(card, weekSnapshots[card.key])),
    [weekCards, weekSnapshots],
  );
  const currentWeek = displayedWeekCards.find((card) => card.status === 'current') ?? null;

  useEffect(() => {
    const closedWeeks = weekCards.filter((card) => card.status === 'past');
    if (closedWeeks.length === 0) return;

    let changed = false;
    const nextSnapshots = { ...weekSnapshots };

    closedWeeks.forEach((card) => {
      if (nextSnapshots[card.key]) return;

      nextSnapshots[card.key] = {
        actual: card.actual,
        target: card.target,
        adherence: card.adherence,
        valueLabel: card.valueLabel,
      };
      changed = true;
    });

    if (!changed) return;
    setWeekSnapshots(nextSnapshots);
    writeWeekSnapshots(nextSnapshots);
  }, [weekCards, weekSnapshots]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Gauge className="h-4 w-4 text-primary" />
            {'Ritmo de produ\u00e7\u00e3o'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {'Mostra quantas entregas foram conclu\u00eddas em cada per\u00edodo do m\u00eas, comparadas com a meta esperada de conclus\u00f5es.'}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{'M\u00eas conclu\u00eddo / meta: '}<span className="font-semibold text-foreground">{monthCard.actual} / {monthCard.target}</span></span>
            {currentWeek ? (
              <span>{'Per\u00edodo atual conclu\u00eddo / meta: '}<span className="font-semibold text-foreground">{currentWeek.actual} / {currentWeek.target}</span></span>
            ) : null}
          </div>
        </div>

        <div className="inline-flex rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-muted-foreground">
          <CalendarRange className="mr-2 h-4 w-4" />
          {'M\u00eas atual'}
        </div>
      </div>

      <div
        className="mt-5 grid gap-4"
        style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
      >
        {[...displayedWeekCards, monthCard].map((card) => {
          const tone = getCardTone(card.status, card.adherence);
          const StatusIcon = tone.icon;
          const targetDelta = Number((card.actual - card.target).toFixed(1));
          const isAboveTarget = targetDelta >= 0;
          const FooterTrendIcon =
            card.status === 'future' ? CalendarRange : isAboveTarget ? TrendingUp : TrendingDown;
          const amountLabel = card.status === 'future'
            ? '0 entregas feitas'
            : `${card.actual} entregas feitas`;
          const fillPercent = Math.max(0, Math.min(card.adherence ?? 0, 100));
          const footerClassName = card.status === 'month'
            ? 'bg-black/20'
            : 'bg-background/60';
          const cardBaseColor = card.status === 'month' ? 'rgb(19, 24, 22)' : 'rgb(35, 31, 34)';
          const cardFillStyle = card.status === 'future'
            ? undefined
            : {
                backgroundImage: `linear-gradient(to top, ${tone.fillColor} 0%, ${tone.fillColor} ${fillPercent}%, ${cardBaseColor} ${fillPercent}%, ${cardBaseColor} 100%)`,
              };
          const textClassName = card.status === 'month'
            ? 'text-white'
            : 'text-foreground';
          const subtextClassName = card.status === 'month'
            ? 'text-white/80'
            : 'text-muted-foreground';
          const isCurrent = card.status === 'current';
          const badgeLabel = card.isFrozen ? 'Fechada' : tone.badge;
          const footerLabel = card.status === 'month'
            ? `${card.actual} entregas / Meta ${card.target}`
            : `${card.actual} entregas / Meta ${card.target}`;

          return (
            <article
              key={card.key}
              className={`relative min-w-0 overflow-hidden rounded-2xl border p-4 transition-colors ${tone.panelClass}`}
              style={cardFillStyle}
            >
              {isCurrent ? (
                <div
                  className="absolute inset-x-0 top-0 z-20 h-2"
                  style={{
                    backgroundColor: tone.solidColor,
                    boxShadow: `0 0 22px ${tone.solidColor}`,
                  }}
                />
              ) : null}

              <div className="relative z-10 flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${subtextClassName}`}>
                    {card.statusLabel}
                  </p>
                  <h4 className={`mt-2 text-sm font-semibold ${textClassName}`}>{card.label}</h4>
                </div>
                {badgeLabel ? (
                  <span className={`inline-flex items-center gap-1 rounded-full border border-current/15 px-2.5 py-1 text-[11px] font-semibold ${tone.accent}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {badgeLabel}
                  </span>
                ) : null}
              </div>

              <div className="relative z-10 mt-6 text-center">
                <div className={`text-5xl font-semibold tracking-tight ${tone.accent}`}>
                  {card.valueLabel}
                </div>
                <p className={`mt-3 text-sm ${subtextClassName}`}>
                  {card.status === 'future' ? `Meta planejada: ${card.target} entregas` : amountLabel}
                </p>
              </div>

              <div className={`relative z-10 mt-5 rounded-xl px-3 py-3 text-sm ${footerClassName}`}>
                <div className={`text-center text-xs ${subtextClassName}`}>
                  {footerLabel}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
