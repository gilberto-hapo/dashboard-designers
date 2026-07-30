import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
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
};

type CalendarsPanelProps = {
  selectedMonth: string;
  selectedYear: string;
  onFilterOptionsChange?: (options: CalendarsFilterOptions) => void;
};

export function CalendarsPanel({ selectedMonth, selectedYear, onFilterOptionsChange }: CalendarsPanelProps) {
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([]);
  const [totalClientes, setTotalClientes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ calendarios: CalendarioInfo[] }>('/api/calendarios')
      .then((data) => setCalendarios(data.calendarios))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    fetchJson<{ clients: unknown[] }>('/api/clientes')
      .then((data) => setTotalClientes(data.clients.length))
      .catch(() => setTotalClientes(null));
  }, []);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    calendarios.forEach((calendario) => {
      const [month] = calendario.mesAno.split('/');
      if (month) months.add(month);
    });
    return ['Todos', ...[...months].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))];
  }, [calendarios]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    calendarios.forEach((calendario) => {
      const [, year] = calendario.mesAno.split('/');
      if (year) years.add(year);
    });
    return ['Todos', ...[...years].sort()];
  }, [calendarios]);

  useEffect(() => {
    onFilterOptionsChange?.({ monthOptions, yearOptions });
  }, [monthOptions, yearOptions, onFilterOptionsChange]);

  const filteredCalendarios = useMemo(() => {
    return calendarios.filter((calendario) => {
      const [month, year] = calendario.mesAno.split('/');
      if (selectedMonth !== 'Todos' && month !== selectedMonth) return false;
      if (selectedYear !== 'Todos' && year !== selectedYear) return false;
      return true;
    });
  }, [calendarios, selectedMonth, selectedYear]);

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
                  <div key={calendario.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
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
                      <InfoRow label="Posts Conectados" value={calendario.postsConectados} />
                      <InfoRow label="Posts Concluídos" value={calendario.postsConcluidos} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
