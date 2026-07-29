import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react';
import { type DashboardInsights } from '@/lib/insights';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function BottlenecksPanel({ data }: { data: DashboardInsights }) {
  const { etapas, title, impact, recommendation } = data.gargaloOperacional;
  const maiorVolumeOperacional = etapas.reduce((max, etapa) => Math.max(max, etapa.count), 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        Gargalos & Insights
      </h3>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {etapas.map((etapa) => {
          const isCritical = etapa.count > 0 && etapa.count === maiorVolumeOperacional;
          const cardClasses = isCritical
            ? 'border-warning/40 bg-warning/10'
            : 'border-border/50 bg-muted/40';
          const labelClasses = isCritical ? 'text-warning' : 'text-muted-foreground';
          const shareClasses = isCritical ? 'text-warning/90' : 'text-muted-foreground';

          return (
            <div key={etapa.stage} className={`rounded-lg border p-3 ${cardClasses}`}>
              <p className={`text-[11px] font-medium ${labelClasses}`}>{etapa.label}</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-2xl font-bold text-foreground">{etapa.count}</p>
                {etapa.comparison ? <StageComparisonBadge comparison={etapa.comparison} /> : null}
              </div>
              <p className={`mt-1 text-[11px] ${shareClasses}`}>{etapa.share}% do fluxo</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{impact}</p>
        <p className="mt-2 text-xs leading-relaxed text-foreground">
          <span className="font-semibold text-warning">Insight atual:</span> {recommendation}
        </p>
      </div>
    </div>
  );
}

function StageComparisonBadge({
  comparison,
}: NonNullable<DashboardInsights['gargaloOperacional']['etapas'][number]['comparison']>) {
  const badgeClassName = comparison.tone === 'danger'
    ? 'bg-destructive/10 text-destructive'
    : comparison.tone === 'success'
      ? 'bg-success/10 text-success'
      : comparison.tone === 'warning'
        ? 'bg-warning/10 text-warning'
        : 'bg-muted text-muted-foreground';

  const Icon = comparison.direction === 'up'
    ? ArrowUpRight
    : comparison.direction === 'down'
      ? ArrowDownRight
      : Minus;
  const signal = comparison.direction === 'up'
    ? '+'
    : comparison.direction === 'down'
      ? '-'
      : '';

  return (
    <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClassName}`}>
            <Icon className="h-3.5 w-3.5" />
            {comparison.direction === 'neutral' ? '0' : `${signal}${comparison.difference}`}
          </span>
          </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-[11px]">{comparison.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
