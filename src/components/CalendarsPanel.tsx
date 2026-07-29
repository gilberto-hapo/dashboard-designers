import { useEffect, useState } from 'react';
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
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function CalendarsPanel() {
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ calendarios: CalendarioInfo[] }>('/api/calendarios')
      .then((data) => setCalendarios(data.calendarios))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredCalendarios = calendarios.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

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

  if (filteredCalendarios.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum calendário encontrado.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {filteredCalendarios.map((calendario) => (
        <div key={calendario.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{calendario.title}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                style={{ backgroundColor: calendario.phaseColor }}
              >
                {calendario.phaseTitle}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border pt-3">
            <InfoRow label="Posts Contratados" value={calendario.postsContratados} />
            <InfoRow label="Posts Conectados a este Calendário" value={calendario.postsConectados} />
            <InfoRow label="Posts Conectados Concluídos" value={calendario.postsConcluidos} />
          </div>
        </div>
      ))}
    </div>
  );
}
