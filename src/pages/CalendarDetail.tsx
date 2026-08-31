import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import Login from './Login';
import {
  SidebarNav,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_MARGIN_COLLAPSED_CLASS,
  SIDEBAR_MARGIN_EXPANDED_CLASS,
} from '@/components/SidebarNav';
import {
  fetchJson,
  getFirstName,
  SegmentedConclusionBar,
  type ProgressSegment,
} from '@/lib/calendarUi';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { Button } from '@/components/ui/button';
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
  GridThumbShared,
  type GridThumbStatus,
  type PortalPost,
  type PostPipelineStage,
} from '@/components/ClientPortalFeed';

type CalendarDetailData = {
  id: string;
  title: string;
  clienteNome: string;
  clientId: string | null;
  mesAno: string;
  designer: string;
  copywriter?: string;
  planejador?: string;
  linkDriveArtes: string;
  phaseTitle: string;
  phaseColor: string;
  linkCalendarioEditorial: string;
  postsContratados: number;
  postsConectados: number;
  postsConcluidos: number;
  postsCriacaoTextual: number;
  postsCriacaoDasArtes: number;
  postsDirecaoDeArte: number;
  postsConferencia: number;
  postsEmValidacao: number;
  postsAprovados: number;
  postsPublicados: number;
  posts: PortalPost[];
};

function decisionStatus(post: PortalPost): GridThumbStatus {
  if (post.feedbackHistory.length > 0) return 'adjustment';
  if (post.published) return null;
  if (post.decision?.approved) return 'approved';
  return null;
}

const PIPELINE_STAGE_STYLES: Record<Exclude<PostPipelineStage, null>, { label: string; className: string }> = {
  criacaoTextual: { label: 'Criação Textual', className: 'border-red-500/30 bg-red-500/10 text-red-400' },
  criacaoDasArtes: { label: 'Criação das Artes', className: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400' },
  direcaoDeArte: { label: 'Direção de Arte', className: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
  conferencia: { label: 'Conferência', className: 'border-orange-400/30 bg-orange-400/10 text-orange-300' },
  validacao: { label: 'Validação', className: 'border-orange-500/30 bg-orange-500/10 text-orange-400' },
  aprovado: { label: 'Aprovado para Programação', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  publicado: { label: 'Publicado', className: 'border-sky-500/30 bg-sky-500/10 text-sky-400' },
};

// Resumo do topo: reflete só a FASE do kanban da Goalfy (post.pipelineStage),
// sem misturar com a decisao do cliente no portal (aprovado/publicado/ajuste
// via decisionStatus) — um post pode estar em "Validação do Cliente" no
// kanban mesmo já tendo uma decisão registrada de uma rodada anterior.
function getPostsPipelineStageCounts(posts: PortalPost[]) {
  const counts = {
    criacaoTextual: 0,
    criacaoDasArtes: 0,
    direcaoDeArte: 0,
    conferencia: 0,
    validacao: 0,
    aprovado: 0,
    publicado: 0,
  };
  posts.forEach((post) => {
    const stage = post.pipelineStage ?? 'criacaoTextual';
    if (stage === 'criacaoDasArtes') counts.criacaoDasArtes += 1;
    else if (stage === 'direcaoDeArte') counts.direcaoDeArte += 1;
    else if (stage === 'conferencia') counts.conferencia += 1;
    else if (stage === 'validacao') counts.validacao += 1;
    else if (stage === 'aprovado') counts.aprovado += 1;
    else if (stage === 'publicado') counts.publicado += 1;
    else counts.criacaoTextual += 1;
  });
  return counts;
}

function getPostsConclusionSegments(posts: PortalPost[]) {
  const total = posts.length;
  const counts = {
    criacaoTextual: 0,
    criacaoDasArtes: 0,
    direcaoDeArte: 0,
    conferencia: 0,
    validacao: 0,
    aprovado: 0,
    publicado: 0,
    ajuste: 0,
  };
  posts.forEach((post) => {
    if (decisionStatus(post) === 'adjustment') {
      counts.ajuste += 1;
      return;
    }
    const stage = post.pipelineStage ?? 'criacaoTextual';
    counts[stage] += 1;
  });

  const decidedTotal = counts.aprovado + counts.publicado;
  const segments: ProgressSegment[] = [
    { key: 'criacaoTextual', count: counts.criacaoTextual, className: 'bg-red-500' },
    { key: 'criacaoDasArtes', count: counts.criacaoDasArtes, className: 'bg-yellow-400' },
    { key: 'direcaoDeArte', count: counts.direcaoDeArte, className: 'bg-purple-500' },
    { key: 'conferencia', count: counts.conferencia, className: 'bg-orange-400' },
    { key: 'validacao', count: counts.validacao, className: 'bg-orange-500' },
    { key: 'aprovado', count: counts.aprovado, className: 'bg-emerald-500' },
    { key: 'publicado', count: counts.publicado, className: 'bg-sky-500' },
    { key: 'ajuste', count: counts.ajuste, className: 'bg-amber-400' },
  ];

  const percent = total > 0 ? Math.round((decidedTotal / total) * 100) : 0;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const textColor =
    clampedPercent >= 67 ? 'text-emerald-500' : clampedPercent >= 34 ? 'text-yellow-400' : 'text-red-500';

  return { segments, percent: clampedPercent, textColor, total };
}

function buildMediaUrl(fileId: string, calendarId: string, variant: 'thumb' | 'preview' | 'original' = 'preview') {
  return `/api/media/${fileId}?calendarId=${calendarId}&variant=${variant}`;
}

function CalendarDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) !== '0',
  );
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  const pendingFeedbackCount = usePendingFeedbackCount();

  const [calendario, setCalendario] = useState<CalendarDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [concludeError, setConcludeError] = useState<string | null>(null);
  const [generatingClientLink, setGeneratingClientLink] = useState(false);

  const loadCalendario = useMemo(
    () => (options?: { forceRefresh?: boolean }) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      const query = options?.forceRefresh ? '?refresh=1' : '';
      fetchJson<{ calendario: CalendarDetailData }>(`/api/calendarios/${id}/detail${query}`)
        .then((data) => setCalendario(data.calendario))
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar calendário'))
        .finally(() => setLoading(false));
    },
    [id],
  );

  useEffect(() => {
    loadCalendario();
  }, [loadCalendario]);

  const refreshCalendario = () => loadCalendario({ forceRefresh: true });

  async function handleOpenClientLink() {
    if (!calendario?.clientId) return;
    setGeneratingClientLink(true);
    try {
      const data = await fetchJson<{ path: string }>(`/api/clientes/${calendario.clientId}/share-link`);
      const url = `${window.location.origin}${data.path}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar link para o cliente');
    } finally {
      setGeneratingClientLink(false);
    }
  }

  async function handleConfirmConclude() {
    if (!calendario) return;
    setConcluding(true);
    setConcludeError(null);
    try {
      await fetchJson('/api/criar-cards/move-calendar-to-posts-programados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: calendario.id }),
      });
      setConfirmingConclude(false);
      navigate('/');
    } catch (err) {
      setConcludeError(err instanceof Error ? err.message : 'Erro ao concluir calendário');
    } finally {
      setConcluding(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav
        activeView="calendars"
        onChange={(view) => navigate(`/painel/${view}`)}
        onRefresh={refreshCalendario}
        isRefreshing={loading}
        lastUpdatedAt={Date.now()}
        onLogout={() => void logout()}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
        badgeCounts={{ feedback: pendingFeedbackCount }}
      />

      <main
        className={`min-w-0 animate-fade-in p-4 pb-24 md:p-6 lg:p-8 lg:pb-8 ${
          isSidebarCollapsed ? SIDEBAR_MARGIN_COLLAPSED_CLASS : SIDEBAR_MARGIN_EXPANDED_CLASS
        }`}
      >
        <div className="mx-auto max-w-none space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 -ml-2"
              onClick={() => navigate('/painel/calendars')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Calendários
            </Button>

            {calendario && (
              <div className="flex flex-wrap gap-2">
                {calendario.clientId && (
                  <Button
                    variant="outline"
                    className="gap-2 text-white hover:text-white"
                    disabled={generatingClientLink}
                    onClick={handleOpenClientLink}
                  >
                    {generatingClientLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Link do Cliente
                  </Button>
                )}
                {calendario.linkCalendarioEditorial && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkCalendarioEditorial} target="_blank" rel="noopener noreferrer">
                      <CalendarDays className="h-4 w-4" />
                      Calendário editorial
                    </a>
                  </Button>
                )}
                {calendario.linkDriveArtes && (
                  <Button variant="outline" className="gap-2 text-white hover:text-white" asChild>
                    <a href={calendario.linkDriveArtes} target="_blank" rel="noopener noreferrer">
                      <FolderOpen className="h-4 w-4" />
                      Link do Drive
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="gap-2 text-white hover:text-white"
                  onClick={() => {
                    setConcludeError(null);
                    setConfirmingConclude(true);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir calendário
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando calendário...
            </div>
          ) : error || !calendario ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error || 'Calendário não encontrado.'}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-foreground">{calendario.title}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {calendario.designer && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.designer)}
                        </span>
                      )}
                      {calendario.copywriter && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.copywriter)}
                        </span>
                      )}
                      {calendario.planejador && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {getFirstName(calendario.planejador)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="inline-flex shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      borderColor: calendario.phaseColor,
                      backgroundColor: `${calendario.phaseColor}1a`,
                      color: calendario.phaseColor,
                    }}
                  >
                    {calendario.phaseTitle}
                  </span>
                </div>

                <SegmentedConclusionBar
                  segments={getPostsConclusionSegments(calendario.posts).segments}
                  total={getPostsConclusionSegments(calendario.posts).total}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {(() => {
                    const pipelineCounts = getPostsPipelineStageCounts(calendario.posts);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-400 ${pipelineCounts.criacaoTextual > 0 ? '' : 'opacity-50'}`}>
                          Criação Textual
                          <span className={pipelineCounts.criacaoTextual > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.criacaoTextual}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-1 text-yellow-400 ${pipelineCounts.criacaoDasArtes > 0 ? '' : 'opacity-50'}`}>
                          Criação das Artes
                          <span className={pipelineCounts.criacaoDasArtes > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.criacaoDasArtes}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-400 ${pipelineCounts.direcaoDeArte > 0 ? '' : 'opacity-50'}`}>
                          Direção de Arte
                          <span className={pipelineCounts.direcaoDeArte > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.direcaoDeArte}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-orange-300 ${pipelineCounts.conferencia > 0 ? '' : 'opacity-50'}`}>
                          Conferência
                          <span className={pipelineCounts.conferencia > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.conferencia}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-orange-400 ${pipelineCounts.validacao > 0 ? '' : 'opacity-50'}`}>
                          Validação
                          <span className={pipelineCounts.validacao > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.validacao}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 ${pipelineCounts.aprovado > 0 ? '' : 'opacity-50'}`}>
                          Aprovado para Programação
                          <span className={pipelineCounts.aprovado > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.aprovado}
                          </span>
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-sky-400 ${pipelineCounts.publicado > 0 ? '' : 'opacity-50'}`}>
                          Publicado
                          <span className={pipelineCounts.publicado > 0 ? 'font-bold text-white' : ''}>
                            {pipelineCounts.publicado}
                          </span>
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      Contrato
                      <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/70">
                        {calendario.postsContratados}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      Cards criados
                      <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/70">
                        {calendario.postsConectados}
                      </span>
                    </span>
                    {(() => {
                      const diff = calendario.postsConectados - calendario.postsContratados;
                      if (diff === 0) return null;
                      return (
                        <span className={`text-[11px] font-semibold ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Posts ({calendario.posts.length})
                </h2>
                {calendario.posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pasta de post encontrada no Drive deste calendário.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                    {calendario.posts.map((post) => (
                      <div key={post.id}>
                        <GridThumbShared
                          mediaUrl={(fileId) => buildMediaUrl(fileId, id!, 'thumb')}
                          media={post.media}
                          title={post.goalfyCardTitle || post.title}
                          status={decisionStatus(post)}
                          internalLabels
                          onOpen={() => navigate(`/calendarios/${id}/posts/${post.id}`)}
                        />
                        <p className="mt-1.5 truncate text-xs font-medium text-foreground">
                          {post.goalfyCardTitle || post.title}
                        </p>
                        {post.folderName && (
                          <p className="truncate text-[11px] text-muted-foreground">Pasta: {post.folderName}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            {post.formatoEntrega || 'Post'}
                          </span>
                          {post.pipelineStage && (
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${PIPELINE_STAGE_STYLES[post.pipelineStage].className}`}
                            >
                              {PIPELINE_STAGE_STYLES[post.pipelineStage].label}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <AlertDialog
        open={confirmingConclude}
        onOpenChange={(open) => {
          if (!open && !concluding) {
            setConfirmingConclude(false);
            setConcludeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir calendário?</AlertDialogTitle>
            <AlertDialogDescription>
              {calendario
                ? `"${calendario.title}" será movido para Posts Programados e você voltará para a lista de calendários.`
                : ''}
              {concludeError && <span className="mt-2 block text-destructive">{concludeError}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={concluding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmConclude();
              }}
              disabled={concluding}
            >
              {concluding ? 'Concluindo...' : 'Concluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CalendarDetail() {
  const { isAuthenticated, isLoading, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return isAuthenticated ? <CalendarDetailContent /> : <Login />;
}
