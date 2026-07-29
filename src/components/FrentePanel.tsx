import { Calendar, Target, TrendingUp } from 'lucide-react';
import { type DashboardInsights, type FrenteInfo } from '@/lib/insights';

export function FrentePanel({ data }: { data: DashboardInsights }) {
  const totalPendentes = data.porDesigner.reduce((acc, d) => acc + d.frente.pendentes, 0);
  const totalMeta = data.porDesigner.reduce((acc, d) => acc + d.frente.totalProximas2Semanas, 0);
  const totalConcluidas = data.porDesigner.reduce((acc, d) => acc + d.frente.concluidasAdiantado, 0);
  const percentGeral = totalMeta > 0 ? Math.round((totalConcluidas / totalMeta) * 100) : 100;

  return (
    <div className="bg-card border border-border rounded-xl p-4 h-full">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground">
        <Target className="h-4 w-4 text-primary" />
        Meta de Frente - 2 Semanas
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Meta por designer, baseada na frente de 14 dias e no ritmo real de conclusão
      </p>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {totalConcluidas} / {totalMeta} posts
          </span>
          <span
            className={`text-sm font-bold ${
              percentGeral >= 80 ? 'text-success' : percentGeral >= 40 ? 'text-warning' : 'text-destructive'
            }`}
          >
            {percentGeral}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${percentGeral}%`,
              background: percentGeral >= 80
                ? 'hsl(var(--success))'
                : percentGeral >= 40
                  ? 'hsl(var(--warning))'
                  : 'hsl(var(--destructive))',
            }}
          />
        </div>
      </div>

      <div className="space-y-3.5">
        {data.porDesigner.map((d) => (
          <DesignerFrenteRow key={d.nome} nome={d.nome} cor={d.cor} avatar={d.avatar} frente={d.frente} />
        ))}
      </div>

      {totalPendentes > 0 && (
        <div className="mt-4 border-t border-border/50 pt-3">
          <p className="text-center text-xs text-muted-foreground">
            Faltam <span className="font-bold text-foreground">{totalPendentes}</span> posts para fechar a meta de 2 semanas
          </p>
        </div>
      )}
    </div>
  );
}

function DesignerFrenteRow({
  nome,
  cor,
  avatar,
  frente,
}: {
  nome: string;
  cor: string;
  avatar: string;
  frente: FrenteInfo;
}) {
  const statusColor = frente.percentual >= 80 ? 'text-success' : frente.percentual >= 40 ? 'text-warning' : 'text-destructive';
  const barColor = frente.percentual >= 80 ? 'hsl(var(--success))' : frente.percentual >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const ritmoAtual = Number(frente.ritmoRecenteDiario || 0);
  const manterRitmo = ritmoAtual >= frente.metaDiaria;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ backgroundColor: `${cor}25`, color: cor }}
        >
          {avatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="truncate text-xs font-medium text-foreground">{nome}</span>
            <span className={`text-[11px] font-bold ${statusColor}`}>
              {frente.concluidasAdiantado}/{frente.totalProximas2Semanas}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${frente.percentual}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pl-9">
        {frente.pendentes > 0 && (
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{frente.pendentes}</span> em aberto
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          Ritmo atual: <span className="font-semibold text-foreground">{frente.ritmoRecenteDiario || 0}</span>/dia
        </span>
        {frente.metaDiaria > 0 && frente.previsaoMetaDiaria && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {manterRitmo ? (
              <span>
                Mantenha o ritmo para fechar a frente até <span className="font-semibold text-foreground">{frente.previsaoMetaDiaria}</span>
              </span>
            ) : (
              <span>
                Ajuste o ritmo para <span className="font-semibold text-foreground">{frente.metaDiaria}</span> post(s)/dia e fechar até <span className="font-semibold text-foreground">{frente.previsaoMetaDiaria}</span>
              </span>
            )}
          </span>
        )}
        {frente.diasDeFrenteAtual > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-success">
            <TrendingUp className="h-3 w-3" />
            {frente.diasDeFrenteAtual}d cobertos
          </span>
        )}
      </div>
    </div>
  );
}
