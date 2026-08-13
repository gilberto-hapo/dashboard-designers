import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
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
  const [selectedCopywriter, setSelectedCopywriter] = useState('Todos');

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

  const copywriterOptions = useMemo(() => {
    const names = new Set<string>();
    (payload?.posts ?? []).forEach((post) => {
      const name = post.copywriter?.trim();
      if (name) names.add(name);
    });
    return ['Todos', ...[...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [payload]);

  const filteredPosts = useMemo(() => {
    const posts = payload?.posts ?? [];
    if (selectedCopywriter === 'Todos') return posts;
    return posts.filter((post) => post.copywriter?.trim() === selectedCopywriter);
  }, [payload, selectedCopywriter]);

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={hapoLogo} alt="hapo" className="h-6 w-auto shrink-0" />
            <div className="h-5 w-px shrink-0 bg-border" />
            <h1 className="truncate text-base font-semibold text-foreground">Ajustes — Copywriter</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="relative">
              <select
                value={selectedCopywriter}
                onChange={(event) => setSelectedCopywriter(event.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40"
              >
                {copywriterOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <FeedbackGridShared
          posts={filteredPosts}
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
