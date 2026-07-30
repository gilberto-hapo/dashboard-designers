import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

// Mesma paleta usada em src/lib/data.ts (buildDesigners) para manter o
// padrão visual de avatar já existente no resto do dashboard.
const AVATAR_COLORS = ['#E67E22', '#9B59B6', '#1ABC9C', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#8E44AD'];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function PersonAvatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];

  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ backgroundColor: `${color}25`, color }}
    >
      {getInitials(name)}
    </span>
  );
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
  linkApresentacao: string | null;
  linkDriveGeral: string | null;
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

export function ClientScorePanel({ selectedDesigner = 'Todos' }: { selectedDesigner?: string }) {
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
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {filteredClients.map((client) => (
        <div key={client.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{client.nome}</h3>
            {client.locaisPublicacao.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {client.locaisPublicacao.map((local) => (
                  <span
                    key={local.nome}
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                    style={{ backgroundColor: local.cor }}
                  >
                    {local.nome}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t border-border pt-3">
            <InfoRow
              label="Designer Responsável"
              value={
                client.designer ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PersonAvatar name={client.designer} />
                    {client.designer}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <InfoRow
              label="Planejador Responsável"
              value={
                client.planejador ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PersonAvatar name={client.planejador} />
                    {client.planejador}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <InfoRow
              label="Copywriter Dedicado"
              value={
                client.copywriter ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PersonAvatar name={client.copywriter} />
                    {client.copywriter}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <InfoRow label="Posts Contratados" value={client.postsContratados} />
          </div>

          {(client.linkApresentacao || client.linkDriveGeral) && (
            <div className="flex gap-2 border-t border-border pt-3">
              {client.linkApresentacao && (
                <a
                  href={client.linkApresentacao}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Apresentação
                </a>
              )}
              {client.linkDriveGeral && (
                <a
                  href={client.linkDriveGeral}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Drive Geral
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
