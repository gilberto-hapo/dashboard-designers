import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { fetchJson } from '@/lib/calendarUi';

type HistoricoMes = {
  mesAno: string;
  temCalendario: boolean;
  totalPosts: number;
  totalAjustes: number;
  taxaAjustes: number;
  porFormato: Record<string, number>;
};

type HistoricoResumo = {
  totalPosts: number;
  totalAjustes: number;
  taxaAjustes: number;
  formatoMaisUsado: string | null;
};

type HistoricoTrimestreResponse = {
  meses: HistoricoMes[];
  resumo: HistoricoResumo;
  geradoEm: string;
};

const FORMATO_LABELS: Record<string, string> = {
  ESTÁTICO: 'Estático',
  CARROSSEL: 'Carrossel',
  VÍDEO: 'Vídeo',
  STORIES: 'Stories',
  'NÃO INFORMADO': 'Não informado',
};

const FORMATO_ORDER = ['ESTÁTICO', 'CARROSSEL', 'VÍDEO', 'STORIES', 'NÃO INFORMADO'];

const FORMATO_CHART_CONFIG: ChartConfig = {
  ESTÁTICO: { label: 'Estático', color: 'var(--chart-format-1)' },
  CARROSSEL: { label: 'Carrossel', color: 'var(--chart-format-2)' },
  VÍDEO: { label: 'Vídeo', color: 'var(--chart-format-3)' },
  STORIES: { label: 'Stories', color: 'var(--chart-format-4)' },
  'NÃO INFORMADO': { label: 'Não informado', color: 'var(--chart-format-5)' },
};

const TAXA_AJUSTES_CHART_CONFIG: ChartConfig = {
  comAjuste: { label: 'Com ajuste', color: 'var(--chart-format-2)' },
  semAjuste: { label: 'Sem ajuste', color: 'var(--chart-neutral)' },
};

function formatMesAnoCurto(mesAno: string) {
  const [month, year] = mesAno.split('/');
  if (!month || !year) return mesAno;
  return `${month.slice(0, 3)}/${year.slice(2)}`;
}

export function ClientQuarterHistoryChart({ clientId }: { clientId: string }) {
  const [data, setData] = useState<HistoricoTrimestreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<HistoricoTrimestreResponse>(`/api/clientes/${clientId}/historico-trimestre`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  const formatosPresentes = useMemo(() => {
    if (!data) return [];
    const presentes = new Set<string>();
    data.meses.forEach((mes) => {
      Object.keys(mes.porFormato).forEach((formato) => presentes.add(formato));
    });
    return FORMATO_ORDER.filter((formato) => presentes.has(formato));
  }, [data]);

  const volumeChartData = useMemo(() => {
    if (!data) return [];
    return data.meses.map((mes) => ({
      mesAno: formatMesAnoCurto(mes.mesAno),
      totalPosts: mes.totalPosts,
      ...mes.porFormato,
    }));
  }, [data]);

  const ajustesChartData = useMemo(() => {
    if (!data) return [];
    return data.meses.map((mes) => ({
      mesAno: formatMesAnoCurto(mes.mesAno),
      taxaAjustes: mes.taxaAjustes,
      comAjuste: mes.totalAjustes > 0 ? mes.taxaAjustes : null,
      semAjuste: mes.totalAjustes > 0 ? 100 - mes.taxaAjustes : null,
      totalAjustes: mes.totalAjustes,
      totalPosts: mes.totalPosts,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando histórico...
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm text-destructive">{error}</p>;
  }

  if (!data || data.resumo.totalPosts === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Sem histórico de posts nos últimos 3 meses.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
          Volume e formato de conteúdo
        </h3>
        <ChartContainer config={FORMATO_CHART_CONFIG} className="aspect-auto h-[220px] w-full">
          <BarChart data={volumeChartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="mesAno" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {formatosPresentes.map((formato, index) => (
              <Bar
                key={formato}
                dataKey={formato}
                name={FORMATO_LABELS[formato] || formato}
                stackId="formato"
                fill={`var(--color-${formato})`}
                radius={index === formatosPresentes.length - 1 ? [4, 4, 0, 0] : 0}
              >
                {index === formatosPresentes.length - 1 && (
                  <LabelList
                    dataKey="totalPosts"
                    position="top"
                    offset={8}
                    className="fill-foreground text-xs font-medium"
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
          Taxa de ajuste
        </h3>
        <ChartContainer config={TAXA_AJUSTES_CHART_CONFIG} className="aspect-auto h-[220px] w-full">
          <BarChart data={ajustesChartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="mesAno" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              allowDecimals={false}
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value) => `${value}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) =>
                    name === 'comAjuste' ? (
                      <span className="text-foreground">
                        {value}% ({item.payload.totalAjustes} de {item.payload.totalPosts} posts com ajuste)
                      </span>
                    ) : null
                  }
                />
              }
            />
            <Bar dataKey="comAjuste" name="comAjuste" stackId="ajuste" fill="var(--color-comAjuste)">
              <LabelList
                dataKey="comAjuste"
                position="center"
                formatter={(value: number) => (value > 0 ? `${value}%` : '')}
                className="fill-white text-xs font-semibold"
              />
            </Bar>
            <Bar dataKey="semAjuste" name="semAjuste" stackId="ajuste" fill="var(--color-semAjuste)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
