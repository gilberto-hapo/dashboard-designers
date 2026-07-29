import { Layers, AlertTriangle, Clock, Ban, CheckCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { type DashboardInsights } from '@/lib/insights';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const statConfig = [
  { key: 'totalAtivas', label: 'Em Produção', icon: Layers, color: 'text-info' },
  { key: 'totalVencidas', label: 'Vencidas', icon: AlertTriangle, color: 'text-destructive' },
  { key: 'totalHoje', label: 'Vencem Hoje', icon: Clock, color: 'text-warning' },
  { key: 'totalBloqueadas', label: 'Aguardando', icon: Ban, color: 'text-tag-aguardando' },
  { key: 'totalConcluidas', label: 'Concluídos no mês atual', icon: CheckCircle, color: 'text-success' },
] as const;

export function StatsBar({ data }: { data: DashboardInsights }) {
  const comparison = data.comparativoConcluidasMesAtual;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {statConfig.map(({ key, label, icon: Icon, color }) => {
        const isProductionCard = key === 'totalAtivas';
        const isCompletedMonthCard = key === 'totalConcluidas';

        return (
          <div key={key} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/20 transition-colors">
            <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-foreground">{data[key]}</p>
                {isProductionCard && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                    {data.totalAFazer} não iniciadas
                  </span>
                )}
                {isCompletedMonthCard && (
                  <ComparisonBadge
                    direction={comparison.direction}
                    difference={comparison.difference}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonBadge({
  direction,
  difference,
}: DashboardInsights['comparativoConcluidasMesAtual']) {
  const tooltipText = 'Comparação entre os concluídos no mês atual e o total concluído no mês anterior.';

  if (direction === 'up') {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +{difference}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-[11px]">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (direction === 'down') {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              <ArrowDownRight className="h-3.5 w-3.5" />
              -{difference}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-[11px]">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Minus className="h-3.5 w-3.5" />
            0
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-[11px]">{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
