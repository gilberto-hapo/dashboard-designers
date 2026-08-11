export type CalendarioSummary = {
  postsConectados: number;
  postsConcluidos: number;
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

export function ConclusionPercentLabel({ progress }: { progress: ReturnType<typeof getConclusionProgress> }) {
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

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
