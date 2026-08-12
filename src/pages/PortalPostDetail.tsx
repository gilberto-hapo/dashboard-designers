import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { PostDetail, type PortalPost } from '@/components/ClientPortalFeed';

type PortalCalendarioResumo = {
  id: string;
  title: string;
  mesAno: string;
  linkDriveArtes: string;
  posts: PortalPost[];
};

type PortalCliente = {
  id: string;
  nome: string;
  calendarios: PortalCalendarioResumo[];
};

export default function PortalPostDetail() {
  const { token, postId } = useParams<{ token: string; postId: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<PortalCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);

    fetch(`/api/public/portal/${token}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error || 'Não foi possível carregar este link.');
        }
        return body;
      })
      .then((data) => setCliente(data.cliente))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [token]);

  function handleDecided(postId: string, decision: PortalPost['decision']) {
    setCliente((prev) =>
      prev
        ? {
            ...prev,
            calendarios: prev.calendarios.map((calendario) => ({
              ...calendario,
              posts: calendario.posts.map((post) =>
                post.id === postId
                  ? {
                      ...post,
                      decision,
                      feedbackHistory:
                        decision && !decision.approved && decision.feedback
                          ? [...post.feedbackHistory, { feedback: decision.feedback, createdAt: decision.createdAt }]
                          : post.feedbackHistory,
                    }
                  : post,
              ),
            })),
          }
        : prev,
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allPosts = cliente?.calendarios.flatMap((calendario) => calendario.posts) ?? [];
  const post = allPosts.find((p) => p.id === postId) ?? null;

  if (error || !cliente || !post || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Post não encontrado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este post não está mais disponível.'}</p>
          <Link
            to={`/portal/${token}`}
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
          onClick={() => navigate(`/portal/${token}`)}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </header>

      <main className="mx-auto w-full max-w-lg">
        <PostDetail token={token} post={post} onDecided={handleDecided} />
      </main>
    </div>
  );
}
