import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { type AlertItem } from '@/lib/insights';

const iconMap = {
  danger: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

const styleMap = {
  danger: 'border-destructive/30 bg-destructive/5',
  warning: 'border-warning/30 bg-warning/5',
  info: 'border-info/30 bg-info/5',
};

const iconStyleMap = {
  danger: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  const displayed = alerts;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Alertas & Atenção
        {alerts.length > 0 && (
          <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[11px] font-bold text-destructive">
            {alerts.length}
          </span>
        )}
      </h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {displayed.map((alert, i) => {
          const Icon = iconMap[alert.type];
          const highlightTone = alert.type === 'danger'
            ? 'bg-destructive/15 text-destructive'
            : alert.type === 'warning'
              ? 'bg-warning/15 text-warning'
              : 'bg-info/15 text-info';

          return (
            <div key={i} className={`flex min-h-[132px] flex-col rounded-lg border p-3 ${styleMap[alert.type]}`}>
              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${iconStyleMap[alert.type]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-foreground">{alert.message}</p>
                  {alert.highlight && (
                    <p className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${highlightTone}`}>
                      {alert.highlight}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-3">
                {alert.designer && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{alert.designer}</p>
                )}
              </div>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">Nenhum alerta no momento</p>
        )}
      </div>
    </div>
  );
}
