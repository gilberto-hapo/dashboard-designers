import { useEffect, useMemo, useState } from 'react';
import { Award } from 'lucide-react';
import { type DesignerClientReference, type DesignerInsight } from '@/lib/insights';
import { stageLabels } from '@/lib/data';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const REFERENCES_STORAGE_KEY = 'hapo:designer-client-references:v10';

function buildReferencesSignature(payload: unknown) {
  return JSON.stringify(payload);
}

function readStoredReferences(signature: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(REFERENCES_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      signature?: string;
      references?: DesignerClientReference[];
    };

    if (parsed.signature !== signature || !Array.isArray(parsed.references)) {
      return null;
    }

    return parsed.references;
  } catch {
    return null;
  }
}

function writeStoredReferences(signature: string, references: DesignerClientReference[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      REFERENCES_STORAGE_KEY,
      JSON.stringify({
        signature,
        references,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage issues and keep runtime state only.
  }
}

function renderDueLabel(dueLabel: string) {
  const normalizedDueLabel = dueLabel
    .replace(/(\d+)d\b/gi, '$1 dias')
    .toLowerCase();
  const naturalDueLabel = dueLabel.replace(/(\d+)d\b/gi, '$1 dias');

  if (normalizedDueLabel.includes('hoje')) {
    return (
      <span className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive shadow-[0_0_0_1px_rgba(239,68,68,0.08)]">
        {naturalDueLabel}
      </span>
    );
  }

  if (normalizedDueLabel.includes('amanh')) {
    return (
      <span className="inline-flex items-center rounded-md border border-warning/40 bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning shadow-[0_0_0_1px_rgba(245,158,11,0.08)]">
        {naturalDueLabel}
      </span>
    );
  }

  const match = naturalDueLabel.match(/(\d+\s*dias?)/i);

  if (!match || match.index === undefined) {
    return naturalDueLabel;
  }

  const start = match.index;
  const end = start + match[0].length;

  return (
    <>
      {naturalDueLabel.slice(0, start)}
      <span className="font-semibold text-foreground">{match[0]}</span>
      {naturalDueLabel.slice(end)}
    </>
  );
}

function PeriodMetricCard({
  value,
  label,
  tooltip,
  isHighlighted = false,
}: {
  value: number;
  label: string;
  tooltip: string;
  isHighlighted?: boolean;
}) {
  const cardClassName = isHighlighted
    ? 'relative overflow-hidden rounded-lg border border-emerald-300/70 bg-emerald-400/10 px-2 py-2 text-center shadow-[0_0_18px_rgba(52,211,153,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:border-cyan-300/80 hover:bg-emerald-400/15 cursor-help'
    : 'bg-muted rounded-lg px-2 py-2 text-center cursor-help';

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cardClassName}>
            {isHighlighted ? (
              <div className="pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
            ) : null}
            <p className="text-xs font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-[11px]">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function isUrgentDueLabel(dueLabel: string) {
  const normalizedDueLabel = dueLabel.toLowerCase();
  return normalizedDueLabel.includes('hoje') || normalizedDueLabel.includes('amanh');
}

function formatTaskDueDate(date: Date) {
  return date.toLocaleDateString('pt-BR');
}

function formatMissionDueDate(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) return 'atrasado';
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanha';
  return `vence em ${days} dias`;
}

function getFrontMissionCopy(designer: DesignerInsight) {
  const front = designer.frente;
  const progress = getNextWeekProgress(designer);
  const pendingForNextLevel = Math.max(0, progress.total - progress.current);
  const deliveryLabel = pendingForNextLevel === 1 ? 'entrega' : 'entregas';

  if (front.marcoPendentes === 0) {
    return {
      title: 'Frente completa ate 8 semanas',
      subtitle: 'Mapa limpo. O proximo jogo e manter esse ritmo quando novas demandas entrarem.',
    };
  }

  // Progressão de semanas para designers que ainda não alcançaram 1 semana completa
  if (front.diasDeFrenteAtual < 7) {
    return {
      title: 'Alcançar 1 semana de frente',
      subtitle: `Faltam ${pendingForNextLevel} ${deliveryLabel} para subir para 1 semana de frente.`,
    };
  }

  // Designers entre 1 e 2 semanas completas
  if (front.percentual < 100 && front.diasDeFrenteAtual >= 7) {
    return {
      title: 'Alcançar 2 semanas de frente',
      subtitle: `Faltam ${pendingForNextLevel} ${deliveryLabel} para subir para 2 semanas de frente.`,
    };
  }

  if (front.marcoAnteriorCompleto) {
    return {
      title: `Alcançar ${front.marcoSemanas} semanas de frente`,
      subtitle: `Faltam ${pendingForNextLevel} ${deliveryLabel} para subir para ${front.marcoSemanas} semanas de frente.`,
    };
  }

  return {
    title: 'Fechar a frente de 2 semanas',
    subtitle: `Faltam ${pendingForNextLevel} ${deliveryLabel} para subir para 2 semanas de frente.`,
  };
}

const medalStyles = {
  1: {
    badge: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
    mission: 'border-sky-500/55 bg-gradient-to-br from-sky-950/45 to-cyan-950/25 shadow-sky-900/20',
    connector: 'text-sky-500/70',
    connectorFill: 'border-t-sky-500/70',
    connectorUpFill: 'border-b-sky-500/70',
    title: 'text-sky-300',
    progressTrack: 'border-sky-700/60 bg-sky-950/55',
    progressFill: 'bg-gradient-to-r from-sky-500 to-cyan-300 shadow-[0_0_8px_rgba(14,165,233,0.55)]',
    progressText: 'text-sky-200',
    progressMuted: 'text-sky-200/70',
  },
  2: {
    badge: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
    mission: 'border-violet-500/55 bg-gradient-to-br from-violet-950/45 to-fuchsia-950/25 shadow-violet-900/20',
    connector: 'text-violet-500/70',
    connectorFill: 'border-t-violet-500/70',
    connectorUpFill: 'border-b-violet-500/70',
    title: 'text-violet-300',
    progressTrack: 'border-violet-700/60 bg-violet-950/55',
    progressFill: 'bg-gradient-to-r from-violet-500 to-fuchsia-300 shadow-[0_0_8px_rgba(139,92,246,0.55)]',
    progressText: 'text-violet-200',
    progressMuted: 'text-violet-200/70',
  },
  3: {
    badge: 'border-amber-300/45 bg-amber-300/10 text-amber-200',
    mission: 'border-amber-600/50 bg-gradient-to-br from-amber-950/40 to-orange-950/30 shadow-amber-900/20',
    connector: 'text-amber-600/70',
    connectorFill: 'border-t-amber-600/70',
    connectorUpFill: 'border-b-amber-600/70',
    title: 'text-amber-300',
    progressTrack: 'border-amber-700/60 bg-amber-950/60',
    progressFill: 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(217,119,6,0.6)]',
    progressText: 'text-amber-300',
    progressMuted: 'text-amber-200/70',
  },
  4: {
    badge: 'border-teal-400/40 bg-teal-400/10 text-teal-300',
    mission: 'border-teal-500/55 bg-gradient-to-br from-teal-950/45 to-emerald-950/25 shadow-teal-900/20',
    connector: 'text-teal-500/70',
    connectorFill: 'border-t-teal-500/70',
    connectorUpFill: 'border-b-teal-500/70',
    title: 'text-teal-300',
    progressTrack: 'border-teal-700/60 bg-teal-950/55',
    progressFill: 'bg-gradient-to-r from-teal-500 to-emerald-300 shadow-[0_0_8px_rgba(20,184,166,0.55)]',
    progressText: 'text-teal-200',
    progressMuted: 'text-teal-200/70',
  },
  5: {
    badge: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    mission: 'border-emerald-500/55 bg-gradient-to-br from-emerald-950/45 to-lime-950/25 shadow-emerald-900/20',
    connector: 'text-emerald-500/70',
    connectorFill: 'border-t-emerald-500/70',
    connectorUpFill: 'border-b-emerald-500/70',
    title: 'text-emerald-300',
    progressTrack: 'border-emerald-700/60 bg-emerald-950/55',
    progressFill: 'bg-gradient-to-r from-emerald-500 to-lime-300 shadow-[0_0_8px_rgba(16,185,129,0.55)]',
    progressText: 'text-emerald-200',
    progressMuted: 'text-emerald-200/70',
  },
  6: {
    badge: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
    mission: 'border-rose-500/55 bg-gradient-to-br from-rose-950/45 to-pink-950/25 shadow-rose-900/20',
    connector: 'text-rose-500/70',
    connectorFill: 'border-t-rose-500/70',
    connectorUpFill: 'border-b-rose-500/70',
    title: 'text-rose-300',
    progressTrack: 'border-rose-700/60 bg-rose-950/55',
    progressFill: 'bg-gradient-to-r from-rose-500 to-pink-300 shadow-[0_0_8px_rgba(244,63,94,0.55)]',
    progressText: 'text-rose-200',
    progressMuted: 'text-rose-200/70',
  },
  7: {
    badge: 'border-indigo-400/40 bg-indigo-400/10 text-indigo-300',
    mission: 'border-indigo-500/55 bg-gradient-to-br from-indigo-950/45 to-blue-950/25 shadow-indigo-900/20',
    connector: 'text-indigo-500/70',
    connectorFill: 'border-t-indigo-500/70',
    connectorUpFill: 'border-b-indigo-500/70',
    title: 'text-indigo-300',
    progressTrack: 'border-indigo-700/60 bg-indigo-950/55',
    progressFill: 'bg-gradient-to-r from-indigo-500 to-blue-300 shadow-[0_0_8px_rgba(99,102,241,0.55)]',
    progressText: 'text-indigo-200',
    progressMuted: 'text-indigo-200/70',
  },
  8: {
    badge: 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200',
    mission: 'border-yellow-500/55 bg-gradient-to-br from-yellow-950/45 to-amber-950/25 shadow-yellow-900/20',
    connector: 'text-yellow-500/70',
    connectorFill: 'border-t-yellow-500/70',
    connectorUpFill: 'border-b-yellow-500/70',
    title: 'text-yellow-200',
    progressTrack: 'border-yellow-700/60 bg-yellow-950/55',
    progressFill: 'bg-gradient-to-r from-yellow-400 to-amber-300 shadow-[0_0_8px_rgba(234,179,8,0.55)]',
    progressText: 'text-yellow-200',
    progressMuted: 'text-yellow-200/70',
  },
} as const;

const neutralMissionStyle = {
  mission: 'border-slate-500/45 bg-gradient-to-br from-slate-900/65 to-zinc-900/45 shadow-slate-900/10',
  title: 'text-slate-300',
  progressTrack: 'border-slate-600/55 bg-slate-950/55',
  progressFill: 'bg-gradient-to-r from-slate-400 to-zinc-300 shadow-[0_0_8px_rgba(148,163,184,0.35)]',
  progressText: 'text-slate-200',
  progressMuted: 'text-slate-300/70',
} as const;

function getMedalStyle(level: number) {
  return medalStyles[level as keyof typeof medalStyles] ?? medalStyles[8];
}

function getFrontMedals(designer: DesignerInsight) {
  const medals = [
    ...(designer.frente.diasDeFrenteAtual >= 7 ? [{ label: '1 sem.', level: 1 }] : []),
    ...(designer.frente.percentual >= 100 ? [{ label: '2 sem.', level: 2 }] : []),
    ...(designer.frente.marcoAnteriorCompleto ? [{ label: `${designer.frente.marcoSemanas - 1} sem.`, level: designer.frente.marcoSemanas - 1 }] : []),
    ...(designer.frente.marcoPendentes === 0 ? [{ label: '8 sem.', level: 8 }] : []),
  ];

  return medals.filter((medal, index) => (
    medals.findIndex((item) => item.label === medal.label) === index
  ));
}

function getFrontMedalTrack(designer: DesignerInsight) {
  const earnedMedals = getFrontMedals(designer);
  const earnedLevels = new Set(earnedMedals.map((medal) => medal.level));
  const trackLevels = [1, 2, 3, 4];

  return trackLevels.map((level) => ({
    label: `${level} sem.`,
    level,
    isEarned: earnedLevels.has(level),
  }));
}

function getNextWeekProgress(designer: DesignerInsight) {
  const front = designer.frente;
  
  // Para designers que ainda não alcançaram 1 semana completa
  // usar a janela reduzida da primeira semana.
  if (front.diasDeFrenteAtual < 7) {
    const percentage = front.totalProxima1Semana > 0
      ? Math.round((front.concluidasProxima1Semana / front.totalProxima1Semana) * 100)
      : 100;

    return {
      current: front.concluidasProxima1Semana,
      total: front.totalProxima1Semana,
      percentage,
    };
  }
  
  // 1 semana ou mais: mostrar progresso do marco atual
  return {
    current: front.marcoConcluidas,
    total: front.marcoTotal,
    percentage: Math.min(100, front.marcoPercentual),
  };
}

function ProgressBadge({
  label,
  level,
  isActive,
  isEarned = true,
}: {
  label: string;
  level: number;
  isActive?: boolean;
  isEarned?: boolean;
}) {
  const style = getMedalStyle(level);

  return (
    <span className="relative inline-flex shrink-0 flex-col items-center">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${style.badge} ${isEarned ? '' : 'grayscale opacity-35'}`}>
        <Award className="h-3 w-3" />
        {label}
      </span>
      {isActive && (
        <span
          className={`pointer-events-none absolute left-1/2 top-[calc(100%+9px)] h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent ${style.connectorUpFill}`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripClientLead(message: string | undefined, cliente: string) {
  const normalizedMessage = String(message || '').trim();
  const normalizedClient = String(cliente || '').trim();

  if (!normalizedMessage || !normalizedClient) {
    return normalizedMessage;
  }

  const leadingClientPattern = new RegExp(`^${escapeRegExp(normalizedClient)}\\s*[:\\-–—]?\\s*`, 'i');
  return normalizedMessage.replace(leadingClientPattern, '').trim();
}

function buildReferenceHighlight(reference: DesignerClientReference) {
  const parts: string[] = [];

  if (reference.validationCriticalCount > 0) {
    parts.push(`${reference.validationCriticalCount} em validação crítica`);
  }
  if (reference.overdueCount > 0) {
    parts.push(`${reference.overdueCount} atrasada(s)`);
  }
  if (reference.blockedCount > 0) {
    parts.push(`${reference.blockedCount} bloqueada(s)`);
  }
  if (reference.executionCount > 0) {
    parts.push(`${reference.executionCount} em execução`);
  }
  if (reference.frontPendingCount > 0) {
    parts.push(`${reference.frontPendingCount} na frente de 14 dias`);
  }
  if (parts.length === 0) {
    parts.push(`${reference.activeCount} entrega(s) ativas`);
  }

  return `${parts.join(' - ')}.`;
}

function buildDefaultReferenceCopy(reference: DesignerClientReference): DesignerClientReference {
  if (reference.tone === 'success') {
    return {
      ...reference,
      message: `${reference.cliente} aparece como a conta mais estável deste momento para esse fluxo.`,
      highlight: buildReferenceHighlight(reference),
    };
  }

  return {
    ...reference,
    message: `${reference.cliente} concentra o ponto de atenção mais claro da carteira neste momento.`,
    highlight: buildReferenceHighlight(reference),
  };
}

export function DesignerCard({
  designer,
  aiReferencesOverride = null,
  isAiReferencesLoadingOverride = false,
  disableInternalAiFetch = false,
  periodHighlights,
}: {
  designer: DesignerInsight;
  aiReferencesOverride?: DesignerClientReference[] | null;
  isAiReferencesLoadingOverride?: boolean;
  disableInternalAiFetch?: boolean;
  periodHighlights?: {
    mesAtual?: boolean;
    semanaAtual?: boolean;
    hoje?: boolean;
  };
}) {
  const [aiReferences, setAiReferences] = useState<DesignerClientReference[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const hasObservacoes = designer.observacoes.length > 0;
  const clientesCarteira = Array.isArray(designer.clientesCarteira)
    ? designer.clientesCarteira
    : [];
  const totalPostsContratados = clientesCarteira.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
  const fallbackReferences = useMemo(
    () => designer.referenciasClientes.map(buildDefaultReferenceCopy),
    [designer.referenciasClientes],
  );
  const renderedReferences = isAiReferencesLoadingOverride
    ? []
    : aiReferencesOverride ?? (aiReferences.length > 0 ? aiReferences : fallbackReferences);
  const hasReferenciasClientes = renderedReferences.length > 0;
  const frontMission = getFrontMissionCopy(designer);
  const frontMissionTasks = designer.frente.marcoTarefasPendentes.slice(0, 5);
  const progressBadges = getFrontMedals(designer);
  const medalTrack = getFrontMedalTrack(designer);
  const missionStyle = progressBadges.length > 0
    ? getMedalStyle(progressBadges[progressBadges.length - 1].level)
    : neutralMissionStyle;
  const referencesPayload = useMemo(
    () => ({
      designer: designer.nome,
      references: designer.referenciasClientes,
    }),
    [designer.nome, designer.referenciasClientes],
  );
  const referencesSignature = useMemo(
    () => buildReferencesSignature(referencesPayload),
    [referencesPayload],
  );

  useEffect(() => {
    if (disableInternalAiFetch) {
      setAiReferences([]);
      setIsLoadingReferences(false);
      return;
    }

    if (aiReferencesOverride) {
      setAiReferences(aiReferencesOverride);
      setIsLoadingReferences(false);
      return;
    }

    if (designer.referenciasClientes.length === 0) {
      setAiReferences([]);
      setIsLoadingReferences(false);
      return;
    }

    const storedReferences = readStoredReferences(referencesSignature);
    if (storedReferences) {
      setAiReferences(storedReferences);
      setIsLoadingReferences(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const loadReferences = async () => {
      if (isActive) {
        setAiReferences([]);
        setIsLoadingReferences(true);
      }

      try {
        const response = await fetch('/api/ai/designer-client-references', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            payload: referencesPayload,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isActive) {
            setAiReferences([]);
            setIsLoadingReferences(false);
          }
          return;
        }

        const result = await response.json();
        if (!isActive) {
          return;
        }

        const references = Array.isArray(result?.references)
          ? result.references.filter(
              (item: DesignerClientReference) => item?.cliente && item?.message && item?.highlight,
            )
          : [];

        setAiReferences(references);
        setIsLoadingReferences(false);

        if (references.length > 0) {
          writeStoredReferences(referencesSignature, references);
        }
      } catch {
        if (isActive) {
          setAiReferences([]);
          setIsLoadingReferences(false);
        }
      }
    };

    void loadReferences();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [aiReferencesOverride, designer.referenciasClientes, disableInternalAiFetch, referencesPayload, referencesSignature]);

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-colors">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: designer.cor + '25', color: designer.cor }}
          >
            {designer.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground truncate">{designer.nome}</h4>
            <p className="text-[11px] text-muted-foreground">
              {designer.totalAtivas} demandas abertas - {designer.emExecucao} em execucao
            </p>
          </div>
        </div>

        <div className="mb-3 p-2 rounded-lg bg-muted/50 border border-border/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">Meta de Frente - 2 Semanas</span>
            <span className={`text-[11px] font-bold ${
              designer.frente.percentual >= 80 ? 'text-success' :
              designer.frente.percentual >= 40 ? 'text-warning' : 'text-destructive'
            }`}>
              {designer.frente.concluidasAdiantado}/{designer.frente.totalProximas2Semanas}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${designer.frente.percentual}%`,
                backgroundColor: designer.frente.percentual >= 80
                  ? 'hsl(var(--success))'
                  : designer.frente.percentual >= 40
                    ? 'hsl(var(--warning))'
                    : 'hsl(var(--destructive))',
              }}
            />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">
              Ritmo atual: <span className="font-bold text-foreground">{designer.frente.ritmoRecenteDiario || 0}</span>/dia
              {' - '}
              Prazo médio: <span className="font-bold text-foreground">{designer.frente.tempoMedioConclusaoDias ?? '-'}</span> dias
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <PeriodMetricCard
            value={designer.concluidasPeriodo.mesAtual}
            isHighlighted={periodHighlights?.mesAtual}
            label="Mês atual"
            tooltip="Quantidade de posts concluídos por este designer no mês atual."
          />
          <PeriodMetricCard
            value={designer.concluidasPeriodo.semanaAtual}
            isHighlighted={periodHighlights?.semanaAtual}
            label="Semana"
            tooltip="Quantidade de posts concluídos por este designer na semana atual, de segunda-feira até hoje."
          />
          <PeriodMetricCard
            value={designer.concluidasPeriodo.hoje}
            isHighlighted={periodHighlights?.hoje}
            label="Hoje"
            tooltip="Quantidade de posts concluídos por este designer hoje."
          />
        </div>

      </div>

      <div className="mt-5 border-t border-border/60 pt-4 min-w-0">
        <div className="mb-2">
          {medalTrack.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {medalTrack.map((medal) => (
                <ProgressBadge
                  key={medal.label}
                  label={medal.label}
                  level={medal.level}
                  isActive={medal.isEarned && medal.level === progressBadges[progressBadges.length - 1]?.level}
                  isEarned={medal.isEarned}
                />
              ))}
            </div>
          )}
        </div>

        <div className={`mt-0 rounded-lg border-2 p-4 shadow-lg ${missionStyle.mission}`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] font-black uppercase tracking-widest ${missionStyle.title}`}>★ MISSÃO ★</p>
              <p className="mt-1.5 text-sm font-bold text-foreground">
                {frontMission.title}
              </p>
              <p className={`mt-0.5 text-[11px] ${missionStyle.progressMuted}`}>
                {frontMission.subtitle}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className={`h-2 flex-1 rounded-full border ${missionStyle.progressTrack}`}>
                <div
                  className={`h-full rounded-full ${missionStyle.progressFill}`}
                  style={{ width: `${getNextWeekProgress(designer).percentage}%` }}
                />
              </div>
              <span className={`shrink-0 text-xs font-bold ${missionStyle.progressText}`}>
                {getNextWeekProgress(designer).current}/{getNextWeekProgress(designer).total}
              </span>
            </div>
            <p className={`text-[10px] ${missionStyle.progressMuted}`}>
              {getNextWeekProgress(designer).percentage.toFixed(0)}% completo
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible className="mt-3">
          <AccordionItem value="clientes-carteira" className="rounded-lg border border-border/40 bg-muted/25 px-3">
            <AccordionTrigger className="py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:no-underline">
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
                <span>Clientes da carteira</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {clientesCarteira.length > 0 ? (
                <div className="space-y-1">
                  {clientesCarteira.map((cliente) => (
                    <div
                      key={cliente.cliente}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/25 bg-background/30 px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate text-[11px] font-medium text-foreground">{cliente.cliente}</span>
                      <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                        {cliente.quantidade} posts/mês
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/40 pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Total contratado
                    </span>
                    <span className="text-[11px] font-bold text-foreground">
                      {clientesCarteira.length} clientes - {totalPostsContratados} posts/mês
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Nenhum cliente ativo com posts contratados.</p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

    </div>
  );
}
