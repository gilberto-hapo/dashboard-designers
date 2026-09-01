import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronDown, ExternalLink, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import Login from './Login';
import {
  SidebarNav,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_MARGIN_COLLAPSED_CLASS,
  SIDEBAR_MARGIN_EXPANDED_CLASS,
} from '@/components/SidebarNav';
import { fetchJson } from '@/lib/calendarUi';
import { Button } from '@/components/ui/button';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { ClientQuarterHistoryChart } from '@/components/client/ClientQuarterHistoryChart';

type LocalPublicacao = { nome: string; cor: string };

type ClienteDetailData = {
  id: string;
  nome: string;
  designer: string | null;
  planejador: string | null;
  copywriter: string | null;
  postsContratados: number;
  locaisPublicacao: LocalPublicacao[];
  linkDriveGeral: string | null;
  linkApresentacao: string | null;
};

type ClienteCalendarioResumo = {
  id: string;
  title: string;
  mesAno: string;
  phaseTitle: string;
  phaseColor: string;
};

function InfoColumn({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ClientDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) !== '0',
  );
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  const pendingFeedbackCount = usePendingFeedbackCount();

  const [client, setClient] = useState<ClienteDetailData | null>(null);
  const [calendarios, setCalendarios] = useState<ClienteCalendarioResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingClientLink, setGeneratingClientLink] = useState(false);
  const [calendariosExpanded, setCalendariosExpanded] = useState(false);

  function loadClient() {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchJson<{ client: ClienteDetailData; calendarios: ClienteCalendarioResumo[] }>(`/api/clientes/${id}/detail`)
      .then((data) => {
        setClient(data.client);
        setCalendarios(data.calendarios);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar cliente'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadClient();
  }, [id]);

  async function handleOpenClientLink() {
    if (!client) return;
    setGeneratingClientLink(true);
    try {
      const data = await fetchJson<{ path: string }>(`/api/clientes/${client.id}/share-link`);
      const url = `${window.location.origin}${data.path}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar link para o cliente');
    } finally {
      setGeneratingClientLink(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav
        activeView="clientes"
        onChange={(view) => navigate(`/painel/${view}`)}
        onRefresh={loadClient}
        isRefreshing={loading}
        lastUpdatedAt={Date.now()}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 -ml-2"
              onClick={() => navigate('/painel/clientes')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Clientes
            </Button>

            {client && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-2 text-white hover:text-white"
                  disabled={generatingClientLink}
                  onClick={handleOpenClientLink}
                >
                  {generatingClientLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Link do Cliente
                </Button>
                {client.linkDriveGeral && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={client.linkDriveGeral} target="_blank" rel="noopener noreferrer">
                      <FolderOpen className="h-4 w-4" />
                      Drive Geral
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando cliente...
            </div>
          ) : error || !client ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error || 'Cliente não encontrado.'}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{client.nome}</h1>
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

                <div className="grid grid-cols-2 gap-4 border-t border-border pt-3 sm:grid-cols-4">
                  <InfoColumn label="Designer Responsável" value={client.designer || '—'} />
                  <InfoColumn label="Planejador Responsável" value={client.planejador || '—'} />
                  <InfoColumn label="Copywriter Dedicado" value={client.copywriter || '—'} />
                  <InfoColumn label="Posts Contratados" value={client.postsContratados} />
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setCalendariosExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/30"
                >
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                    Calendários ({calendarios.length})
                  </h2>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${calendariosExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {calendariosExpanded && (
                  calendarios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum calendário encontrado para este cliente.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {calendarios.map((calendario) => (
                        <button
                          key={calendario.id}
                          type="button"
                          onClick={() => navigate(`/calendarios/${calendario.id}`)}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
                        >
                          <p className="text-sm font-semibold text-foreground">{calendario.title}</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">{calendario.mesAno}</span>
                            <span
                              className="inline-flex shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase"
                              style={{
                                borderColor: calendario.phaseColor,
                                backgroundColor: `${calendario.phaseColor}1a`,
                                color: calendario.phaseColor,
                              }}
                            >
                              {calendario.phaseTitle}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>

              {client && <ClientQuarterHistoryChart clientId={client.id} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ClientDetail() {
  const { isAuthenticated, isLoading, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return isAuthenticated ? <ClientDetailContent /> : <Login />;
}
