import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Info, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  navItems,
  SidebarNav,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_MARGIN_COLLAPSED_CLASS,
  SIDEBAR_MARGIN_EXPANDED_CLASS,
} from '@/components/SidebarNav';
import {
  AGENDA_CUSTOM_RANGE_VALUE,
  AGENDA_NEXT_15_DAYS_VALUE,
  AgendaPanel,
  fetchClientesContatos,
  getAgendaMonthOptionsList,
  getClienteContatoForTask,
  getSelectedPeriodRange,
  type ClienteContato,
} from '@/components/AgendaPanel';
import { CalendarsPanel, type CalendarsFilterOptions } from '@/components/CalendarsPanel';
import { ClientFeedbackPanel, type FeedbackFilterOptions } from '@/components/ClientFeedbackPanel';
import { ClientScorePanel } from '@/components/ClientScorePanel';
import { CreateCardsPanel } from '@/components/CreateCardsPanel';
import { TutorialPanel } from '@/components/TutorialPanel';
import { useGoalfyData } from '@/hooks/useGoalfyData';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { useAuth } from '@/lib/auth';
import type { DesignTask } from '@/lib/data';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ViewMode = 'clientes' | 'calendar' | 'calendars' | 'create-cards' | 'feedback' | 'dicas';

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
  const { logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) !== '0',
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  const navigate = useNavigate();
  const { view: viewParam } = useParams<{ view?: string }>();
  const activeView = (viewParam as ViewMode | undefined) ?? 'calendars';
  const setActiveView = useCallback(
    (view: ViewMode) => navigate(`/painel/${view}`),
    [navigate],
  );
  const agendaMonthOptions = useMemo(() => getAgendaMonthOptionsList(), []);
  const [selectedAgendaMonth, setSelectedAgendaMonth] = useState(AGENDA_NEXT_15_DAYS_VALUE);
  const [agendaCustomStart, setAgendaCustomStart] = useState('');
  const [agendaCustomEnd, setAgendaCustomEnd] = useState('');
  const [agendaRangeDraftStart, setAgendaRangeDraftStart] = useState('');
  const [agendaRangeDraftEnd, setAgendaRangeDraftEnd] = useState('');
  const [isAgendaCustomRangeDialogOpen, setIsAgendaCustomRangeDialogOpen] = useState(false);
  const [selectedAgendaDesigner, setSelectedAgendaDesigner] = useState('Todos');
  const [selectedAgendaClient, setSelectedAgendaClient] = useState('Todos');
  const [calendarsFilterOptions, setCalendarsFilterOptions] = useState<CalendarsFilterOptions>({
    monthOptions: ['Todos'],
    yearOptions: ['Todos'],
    designerOptions: ['Todos'],
  });
  const [selectedCalendarsMonth, setSelectedCalendarsMonth] = useState('Todos');
  const [selectedCalendarsYear, setSelectedCalendarsYear] = useState('Todos');
  const [selectedCalendarsDesigner, setSelectedCalendarsDesigner] = useState('Todos');
  const [selectedClientScoreDesigner, setSelectedClientScoreDesigner] = useState('Todos');
  const [feedbackFilterOptions, setFeedbackFilterOptions] = useState<FeedbackFilterOptions>({
    designerOptions: ['Todos'],
  });
  const [selectedFeedbackDesigner, setSelectedFeedbackDesigner] = useState('Todos');

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === activeView) ?? navItems[0],
    [activeView],
  );
  const ActiveNavIcon = activeNav.icon;

  useEffect(() => {
    if (agendaMonthOptions.length === 0) return;
    if (!agendaMonthOptions.some((option) => option.value === selectedAgendaMonth)) {
      setSelectedAgendaMonth(agendaMonthOptions[0].value);
    }
  }, [agendaMonthOptions, selectedAgendaMonth]);

  const [clientesDesigners, setClientesDesigners] = useState<string[]>([]);
  const [clientesContatos, setClientesContatos] = useState<ClienteContato[]>([]);

  useEffect(() => {
    if (activeView !== 'clientes') return;
    fetch('/api/clientes/designers', { credentials: 'include' })
      .then((response) => response.json())
      .then((responseData) => setClientesDesigners(responseData.designers ?? []))
      .catch(() => setClientesDesigners([]));
  }, [activeView]);

  useEffect(() => {
    fetchClientesContatos().then(setClientesContatos);
  }, []);

  const pendingFeedbackCount = usePendingFeedbackCount(lastUpdatedAt);

  const clientScoreDesignerOptions = useMemo(
    () => ['Todos', ...clientesDesigners],
    [clientesDesigners],
  );

  const agendaCustomRange = useMemo(() => {
    const start = agendaCustomStart ? new Date(`${agendaCustomStart}T00:00:00`) : null;
    const end = agendaCustomEnd ? new Date(`${agendaCustomEnd}T00:00:00`) : null;
    return { start, end };
  }, [agendaCustomEnd, agendaCustomStart]);

  const tasksInSelectedAgendaPeriod = useMemo(() => {
    const { start, end } = getSelectedPeriodRange(selectedAgendaMonth, agendaCustomRange);
    return (data?.tasks ?? []).filter(
      (task) => task.dataVencimento >= start && task.dataVencimento <= end,
    );
  }, [data?.tasks, selectedAgendaMonth, agendaCustomRange]);

  const agendaDesignerOptions = useMemo(() => {
    const designerSet = new Set<string>();

    tasksInSelectedAgendaPeriod.forEach((task) => {
      const designer = getClienteContatoForTask(task, clientesContatos)?.designer?.trim();
      if (designer) designerSet.add(designer);
    });

    const options = [...designerSet].sort((left, right) => left.localeCompare(right, 'pt-BR'));
    return ['Todos', ...options];
  }, [tasksInSelectedAgendaPeriod, clientesContatos]);

  const agendaClientOptions = useMemo(() => {
    const clientSet = new Set<string>();

    tasksInSelectedAgendaPeriod.forEach((task) => {
      const cliente = task.clienteRelacionado?.trim();
      if (cliente) clientSet.add(cliente);
    });

    const options = [...clientSet].sort((left, right) => left.localeCompare(right, 'pt-BR'));
    return ['Todos', ...options];
  }, [tasksInSelectedAgendaPeriod]);

  useEffect(() => {
    if (!clientScoreDesignerOptions.includes(selectedClientScoreDesigner)) {
      setSelectedClientScoreDesigner('Todos');
    }
  }, [clientScoreDesignerOptions, selectedClientScoreDesigner]);

  useEffect(() => {
    if (!agendaDesignerOptions.includes(selectedAgendaDesigner)) {
      setSelectedAgendaDesigner('Todos');
    }
  }, [agendaDesignerOptions, selectedAgendaDesigner]);

  useEffect(() => {
    if (!agendaClientOptions.includes(selectedAgendaClient)) {
      setSelectedAgendaClient('Todos');
    }
  }, [agendaClientOptions, selectedAgendaClient]);

  const handleCalendarsFilterOptionsChange = useCallback((options: CalendarsFilterOptions) => {
    setCalendarsFilterOptions(options);
  }, []);

  useEffect(() => {
    if (!calendarsFilterOptions.monthOptions.includes(selectedCalendarsMonth)) {
      setSelectedCalendarsMonth('Todos');
    }
  }, [calendarsFilterOptions.monthOptions, selectedCalendarsMonth]);

  useEffect(() => {
    if (!calendarsFilterOptions.yearOptions.includes(selectedCalendarsYear)) {
      setSelectedCalendarsYear('Todos');
    }
  }, [calendarsFilterOptions.yearOptions, selectedCalendarsYear]);

  useEffect(() => {
    if (!calendarsFilterOptions.designerOptions.includes(selectedCalendarsDesigner)) {
      setSelectedCalendarsDesigner('Todos');
    }
  }, [calendarsFilterOptions.designerOptions, selectedCalendarsDesigner]);

  const handleFeedbackFilterOptionsChange = useCallback((options: FeedbackFilterOptions) => {
    setFeedbackFilterOptions(options);
  }, []);

  useEffect(() => {
    if (!feedbackFilterOptions.designerOptions.includes(selectedFeedbackDesigner)) {
      setSelectedFeedbackDesigner('Todos');
    }
  }, [feedbackFilterOptions.designerOptions, selectedFeedbackDesigner]);

  const openAgendaCustomRangeDialog = () => {
    setAgendaRangeDraftStart(agendaCustomStart);
    setAgendaRangeDraftEnd(agendaCustomEnd);
    setIsAgendaCustomRangeDialogOpen(true);
  };

  const applyAgendaCustomRange = () => {
    setAgendaCustomStart(agendaRangeDraftStart);
    setAgendaCustomEnd(agendaRangeDraftEnd);
    setSelectedAgendaMonth(AGENDA_CUSTOM_RANGE_VALUE);
    setIsAgendaCustomRangeDialogOpen(false);
  };

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
            onChange={(view) => setActiveView(view as ViewMode)}
            onRefresh={() => void refetch()}
            isRefreshing={isFetching || isBackgroundSyncing}
            lastUpdatedAt={lastUpdatedAt}
            onLogout={() => void logout()}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
            badgeCounts={{ feedback: pendingFeedbackCount }}
          />

          <main
            className={`min-w-0 animate-fade-in p-4 pb-24 md:p-6 lg:p-8 lg:pb-8 ${
              isSidebarCollapsed ? SIDEBAR_MARGIN_COLLAPSED_CLASS : SIDEBAR_MARGIN_EXPANDED_CLASS
            }`}
          >
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
        onChange={(view) => setActiveView(view as ViewMode)}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching || isBackgroundSyncing}
        lastUpdatedAt={lastUpdatedAt}
        onLogout={() => void logout()}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
        badgeCounts={{ feedback: pendingFeedbackCount }}
      />

      <main
        className={`min-w-0 animate-fade-in p-4 pb-24 md:p-6 lg:p-8 lg:pb-8 ${
          isSidebarCollapsed ? SIDEBAR_MARGIN_COLLAPSED_CLASS : SIDEBAR_MARGIN_EXPANDED_CLASS
        }`}
      >
        <div className="mx-auto max-w-none space-y-5">
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
                  {activeView === 'dicas' ? <Info className="h-5 w-5" /> : <ActiveNavIcon className="h-5 w-5" />}
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    {activeView === 'dicas' ? 'Dicas' : activeNav.label}
                  </h1>
                </div>
              </div>

              {activeView === 'calendar' && agendaMonthOptions.length > 0 ? (
                <div className="grid w-full gap-3 md:ml-auto md:w-auto md:grid-cols-3">
                  <div className="w-full md:w-56">
                    <label htmlFor="calendar-month-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Período
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendar-month-filter"
                        value={selectedAgendaMonth}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (nextValue === AGENDA_CUSTOM_RANGE_VALUE) {
                            openAgendaCustomRangeDialog();
                            return;
                          }
                          setSelectedAgendaMonth(nextValue);
                        }}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {agendaMonthOptions.map((option) => (
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
                        value={selectedAgendaDesigner}
                        onChange={(event) => setSelectedAgendaDesigner(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {agendaDesignerOptions.map((value) => (
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
                        value={selectedAgendaClient}
                        onChange={(event) => setSelectedAgendaClient(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {agendaClientOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                </div>
              ) : activeView === 'calendars' ? (
                <div className="flex w-full flex-wrap items-end gap-3 md:w-auto md:justify-end">
                  <button
                    type="button"
                    onClick={() => navigate('/painel/dicas')}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
                  >
                    <Info className="h-4 w-4" />
                    Dicas
                  </button>

                  <div className="grid w-full gap-3 md:w-auto md:grid-cols-3">
                  <div className="w-full md:w-48">
                    <label htmlFor="calendars-month-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Mês
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendars-month-filter"
                        value={selectedCalendarsMonth}
                        onChange={(event) => setSelectedCalendarsMonth(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarsFilterOptions.monthOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="w-full md:w-48">
                    <label htmlFor="calendars-year-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Ano
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendars-year-filter"
                        value={selectedCalendarsYear}
                        onChange={(event) => setSelectedCalendarsYear(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarsFilterOptions.yearOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="w-full md:w-48">
                    <label htmlFor="calendars-designer-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Designer
                    </label>
                    <div className="relative mt-2">
                      <select
                        id="calendars-designer-filter"
                        value={selectedCalendarsDesigner}
                        onChange={(event) => setSelectedCalendarsDesigner(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                      >
                        {calendarsFilterOptions.designerOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  </div>
                </div>
              ) : activeView === 'clientes' && clientScoreDesignerOptions.length > 0 ? (
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
              ) : activeView === 'feedback' ? (
                <div className="flex w-full flex-wrap items-end justify-end gap-3">
                  {feedbackFilterOptions.designerOptions.length > 1 && (
                    <div className="w-full max-w-xs">
                      <label htmlFor="feedback-designer-filter" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Designer
                      </label>
                      <div className="relative mt-2">
                        <select
                          id="feedback-designer-filter"
                          value={selectedFeedbackDesigner}
                          onChange={(event) => setSelectedFeedbackDesigner(event.target.value)}
                          className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
                        >
                          {feedbackFilterOptions.designerOptions.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  <a
                    href="/copywriter-portal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Link do Copywriter
                  </a>
                </div>
              ) : null}
            </div>
          </section>

          {activeView === 'clientes' ? (
            <ClientScorePanel selectedDesigner={selectedClientScoreDesigner} />
          ) : activeView === 'calendar' ? (
            <AgendaPanel
              tasks={data?.tasks ?? []}
              selectedMonth={selectedAgendaMonth}
              selectedDesigner={selectedAgendaDesigner}
              selectedClient={selectedAgendaClient}
              onEditCustomRange={openAgendaCustomRangeDialog}
              customRange={agendaCustomRange}
            />
          ) : activeView === 'calendars' ? (
            <CalendarsPanel
              selectedMonth={selectedCalendarsMonth}
              selectedYear={selectedCalendarsYear}
              selectedDesigner={selectedCalendarsDesigner}
              onFilterOptionsChange={handleCalendarsFilterOptionsChange}
              refreshSignal={lastUpdatedAt}
            />
          ) : activeView === 'create-cards' ? (
            <CreateCardsPanel isSidebarCollapsed={isSidebarCollapsed} />
          ) : activeView === 'feedback' ? (
            <ClientFeedbackPanel
              selectedDesigner={selectedFeedbackDesigner}
              onFilterOptionsChange={handleFeedbackFilterOptionsChange}
            />
          ) : (
            <TutorialPanel />
          )}
        </div>
      </main>

      <Dialog open={isAgendaCustomRangeDialogOpen} onOpenChange={setIsAgendaCustomRangeDialogOpen}>
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
                value={agendaRangeDraftStart}
                onChange={(event) => setAgendaRangeDraftStart(event.target.value)}
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
                value={agendaRangeDraftEnd}
                onChange={(event) => setAgendaRangeDraftEnd(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-80"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <button
              type="button"
              onClick={() => setIsAgendaCustomRangeDialogOpen(false)}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={applyAgendaCustomRange}
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
