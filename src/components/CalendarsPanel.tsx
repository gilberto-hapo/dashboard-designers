import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type CalendarioInfo = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  phaseTitle: string;
  phaseColor: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro na requisição (status ${response.status})`);
  }
  return body as T;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

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
};

type ClienteInfo = { nome?: string; designer?: string };

export function CalendarsPanel({ selectedMonth, selectedYear, selectedDesigner, onFilterOptionsChange }: CalendarsPanelProps) {
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([]);
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarToConclude, setCalendarToConclude] = useState<CalendarioInfo | null>(null);
  const [concluding, setConcluding] = useState(false);
  const [concludeError, setConcludeError] = useState<string | null>(null);

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
  }, []);

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

  async function handleConfirmConclude() {
    if (!calendarToConclude) return;
    setConcluding(true);
    setConcludeError(null);
    try {
      await fetchJson('/api/criar-cards/move-calendar-to-posts-programados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: calendarToConclude.id }),
      });
      setCalendarios((prev) => prev.filter((c) => c.id !== calendarToConclude.id));
      setCalendarToConclude(null);
    } catch (err) {
      setConcludeError(err instanceof Error ? err.message : 'Erro ao concluir calendário');
    } finally {
      setConcluding(false);
    }
  }

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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {group.items.map((calendario) => (
                  <div key={calendario.id} className="group relative space-y-2 rounded-xl border border-border bg-card p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setConcludeError(null);
                        setCalendarToConclude(calendario);
                      }}
                      title="Concluir calendário"
                      aria-label="Concluir calendário"
                      className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-emerald-500 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <div>
                      <h3 className="pr-5 text-sm font-semibold text-foreground">{calendario.title}</h3>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                      </div>
                    </div>

                    <div className="space-y-1 border-t border-border pt-2">
                      <InfoRow label="Posts Contratados" value={calendario.postsContratados} />
                      <InfoRow label="Posts Criados" value={calendario.postsConectados} />
                      <InfoRow label="Posts Concluídos" value={calendario.postsConcluidos} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={calendarToConclude != null}
        onOpenChange={(open) => {
          if (!open && !concluding) {
            setCalendarToConclude(null);
            setConcludeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir calendário?</AlertDialogTitle>
            <AlertDialogDescription>
              {calendarToConclude
                ? `"${calendarToConclude.title}" será movido para Posts Programados e deixará de aparecer nesta lista.`
                : ''}
              {concludeError && (
                <span className="mt-2 block text-destructive">{concludeError}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={concluding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmConclude();
              }}
              disabled={concluding}
            >
              {concluding ? 'Concluindo...' : 'Concluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
