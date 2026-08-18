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
import { AdjustmentsBlock, ReadOnlyPostMedia, PostTags } from '@/components/ClientPortalFeed';
import type { FeedbackPost } from '@/components/FeedbackGridShared';

function buildMediaUrl(fileId: string, calendarId: string, variant: 'thumb' | 'preview' | 'original' = 'preview') {
  return `/api/media/${fileId}?calendarId=${calendarId}&variant=${variant}`;
}

function FeedbackPostDetailContent() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            <ReadOnlyPostMedia
              mediaUrl={(fileId) => buildMediaUrl(fileId, post.calendarId, 'preview')}
              originalMediaUrl={(fileId) => buildMediaUrl(fileId, post.calendarId, 'original')}
              media={post.media}
              title={post.postTitle}
              feedbackHistory={post.feedbackHistory}
            />
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

            <AdjustmentsBlock
              feedbackHistory={post.feedbackHistory}
              resolvedFeedbackHistory={post.resolvedFeedbackHistory}
            />

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
