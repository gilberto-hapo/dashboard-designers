import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageSquareWarning, X } from 'lucide-react';
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
import {
  AdjustmentsBlock,
  GridThumbShared,
  ReadOnlyPostMedia,
  type PortalPostTag,
  type PostMedia,
} from '@/components/ClientPortalFeed';

export type FeedbackHistoryEntry = {
  id?: number;
  feedback: string;
  createdAt: string;
  mediaFileId?: string | null;
  x?: number | null;
  y?: number | null;
};

export type FeedbackPost = {
  postId: string;
  postTitle: string;
  calendarId: string;
  calendarTitle: string;
  designer: string;
  copywriter?: string;
  caption: string | null;
  media: PostMedia | null;
  latestCreatedAt: string;
  feedbackHistory: FeedbackHistoryEntry[];
  resolvedFeedbackHistory: FeedbackHistoryEntry[];
  tags?: PortalPostTag[];
};

function mediaUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

export function FeedbackGridShared({
  posts,
  readOnly = false,
  onResolve,
  resolving = false,
  mediaUrl: mediaUrlOverride,
  emptyMessage = 'Nenhum feedback pendente de cliente no momento.',
  gridClassName = 'grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6',
  showCopywriterTag = false,
  linkTo,
}: {
  posts: FeedbackPost[];
  readOnly?: boolean;
  onResolve?: (postId: string) => void;
  resolving?: boolean;
  mediaUrl?: (fileId: string) => string;
  emptyMessage?: string;
  gridClassName?: string;
  showCopywriterTag?: boolean;
  linkTo?: (postId: string) => string;
}) {
  const navigate = useNavigate();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [confirmingResolve, setConfirmingResolve] = useState(false);

  const resolveMediaUrl = mediaUrlOverride || mediaUrl;
  const openPost = posts.find((post) => post.postId === openPostId) ?? null;

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <MessageSquareWarning className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className={gridClassName}>
        {posts.map((post) => (
          <div key={post.postId} className="space-y-1.5">
            <div className="overflow-hidden border border-amber-500/40">
              <GridThumbShared
                mediaUrl={resolveMediaUrl}
                media={post.media}
                title={post.postTitle}
                status="adjustment"
                onOpen={() => {
                  if (linkTo) {
                    navigate(linkTo(post.postId));
                    return;
                  }
                  setOpenPostId(post.postId);
                }}
              />
            </div>
            <p className="truncate text-xs font-medium text-foreground">{post.postTitle || post.calendarTitle}</p>
            <p className="truncate text-[11px] text-muted-foreground">{post.calendarTitle}</p>
            <div className="flex flex-wrap gap-1">
              {post.designer && (
                <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {post.designer}
                </span>
              )}
              {showCopywriterTag && post.copywriter && (
                <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {post.copywriter.trim().split(/\s+/)[0]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={openPost != null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenPostId(null);
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
                  <ReadOnlyPostMedia
                    mediaUrl={resolveMediaUrl}
                    media={openPost.media}
                    title={openPost.postTitle}
                    feedbackHistory={openPost.feedbackHistory}
                  />
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

                  <AdjustmentsBlock
                    key={openPost.postId}
                    feedbackHistory={openPost.feedbackHistory}
                    resolvedFeedbackHistory={openPost.resolvedFeedbackHistory}
                  />

                  {!readOnly && (
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
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {!readOnly && (
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
                    onResolve?.(openPost.postId);
                  }
                }}
              >
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Finalizar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
