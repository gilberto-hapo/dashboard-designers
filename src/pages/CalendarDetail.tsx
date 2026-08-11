import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, ExternalLink, FolderOpen, Loader2, X } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
  GridThumbShared,
  PostMediaViewShared,
  type FeedbackEntry,
  type GridThumbStatus,
  type PortalPost,
} from '@/components/ClientPortalFeed';

type CalendarDetailData = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  designer: string;
  linkDriveArtes: string;
  phaseTitle: string;
  phaseColor: string;
  linkCalendarioEditorial: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
  posts: PortalPost[];
};

function mediaUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function decisionStatus(post: PortalPost): GridThumbStatus {
  if (post.feedbackHistory.length > 0) return 'adjustment';
  if (post.published) return 'published';
  if (post.decision?.approved) return 'approved';
  return null;
}

function FeedbackList({ title, entries }: { title: string; entries: FeedbackEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">{title}</span>
      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <li key={`${entry.createdAt}-${index}`}>
            <span className="mb-0.5 block text-[10px] text-muted-foreground">{formatDate(entry.createdAt)}</span>
            {entry.feedback}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PostDetailModal({
  post,
  onClose,
  onResolved,
}: {
  post: PortalPost;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isApproved = Boolean(post.decision?.approved);
  const isPublished = Boolean(post.published);
  const hasPendingAdjustments = post.feedbackHistory.length > 0;

  async function handleResolveAdjustments() {
    setSubmitting(true);
    try {
      await fetchJson(`/api/feedback/${post.id}/resolve`, { method: 'POST' });
      setConfirmingResolve(false);
      toast.success('Ajustes marcados como finalizados.');
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar ajustes');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogTitle className="sr-only">{post.title}</DialogTitle>
      <button
        type="button"
        onClick={onClose}
        className="sticky top-2 z-10 ml-auto mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex w-full flex-col">
        <div className="w-full bg-black">
          <PostMediaViewShared mediaUrl={mediaUrl} media={post.media} title={post.title} />
        </div>

        <div className="flex w-full flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
              {post.formatoEntrega || 'Post'}
            </span>
            {isPublished ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Publicado
              </span>
            ) : isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aprovado
              </span>
            ) : hasPendingAdjustments ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                Ajuste solicitado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Aguardando avaliação
              </span>
            )}
          </div>

          {post.caption && <p className="whitespace-pre-wrap text-sm text-foreground">{post.caption}</p>}

          <FeedbackList title="Ajustes:" entries={post.feedbackHistory} />

          {post.resolvedFeedbackHistory.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowResolvedHistory((v) => !v)}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showResolvedHistory
                  ? 'ocultar ajustes concluídos'
                  : `ver ajustes concluídos (${post.resolvedFeedbackHistory.length})`}
              </button>
              {showResolvedHistory && (
                <ul className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {post.resolvedFeedbackHistory.map((entry, index) => (
                    <li key={`${entry.createdAt}-${index}`}>
                      <span className="mb-0.5 block text-[10px] text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </span>
                      {entry.feedback}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-auto pt-2">
            {isPublished || isApproved ? null : hasPendingAdjustments ? (
              <Button
                className="h-14 w-full gap-2 text-base bg-emerald-600 text-white hover:bg-emerald-600/90"
                disabled={submitting}
                onClick={() => setConfirmingResolve(true)}
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Ajustes finalizados
              </Button>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Aguardando avaliação do cliente pelo link do calendário.
              </p>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmingResolve} onOpenChange={(open) => !open && setConfirmingResolve(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar ajustes como finalizados?</AlertDialogTitle>
            <AlertDialogDescription>
              O destaque de ajuste pendente será removido deste post no link do cliente. Os comentários ficam salvos no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                handleResolveAdjustments();
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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

  const [calendario, setCalendario] = useState<CalendarDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [generatingShareLink, setGeneratingShareLink] = useState(false);
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [concludeError, setConcludeError] = useState<string | null>(null);

  const loadCalendario = useMemo(
    () => () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      fetchJson<{ calendario: CalendarDetailData }>(`/api/calendarios/${id}/detail`)
        .then((data) => setCalendario(data.calendario))
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar calendário'))
        .finally(() => setLoading(false));
    },
    [id],
  );

  useEffect(() => {
    loadCalendario();
  }, [loadCalendario]);

  const openPost = calendario?.posts.find((post) => post.id === openPostId) ?? null;

  async function handleCopyClientLink() {
    if (!calendario) return;
    setGeneratingShareLink(true);
    try {
      const data = await fetchJson<{ path: string }>(`/api/calendarios/${calendario.id}/share-link`);
      const url = `${window.location.origin}${data.path}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link do cliente copiado para a área de transferência.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar link para o cliente');
    } finally {
      setGeneratingShareLink(false);
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
        onChange={(view) => navigate('/', { state: { activeView: view } })}
        onRefresh={loadCalendario}
        isRefreshing={loading}
        lastUpdatedAt={Date.now()}
        onLogout={() => void logout()}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
      />

      <main
        className={`min-w-0 animate-fade-in p-4 md:p-6 lg:p-8 ${
          isSidebarCollapsed ? SIDEBAR_MARGIN_COLLAPSED_CLASS : SIDEBAR_MARGIN_EXPANDED_CLASS
        }`}
      >
        <div className="mx-auto max-w-none space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 -ml-2"
              onClick={() => navigate('/', { state: { activeView: 'calendars' } })}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Calendários
            </Button>

            {calendario && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-2 text-white hover:text-white"
                  disabled={generatingShareLink}
                  onClick={handleCopyClientLink}
                >
                  {generatingShareLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Link do cliente
                </Button>
                {calendario.linkCalendarioEditorial && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkCalendarioEditorial} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Calendário editorial
                    </a>
                  </Button>
                )}
                {calendario.linkDriveArtes && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkDriveArtes} target="_blank" rel="noopener noreferrer">
                      <FolderOpen className="h-4 w-4" />
                      Drive do calendário
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
                    <p className="text-sm text-muted-foreground">{calendario.mesAno}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
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
                      <div key={post.id} className="space-y-1.5">
                        <GridThumbShared
                          mediaUrl={mediaUrl}
                          media={post.media}
                          title={post.title}
                          status={decisionStatus(post)}
                          onOpen={() => setOpenPostId(post.id)}
                        />
                        <p className="truncate text-xs font-medium text-foreground">{post.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Dialog open={openPost != null} onOpenChange={(open) => !open && setOpenPostId(null)}>
        <DialogContent className="top-[5vh] max-h-[90vh] max-w-lg translate-y-0 gap-0 overflow-y-auto overscroll-contain rounded-none p-0 [touch-action:pan-y] sm:rounded-none [&>button:last-child]:hidden">
          {openPost && calendario && (
            <PostDetailModal
              post={openPost}
              onClose={() => setOpenPostId(null)}
              onResolved={() => {
                setOpenPostId(null);
                loadCalendario();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
