import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import Login from './Login';
import {
  SidebarNav,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_MARGIN_COLLAPSED_CLASS,
  SIDEBAR_MARGIN_EXPANDED_CLASS,
} from '@/components/SidebarNav';
import {
  ConclusionBar,
  ConclusionPercentLabel,
  fetchJson,
  getConclusionProgress,
  getFirstName,
} from '@/lib/calendarUi';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { Button } from '@/components/ui/button';
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
import { GridThumbShared, type GridThumbStatus, type PortalPost } from '@/components/ClientPortalFeed';

type CalendarDetailData = {
  id: string;
  title: string;
  clienteNome: string;
  clientId: string | null;
  mesAno: string;
  designer: string;
  copywriter?: string;
  planejador?: string;
  linkDriveArtes: string;
  phaseTitle: string;
  phaseColor: string;
  linkCalendarioEditorial: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
  posts: PortalPost[];
};

function decisionStatus(post: PortalPost): GridThumbStatus {
  if (post.feedbackHistory.length > 0) return 'adjustment';
  if (post.published) return 'published';
  if (post.decision?.approved) return 'approved';
  return null;
}

function buildMediaUrl(fileId: string, calendarId: string, variant: 'thumb' | 'preview' | 'original' = 'preview') {
  return `/api/media/${fileId}?calendarId=${calendarId}&variant=${variant}`;
}

function CalendarDetailContent() {
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

  const [calendario, setCalendario] = useState<CalendarDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [concludeError, setConcludeError] = useState<string | null>(null);
  const [generatingClientLink, setGeneratingClientLink] = useState(false);

  const loadCalendario = useMemo(
    () => (options?: { forceRefresh?: boolean }) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      const query = options?.forceRefresh ? '?refresh=1' : '';
      fetchJson<{ calendario: CalendarDetailData }>(`/api/calendarios/${id}/detail${query}`)
        .then((data) => setCalendario(data.calendario))
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar calendário'))
        .finally(() => setLoading(false));
    },
    [id],
  );

  useEffect(() => {
    loadCalendario();
  }, [loadCalendario]);

  const refreshCalendario = () => loadCalendario({ forceRefresh: true });

  async function handleOpenClientLink() {
    if (!calendario?.clientId) return;
    setGeneratingClientLink(true);
    try {
      const data = await fetchJson<{ path: string }>(`/api/clientes/${calendario.clientId}/share-link`);
      const url = `${window.location.origin}${data.path}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar link para o cliente');
    } finally {
      setGeneratingClientLink(false);
    }
  }

  async function handleConfirmConclude() {
    if (!calendario) return;
    setConcluding(true);
    setConcludeError(null);
    try {
      await fetchJson('/api/criar-cards/move-calendar-to-posts-programados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: calendario.id }),
      });
      setConfirmingConclude(false);
      navigate('/');
    } catch (err) {
      setConcludeError(err instanceof Error ? err.message : 'Erro ao concluir calendário');
    } finally {
      setConcluding(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav
        activeView="calendars"
        onChange={(view) => navigate(`/painel/${view}`)}
        onRefresh={refreshCalendario}
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
              onClick={() => navigate('/painel/calendars')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Calendários
            </Button>

            {calendario && (
              <div className="flex flex-wrap gap-2">
                {calendario.clientId && (
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
                )}
                {calendario.linkCalendarioEditorial && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkCalendarioEditorial} target="_blank" rel="noopener noreferrer">
                      <CalendarDays className="h-4 w-4" />
                      Calendário editorial
                    </a>
                  </Button>
                )}
                {calendario.linkDriveArtes && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkDriveArtes} target="_blank" rel="noopener noreferrer">
                      <FolderOpen className="h-4 w-4" />
                      Link do Drive
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="gap-2 text-white hover:text-white"
                  onClick={() => {
                    setConcludeError(null);
                    setConfirmingConclude(true);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir calendário
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando calendário...
            </div>
          ) : error || !calendario ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error || 'Calendário não encontrado.'}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-foreground">{calendario.title}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {calendario.designer && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.designer)}
                        </span>
                      )}
                      {calendario.copywriter && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.copywriter)}
                        </span>
                      )}
                      {calendario.planejador && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.planejador)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="inline-flex shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      borderColor: calendario.phaseColor,
                      backgroundColor: `${calendario.phaseColor}1a`,
                      color: calendario.phaseColor,
                    }}
                  >
                    {calendario.phaseTitle}
                  </span>
                </div>

                <div className="flex items-center justify-end">
                  <ConclusionPercentLabel progress={getConclusionProgress(calendario)} />
                </div>
                <ConclusionBar progress={getConclusionProgress(calendario)} />

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    Posts Contratados: <span className="font-medium text-foreground">{calendario.postsContratados}</span>
                  </span>
                  <span className="text-border">/</span>
                  <span>
                    Posts Criados: <span className="font-medium text-foreground">{calendario.postsConectados}</span>
                  </span>
                  <span className="text-border">/</span>
                  <span>
                    Posts Concluídos: <span className="font-medium text-foreground">{calendario.postsConcluidos}</span>
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Posts ({calendario.posts.length})
                </h2>
                {calendario.posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pasta de post encontrada no Drive deste calendário.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                    {calendario.posts.map((post) => (
                      <div key={post.id}>
                        <GridThumbShared
                          mediaUrl={(fileId) => buildMediaUrl(fileId, id!, 'thumb')}
                          media={post.media}
                          title={post.goalfyCardTitle || post.title}
                          status={decisionStatus(post)}
                          onOpen={() => navigate(`/calendarios/${id}/posts/${post.id}`)}
                        />
                        <p className="mt-1.5 truncate text-xs font-medium text-foreground">
                          {post.goalfyCardTitle || post.title}
                        </p>
                        {post.folderName && (
                          <p className="truncate text-[11px] text-muted-foreground">Pasta: {post.folderName}</p>
                        )}
                        <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {post.formatoEntrega || 'Post'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <AlertDialog
        open={confirmingConclude}
        onOpenChange={(open) => {
          if (!open && !concluding) {
            setConfirmingConclude(false);
            setConcludeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir calendário?</AlertDialogTitle>
            <AlertDialogDescription>
              {calendario
                ? `"${calendario.title}" será movido para Posts Programados e você voltará para a lista de calendários.`
                : ''}
              {concludeError && <span className="mt-2 block text-destructive">{concludeError}</span>}
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

export default function CalendarDetail() {
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

  return isAuthenticated ? <CalendarDetailContent /> : <Login />;
}
