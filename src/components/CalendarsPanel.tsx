import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  ConclusionBar,
  ConclusionPercentLabel,
  fetchJson,
  getConclusionProgress,
  getFirstName,
  InfoRow,
} from '@/lib/calendarUi';
import { usePendingFeedbackByCalendar } from '@/hooks/usePendingFeedbackCount';

type CalendarioInfo = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  phaseTitle: string;
  phaseColor: string;
  linkCalendarioEditorial: string;
  designer: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
};

const MONTH_ORDER = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

function parseMesAno(mesAno: string) {
  const [month, year] = mesAno.split('/');
  const monthIndex = MONTH_ORDER.indexOf(month);
  const yearNumber = Number(year);
  return {
    sortKey: (Number.isFinite(yearNumber) ? yearNumber : 0) * 100 + (monthIndex >= 0 ? monthIndex : 0),
    label: mesAno,
  };
}

function groupCalendariosByMesAno(calendarios: CalendarioInfo[]) {
  const groups = new Map<string, CalendarioInfo[]>();

  calendarios.forEach((calendario) => {
    const key = calendario.mesAno || 'Sem data';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(calendario);
  });

  return [...groups.entries()]
    .map(([mesAno, items]) => ({
      mesAno,
      items: items.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    }))
    .sort((a, b) => {
      if (a.mesAno === 'Sem data') return 1;
      if (b.mesAno === 'Sem data') return -1;
      return parseMesAno(a.mesAno).sortKey - parseMesAno(b.mesAno).sortKey;
    });
}

export type CalendarsFilterOptions = {
  monthOptions: string[];
  yearOptions: string[];
  designerOptions: string[];
};

type CalendarsPanelProps = {
  selectedMonth: string;
  selectedYear: string;
  selectedDesigner: string;
  onFilterOptionsChange?: (options: CalendarsFilterOptions) => void;
  refreshSignal?: number;
};

type ClienteInfo = { nome?: string; designer?: string };

export function CalendarsPanel({
  selectedMonth,
  selectedYear,
  selectedDesigner,
  onFilterOptionsChange,
  refreshSignal,
}: CalendarsPanelProps) {
  const navigate = useNavigate();
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([]);
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingFeedbackByCalendar = usePendingFeedbackByCalendar(refreshSignal);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ calendarios: CalendarioInfo[] }>('/api/calendarios')
      .then((data) => setCalendarios(data.calendarios))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    fetchJson<{ clients: ClienteInfo[] }>('/api/clientes')
      .then((data) => setClientes(data.clients))
      .catch(() => setClientes([]));
  }, [refreshSignal]);

  const totalClientes = clientes.length || null;

  const designerByClientName = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach((cliente) => {
      const nome = cliente.nome?.trim();
      const designer = cliente.designer?.trim();
      if (nome && designer) map.set(nome.toLowerCase(), designer);
    });
    return map;
  }, [clientes]);

  // "Posts Programados" é a fase final do board (calendário concluído) —
  // não faz sentido continuar exibindo aqui.
  const visibleCalendarios = useMemo(
    () => calendarios.filter((calendario) => calendario.phaseTitle !== 'Posts Programados'),
    [calendarios],
  );

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    visibleCalendarios.forEach((calendario) => {
      const [month] = calendario.mesAno.split('/');
      if (month) months.add(month);
    });
    return ['Todos', ...[...months].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))];
  }, [visibleCalendarios]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    visibleCalendarios.forEach((calendario) => {
      const [, year] = calendario.mesAno.split('/');
      if (year) years.add(year);
    });
    return ['Todos', ...[...years].sort()];
  }, [visibleCalendarios]);

  const designerOptions = useMemo(() => {
    const designers = new Set<string>();
    visibleCalendarios.forEach((calendario) => {
      const designer = designerByClientName.get(calendario.clienteNome?.trim().toLowerCase() || '');
      if (designer) designers.add(designer);
    });
    return ['Todos', ...[...designers].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [visibleCalendarios, designerByClientName]);

  useEffect(() => {
    onFilterOptionsChange?.({ monthOptions, yearOptions, designerOptions });
  }, [monthOptions, yearOptions, designerOptions, onFilterOptionsChange]);

  const filteredCalendarios = useMemo(() => {
    return visibleCalendarios.filter((calendario) => {
      const [month, year] = calendario.mesAno.split('/');
      if (selectedMonth !== 'Todos' && month !== selectedMonth) return false;
      if (selectedYear !== 'Todos' && year !== selectedYear) return false;
      if (selectedDesigner !== 'Todos') {
        const designer = designerByClientName.get(calendario.clienteNome?.trim().toLowerCase() || '');
        if (designer !== selectedDesigner) return false;
      }
      return true;
    });
  }, [visibleCalendarios, selectedMonth, selectedYear, selectedDesigner, designerByClientName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando calendários...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (calendarios.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum calendário encontrado.</p>;
  }

  const groupedCalendarios = groupCalendariosByMesAno(filteredCalendarios);

  return (
    <div className="space-y-6">
      {groupedCalendarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum calendário encontrado para este filtro.</p>
      ) : (
        <div className="space-y-8">
          {groupedCalendarios.map((group) => (
            <div key={group.mesAno} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{group.mesAno}</h2>
                <span className="text-xs text-muted-foreground">
                  {totalClientes != null
                    ? `${group.items.length}/${totalClientes} calendários`
                    : `${group.items.length} ${group.items.length === 1 ? 'calendário' : 'calendários'}`}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(285px,1fr))] gap-3">
                {group.items.map((calendario) => {
                  const progress = getConclusionProgress(calendario);
                  const pendingFeedbackCount = pendingFeedbackByCalendar[calendario.id] ?? 0;

                  return (
                    <div
                      key={calendario.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/calendarios/${calendario.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/calendarios/${calendario.id}`);
                        }
                      }}
                      className={`group relative space-y-2 rounded-xl p-3 cursor-pointer transition-colors ${
                        pendingFeedbackCount > 0
                          ? 'border-2 border-amber-500/60 bg-card hover:border-amber-500'
                          : progress?.percent === 100
                          ? 'border border-emerald-500/40 bg-emerald-500/15 hover:border-emerald-500/60'
                          : 'border border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      {pendingFeedbackCount > 0 && (
                        <span
                          title={`${pendingFeedbackCount} post${pendingFeedbackCount > 1 ? 's' : ''} com ajuste pendente`}
                          className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                        >
                          {pendingFeedbackCount}
                        </span>
                      )}
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{calendario.title}</h3>
                        <div className="mt-1.5 flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                              style={{
                                borderColor: calendario.phaseColor,
                                backgroundColor: `${calendario.phaseColor}1a`,
                                color: calendario.phaseColor,
                              }}
                            >
                              {calendario.phaseTitle}
                            </span>
                            {calendario.designer && (
                              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                {getFirstName(calendario.designer)}
                              </span>
                            )}
                          </div>
                          <ConclusionPercentLabel progress={progress} />
                        </div>
                        <div className="mt-3">
                          <ConclusionBar progress={progress} />
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <InfoRow label="Posts Contratados" value={calendario.postsContratados} />
                        <InfoRow label="Posts Criados" value={calendario.postsConectados} />
                        <InfoRow label="Posts Concluídos" value={calendario.postsConcluidos} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
