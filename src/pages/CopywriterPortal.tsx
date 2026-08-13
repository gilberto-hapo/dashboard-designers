import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { FeedbackGridShared, type FeedbackPost } from '@/components/FeedbackGridShared';
import hapoLogo from '@/assets/hapo-logo.svg';

type CopywriterPayload = {
  posts: FeedbackPost[];
};

export default function CopywriterPortal() {
  const [payload, setPayload] = useState<CopywriterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(options?: { forceRefresh?: boolean }) {
    const isRefresh = Boolean(options?.forceRefresh);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const query = isRefresh ? '?refresh=1' : '';
    fetch(`/api/public/copywriter-portal${query}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error || 'Não foi possível carregar este link.');
        }
        return body;
      })
      .then((data) => setPayload(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar</h1>
          <p className="text-sm text-muted-foreground">{error || 'Erro desconhecido.'}</p>
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
            <h1 className="truncate text-base font-semibold text-foreground">Ajustes — Copywriter</h1>
          </div>
          <button
            type="button"
            onClick={() => load({ forceRefresh: true })}
            disabled={refreshing}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Atualizando...' : 'Atualizar dados'}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <FeedbackGridShared
          posts={payload.posts}
          readOnly
          mediaUrl={(fileId) => `/api/public/copywriter-portal/media/${fileId}`}
          emptyMessage="Nenhum ajuste pendente no momento."
          gridClassName="grid grid-cols-3 gap-1 sm:gap-2"
          showCopywriterTag
        />
      </main>
    </div>
  );
}
