import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, MessageSquareWarning } from 'lucide-react';
import { PostMediaViewShared } from '@/components/ClientPortalFeed';
import type { FeedbackPost } from '@/components/FeedbackGridShared';

type CopywriterPayload = {
  posts: FeedbackPost[];
};

function mediaUrl(fileId: string) {
  return `/api/public/copywriter-portal/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export default function CopywriterPostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<CopywriterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch('/api/public/copywriter-portal')
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error || 'Não foi possível carregar este link.');
        }
        return body;
      })
      .then((data) => setPayload(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const post = payload?.posts.find((p) => p.postId === postId) ?? null;

  if (error || !payload || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Post não encontrado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este post não está mais disponível.'}</p>
          <Link
            to="/copywriter-portal"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/copywriter-portal')}
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
          </div>
        </div>
      </main>
    </div>
  );
}
