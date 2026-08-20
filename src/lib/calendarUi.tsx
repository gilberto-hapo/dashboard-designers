export type CalendarioSummary = {
  postsConectados: number;
  postsConcluidos: number;
};

export function normalizeClientKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export type CalendarioSegments = {
  postsConectados: number;
  postsPublicados: number;
  postsAprovados: number;
  postsPendentes: number;
};

export type ProgressSegment = {
  key: 'publicado' | 'aprovado' | 'ajuste' | 'pendente';
  count: number;
  className: string;
};

export function getConclusionProgress(calendario: CalendarioSummary) {
  const total = calendario.postsConectados;
  const percent = total > 0 ? Math.round((calendario.postsConcluidos / total) * 100) : 0;
  const clampedPercent = Math.min(100, Math.max(0, percent));

  const barColor =
    clampedPercent >= 67 ? 'bg-emerald-500' : clampedPercent >= 34 ? 'bg-yellow-400' : 'bg-red-500';
  const textColor =
    clampedPercent >= 67 ? 'text-emerald-500' : clampedPercent >= 34 ? 'text-yellow-400' : 'text-red-500';

  return { percent: clampedPercent, barColor, textColor };
}

export function getConclusionSegments(calendario: CalendarioSegments) {
  const total = calendario.postsConectados;
  const segments: ProgressSegment[] = [
    { key: 'publicado', count: calendario.postsPublicados, className: 'bg-sky-500' },
    { key: 'aprovado', count: calendario.postsAprovados, className: 'bg-emerald-500' },
    { key: 'ajuste', count: 0, className: 'bg-amber-400' },
    { key: 'pendente', count: calendario.postsPendentes, className: 'bg-muted-foreground/30' },
  ];

  const decided = calendario.postsPublicados + calendario.postsAprovados;
  const percent = total > 0 ? Math.round((decided / total) * 100) : 0;
  const clampedPercent = Math.min(100, Math.max(0, percent));

  const textColor =
    clampedPercent >= 67 ? 'text-emerald-500' : clampedPercent >= 34 ? 'text-yellow-400' : 'text-red-500';

  return { segments, percent: clampedPercent, textColor, total };
}

export function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || '';
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro na requisição (status ${response.status})`);
  }
  return body as T;
}

export function ConclusionPercentLabel({
  progress,
}: {
  progress: { percent: number; textColor: string };
}) {
  return <span className={`shrink-0 text-xs font-bold ${progress.textColor}`}>{progress.percent}%</span>;
}

export function ConclusionBar({ progress }: { progress: ReturnType<typeof getConclusionProgress> }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${progress.barColor}`}
        style={{ width: `${progress.percent}%` }}
      />
    </div>
  );
}

const SEGMENT_LABELS: Record<ProgressSegment['key'], string> = {
  publicado: 'Publicado',
  aprovado: 'Aprovado',
  ajuste: 'Em ajuste',
  pendente: 'Pendente',
};

export function SegmentedConclusionBar({
  segments,
  total,
}: {
  segments: ProgressSegment[];
  total: number;
}) {
  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-muted" />;
  }

  return (
    <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted">
      {segments
        .filter((segment) => segment.count > 0)
        .map((segment) => (
          <div
            key={segment.key}
            className={`h-full transition-all ${segment.className}`}
            style={{ width: `${(segment.count / total) * 100}%` }}
            title={`${SEGMENT_LABELS[segment.key]}: ${segment.count}`}
          />
        ))}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
