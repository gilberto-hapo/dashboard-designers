import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, MessageSquareWarning } from 'lucide-react';
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
import { PostMediaViewShared, PostTags } from '@/components/ClientPortalFeed';
import type { FeedbackPost } from '@/components/FeedbackGridShared';

function mediaUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function FeedbackPostDetailContent() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ posts: FeedbackPost[] }>('/api/feedback')
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar feedback'))
      .finally(() => setLoading(false));
  }, []);

  const post = posts.find((p) => p.postId === postId) ?? null;

  async function handleResolveAdjustments() {
    if (!post) return;
    setSubmitting(true);
    try {
      await fetchJson(`/api/feedback/${post.postId}/resolve`, { method: 'POST' });
      setConfirmingResolve(false);
      toast.success('Ajustes marcados como finalizados.');
      navigate('/painel/feedback');
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

  if (error || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Post não encontrado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este post não está mais disponível.'}</p>
          <button
            type="button"
            onClick={() => navigate('/painel/feedback')}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/painel/feedback')}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </header>

      <main className="mx-auto w-full max-w-lg">
        <div className="flex w-full flex-col">
          <div className="w-full bg-black">
            <PostMediaViewShared mediaUrl={mediaUrl} media={post.media} title={post.postTitle} />
          </div>

          <div className="flex w-full flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{post.postTitle || post.calendarTitle}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                Ajuste solicitado
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{post.calendarTitle}</p>

            <PostTags tags={post.tags} />

            {post.caption && <p className="whitespace-pre-wrap text-sm text-foreground">{post.caption}</p>}

            <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-600">
                <MessageSquareWarning className="h-4 w-4" />
                <span className="text-sm font-semibold">Ajustes solicitados</span>
              </div>
              <ul className="space-y-3">
                {post.feedbackHistory.map((entry, index) => (
                  <li
                    key={`${entry.createdAt}-${index}`}
                    className="rounded-lg border border-amber-500/20 bg-background/60 p-3.5"
                  >
                    <span className="mb-1.5 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                      {formatDate(entry.createdAt)}
                    </span>
                    <p className="text-base leading-relaxed text-foreground">{entry.feedback}</p>
                  </li>
                ))}
              </ul>
            </div>

            {post.resolvedFeedbackHistory.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowResolvedHistory((v) => !v)}
                  className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {showResolvedHistory
                    ? 'Ocultar ajustes concluídos'
                    : `Ver ajustes concluídos (${post.resolvedFeedbackHistory.length})`}
                </button>
                {showResolvedHistory && (
                  <ul className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
                    {post.resolvedFeedbackHistory.map((entry, index) => (
                      <li key={`${entry.createdAt}-${index}`} className="text-sm text-muted-foreground">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground/80">
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
              <Button
                className="h-20 w-full gap-2 text-base bg-emerald-600 text-white hover:bg-emerald-600/90"
                disabled={submitting}
                onClick={() => setConfirmingResolve(true)}
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Ajustes finalizados
              </Button>
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

export default function FeedbackPostDetail() {
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

  return isAuthenticated ? <FeedbackPostDetailContent /> : <Login />;
}
