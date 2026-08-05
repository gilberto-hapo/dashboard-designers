import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { stageLabels } from '@/lib/data';
import type { Stage } from '@/lib/data';

type CalendarioPost = {
  id: string;
  title: string;
  stage: Stage;
  formatoEntrega: string;
  dataVencimento: string | null;
  concluidoEm: string | null;
};

const stageBadgeClasses: Record<Stage, string> = {
  fazer: 'border-red-500/70 bg-red-950 text-red-50',
  executando: 'border-yellow-300/70 bg-yellow-700/55 text-yellow-50',
  direcao_arte: 'border-purple-500/70 bg-purple-950 text-purple-50',
  montagem: 'border-orange-400/95 bg-[rgb(182_75_0_/_35%)] text-orange-50',
  validacao: 'border-sky-400/70 bg-sky-950 text-sky-50',
  aprovado_programacao: 'border-lime-400/70 bg-lime-950 text-lime-50',
  concluido: 'border-zinc-500/20 bg-zinc-900 text-zinc-200',
};

type CalendarioInfo = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  phaseTitle: string;
  phaseColor: string;
  linkCalendarioEditorial: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
  posts: CalendarioPost[];
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
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarioInfo | null>(null);

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
      setSelectedCalendar((prev) => (prev?.id === calendarToConclude.id ? null : prev));
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
                  <div
                    key={calendario.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCalendar(calendario)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedCalendar(calendario);
                      }
                    }}
                    className="group relative space-y-2 rounded-xl border border-border bg-card p-3 cursor-pointer transition-colors hover:border-primary/50"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{calendario.title}</h3>
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

      <Dialog open={selectedCalendar != null} onOpenChange={(open) => !open && setSelectedCalendar(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {selectedCalendar && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedCalendar.title}</DialogTitle>
                <DialogDescription>
                  <span
                    className="mt-1 inline-flex rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      borderColor: selectedCalendar.phaseColor,
                      backgroundColor: `${selectedCalendar.phaseColor}1a`,
                      color: selectedCalendar.phaseColor,
                    }}
                  >
                    {selectedCalendar.phaseTitle}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
                <InfoRow label="Posts Contratados" value={selectedCalendar.postsContratados} />
                <InfoRow label="Posts Criados" value={selectedCalendar.postsConectados} />
                <InfoRow label="Posts Concluídos" value={selectedCalendar.postsConcluidos} />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Posts conectados ({(selectedCalendar.posts ?? []).length})
                </h4>
                {(selectedCalendar.posts ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum post conectado a este calendário.</p>
                ) : (
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                    {(selectedCalendar.posts ?? []).map((post) => (
                      <li
                        key={post.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-foreground">{post.title}</span>
                          {post.formatoEntrega && (
                            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                              {post.formatoEntrega}
                            </span>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${
                            stageBadgeClasses[post.stage] ?? 'border-zinc-400/25 bg-zinc-900 text-zinc-200'
                          }`}
                        >
                          {stageLabels[post.stage] ?? post.stage}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <DialogFooter className="sm:justify-between">
                {selectedCalendar.linkCalendarioEditorial ? (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={selectedCalendar.linkCalendarioEditorial} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Calendário editorial
                    </a>
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="outline"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setConcludeError(null);
                    setCalendarToConclude(selectedCalendar);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir calendário
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
