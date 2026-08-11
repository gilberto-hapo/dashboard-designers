import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { GridThumbShared, PostMediaViewShared, type PostMedia } from '@/components/ClientPortalFeed';

type FeedbackHistoryEntry = {
  feedback: string;
  createdAt: string;
};

type FeedbackPost = {
  postId: string;
  postTitle: string;
  calendarId: string;
  calendarTitle: string;
  designer: string;
  caption: string | null;
  media: PostMedia | null;
  latestCreatedAt: string;
  feedbackHistory: FeedbackHistoryEntry[];
  resolvedFeedbackHistory: FeedbackHistoryEntry[];
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro na requisição (status ${response.status})`);
  }
  return body as T;
}

function mediaUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
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
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);

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

  const openPost = filteredPosts.find((post) => post.postId === openPostId) ?? null;

  async function handleResolveAdjustments(postId: string) {
    setResolving(true);
    try {
      await fetchJson(`/api/feedback/${postId}/resolve`, { method: 'POST' });
      setPosts((prev) => prev.filter((post) => post.postId !== postId));
      setOpenPostId(null);
      setShowResolvedHistory(false);
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

  if (filteredPosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <MessageSquareWarning className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhum feedback pendente de cliente no momento.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
        {filteredPosts.map((post) => (
          <div key={post.postId} className="space-y-1.5">
            <div className="overflow-hidden border border-amber-500/40">
              <GridThumbShared
                mediaUrl={mediaUrl}
                media={post.media}
                title={post.postTitle}
                status="adjustment"
                onOpen={() => {
                  setOpenPostId(post.postId);
                  setShowResolvedHistory(false);
                }}
              />
            </div>
            <p className="truncate text-xs font-medium text-foreground">{post.postTitle || post.calendarTitle}</p>
            <p className="truncate text-[11px] text-muted-foreground">{post.calendarTitle}</p>
            {post.designer && (
              <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {post.designer}
              </span>
            )}
          </div>
        ))}
      </div>

      <Dialog
        open={openPost != null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenPostId(null);
            setShowResolvedHistory(false);
            setConfirmingResolve(false);
          }
        }}
      >
        <DialogContent className="top-[5vh] max-h-[90vh] max-w-lg translate-y-0 gap-0 overflow-y-auto overscroll-contain rounded-none p-0 [touch-action:pan-y] sm:rounded-none [&>button:last-child]:hidden">
          {openPost && (
            <>
              <DialogTitle className="sr-only">{openPost.postTitle}</DialogTitle>
              <button
                type="button"
                onClick={() => setOpenPostId(null)}
                className="sticky top-2 z-10 ml-auto mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex w-full flex-col">
                <div className="w-full bg-black">
                  <PostMediaViewShared mediaUrl={mediaUrl} media={openPost.media} title={openPost.postTitle} />
                </div>

                <div className="flex w-full flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {openPost.postTitle || openPost.calendarTitle}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                      Ajuste solicitado
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{openPost.calendarTitle}</p>

                  {openPost.caption && (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{openPost.caption}</p>
                  )}

                  <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Ajustes:</span>
                    <ul className="space-y-2">
                      {openPost.feedbackHistory.map((entry, index) => (
                        <li key={`${entry.createdAt}-${index}`}>
                          <span className="mb-0.5 block text-[10px] text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </span>
                          {entry.feedback}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {openPost.resolvedFeedbackHistory.length > 0 && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setShowResolvedHistory((v) => !v)}
                        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {showResolvedHistory
                          ? 'ocultar ajustes concluídos'
                          : `ver ajustes concluídos (${openPost.resolvedFeedbackHistory.length})`}
                      </button>
                      {showResolvedHistory && (
                        <ul className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                          {openPost.resolvedFeedbackHistory.map((entry, index) => (
                            <li key={`${entry.createdAt}-${index}`}>
                              <span className="mb-0.5 block text-[10px] text-muted-foreground">
                                {formatDate(entry.createdAt)}
                              </span>
                              {entry.feedback}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    <Button
                      className="h-20 w-full gap-2 text-base bg-emerald-600 text-white hover:bg-emerald-600/90"
                      disabled={resolving}
                      onClick={() => setConfirmingResolve(true)}
                    >
                      {resolving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                      Ajustes finalizados
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingResolve} onOpenChange={(open) => !open && setConfirmingResolve(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar ajustes como finalizados?</AlertDialogTitle>
            <AlertDialogDescription>
              O destaque de ajuste pendente será removido deste post no link do cliente. Os comentários ficam salvos no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              disabled={resolving}
              onClick={(event) => {
                event.preventDefault();
                if (openPost) {
                  setConfirmingResolve(false);
                  handleResolveAdjustments(openPost.postId);
                }
              }}
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
