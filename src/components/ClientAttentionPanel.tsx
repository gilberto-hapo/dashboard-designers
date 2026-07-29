import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Sparkles, TriangleAlert } from 'lucide-react';
import { type DashboardInsights } from '@/lib/insights';

type AiClientRecommendation = {
  cliente: string;
  responsaveis?: string[];
  tituloProblema: string;
  acaoRecomendada: string;
  categoria: string;
  prioridade: number;
};

type RecommendationPayloadItem = {
  cliente: string;
  responsaveis: string[];
  prioridadeBase: number;
  score: number;
  totalAtivas: number;
  nivelAtencao: string;
  frenteStatus: string;
  frentePendentes: number;
  frenteTotal: number;
  validacaoCount: number;
  validacaoCriticaCount: number;
  correcaoCount: number;
  bloqueadoCount: number;
  atrasadoCount: number;
  venceHojeOuAmanhaCount: number;
  venceEmTresDiasCount: number;
  etapaCounts: Record<string, number>;
};

const STORAGE_KEY = 'hapo:ai-client-recommendations:v10';
const recommendationsMemoryCache = new Map<string, AiClientRecommendation[]>();

function normalizeClientKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeAiCategory(category?: string | null) {
  const normalized = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (normalized === 'atraso') return 'Atraso';
  if (normalized === 'prazo') return 'Prazo';
  if (normalized === 'validacao') return 'Validacao';
  if (normalized === 'bloqueio') return 'Bloqueio';
  if (normalized === 'acumulo') return 'Acumulo';
  if (normalized === 'gargalo') return 'Gargalo';
  return 'Estavel';
}

function getBadgeAppearance(category: string) {
  switch (normalizeAiCategory(category)) {
    case 'Atraso':
      return 'border-destructive/20 bg-destructive/10 text-destructive';
    case 'Prazo':
      return 'border-warning/20 bg-warning/10 text-warning';
    case 'Validacao':
      return 'border-info/20 bg-info/10 text-info';
    case 'Bloqueio':
      return 'border-warning/20 bg-warning/10 text-warning';
    case 'Acumulo':
      return 'border-primary/20 bg-primary/10 text-primary';
    case 'Gargalo':
      return 'border-orange-500/20 bg-orange-500/10 text-orange-400';
    default:
      return 'border-success/20 bg-success/10 text-success';
  }
}

function buildPayloadSignature(items: RecommendationPayloadItem[]) {
  const clients = items
    .map((item) => ({
      cliente: normalizeClientKey(item.cliente),
      responsaveis: [...item.responsaveis].map((value) => value.trim()).sort(),
      prioridadeBase: item.prioridadeBase,
      score: item.score,
      totalAtivas: item.totalAtivas,
      nivelAtencao: item.nivelAtencao,
      frenteStatus: item.frenteStatus,
      frentePendentes: item.frentePendentes,
      frenteTotal: item.frenteTotal,
      validacaoCount: item.validacaoCount,
      validacaoCriticaCount: item.validacaoCriticaCount,
      correcaoCount: item.correcaoCount,
      bloqueadoCount: item.bloqueadoCount,
      atrasadoCount: item.atrasadoCount,
      venceHojeOuAmanhaCount: item.venceHojeOuAmanhaCount,
      venceEmTresDiasCount: item.venceEmTresDiasCount,
      etapaCounts: {
        fazer: Number(item.etapaCounts?.fazer) || 0,
        executando: Number(item.etapaCounts?.executando) || 0,
        direcaoArte: Number(item.etapaCounts?.direcaoArte) || 0,
        montagem: Number(item.etapaCounts?.montagem) || 0,
        validacao: Number(item.etapaCounts?.validacao) || 0,
        aprovadoProgramacao: Number(item.etapaCounts?.aprovadoProgramacao) || 0,
      },
    }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente));

  return JSON.stringify({ clients });
}

function readStoredRecommendations(signature: string) {
  const inMemory = recommendationsMemoryCache.get(signature);
  if (inMemory && inMemory.length > 0) {
    return inMemory;
  }

  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      signature?: string;
      recommendations?: AiClientRecommendation[];
    };

    if (
      parsed.signature !== signature ||
      !Array.isArray(parsed.recommendations) ||
      parsed.recommendations.length === 0
    ) {
      return null;
    }

    return parsed.recommendations;
  } catch {
    return null;
  }
}

function writeStoredRecommendations(signature: string, recommendations: AiClientRecommendation[]) {
  if (Array.isArray(recommendations) && recommendations.length > 0) {
    recommendationsMemoryCache.set(signature, recommendations);
  }

  if (typeof window === 'undefined') return;
  if (!Array.isArray(recommendations) || recommendations.length === 0) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        signature,
        recommendations,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage issues and keep runtime state only.
  }
}

function normalizeAiRecommendations(value: unknown): AiClientRecommendation[] {
  const values = value && typeof value === 'object'
    ? Object.values(value as Record<string, unknown>)
    : [];

  const recommendations = values
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const recommendation = item as Partial<AiClientRecommendation>;
      return {
        cliente: String(recommendation.cliente || '').trim(),
        responsaveis: Array.isArray(recommendation.responsaveis)
          ? recommendation.responsaveis.map((value) => String(value).trim()).filter(Boolean)
          : [],
        tituloProblema: String(recommendation.tituloProblema || '').trim(),
        acaoRecomendada: String(recommendation.acaoRecomendada || '').trim(),
        categoria: normalizeAiCategory(recommendation.categoria),
        prioridade: Number(recommendation.prioridade) || 999,
      };
    })
    .filter((item) => item.cliente && item.tituloProblema && item.acaoRecomendada)
    .sort((a, b) => a.prioridade - b.prioridade);

  const uniqueByClient = new Map<string, AiClientRecommendation>();
  for (const recommendation of recommendations) {
    const key = normalizeClientKey(recommendation.cliente);
    if (!key || !uniqueByClient.has(key)) {
      uniqueByClient.set(key, recommendation);
    }
  }

  return [...uniqueByClient.values()];
}

function mergeRecommendationResponsibles(
  recommendations: AiClientRecommendation[],
  payload: Array<{ cliente: string; responsaveis: string[] }>,
) {
  const responsiblesByClient = new Map(
    payload.map((item) => [normalizeClientKey(item.cliente), item.responsaveis]),
  );

  return recommendations.map((recommendation) => ({
    ...recommendation,
    responsaveis: responsiblesByClient.get(normalizeClientKey(recommendation.cliente)) ?? recommendation.responsaveis ?? [],
  }));
}

function buildInstantRecommendation(item: DashboardInsights['clientesAtencao'][number]): AiClientRecommendation {
  let tituloProblema = 'Conta estavel';
  let categoria = 'Estavel';

  if (item.atrasadoCount > 0) {
    tituloProblema = 'Atrasos acumulados na conta';
    categoria = 'Atraso';
  } else if (item.venceHojeOuAmanhaCount >= 2 || item.venceEmTresDiasCount >= 4) {
    tituloProblema = 'Conta com risco de atraso';
    categoria = 'Prazo';
  } else if (item.validacaoCriticaCount > 0 || item.validacaoCount >= 3) {
    tituloProblema = 'Conta travada por validacao';
    categoria = 'Validacao';
  } else if (item.bloqueadoCount > 0) {
    tituloProblema = 'Conta bloqueada por dependencias';
    categoria = 'Bloqueio';
  } else if (item.etapaCounts.fazer >= Math.max(4, Math.ceil(item.totalAtivas * 0.35))) {
    tituloProblema = 'Fila elevada na entrada da producao';
    categoria = 'Acumulo';
  } else if (
    Math.max(
      item.etapaCounts.executando,
      item.etapaCounts.direcaoArte,
      item.etapaCounts.montagem,
      item.etapaCounts.validacao,
    ) >= 3
  ) {
    tituloProblema = 'Conta com gargalo concentrado em etapa';
    categoria = 'Gargalo';
  }

  return {
    cliente: item.cliente,
    responsaveis: item.designers,
    tituloProblema,
    acaoRecomendada: item.acaoSugerida,
    categoria,
    prioridade: Number(item.prioridadeOrdem || item.score || 999),
  };
}

type ClientAttentionPanelProps = {
  data: DashboardInsights;
  refreshNonce: number;
  onLoadingChange?: (isLoading: boolean) => void;
};

export function ClientAttentionPanel({
  data,
  refreshNonce,
  onLoadingChange,
}: ClientAttentionPanelProps) {
  const recommendationPayload = useMemo<RecommendationPayloadItem[]>(
    () =>
      data.clientesAtencao.map((item) => ({
        cliente: item.cliente,
        responsaveis: item.designers,
        prioridadeBase: item.prioridadeOrdem || item.score,
        score: item.score,
        totalAtivas: item.totalAtivas,
        nivelAtencao: item.nivelAtencao,
        frenteStatus: item.frente.status,
        frentePendentes: item.frente.pendentesProximas2Semanas,
        frenteTotal: item.frente.totalProximas2Semanas,
        validacaoCount: item.validacaoCount,
        validacaoCriticaCount: item.validacaoCriticaCount,
        correcaoCount: item.correcaoCount,
        bloqueadoCount: item.bloqueadoCount,
        atrasadoCount: item.atrasadoCount,
        venceHojeOuAmanhaCount: item.venceHojeOuAmanhaCount,
        venceEmTresDiasCount: item.venceEmTresDiasCount,
        etapaCounts: item.etapaCounts,
      })),
    [data.clientesAtencao],
  );

  const payloadSignature = useMemo(
    () => buildPayloadSignature(recommendationPayload),
    [recommendationPayload],
  );

  const instantRecommendations = useMemo(
    () =>
      data.clientesAtencao
        .map(buildInstantRecommendation)
        .sort((left, right) => left.prioridade - right.prioridade),
    [data.clientesAtencao],
  );

  const [aiRecommendations, setAiRecommendations] = useState<AiClientRecommendation[]>(instantRecommendations);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    setAiRecommendations(instantRecommendations);
    setIsAiLoading(false);
    onLoadingChange?.(false);
  }, [instantRecommendations, onLoadingChange]);

  useEffect(() => {
    if (refreshNonce <= 0 || recommendationPayload.length === 0 || typeof window === 'undefined') {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const loadRecommendations = async () => {
      const storedRecommendations = readStoredRecommendations(payloadSignature);
      if (storedRecommendations && storedRecommendations.length > 0) {
        setAiRecommendations(
          mergeRecommendationResponsibles(storedRecommendations, recommendationPayload),
        );
      }

      setIsAiLoading(true);
      onLoadingChange?.(true);

      try {
        const response = await fetch('/api/ai/client-actions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ items: recommendationPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isActive) {
            setAiRecommendations(instantRecommendations);
            setIsAiLoading(false);
            onLoadingChange?.(false);
          }
          return;
        }

        const result = await response.json();
        const recommendations = mergeRecommendationResponsibles(
          normalizeAiRecommendations(result?.recommendations),
          recommendationPayload,
        );

        if (isActive) {
          const nextRecommendations = recommendations.length > 0
            ? recommendations
            : instantRecommendations;
          setAiRecommendations(nextRecommendations);
          if (recommendations.length > 0) {
            writeStoredRecommendations(payloadSignature, recommendations);
          }
          setIsAiLoading(false);
          onLoadingChange?.(false);
        }
      } catch {
        if (isActive) {
          setAiRecommendations(instantRecommendations);
          setIsAiLoading(false);
          onLoadingChange?.(false);
        }
      }
    };

    void loadRecommendations();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [instantRecommendations, onLoadingChange, payloadSignature, recommendationPayload, refreshNonce]);

  if (data.clientesAtencao.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-3">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-success" />
        <p className="text-sm text-foreground">Nenhum cliente pedindo atencao extra neste momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aiRecommendations.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-3">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-success" />
          <p className="text-sm text-foreground">Nenhuma recomendacao prioritaria neste momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {isAiLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              <span>Avaliacao inicial pronta. A IA esta refinando os textos em segundo plano.</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-4">
            {aiRecommendations.map((recommendation) => {
              const badgeClassName = getBadgeAppearance(recommendation.categoria);

              return (
                <div
                  key={`${recommendation.cliente}-${recommendation.prioridade}`}
                  className="flex h-full flex-col rounded-lg border border-border/50 bg-muted/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{recommendation.cliente}</p>
                      {recommendation.responsaveis && recommendation.responsaveis.length > 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Responsavel:{' '}
                          <span className="font-medium text-foreground">{recommendation.responsaveis.join(', ')}</span>
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClassName}`}
                    >
                      {recommendation.categoria}
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border border-border/40 bg-background/40 p-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Recomendacao
                        </p>

                        <div className="mt-2 space-y-2">
                          <p className="text-sm font-semibold leading-relaxed text-foreground">
                            {recommendation.tituloProblema}
                          </p>

                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {recommendation.acaoRecomendada}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
