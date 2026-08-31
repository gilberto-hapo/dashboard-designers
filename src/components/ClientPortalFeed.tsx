import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, MapPin, MessageSquareWarning, MoreVertical, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Carousel,
  type CarouselApi,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  id?: number;
  feedback: string;
  createdAt: string;
  mediaFileId?: string | null;
  x?: number | null;
  y?: number | null;
};

export type PortalPostTag = {
  text: string;
  color: string | null;
};

export type PostPipelineStage =
  | 'criacaoTextual'
  | 'criacaoDasArtes'
  | 'direcaoDeArte'
  | 'conferencia'
  | 'validacao'
  | 'aprovado'
  | 'publicado'
  | null;

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
  pipelineStage?: PostPipelineStage;
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

function mediaUrl(token: string, fileId: string, variant: 'thumb' | 'preview' | 'original' = 'preview') {
  return `/api/public/portal/${token}/media/${fileId}?variant=${variant}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function AdjustmentsBlock({
  feedbackHistory,
  resolvedFeedbackHistory,
  onDeleteEntry,
  deletingEntryId,
}: {
  feedbackHistory: FeedbackEntry[];
  resolvedFeedbackHistory: FeedbackEntry[];
  onDeleteEntry?: (entryId: number) => void;
  deletingEntryId?: number | null;
}) {
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);

  let pinCounter = 0;

  return (
    <>
      {feedbackHistory.length > 0 && (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-600">
            <MessageSquareWarning className="h-4 w-4" />
            <span className="text-sm font-semibold">Ajustes solicitados</span>
          </div>
          <ul className="space-y-3">
            {feedbackHistory.map((entry, index) => {
              const hasPin = Boolean(entry.mediaFileId && entry.x != null && entry.y != null);
              if (hasPin) pinCounter += 1;

              return (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className="rounded-lg border border-amber-500/20 bg-background/60 p-3.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                        {formatDate(entry.createdAt)}
                      </span>
                      {hasPin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                          <MapPin className="h-3 w-3" />
                          ponto {pinCounter} na imagem
                        </span>
                      )}
                    </div>
                    {onDeleteEntry && entry.id != null && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 cursor-pointer text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={deletingEntryId === entry.id}
                          >
                            {deletingEntryId === entry.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="cursor-pointer text-muted-foreground data-[highlighted]:bg-transparent data-[highlighted]:text-destructive"
                            onClick={() => setConfirmingDeleteId(entry.id!)}
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="text-base leading-relaxed text-foreground">{entry.feedback}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AlertDialog open={confirmingDeleteId != null} onOpenChange={(open) => !open && setConfirmingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este comentário?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O comentário será removido definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (confirmingDeleteId != null) onDeleteEntry?.(confirmingDeleteId);
                setConfirmingDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {resolvedFeedbackHistory.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowResolvedHistory((v) => !v)}
            className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showResolvedHistory
              ? 'Ocultar ajustes concluídos'
              : `Ver ajustes concluídos (${resolvedFeedbackHistory.length})`}
          </button>
          {showResolvedHistory && (
            <ul className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
              {resolvedFeedbackHistory.map((entry, index) => (
                <li key={`${entry.createdAt}-${index}`} className="text-sm text-muted-foreground">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground/80">
                    {formatDate(entry.createdAt)}
                  </span>
                  {entry.feedback}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export type MediaPin = {
  id: string;
  mediaFileId: string;
  x: number;
  y: number;
  number: number;
  feedback?: string;
  /** true enquanto o cliente ainda está escrevendo o comentário deste pino */
  editing?: boolean;
  /** true para pinos já enviados ao servidor — o balão deles é somente leitura */
  readOnly?: boolean;
};

export function entriesToPins(entries: FeedbackEntry[]): MediaPin[] {
  return entries
    .filter((entry): entry is FeedbackEntry & { mediaFileId: string; x: number; y: number } =>
      Boolean(entry.mediaFileId && entry.x != null && entry.y != null),
    )
    .map((entry, index) => ({
      id: `${entry.mediaFileId}-${entry.createdAt}-${index}`,
      mediaFileId: entry.mediaFileId,
      x: entry.x,
      y: entry.y,
      number: index + 1,
      feedback: entry.feedback,
      readOnly: true,
    }));
}

function PinBubble({
  pin,
  submitting,
  onPinFeedbackChange,
  onConfirmPin,
  onCancelPin,
  onTogglePin,
}: {
  pin: MediaPin;
  submitting?: boolean;
  onPinFeedbackChange?: (pinId: string, feedback: string) => void;
  onConfirmPin?: (pinId: string) => void;
  onCancelPin?: (pinId: string) => void;
  onTogglePin?: (pinId: string) => void;
}) {
  const open = Boolean(pin.editing);
  const alignRight = pin.x > 0.6;
  const alignTop = pin.y > 0.55;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onTogglePin?.(pin.id)}
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-xs font-bold text-white shadow-lg"
      >
        {pin.number}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-20 w-56 space-y-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl',
            alignTop ? 'bottom-7' : 'top-7',
            alignRight ? 'right-0' : 'left-0',
          )}
        >
          {pin.readOnly ? (
            <p className="text-sm text-foreground">{pin.feedback}</p>
          ) : (
            <>
              <Textarea
                autoFocus
                placeholder={`Comentário do ponto ${pin.number}...`}
                value={pin.feedback ?? ''}
                onChange={(e) => onPinFeedbackChange?.(pin.id, e.target.value)}
                disabled={submitting}
                className="min-h-[70px] text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={submitting} onClick={() => onCancelPin?.(pin.id)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={submitting || !pin.feedback?.trim()}
                  onClick={() => onConfirmPin?.(pin.id)}
                >
                  {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Confirmar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MediaPinOverlay({
  mediaFileId,
  pins,
  pinMode,
  submitting,
  onAddPin,
  onPinFeedbackChange,
  onConfirmPin,
  onCancelPin,
  onTogglePin,
}: {
  mediaFileId: string;
  pins?: MediaPin[];
  pinMode?: boolean;
  submitting?: boolean;
  onAddPin?: (mediaFileId: string, x: number, y: number) => void;
  onPinFeedbackChange?: (pinId: string, feedback: string) => void;
  onConfirmPin?: (pinId: string) => void;
  onCancelPin?: (pinId: string) => void;
  onTogglePin?: (pinId: string) => void;
}) {
  const pinsForThisFile = pins?.filter((pin) => pin.mediaFileId === mediaFileId) ?? [];

  return (
    <div
      className={cn('absolute inset-0', pinMode && 'cursor-crosshair')}
      onClick={(e) => {
        if (!pinMode || !onAddPin) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        onAddPin(mediaFileId, x, y);
      }}
    >
      {pinsForThisFile.map((pin) => (
        <PinBubble
          key={pin.id}
          pin={pin}
          submitting={submitting}
          onPinFeedbackChange={onPinFeedbackChange}
          onConfirmPin={onConfirmPin}
          onCancelPin={onCancelPin}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}

export function PostMediaViewShared({
  mediaUrl: buildMediaUrl,
  originalMediaUrl,
  media,
  title,
  pins,
  pinMode,
  submitting,
  onAddPin,
  onPinFeedbackChange,
  onConfirmPin,
  onCancelPin,
  onTogglePin,
}: {
  mediaUrl: (fileId: string) => string;
  /** Quando informado, habilita o botão "Ver em qualidade máxima" na visualização de imagem. */
  originalMediaUrl?: (fileId: string) => string;
  media: PostMedia | null;
  title: string;
  pins?: MediaPin[];
  pinMode?: boolean;
  submitting?: boolean;
  onAddPin?: (mediaFileId: string, x: number, y: number) => void;
  onPinFeedbackChange?: (pinId: string, feedback: string) => void;
  onConfirmPin?: (pinId: string) => void;
  onCancelPin?: (pinId: string) => void;
  onTogglePin?: (pinId: string) => void;
}) {
  if (!media || media.files.length === 0) {
    return (
      <AspectRatio ratio={4 / 5} className="flex items-center justify-center bg-muted">
        <p className="px-4 text-center text-xs text-muted-foreground">Mídia ainda não disponível para este post.</p>
      </AspectRatio>
    );
  }

  if (media.type === 'video') {
    return <SingleVideoFrame src={buildMediaUrl(media.files[0].id)} mimeType={media.files[0].mimeType} poster={media.coverImageId ? buildMediaUrl(media.coverImageId) : undefined} />;
  }

  const pinOverlayProps = {
    pins,
    pinMode,
    submitting,
    onAddPin,
    onPinFeedbackChange,
    onConfirmPin,
    onCancelPin,
    onTogglePin,
  };

  if (media.files.length === 1) {
    return (
      <div>
        <SingleMediaFrame
          src={buildMediaUrl(media.files[0].id)}
          alt={title}
          mediaFileId={media.files[0].id}
          pinOverlayProps={pinOverlayProps}
        />
        {originalMediaUrl ? (
          <div className="flex bg-background px-2">
            <QualityMaxLink href={originalMediaUrl(media.files[0].id)} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <CarouselMediaFrames
      files={media.files}
      title={title}
      buildMediaUrl={buildMediaUrl}
      originalMediaUrl={originalMediaUrl}
      pinOverlayProps={pinOverlayProps}
    />
  );
}

function CarouselMediaFrames({
  files,
  title,
  buildMediaUrl,
  originalMediaUrl,
  pinOverlayProps,
}: {
  files: PostMedia['files'];
  title: string;
  buildMediaUrl: (fileId: string) => string;
  originalMediaUrl?: (fileId: string) => string;
  pinOverlayProps: Omit<Parameters<typeof MediaPinOverlay>[0], 'mediaFileId'>;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const selectedFile = files[selectedIndex];

  return (
    <div>
      <Carousel className="w-full" opts={{ containScroll: 'trimSnaps' }} setApi={setApi}>
        <CarouselContent>
          {files.map((file, index) => (
            <CarouselItem key={file.id}>
              <SingleMediaFrame
                src={buildMediaUrl(file.id)}
                alt={`${title} — imagem ${index + 1}`}
                mediaFileId={file.id}
                pinOverlayProps={pinOverlayProps}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
      {originalMediaUrl && selectedFile ? (
        <div className="flex bg-background px-2">
          <QualityMaxLink href={originalMediaUrl(selectedFile.id)} />
        </div>
      ) : null}
    </div>
  );
}

// Mesma técnica de reserva de espaço do SingleMediaFrame (imagem): sem o
// placeholder com aspect ratio, o vídeo não ocupa nenhum espaço até
// carregar, fazendo o resto da página (badge, tags, legenda) saltar de
// posição quando ele finalmente aparece.
function SingleVideoFrame({ src, mimeType, poster }: { src: string; mimeType: string; poster?: string }) {
  const [ready, setReady] = useState(false);

  return (
    <div className="relative flex max-h-[80vh] w-full items-center justify-center overflow-hidden bg-black">
      {!ready ? <AspectRatio ratio={1080 / 1350} className="animate-pulse bg-muted" /> : null}
      <video
        key={src}
        controls
        playsInline
        className={cn('max-h-[80vh] w-full object-contain', ready ? 'static' : 'absolute inset-0 opacity-0')}
        preload="metadata"
        poster={poster}
        onLoadedMetadata={() => setReady(true)}
      >
        <source src={src} type={mimeType} />
      </video>
    </div>
  );
}

function SingleMediaFrame({
  src,
  alt,
  mediaFileId,
  pinOverlayProps,
}: {
  src: string;
  alt: string;
  mediaFileId: string;
  pinOverlayProps: Omit<Parameters<typeof MediaPinOverlay>[0], 'mediaFileId'>;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full bg-black">
      {!loaded ? (
        <AspectRatio ratio={1080 / 1350} className="animate-pulse bg-muted" />
      ) : null}
      <img
        key={src}
        src={src}
        alt={alt}
        className={cn(
          'block h-auto w-full transition-opacity duration-300',
          loaded ? 'static opacity-100' : 'absolute inset-0 opacity-0',
        )}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
      <MediaPinOverlay mediaFileId={mediaFileId} {...pinOverlayProps} />
    </div>
  );
}

function QualityMaxLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-auto px-1 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
    >
      Ver em qualidade máxima
    </a>
  );
}

/**
 * Variante somente-leitura de PostMediaViewShared para as telas do
 * designer/copywriter: mostra os pins já enviados pelo cliente e permite
 * clicar num pino para ler o comentário, sem habilitar criação de novos.
 */
export function ReadOnlyPostMedia({
  mediaUrl,
  originalMediaUrl,
  media,
  title,
  feedbackHistory,
}: {
  mediaUrl: (fileId: string) => string;
  originalMediaUrl?: (fileId: string) => string;
  media: PostMedia | null;
  title: string;
  feedbackHistory: FeedbackEntry[];
}) {
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  return (
    <PostMediaViewShared
      mediaUrl={mediaUrl}
      originalMediaUrl={originalMediaUrl}
      media={media}
      title={title}
      pins={entriesToPins(feedbackHistory).map((pin) => ({ ...pin, editing: openPinId === pin.id }))}
      onTogglePin={(pinId) => setOpenPinId((current) => (current === pinId ? null : pinId))}
    />
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
  internalLabels = false,
  onOpen,
}: {
  mediaUrl: (fileId: string) => string;
  media: PostMedia | null;
  title: string;
  status?: GridThumbStatus;
  internalLabels?: boolean;
  onOpen: () => void;
}) {
  const firstFile = media?.files?.[0];
  const isVideo = media?.type === 'video';
  const hasMultiple = (media?.files?.length ?? 0) > 1;
  const coverImageId = media?.coverImageId;
  const statusStyle = status ? GRID_THUMB_STATUS_STYLES[status] : null;
  const statusLabel = internalLabels
    ? status === 'approved'
      ? 'Cliente Aprovou'
      : status === 'adjustment'
        ? 'Ajuste do Cliente'
        : statusStyle?.label
    : statusStyle?.label;

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
            {statusLabel}
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

function PostMediaView({
  token,
  media,
  title,
  pins,
  pinMode,
  submitting,
  onAddPin,
  onPinFeedbackChange,
  onConfirmPin,
  onCancelPin,
  onTogglePin,
}: {
  token: string;
  media: PostMedia | null;
  title: string;
  pins?: MediaPin[];
  pinMode?: boolean;
  submitting?: boolean;
  onAddPin?: (mediaFileId: string, x: number, y: number) => void;
  onPinFeedbackChange?: (pinId: string, feedback: string) => void;
  onConfirmPin?: (pinId: string) => void;
  onCancelPin?: (pinId: string) => void;
  onTogglePin?: (pinId: string) => void;
}) {
  return (
    <PostMediaViewShared
      mediaUrl={(fileId) => mediaUrl(token, fileId, 'preview')}
      originalMediaUrl={(fileId) => mediaUrl(token, fileId, 'original')}
      media={media}
      title={title}
      pins={pins}
      pinMode={pinMode}
      submitting={submitting}
      onAddPin={onAddPin}
      onPinFeedbackChange={onPinFeedbackChange}
      onConfirmPin={onConfirmPin}
      onCancelPin={onCancelPin}
      onTogglePin={onTogglePin}
    />
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
      mediaUrl={(fileId) => mediaUrl(token, fileId, 'thumb')}
      media={post.media}
      title={post.title}
      status={decisionStatus(post)}
      onOpen={onOpen}
    />
  );
}

type PendingPin = {
  id: string;
  mediaFileId: string;
  x: number;
  y: number;
  feedback: string;
};

let pendingPinCounter = 0;
function nextPendingPinId() {
  pendingPinCounter += 1;
  return `pin-${pendingPinCounter}`;
}

export function PostDetail({
  token,
  post,
  onDecided,
  onEntryDeleted,
}: {
  token: string;
  post: PortalPost;
  onDecided: (postId: string, decision: PostDecision | null, pins?: FeedbackEntry[]) => void;
  onEntryDeleted?: (postId: string, entryId: number) => void;
}) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [openPinId, setOpenPinId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingPin, setSubmittingPin] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [confirmingApproval, setConfirmingApproval] = useState(false);

  const canEdit = !post.published && !post.decision?.approved;
  const existingPins = entriesToPins(post.feedbackHistory);
  const existingPinsCount = existingPins.length;

  function addPin(mediaFileId: string, x: number, y: number) {
    const id = nextPendingPinId();
    setPendingPin({ id, mediaFileId, x, y, feedback: '' });
    setOpenPinId(id);
  }

  function updatePinFeedback(pinId: string, feedback: string) {
    setPendingPin((current) => (current?.id === pinId ? { ...current, feedback } : current));
  }

  function cancelPin(pinId: string) {
    setPendingPin((current) => (current?.id === pinId ? null : current));
    setOpenPinId((current) => (current === pinId ? null : current));
  }

  async function confirmPin(pinId: string) {
    if (!pendingPin || pendingPin.id !== pinId || !pendingPin.feedback.trim()) return;
    setSubmittingPin(true);
    try {
      const response = await fetch(`/api/public/portal/${token}/posts/${post.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: false,
          pins: [
            {
              feedback: pendingPin.feedback.trim(),
              mediaFileId: pendingPin.mediaFileId,
              x: pendingPin.x,
              y: pendingPin.y,
            },
          ],
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao enviar comentário');
      }

      const nowIso = new Date().toISOString();
      onDecided(post.id, null, [
        {
          feedback: pendingPin.feedback.trim(),
          mediaFileId: pendingPin.mediaFileId,
          x: pendingPin.x,
          y: pendingPin.y,
          createdAt: nowIso,
        },
      ]);
      setPendingPin(null);
      setOpenPinId(null);
      toast.success('Comentário enviado à equipe.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar comentário');
    } finally {
      setSubmittingPin(false);
    }
  }

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

      onDecided(post.id, {
        approved,
        feedback: approved ? null : feedback || null,
        createdAt: new Date().toISOString(),
      });
      setIsRejecting(false);
      setFeedbackText('');
      toast.success(approved ? 'Post aprovado!' : 'Feedback enviado à equipe.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar sua decisão');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEntry(entryId: number) {
    setDeletingEntryId(entryId);
    try {
      const response = await fetch(`/api/public/portal/${token}/posts/${post.id}/decision/${entryId}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao excluir comentário');
      }

      onEntryDeleted?.(post.id, entryId);
      toast.success('Comentário excluído.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir comentário');
    } finally {
      setDeletingEntryId(null);
    }
  }

  return (
    <div className="flex w-full flex-col">
      <div className="w-full bg-black">
        <PostMediaView
          token={token}
          media={post.media}
          title={post.title}
          pinMode={canEdit}
          pins={[
            ...existingPins.map((pin) => ({ ...pin, editing: openPinId === pin.id })),
            ...(pendingPin
              ? [
                  {
                    id: pendingPin.id,
                    mediaFileId: pendingPin.mediaFileId,
                    x: pendingPin.x,
                    y: pendingPin.y,
                    number: existingPinsCount + 1,
                    feedback: pendingPin.feedback,
                    editing: openPinId === pendingPin.id,
                  },
                ]
              : []),
          ]}
          submitting={submittingPin}
          onAddPin={addPin}
          onPinFeedbackChange={updatePinFeedback}
          onConfirmPin={confirmPin}
          onCancelPin={cancelPin}
          onTogglePin={(pinId) => setOpenPinId((current) => (current === pinId ? null : pinId))}
        />
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

        <AdjustmentsBlock
          feedbackHistory={post.feedbackHistory}
          resolvedFeedbackHistory={post.resolvedFeedbackHistory}
          onDeleteEntry={deleteEntry}
          deletingEntryId={deletingEntryId}
        />

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

        if (pendingPosts.length === 0) {
          return null;
        }

        return (
          <div key={group.label ?? index} className="space-y-2">
            {group.label && (
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            )}
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
          </div>
        );
      })}
    </div>
  );
}
