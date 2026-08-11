import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { ClientPortalFeed, type PortalPost } from '@/components/ClientPortalFeed';
import hapoLogo from '@/assets/hapo-logo.svg';

type PortalCalendario = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  linkDriveArtes: string;
  posts: PortalPost[];
};

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [calendario, setCalendario] = useState<PortalCalendario | null>(null);
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
      .then((data) => setCalendario(data.calendario))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [token]);

  function handleDecided(postId: string, decision: PortalPost['decision']) {
    setCalendario((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((post) =>
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

  if (error || !calendario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Link inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Calendário não encontrado.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={hapoLogo} alt="hapo" className="h-6 w-auto shrink-0" />
            <div className="h-5 w-px shrink-0 bg-border" />
            <h1 className="truncate text-base font-semibold text-foreground">{calendario.title}</h1>
          </div>
          {calendario.linkDriveArtes && (
            <a
              href={calendario.linkDriveArtes}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Link do Drive
            </a>
          )}
        </div>
      </header>

      <main className="py-1">
        {calendario.posts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum post disponível neste calendário ainda.
          </p>
        ) : (
          <ClientPortalFeed token={token!} posts={calendario.posts} onDecided={handleDecided} />
        )}
      </main>
    </div>
  );
}
