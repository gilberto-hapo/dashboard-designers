import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import Login from './Login';
import { fetchJson } from '@/lib/calendarUi';
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
import { PostMediaViewShared, type FeedbackEntry, type PortalPost } from '@/components/ClientPortalFeed';

type CalendarDetailData = {
  id: string;
  title: string;
  posts: PortalPost[];
};

function mediaUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
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

function CalendarPostDetailContent() {
  const { id, postId } = useParams<{ id: string; postId: string }>();
  const navigate = useNavigate();

  const [calendario, setCalendario] = useState<CalendarDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchJson<{ calendario: CalendarDetailData }>(`/api/calendarios/${id}/detail`)
      .then((data) => setCalendario(data.calendario))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar calendário'))
      .finally(() => setLoading(false));
  }, [id]);

  const post = calendario?.posts.find((p) => p.id === postId) ?? null;

  async function handleResolveAdjustments() {
    if (!post) return;
    setSubmitting(true);
    try {
      await fetchJson(`/api/feedback/${post.id}/resolve`, { method: 'POST' });
      setConfirmingResolve(false);
      toast.success('Ajustes marcados como finalizados.');
      navigate(`/calendarios/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar ajustes');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !calendario || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Post não encontrado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este post não está mais disponível.'}</p>
          <button
            type="button"
            onClick={() => navigate(`/calendarios/${id}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const isApproved = Boolean(post.decision?.approved);
  const isPublished = Boolean(post.published);
  const hasPendingAdjustments = post.feedbackHistory.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/calendarios/${id}`)}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </header>

      <main className="mx-auto w-full max-w-lg">
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

            <div className="pt-2">
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
      </main>

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
    </div>
  );
}

export default function CalendarPostDetail() {
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

  return isAuthenticated ? <CalendarPostDetailContent /> : <Login />;
}
