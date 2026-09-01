import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/calendarUi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export type EditorialCalendarItem = {
  oQue: string;
  dia: string;
  tituloTema: string;
  aprofundamento: string;
  formato: string;
  linhaEditorial: string;
  copy?: string;
};

// Ajusta a altura ao conteúdo em vez de deixar fixa: a copy gerada pode
// variar bastante de tamanho entre posts, e um textarea de altura fixa
// tanto sobra quanto corta texto dependendo do caso.
function AutoResizeTextarea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="rounded-md border border-input bg-background">
      <Textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mx-auto min-h-24 max-w-[70ch] resize-none overflow-hidden border-0 bg-transparent p-8 text-base leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}

function EditorialItemRow({ calendarId, item }: { calendarId: string; item: EditorialCalendarItem }) {
  const [copy, setCopy] = useState(item.copy || '');
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerateCopy() {
    setGenerating(true);
    setProgressStep(null);

    // SSE em vez de um POST simples: buscar as legendas reais dos posts já
    // aprovados no Drive é mais lento que as outras chamadas de IA do app —
    // o designer precisa ver o que está acontecendo, não uma barra de
    // carregamento indefinida (mesmo padrão de ClientFeedbackPanel).
    let finished = false;
    const params = new URLSearchParams({ calendarId, item: JSON.stringify(item) });
    const source = new EventSource(`/api/ai/generate-post-copy/stream?${params.toString()}`, {
      withCredentials: true,
    });

    function finish(errorMessage?: string) {
      if (finished) return;
      finished = true;
      setGenerating(false);
      setProgressStep(null);
      if (errorMessage) toast.error(errorMessage);
      source.close();
    }

    source.addEventListener('progress', (event) => {
      if (finished) return;
      const data = JSON.parse((event as MessageEvent).data) as { step: string };
      setProgressStep(data.step);
    });

    source.addEventListener('done', (event) => {
      if (finished) return;
      const data = JSON.parse((event as MessageEvent).data) as { copy: string };
      setCopy(data.copy);
      finish();
    });

    source.addEventListener('error', (event) => {
      if (finished) return;
      const data = (event as MessageEvent).data;
      const message = data ? JSON.parse(data)?.message : null;
      finish(message || 'Erro ao gerar copy');
    });
  }

  async function handleCopyToClipboard(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar o texto');
    }
  }

  return (
    <AccordionItem value={item.oQue} className="rounded-lg border border-border bg-card px-4">
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex flex-1 flex-wrap items-center gap-2 text-left">
          {item.oQue && <span className="text-sm font-semibold text-foreground">{item.oQue}</span>}
          {item.dia && <span className="text-xs text-muted-foreground">{item.dia}</span>}
          {item.formato && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {item.formato}
            </span>
          )}
          {item.tituloTema && (
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.tituloTema}</span>
          )}
          {copy && (
            <span className="rounded-full border border-emerald-800/40 bg-emerald-800/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              Copy gerada
            </span>
          )}
        </div>
      </AccordionTrigger>

      <AccordionContent>
        <div className="grid grid-cols-1 gap-4 pb-2 md:grid-cols-2">
          <div className="space-y-2">
            {item.linhaEditorial && (
              <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {item.linhaEditorial}
              </span>
            )}
            {item.tituloTema && <p className="text-sm font-semibold text-foreground">{item.tituloTema}</p>}
            {item.aprofundamento && <p className="text-sm text-muted-foreground">{item.aprofundamento}</p>}
          </div>

          <div className="flex flex-col gap-2">
            {!copy && (
              <div className="flex min-h-24 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-8">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={generating}
                  onClick={handleGenerateCopy}
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Gerar copy
                </Button>
                {generating && progressStep && <p className="text-xs text-muted-foreground">{progressStep}</p>}
              </div>
            )}

            {copy && (
              <>
                <AutoResizeTextarea value={copy} onChange={setCopy} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-2" disabled={generating} onClick={handleGenerateCopy}>
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Gerar novamente
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-2" onClick={handleCopyToClipboard}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                  {generating && progressStep && <p className="text-xs text-muted-foreground">{progressStep}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function EditorialCalendarPanel({ calendarId }: { calendarId: string }) {
  const [items, setItems] = useState<EditorialCalendarItem[] | null>(null);
  const [hasLink, setHasLink] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ items: EditorialCalendarItem[]; hasLink: boolean }>(`/api/calendarios/${calendarId}/editorial`)
      .then((data) => {
        setItems(data.items);
        setHasLink(data.hasLink);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar calendário editorial'))
      .finally(() => setLoading(false));
  }, [calendarId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando calendário editorial...
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-sm text-destructive">{error}</p>;
  }

  if (!hasLink) {
    return <p className="py-4 text-sm text-muted-foreground">Este calendário não tem um link de calendário editorial configurado.</p>;
  }

  if (!items || items.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Nenhum item encontrado no calendário editorial.</p>;
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {items.map((item, index) => (
        <EditorialItemRow key={`${item.oQue || index}`} calendarId={calendarId} item={item} />
      ))}
    </Accordion>
  );
}
