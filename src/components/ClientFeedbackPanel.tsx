import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FeedbackGridShared, type FeedbackPost } from '@/components/FeedbackGridShared';
import { Progress } from '@/components/ui/progress';

export type FeedbackFilterOptions = {
  designerOptions: string[];
};

// Consome /api/feedback/stream (Server-Sent Events): a tela vai preenchendo
// com os posts de cada calendário assim que ficam prontos, em vez de esperar
// TODOS os calendários resolverem (pode levar dezenas de segundos ao todo,
// já que cada um depende de listar pastas no Google Drive).
export function ClientFeedbackPanel({
  selectedDesigner = 'Todos',
  onFilterOptionsChange,
}: {
  selectedDesigner?: string;
  onFilterOptionsChange?: (options: FeedbackFilterOptions) => void;
}) {
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null);
  const postsRef = useRef<FeedbackPost[]>([]);

  useEffect(() => {
    setPosts([]);
    postsRef.current = [];
    setStreaming(true);
    setError(null);
    setProgress(null);

    let cancelled = false;
    const pollInterval = setInterval(() => {
      fetch('/api/feedback-progress', { credentials: 'include' })
        .then((response) => response.json())
        .then((data: { total: number; done: number; active: boolean }) => {
          if (!cancelled && data.active) setProgress({ total: data.total, done: data.done });
        })
        .catch(() => {});
    }, 400);

    const source = new EventSource('/api/feedback/stream', { withCredentials: true });

    source.addEventListener('post', (event) => {
      const post = JSON.parse((event as MessageEvent).data) as FeedbackPost;
      postsRef.current = [post, ...postsRef.current].sort(
        (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
      );
      setPosts(postsRef.current);
    });

    source.addEventListener('done', () => {
      cancelled = true;
      clearInterval(pollInterval);
      setStreaming(false);
      source.close();
    });

    source.addEventListener('error', () => {
      cancelled = true;
      clearInterval(pollInterval);
      setStreaming(false);
      if (postsRef.current.length === 0) {
        setError('Não foi possível carregar o feedback dos clientes.');
      }
      source.close();
    });

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      source.close();
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

  const hasProgress = progress && progress.total > 0;
  const streamingIndicator = streaming ? (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {hasProgress
          ? `Verificando calendários (${progress.done}/${progress.total})...`
          : 'Carregando feedback dos clientes...'}
      </div>
      {hasProgress && <Progress value={(progress.done / progress.total) * 100} className="h-1.5 max-w-sm" />}
    </div>
  ) : null;

  if (error && posts.length === 0) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (posts.length === 0 && streaming) {
    return streamingIndicator;
  }

  return (
    <div className="space-y-3">
      {streamingIndicator}
      <FeedbackGridShared
        posts={filteredPosts}
        emptyMessage="Nenhum feedback pendente de cliente no momento."
        linkTo={(postId) => `/feedback/posts/${postId}`}
      />
    </div>
  );
}
