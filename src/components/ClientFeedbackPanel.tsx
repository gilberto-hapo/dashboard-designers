import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FeedbackGridShared, type FeedbackPost } from '@/components/FeedbackGridShared';

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
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ posts: FeedbackPost[] }>('/api/feedback')
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
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

  async function handleResolveAdjustments(postId: string) {
    setResolving(true);
    try {
      await fetchJson(`/api/feedback/${postId}/resolve`, { method: 'POST' });
      setPosts((prev) => prev.filter((post) => post.postId !== postId));
      toast.success('Ajustes marcados como finalizados.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar ajustes');
    } finally {
      setResolving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando feedback dos clientes...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <FeedbackGridShared
      posts={filteredPosts}
      resolving={resolving}
      onResolve={handleResolveAdjustments}
      emptyMessage="Nenhum feedback pendente de cliente no momento."
    />
  );
}
