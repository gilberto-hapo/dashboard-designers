import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { AdjustmentsBlock, ReadOnlyPostMedia, PostTags } from '@/components/ClientPortalFeed';
import type { FeedbackPost } from '@/components/FeedbackGridShared';

type CopywriterPayload = {
  posts: FeedbackPost[];
};

function buildMediaUrl(fileId: string, variant: 'thumb' | 'preview' | 'original' = 'preview') {
  return `/api/public/copywriter-portal/media/${fileId}?variant=${variant}`;
}

export default function CopywriterPostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<CopywriterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <ReadOnlyPostMedia
              mediaUrl={(fileId) => buildMediaUrl(fileId, 'preview')}
              originalMediaUrl={(fileId) => buildMediaUrl(fileId, 'original')}
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
          </div>
        </div>
      </main>
    </div>
  );
}
