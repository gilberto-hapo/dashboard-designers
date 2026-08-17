import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchJson } from '@/lib/calendarUi';

// Mesma paleta usada em src/lib/data.ts (buildDesigners) para manter o
// padrão visual de cor por pessoa já existente no resto do dashboard.
const DESIGNER_COLORS = ['#E67E22', '#9B59B6', '#1ABC9C', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#8E44AD'];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function designerColor(name: string) {
  return DESIGNER_COLORS[hashString(name) % DESIGNER_COLORS.length];
}

type LocalPublicacao = { nome: string; cor: string };

type ClienteInfo = {
  id: string;
  nome: string;
  designer: string | null;
  planejador: string | null;
  copywriter: string | null;
  postsContratados: number;
  locaisPublicacao: LocalPublicacao[];
  linkDriveGeral: string | null;
};

export function ClientScorePanel({ selectedDesigner = 'Todos' }: { selectedDesigner?: string }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClienteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ clients: ClienteInfo[] }>('/api/clientes')
      .then((data) => setClients(data.clients))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredClients = (
    selectedDesigner === 'Todos' ? clients : clients.filter((c) => c.designer === selectedDesigner)
  ).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando clientes...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (filteredClients.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {filteredClients.map((client) => (
        <div
          key={client.id}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/clientes/${client.id}`)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate(`/clientes/${client.id}`);
            }
          }}
          className="cursor-pointer space-y-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
        >
          <h3 className="truncate text-base font-semibold text-foreground">{client.nome}</h3>
          {client.designer && (
            <span
              className="inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase"
              style={{ backgroundColor: `${designerColor(client.designer)}25`, color: designerColor(client.designer) }}
            >
              {client.designer}
            </span>
          )}
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{client.postsContratados}</span> posts/mês
          </p>
        </div>
      ))}
    </div>
  );
}
