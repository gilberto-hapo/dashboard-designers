import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FeedbackGridShared, type FeedbackPost } from '@/components/FeedbackGridShared';
import { Progress } from '@/components/ui/progress';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro na requisição (status ${response.status})`);
  }
  return body as T;
}

export type FeedbackFilterOptions = {
  designerOptions: string[];
};

export function ClientFeedbackPanel({
  selectedDesigner = 'Todos',
  onFilterOptionsChange,
}: {
  selectedDesigner?: string;
  onFilterOptionsChange?: (options: FeedbackFilterOptions) => void;
}) {
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setProgress(null);

    let cancelled = false;
    const pollInterval = setInterval(() => {
      fetchJson<{ total: number; done: number; active: boolean }>('/api/feedback-progress')
        .then((data) => {
          if (!cancelled && data.active) setProgress({ total: data.total, done: data.done });
        })
        .catch(() => {});
    }, 400);

    fetchJson<{ posts: FeedbackPost[] }>('/api/feedback')
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err.message))
      .finally(() => {
        cancelled = true;
        clearInterval(pollInterval);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, []);

  const designerOptions = useMemo(() => {
    const designers = new Set<string>();
    posts.forEach((post) => {
      if (post.designer) designers.add(post.designer);
    });
    return ['Todos', ...[...designers].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [posts]);

  useEffect(() => {
    onFilterOptionsChange?.({ designerOptions });
  }, [designerOptions, onFilterOptionsChange]);

  const filteredPosts = useMemo(
    () => (selectedDesigner === 'Todos' ? posts : posts.filter((post) => post.designer === selectedDesigner)),
    [posts, selectedDesigner],
  );

  if (loading) {
    const hasProgress = progress && progress.total > 0;
    return (
      <div className="max-w-sm space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {hasProgress
            ? `Carregando calendários (${progress.done}/${progress.total})...`
            : 'Carregando feedback dos clientes...'}
        </div>
        {hasProgress && <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <FeedbackGridShared
      posts={filteredPosts}
      emptyMessage="Nenhum feedback pendente de cliente no momento."
      linkTo={(postId) => `/feedback/posts/${postId}`}
    />
  );
}
