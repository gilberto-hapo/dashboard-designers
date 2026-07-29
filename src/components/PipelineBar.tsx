import { type DashboardInsights } from '@/lib/insights';

export function PipelineBar({ data }: { data: DashboardInsights }) {
  const total = data.porEtapa.reduce((acc, etapa) => acc + etapa.count, 0);
  const colors = [
    'hsl(var(--destructive))',
    'hsl(var(--warning))',
    'hsl(var(--info))',
    'hsl(var(--tag-feed))',
    'hsl(var(--tag-story))',
    'hsl(var(--success))',
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-base font-semibold text-foreground mb-1">Pipeline de Produção</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Distribuição das demandas ativas por etapa
      </p>

      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {data.porEtapa.map((etapa, index) => (
          <div
            key={etapa.stage}
            className="transition-all duration-500"
            style={{
              width: `${(etapa.count / Math.max(total, 1)) * 100}%`,
              backgroundColor: colors[index],
              minWidth: etapa.count > 0 ? '4px' : 0,
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.porEtapa.map((etapa, index) => (
          <div key={etapa.stage} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[index] }} />
            <span className="text-xs text-muted-foreground">{etapa.label}</span>
            <span className="text-xs font-bold text-foreground">{etapa.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
