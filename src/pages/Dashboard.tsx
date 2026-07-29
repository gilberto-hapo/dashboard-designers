import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Gauge, LayoutDashboard, Loader2, LogOut, PlusSquare, RefreshCw, WifiOff } from 'lucide-react';
import hapoLogo from '@/assets/hapo-logo.svg';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CALENDAR_CUSTOM_RANGE_VALUE,
  CALENDAR_NEXT_15_DAYS_VALUE,
  CalendarPanel,
  getCalendarMonthOptionsList,
} from '@/components/CalendarPanel';
import { AlertsPanel } from '@/components/AlertsPanel';
import { BottlenecksPanel } from '@/components/BottlenecksPanel';
import { CalendarsPanel } from '@/components/CalendarsPanel';
import { ClientScorePanel } from '@/components/ClientScorePanel';
import { CreateCardsPanel } from '@/components/CreateCardsPanel';
import { DesignerCard } from '@/components/DesignerCard';
import { FrentePanel } from '@/components/FrentePanel';
import { ProductionRhythmPanel } from '@/components/ProductionRhythmPanel';
import { StatsBar } from '@/components/StatsBar';
import {
  getStatisticsCurrentMonth,
  StatisticsPanel,
} from '@/components/StatisticsPanel';
import { useGoalfyData } from '@/hooks/useGoalfyData';
import { useAuth } from '@/lib/auth';
import type { DesignTask } from '@/lib/data';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ViewMode = 'dashboard' | 'designers' | 'client-score' | 'statistics' | 'calendar' | 'calendars' | 'create-cards';

type DesignerAiReference = {
  tone: 'success' | 'warning';
  cliente: string;
  message?: string;
  highlight?: string;
};

const DESIGNER_REFERENCES_STORAGE_KEY = 'hapo:designer-client-references-batch:v5';

function parseMonthValue(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, Math.max(0, (month || 1) - 1), 1);
}

function formatStatisticsMonthTitle(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseMonthValue(value));
}

function shiftMonthValue(value: string, offset: number) {
  const date = parseMonthValue(value);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCalendarPrimaryDesigner(task: DesignTask) {
  return String(task.responsavel || task.designerResponsavel1 || task.responsavelCliente || '')
    .split(/[;,/]+/)
    .map((value) => value.trim())
    .find(Boolean) || '';
}

function buildDesignerReferencesSignature(
  dataVersion: number,
  payloads: Array<{ designer: string; references: Array<Record<string, unknown>> }>,
) {
  return JSON.stringify({ dataVersion, payloads });
}

function readStoredDesignerReferences(signature: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DESIGNER_REFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      signature?: string;
      designers?: Record<string, DesignerAiReference[]>;
    };

    if (parsed.signature !== signature || !parsed.designers || typeof parsed.designers !== 'object') {
      return null;
    }

    return parsed.designers;
  } catch {
    return null;
  }
}

function writeStoredDesignerReferences(signature: string, designers: Record<string, DesignerAiReference[]>) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      DESIGNER_REFERENCES_STORAGE_KEY,
      JSON.stringify({
        signature,
        designers,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // ignore cache failure
  }
}

const navItems: Array<{
  id: ViewMode;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: 'calendar',
    label: 'Agenda',
    icon: CalendarDays,
  },
  {
    id: 'client-score',
    label: 'Clientes',
    icon: Gauge,
  },
  {
    id: 'calendars',
    label: 'Calendários',
    icon: CalendarRange,
  },
  {
    id: 'create-cards',
    label: 'Criar Cards',
    icon: PlusSquare,
  },
];

function formatLastUpdated(lastUpdatedAt: number) {
  if (!lastUpdatedAt) return 'Ainda não atualizado';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(lastUpdatedAt));
}

function SidebarNav({
  activeView,
  onChange,
  onRefresh,
  isRefreshing,
  isBackgroundSyncing,
  lastUpdatedAt,
  userName,
  onLogout,
}: {
  activeView: ViewMode;
  onChange: (view: ViewMode) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isBackgroundSyncing: boolean;
  lastUpdatedAt: number;
  userName?: string;
  onLogout: () => void;
}) {
  return (
    <aside className="w-full lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-72">
      <div className="flex min-h-[100dvh] flex-col border-r border-border bg-card px-4 py-5 lg:h-screen lg:min-h-0">
        <div className="border-b border-border pb-5">
          <img src={hapoLogo} alt="Hapo" className="h-8 w-auto" />
          <p className="mt-4 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
            Gestão de Produção de Conteúdo
          </p>
        </div>

        <nav className="mt-5 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-transparent hover:border-border hover:bg-muted/60'
                }`}
              >
                <div
                  className={`rounded-lg p-2 ${
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>
                {isRefreshing
                  ? 'Atualizando...'
                  : 'Atualizar dados'}
              </span>
            </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Última atualização: <span className="text-foreground">{formatLastUpdated(lastUpdatedAt)}</span>
          </p>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                {userName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="truncate text-sm font-semibold text-foreground">{userName || 'Usuário'}</span>
            </div>

            <button
              onClick={onLogout}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function Dashboard() {
  const {
    data,
    insights,
    hasData,
    isLoading,
    isFetching,
    isBackgroundSyncing,
    isError,
    error,
    lastUpdatedAt,
    refetch,
  } = useGoalfyData();
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState<ViewMode>('calendar');
  const [selectedStatisticsMonth, setSelectedStatisticsMonth] = useState(getStatisticsCurrentMonth());
  const calendarMonthOptions = useMemo(() => getCalendarMonthOptionsList(), []);
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(CALENDAR_NEXT_15_DAYS_VALUE);
  const [calendarCustomStart, setCalendarCustomStart] = useState('');
  const [calendarCustomEnd, setCalendarCustomEnd] = useState('');
  const [calendarRangeDraftStart, setCalendarRangeDraftStart] = useState('');
  const [calendarRangeDraftEnd, setCalendarRangeDraftEnd] = useState('');
  const [isCalendarCustomRangeDialogOpen, setIsCalendarCustomRangeDialogOpen] = useState(false);
  const [selectedCalendarDesigner, setSelectedCalendarDesigner] = useState('Todos');
  const [selectedCalendarClient, setSelectedCalendarClient] = useState('Todos');
  const [selectedClientScoreDesigner, setSelectedClientScoreDesigner] = useState('Todos');
  const [designerAiReferences, setDesignerAiReferences] = useState<Record<string, DesignerAiReference[]>>({});
  const [isDesignerAiLoading, setIsDesignerAiLoading] = useState(false);

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === activeView) ?? navItems[0],
    [activeView],
  );
  const ActiveNavIcon = activeNav.icon;
  const designerPeriodHighlightValues = useMemo(() => {
    const designers = insights?.porDesigner ?? [];
    const getMax = (period: 'mesAtual' | 'semanaAtual' | 'hoje') =>
      Math.max(0, ...designers.map((designer) => designer.concluidasPeriodo[period] || 0));

    return {
      mesAtual: getMax('mesAtual'),
      semanaAtual: getMax('semanaAtual'),
      hoje: getMax('hoje'),
    };
  }, [insights?.porDesigner]);

  useEffect(() => {
    if (calendarMonthOptions.length === 0) return;
    if (!calendarMonthOptions.some((option) => option.value === selectedCalendarMonth)) {
      setSelectedCalendarMonth(calendarMonthOptions[0].value);
    }
  }, [calendarMonthOptions, selectedCalendarMonth]);

  const [clientesDesigners, setClientesDesigners] = useState<string[]>([]);

  useEffect(() => {
    if (activeView !== 'client-score') return;
    fetch('/api/clientes/designers', { credentials: 'include' })
      .then((response) => response.json())
      .then((responseData) => setClientesDesigners(responseData.designers ?? []))
      .catch(() => setClientesDesigners([]));
  }, [activeView]);

  const clientScoreDesignerOptions = useMemo(
    () => ['Todos', ...clientesDesigners],
    [clientesDesigners],
  );

  const calendarDesignerOptions = useMemo(() => {
    const designerSet = new Set<string>();

    (data?.tasks ?? [])
      .filter((task) => task.clienteAtivo === true && typeof task.clientePostsMes === 'number' && task.clientePostsMes > 0)
      .forEach((task) => {
        const responsaveis = String(task.responsavel || task.designerResponsavel1 || task.responsavelCliente || '')
          .split(/[;,/]+/)
          .map((value) => value.trim())
          .filter(Boolean);

        responsaveis.forEach((responsavel) => {
          if (responsavel && responsavel !== 'Sem designer') {
            designerSet.add(responsavel);
          }
        });
      });

    const options = [...designerSet].sort((left, right) => left.localeCompare(right, 'pt-BR'));
    return ['Todos', ...options];
  }, [data]);

  const calendarClientOptions = useMemo(() => {
    const fallbackClients = (data?.tasks ?? [])
      .filter((task) => task.clienteAtivo === true && typeof task.clientePostsMes === 'number' && task.clientePostsMes > 0)
      .map((task) => task.clienteRelacionado?.trim())
      .filter((value): value is string => Boolean(value));

    const sourceClients = (data?.clients?.length ? data.clients : fallbackClients)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'pt-BR'));

    const options = [...new Set(sourceClients)];

    return ['Todos', ...options];
  }, [data?.clients, data?.tasks]);

  const currentStatisticsMonth = useMemo(() => getStatisticsCurrentMonth(), []);
  const isStatisticsCurrentMonth = selectedStatisticsMonth === currentStatisticsMonth;
  const selectedStatisticsMonthTitle = useMemo(
    () => formatStatisticsMonthTitle(selectedStatisticsMonth),
    [selectedStatisticsMonth],
  );
  const handlePreviousStatisticsMonth = () => {
    setSelectedStatisticsMonth((value) => shiftMonthValue(value, -1));
  };
  const handleNextStatisticsMonth = () => {
    setSelectedStatisticsMonth((value) => {
      const nextValue = shiftMonthValue(value, 1);
      return nextValue > currentStatisticsMonth ? currentStatisticsMonth : nextValue;
    });
  };
  const calendarCustomRange = useMemo(() => {
    const start = calendarCustomStart ? new Date(`${calendarCustomStart}T00:00:00`) : null;
    const end = calendarCustomEnd ? new Date(`${calendarCustomEnd}T00:00:00`) : null;
    return { start, end };
  }, [calendarCustomEnd, calendarCustomStart]);

  useEffect(() => {
    if (!clientScoreDesignerOptions.includes(selectedClientScoreDesigner)) {
      setSelectedClientScoreDesigner('Todos');
    }
  }, [clientScoreDesignerOptions, selectedClientScoreDesigner]);

  useEffect(() => {
    if (!calendarDesignerOptions.includes(selectedCalendarDesigner)) {
      setSelectedCalendarDesigner('Todos');
    }
  }, [calendarDesignerOptions, selectedCalendarDesigner]);

  useEffect(() => {
    if (!calendarClientOptions.includes(selectedCalendarClient)) {
      setSelectedCalendarClient('Todos');
    }
  }, [calendarClientOptions, selectedCalendarClient]);

  const openCustomRangeDialog = () => {
    setCalendarRangeDraftStart(calendarCustomStart);
    setCalendarRangeDraftEnd(calendarCustomEnd);
    setIsCalendarCustomRangeDialogOpen(true);
  };

  const applyCustomRange = () => {
    setCalendarCustomStart(calendarRangeDraftStart);
    setCalendarCustomEnd(calendarRangeDraftEnd);
    setSelectedCalendarMonth(CALENDAR_CUSTOM_RANGE_VALUE);
    setIsCalendarCustomRangeDialogOpen(false);
  };

  const designerReferencesPayload = useMemo(
    () =>
      insights?.porDesigner
        .map((designer) => ({
          designer: designer.nome,
          references: designer.referenciasClientes,
        }))
        .filter((designer) => designer.references.length > 0) ?? [],
    [insights],
  );

  const designerReferencesSignature = useMemo(
    () => buildDesignerReferencesSignature(lastUpdatedAt, designerReferencesPayload),
    [designerReferencesPayload, lastUpdatedAt],
  );

  useEffect(() => {
    if (designerReferencesPayload.length === 0) {
      setDesignerAiReferences({});
      setIsDesignerAiLoading(false);
      return;
    }

    const stored = readStoredDesignerReferences(designerReferencesSignature);
    if (stored) {
      setDesignerAiReferences(stored);
      setIsDesignerAiLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const loadBatchReferences = async () => {
      setIsDesignerAiLoading(true);

      try {
        const response = await fetch('/api/ai/designer-client-references-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ payloads: designerReferencesPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isActive) setIsDesignerAiLoading(false);
          return;
        }

        const result = await response.json();
        const designers = result?.designers && typeof result.designers === 'object'
          ? result.designers as Record<string, DesignerAiReference[]>
          : {};

        if (isActive) {
          setDesignerAiReferences(designers);
          setIsDesignerAiLoading(false);
          if (Object.keys(designers).length > 0) {
            writeStoredDesignerReferences(designerReferencesSignature, designers);
          }
        }
      } catch {
        if (isActive) {
          setIsDesignerAiLoading(false);
        }
      }
    };

    void loadBatchReferences();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [designerReferencesPayload, designerReferencesSignature]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-base text-muted-foreground">Sincronizando...</p>
        </div>
      </div>
    );
  }

  if ((isError && !hasData) || (!insights && !hasData)) {
    if (!isError && !hasData) {
      return (
        <div className="min-h-screen bg-background">
          <SidebarNav
            activeView={activeView}
            onChange={setActiveView}
            onRefresh={() => void refetch()}
            isRefreshing={isFetching || isBackgroundSyncing}
            isBackgroundSyncing={isBackgroundSyncing}
            lastUpdatedAt={lastUpdatedAt}
            userName={user?.name}
            onLogout={() => void logout()}
          />

          <main className="min-w-0 animate-fade-in p-4 md:p-6 lg:ml-72 lg:p-8">
            <div className="mx-auto flex min-h-[70vh] max-w-[720px] items-center justify-center">
              <div className="space-y-4 text-center">
                <Loader2 className={`mx-auto h-8 w-8 text-primary ${isFetching ? 'animate-spin' : ''}`} />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    {isFetching ? 'Carregando dados da Goalfy...' : 'Nenhum dado carregado ainda'}
                  </h2>
                  <p className="text-base text-muted-foreground">
                    {isFetching
                      ? 'Estamos sincronizando os dados mais recentes. Isso pode levar alguns instantes.'
                      : 'Os dados da Goalfy são carregados no login ou quando você usa o botão Atualizar dados.'}
                  </p>
                </div>
                {!isFetching ? (
                  <button
                    onClick={() => void refetch()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Carregar dados agora
                  </button>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-4 text-center">
          <WifiOff className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-xl font-semibold text-foreground">Erro ao conectar com a Goalfy</h2>
          <p className="text-base text-muted-foreground">
            {error?.message || 'Não foi possível carregar os dados. Verifique a conexão.'}
          </p>
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-primary-foreground transition hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav
        activeView={activeView}
        onChange={setActiveView}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching || isBackgroundSyncing}
        isBackgroundSyncing={isBackgroundSyncing}
        lastUpdatedAt={lastUpdatedAt}
        userName={user?.name}
        onLogout={() => void logout()}
      />

      <main className="min-w-0 animate-fade-in p-4 md:p-6 lg:ml-72 lg:p-8">
        <div className={`mx-auto space-y-5 ${activeView === 'calendar' ? 'max-w-none' : 'max-w-[1600px]'}`}>
          {error ? (
            <Alert className="border-warning/40 bg-warning/10 text-foreground">
              <AlertDescription className="text-sm">
                {error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="px-1 pt-1.5">
            <div className="flex min-h-[58px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <ActiveNavIcon className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">{activeNav.label}</h1>
                </div>
              </div>

              {activeView === 'statistics' ? (
                <>
                <div className="w-full max-w-sm">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    PERIODO
                  </p>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <div className="inline-flex min-w-0 flex-1 items-center rounded-xl border border-border bg-card text-foreground">
                      <button
                        type="button"
                        onClick={handlePreviousStatisticsMonth}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        title="Mes anterior"
                        aria-label="Mes anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1 border-x border-border px-3 text-center">
                        <span className="block truncate text-sm font-semibold capitalize text-foreground">
                          {selectedStatisticsMonthTitle}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextStatisticsMonth}
                        disabled={isStatisticsCurrentMonth}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        title="Proximo mes"
                        aria-label="Proximo mes"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                </>
              ) : activeView === 'calendar' && calendarMonthOptions.length > 0 ? (
                <div className="grid w-full gap-3 md:ml-auto md:w-auto md:grid-cols-3">
                  <div className="w-full md:w-56">
                    <label htmlFor="calendar-month-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Período
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendar-month-filter"
                        value={selectedCalendarMonth}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (nextValue === CALENDAR_CUSTOM_RANGE_VALUE) {
                            openCustomRangeDialog();
                            return;
                          }
                          setSelectedCalendarMonth(nextValue);
                        }}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarMonthOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="w-full md:w-56">
                    <label htmlFor="calendar-designer-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Designer
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendar-designer-filter"
                        value={selectedCalendarDesigner}
                        onChange={(event) => setSelectedCalendarDesigner(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarDesignerOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="w-full md:w-56">
                    <label htmlFor="calendar-client-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Cliente
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendar-client-filter"
                        value={selectedCalendarClient}
                        onChange={(event) => setSelectedCalendarClient(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarClientOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                </div>
              ) : activeView === 'client-score' && clientScoreDesignerOptions.length > 0 ? (
                <div className="w-full max-w-xs">
                  <label htmlFor="client-score-designer-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Designer
                  </label>
                  <div className="relative mt-2">
                    <select
                      id="client-score-designer-filter"
                      value={selectedClientScoreDesigner}
                      onChange={(event) => setSelectedClientScoreDesigner(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                    >
                      {clientScoreDesignerOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {activeView === 'dashboard' ? (
            <>
              <StatsBar data={insights} />
              <FrentePanel data={insights} />
              <ProductionRhythmPanel tasks={data?.tasks ?? []} />
              <BottlenecksPanel data={insights} />
              <AlertsPanel alerts={insights.alertas} />
            </>
          ) : activeView === 'client-score' ? (
            <ClientScorePanel selectedDesigner={selectedClientScoreDesigner} />
          ) : activeView === 'statistics' ? (
            <StatisticsPanel
              selectedMonth={selectedStatisticsMonth}
              dataVersion={lastUpdatedAt}
              tasks={data?.tasks ?? []}
              designers={data?.designers ?? []}
              designerFronts={insights.porDesigner}
              adjustments={data?.adjustments ?? []}
            />
          ) : activeView === 'calendar' ? (
            <CalendarPanel
              tasks={data?.tasks ?? []}
              selectedMonth={selectedCalendarMonth}
              selectedDesigner={selectedCalendarDesigner}
              selectedClient={selectedCalendarClient}
              onEditCustomRange={openCustomRangeDialog}
              customRange={calendarCustomRange}
            />
          ) : activeView === 'calendars' ? (
            <CalendarsPanel />
          ) : activeView === 'create-cards' ? (
            <CreateCardsPanel />
          ) : (
            <section className="space-y-4">
              <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {insights.porDesigner.map((designer) => (
                  <DesignerCard
                    key={designer.nome}
                    designer={designer}
                    aiReferencesOverride={designerAiReferences[designer.nome] || null}
                    isAiReferencesLoadingOverride={isDesignerAiLoading}
                    disableInternalAiFetch
                    periodHighlights={{
                      mesAtual:
                        designerPeriodHighlightValues.mesAtual > 0 &&
                        designer.concluidasPeriodo.mesAtual === designerPeriodHighlightValues.mesAtual,
                      semanaAtual:
                        designerPeriodHighlightValues.semanaAtual > 0 &&
                        designer.concluidasPeriodo.semanaAtual === designerPeriodHighlightValues.semanaAtual,
                      hoje:
                        designerPeriodHighlightValues.hoje > 0 &&
                        designer.concluidasPeriodo.hoje === designerPeriodHighlightValues.hoje,
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Dialog open={isCalendarCustomRangeDialogOpen} onOpenChange={setIsCalendarCustomRangeDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-border/70 bg-card p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="text-base font-semibold text-foreground">Selecionar intervalo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label htmlFor="calendar-custom-start-modal" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                De
              </label>
              <input
                id="calendar-custom-start-modal"
                type="date"
                value={calendarRangeDraftStart}
                onChange={(event) => setCalendarRangeDraftStart(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-80"
              />
            </div>

            <div>
              <label htmlFor="calendar-custom-end-modal" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Até
              </label>
              <input
                id="calendar-custom-end-modal"
                type="date"
                value={calendarRangeDraftEnd}
                onChange={(event) => setCalendarRangeDraftEnd(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-80"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <button
              type="button"
              onClick={() => setIsCalendarCustomRangeDialogOpen(false)}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={applyCustomRange}
              className="rounded-xl border border-primary/35 bg-primary/15 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              Aplicar filtro
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
