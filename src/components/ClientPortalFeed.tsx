import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageSquareWarning, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

export type PostMedia = {
  type: 'image' | 'video';
  files: Array<{ id: string; mimeType: string }>;
  coverImageId?: string | null;
};

export type PostDecision = {
  approved: boolean;
  feedback: string | null;
  createdAt: string;
};

export type FeedbackEntry = {
  feedback: string;
  createdAt: string;
};

export type PortalPostTag = {
  text: string;
  color: string | null;
};

export type PortalPost = {
  id: string;
  title: string;
  folderName?: string;
  goalfyCardTitle?: string;
  formatoEntrega: string;
  caption: string | null;
  media: PostMedia | null;
  decision: PostDecision | null;
  published?: boolean;
  feedbackHistory: FeedbackEntry[];
  resolvedFeedbackHistory: FeedbackEntry[];
  calendarLabel?: string;
  tags?: PortalPostTag[];
};

function getTagTextColor(hexColor: string | null) {
  if (!hexColor) return '#ffffff';
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

export function PostTags({ tags }: { tags?: PortalPostTag[] }) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag, index) => (
        <span
          key={`${tag.text}-${index}`}
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase"
          style={{
            backgroundColor: tag.color || '#6b7280',
            color: getTagTextColor(tag.color),
          }}
        >
          {tag.text}
        </span>
      ))}
    </div>
  );
}

function mediaUrl(token: string, fileId: string) {
  return `/api/public/portal/${token}/media/${fileId}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function PostMediaViewShared({
  mediaUrl: buildMediaUrl,
  media,
  title,
}: {
  mediaUrl: (fileId: string) => string;
  media: PostMedia | null;
  title: string;
}) {
  if (!media || media.files.length === 0) {
    return (
      <AspectRatio ratio={4 / 5} className="flex items-center justify-center bg-muted">
        <p className="px-4 text-center text-xs text-muted-foreground">Mídia ainda não disponível para este post.</p>
      </AspectRatio>
    );
  }

  if (media.type === 'video') {
    return (
      <div className="flex items-center justify-center overflow-hidden bg-black">
        <video
          controls
          playsInline
          className="w-full object-contain"
          preload="metadata"
          poster={media.coverImageId ? buildMediaUrl(media.coverImageId) : undefined}
        >
          <source src={buildMediaUrl(media.files[0].id)} type={media.files[0].mimeType} />
        </video>
      </div>
    );
  }

  if (media.files.length === 1) {
    return (
      <AspectRatio ratio={4 / 5} className="overflow-hidden bg-muted">
        <img
          src={buildMediaUrl(media.files[0].id)}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </AspectRatio>
    );
  }

  return (
    <Carousel className="w-full">
      <CarouselContent>
        {media.files.map((file, index) => (
          <CarouselItem key={file.id}>
            <AspectRatio ratio={4 / 5} className="overflow-hidden bg-muted">
              <img
                src={buildMediaUrl(file.id)}
                alt={`${title} — imagem ${index + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </AspectRatio>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2" />
      <CarouselNext className="right-2" />
    </Carousel>
  );
}

export type GridThumbStatus = 'approved' | 'published' | 'adjustment' | null;

const GRID_THUMB_STATUS_STYLES: Record<
  Exclude<GridThumbStatus, null>,
  { border: string; overlay: string; badge: string; label: string }
> = {
  approved: {
    border: 'border-emerald-500',
    overlay: 'bg-emerald-500/10',
    badge: 'bg-emerald-500 text-white',
    label: 'Aprovado',
  },
  published: {
    border: 'border-sky-500',
    overlay: 'bg-sky-500/10',
    badge: 'bg-sky-500 text-white',
    label: 'Publicado',
  },
  adjustment: {
    border: 'border-amber-500',
    overlay: 'bg-amber-500/10',
    badge: 'bg-amber-500 text-white',
    label: 'Ajuste',
  },
};

export function GridThumbShared({
  mediaUrl: buildMediaUrl,
  media,
  title,
  status,
  onOpen,
}: {
  mediaUrl: (fileId: string) => string;
  media: PostMedia | null;
  title: string;
  status?: GridThumbStatus;
  onOpen: () => void;
}) {
  const firstFile = media?.files?.[0];
  const isVideo = media?.type === 'video';
  const hasMultiple = (media?.files?.length ?? 0) > 1;
  const coverImageId = media?.coverImageId;
  const statusStyle = status ? GRID_THUMB_STATUS_STYLES[status] : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block aspect-[3/4] w-full overflow-hidden bg-muted focus:outline-none"
    >
      {!firstFile ? (
        <div className="flex h-full w-full items-center justify-center p-2">
          <p className="text-center text-[10px] text-muted-foreground">Mídia ainda não disponível</p>
        </div>
      ) : isVideo ? (
        <>
          {coverImageId ? (
            <img
              src={buildMediaUrl(coverImageId)}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <video className="h-full w-full object-cover" preload="metadata" muted playsInline>
              <source src={buildMediaUrl(firstFile.id)} type={firstFile.mimeType} />
            </video>
          )}
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50">
            <Play className="h-3 w-3 fill-white text-white" />
          </span>
        </>
      ) : (
        <img
          src={buildMediaUrl(firstFile.id)}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
      )}
      {hasMultiple && (
        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          1/{media?.files.length}
        </span>
      )}
      {statusStyle && (
        <>
          <span className={`absolute inset-0 ${statusStyle.overlay}`} />
          <span className={`pointer-events-none absolute inset-0 border-[3px] ${statusStyle.border}`} />
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle.badge}`}
          >
            {statusStyle.label}
          </span>
        </>
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </button>
  );
}

function CaptionText({ caption }: { caption: string | null }) {
  if (!caption) return null;

  return <div className="whitespace-pre-wrap text-sm text-foreground">{caption}</div>;
}

function PostMediaView({ token, media, title }: { token: string; media: PostMedia | null; title: string }) {
  return <PostMediaViewShared mediaUrl={(fileId) => mediaUrl(token, fileId)} media={media} title={title} />;
}

function ResolvedFeedbackToggle({ entries }: { entries: FeedbackEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {expanded ? 'Ocultar ajustes concluídos' : `Ver ajustes concluídos (${entries.length})`}
      </button>
      {expanded && (
        <ul className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
          {entries.map((entry, index) => (
            <li key={`${entry.createdAt}-${index}`} className="text-sm text-muted-foreground">
              <span className="mb-1 block text-xs font-medium text-muted-foreground/80">{formatDate(entry.createdAt)}</span>
              {entry.feedback}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecisionBadge({
  decision,
  published,
  hasPendingAdjustments,
}: {
  decision: PostDecision | null;
  published?: boolean;
  hasPendingAdjustments?: boolean;
}) {
  if (published) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Publicado
      </span>
    );
  }

  if (decision?.approved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aprovado
      </span>
    );
  }

  if (hasPendingAdjustments) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
        <MessageSquareWarning className="h-3.5 w-3.5" />
        Ajuste solicitado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
      Aguardando sua avaliação
    </span>
  );
}

function decisionStatus(post: PortalPost): GridThumbStatus {
  if (post.feedbackHistory.length > 0) return 'adjustment';
  if (post.published) return 'published';
  if (post.decision?.approved) return 'approved';
  return null;
}

function GridThumb({ token, post, onOpen }: { token: string; post: PortalPost; onOpen: () => void }) {
  return (
    <GridThumbShared
      mediaUrl={(fileId) => mediaUrl(token, fileId)}
      media={post.media}
      title={post.title}
      status={decisionStatus(post)}
      onOpen={onOpen}
    />
  );
}

export function PostDetail({
  token,
  post,
  onDecided,
}: {
  token: string;
  post: PortalPost;
  onDecided: (postId: string, decision: PostDecision) => void;
}) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);

  async function submitDecision(approved: boolean, feedback?: string) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/public/portal/${token}/posts/${post.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, feedback }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao enviar sua decisão');
      }

      onDecided(post.id, { approved, feedback: approved ? null : feedback || null, createdAt: new Date().toISOString() });
      setIsRejecting(false);
      setFeedbackText('');
      toast.success(approved ? 'Post aprovado!' : 'Feedback enviado à equipe.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar sua decisão');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col">
      <div className="w-full bg-black">
        <PostMediaView token={token} media={post.media} title={post.title} />
      </div>

      <div className="flex w-full flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
            {post.formatoEntrega || 'Post'}
          </span>
          <DecisionBadge
            decision={post.decision}
            published={post.published}
            hasPendingAdjustments={post.feedbackHistory.length > 0}
          />
        </div>

        <PostTags tags={post.tags} />

        <CaptionText caption={post.caption} />

        {post.feedbackHistory.length > 0 && (
          <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-amber-600">
              <MessageSquareWarning className="h-4 w-4" />
              <span className="text-sm font-semibold">Ajustes solicitados</span>
            </div>
            <ul className="space-y-3">
              {post.feedbackHistory.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className="rounded-lg border border-amber-500/20 bg-background/60 p-3.5"
                >
                  <span className="mb-1.5 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                    {formatDate(entry.createdAt)}
                  </span>
                  <p className="text-base leading-relaxed text-foreground">{entry.feedback}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {post.resolvedFeedbackHistory.length > 0 && (
          <ResolvedFeedbackToggle entries={post.resolvedFeedbackHistory} />
        )}

        <div className="mt-auto pt-2">
          {post.published ? null : !isRejecting ? (
            <div className="flex flex-col gap-6 sm:flex-row">
              <Button
                className="h-20 w-full shrink-0 gap-2 text-base bg-emerald-600 text-white hover:bg-emerald-600/90 sm:w-auto sm:flex-1"
                disabled={submitting || post.decision?.approved}
                onClick={() => setConfirmingApproval(true)}
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Aprovar
              </Button>
              <Button
                className="h-20 w-full shrink-0 gap-2 text-base sm:w-auto sm:flex-1"
                disabled={submitting || post.decision?.approved}
                onClick={() => setIsRejecting(true)}
              >
                <MessageSquareWarning className="h-5 w-5" />
                Pedir ajustes
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Descreva o que precisa ser ajustado..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                disabled={submitting}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => {
                    setIsRejecting(false);
                    setFeedbackText('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  disabled={submitting || !feedbackText.trim()}
                  onClick={() => submitDecision(false, feedbackText.trim())}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmingApproval} onOpenChange={(open) => !open && setConfirmingApproval(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar este post?</AlertDialogTitle>
            <AlertDialogDescription>
              Depois de aprovado, não será mais possível pedir ajustes para este post.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                setConfirmingApproval(false);
                submitDecision(true);
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Aprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ClientPortalFeed({
  token,
  posts,
}: {
  token: string;
  posts: PortalPost[];
}) {
  const navigate = useNavigate();
  const visiblePosts = posts.filter((post) => (post.media?.files?.length ?? 0) > 0);

  const groups: Array<{ label: string | null; posts: PortalPost[] }> = [];
  visiblePosts.forEach((post) => {
    const label = post.calendarLabel ?? null;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.posts.push(post);
    } else {
      groups.push({ label, posts: [post] });
    }
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-1 sm:px-4">
      {groups.map((group, index) => {
        const pendingPosts = group.posts.filter((post) => !post.published);

        return (
          <div key={group.label ?? index} className="space-y-2">
            {group.label && (
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            )}
            {pendingPosts.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Nenhum post pendente.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {pendingPosts.map((post) => (
                  <GridThumb
                    key={post.id}
                    token={token}
                    post={post}
                    onOpen={() => navigate(`/portal/${token}/posts/${post.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
