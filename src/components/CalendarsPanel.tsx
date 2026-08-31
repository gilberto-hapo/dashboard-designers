import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  fetchJson,
  getConclusionSegments,
  getFirstName,
  normalizeClientKey,
  SegmentedConclusionBar,
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
  postsCriacaoTextual: number;
  postsCriacaoDasArtes: number;
  postsDirecaoDeArte: number;
  postsConferencia: number;
  postsEmValidacao: number;
  postsAprovados: number;
  postsPublicados: number;
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

type ClienteInfo = { nome?: string; designer?: string; ativo?: boolean; postsContratados?: number };

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
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const pendingFeedbackByCalendar = usePendingFeedbackByCalendar(refreshSignal);

  const toggleExpandedMonth = (mesAno: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(mesAno)) next.delete(mesAno);
      else next.add(mesAno);
      return next;
    });
  };

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

  const activeClientRoster = useMemo(() => {
    return clientes
      .filter((c) => c.ativo !== false && c.nome)
      .filter((c) => selectedDesigner === 'Todos' || c.designer === selectedDesigner)
      .map((c) => ({ nome: c.nome as string, postsContratados: c.postsContratados ?? 0 }));
  }, [clientes, selectedDesigner]);

  // "Status do mês" (Sem calendário / Calendário criado / Concluído) precisa
  // considerar TODOS os calendários do mês, incluindo os já concluídos
  // ("Posts Programados"), senão um cliente cujo calendário foi finalizado
  // some da lista visível e volta a aparecer como "Sem calendário"
  // incorretamente. Guarda também se o calendário está concluído, para
  // diferenciar visualmente do "criado, ainda em produção".
  const createdKeysByMesAno = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    calendarios
      .filter((calendario) => {
        const [month, year] = calendario.mesAno.split('/');
        if (selectedMonth !== 'Todos' && month !== selectedMonth) return false;
        if (selectedYear !== 'Todos' && year !== selectedYear) return false;
        if (selectedDesigner !== 'Todos') {
          const designer = designerByClientName.get(calendario.clienteNome?.trim().toLowerCase() || '');
          if (designer !== selectedDesigner) return false;
        }
        return true;
      })
      .forEach((calendario) => {
        const key = calendario.mesAno || 'Sem data';
        if (!map.has(key)) map.set(key, new Map());
        const concluded = calendario.phaseTitle === 'Posts Programados';
        const clientKey = normalizeClientKey(calendario.clienteNome);
        const monthMap = map.get(key)!;
        // Se houver mais de um calendário do mesmo cliente/mês, um concluído
        // "vence" — o cliente já teve o trabalho daquele mês finalizado.
        if (!monthMap.has(clientKey) || concluded) monthMap.set(clientKey, concluded);
      });
    return map;
  }, [calendarios, selectedMonth, selectedYear, selectedDesigner, designerByClientName]);

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
                <button
                  type="button"
                  onClick={() => toggleExpandedMonth(group.mesAno)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  Status do mês
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expandedMonths.has(group.mesAno) ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {expandedMonths.has(group.mesAno) && (() => {
                const createdMap = createdKeysByMesAno.get(group.mesAno) ?? new Map<string, boolean>();
                const clientStatus = activeClientRoster
                  .map((c) => {
                    const key = normalizeClientKey(c.nome);
                    const created = createdMap.has(key);
                    const concluded = created && (createdMap.get(key) ?? false);
                    return { ...c, created, concluded };
                  })
                  .sort((a, b) => {
                    if (a.created !== b.created) return a.created ? 1 : -1;
                    if (a.concluded !== b.concluded) return a.concluded ? 1 : -1;
                    return a.nome.localeCompare(b.nome, 'pt-BR');
                  });
                const semCalendario = clientStatus.filter((c) => !c.created);
                const comCalendario = clientStatus.filter((c) => c.created && !c.concluded);
                const concluidos = clientStatus.filter((c) => c.concluded);
                const postsSemCalendario = semCalendario.reduce((sum, c) => sum + c.postsContratados, 0);
                const postsComCalendario = comCalendario.reduce((sum, c) => sum + c.postsContratados, 0);
                const postsConcluidos = concluidos.reduce((sum, c) => sum + c.postsContratados, 0);

                if (clientStatus.length === 0) {
                  return (
                    <div className="rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
                      Nenhum cliente ativo encontrado para este filtro.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5 rounded-xl border border-border bg-card/50 p-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        Sem calendário ({semCalendario.length} {semCalendario.length === 1 ? 'cliente' : 'clientes'} / {postsSemCalendario} {postsSemCalendario === 1 ? 'post' : 'posts'})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        Calendário criado ({comCalendario.length} {comCalendario.length === 1 ? 'cliente' : 'clientes'} / {postsComCalendario} {postsComCalendario === 1 ? 'post' : 'posts'})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                        Concluído ({concluidos.length} {concluidos.length === 1 ? 'cliente' : 'clientes'} / {postsConcluidos} {postsConcluidos === 1 ? 'post' : 'posts'})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {clientStatus.map((c) => (
                        <span
                          key={c.nome}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            c.concluded
                              ? 'border-white/30 bg-white/10 text-white'
                              : c.created
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-red-500/30 bg-red-500/10 text-red-400'
                          }`}
                        >
                          {c.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-[repeat(auto-fill,minmax(285px,1fr))] gap-3">
                {group.items.map((calendario) => {
                  const progress = getConclusionSegments(calendario);
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
                      className={`group relative space-y-2 rounded-xl border p-3 cursor-pointer transition-colors ${
                        pendingFeedbackCount > 0
                          ? 'border-amber-400/40 bg-amber-400/15 hover:border-amber-400/60'
                          : progress?.percent === 100
                          ? 'border-emerald-500/40 bg-emerald-500/15 hover:border-emerald-500/60'
                          : 'border-border bg-card hover:border-primary/50'
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
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className="rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase"
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
                        <div className="mt-3">
                          <SegmentedConclusionBar segments={progress.segments} total={progress.total} />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          Contrato
                          <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/70">
                            {calendario.postsContratados}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          Cards criados
                          <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/70">
                            {calendario.postsConectados}
                          </span>
                        </span>
                        {(() => {
                          const diff = calendario.postsConectados - calendario.postsContratados;
                          if (diff === 0) return null;
                          return (
                            <span className={`text-[11px] font-semibold ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          );
                        })()}
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
