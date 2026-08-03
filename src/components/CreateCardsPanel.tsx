import { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Calendario = {
  id: string;
  title: string;
  clienteNome: string;
  mesAno: string;
  hasCopywriter?: boolean;
};

type PostStatus = 'pending' | 'creating' | 'created' | 'failed';

type PreviewPost = {
  index: number;
  total: number;
  title: string;
  formato: string;
  status: PostStatus;
  error?: string;
};

type PreviewResponse = {
  calendar: Calendario;
  posts: { index: number; total: number; title: string; formato: string }[];
  formatoOptions: string[];
};

type CreateSummary = {
  createdCount: number;
  failedCount: number;
  calendarMoved: boolean;
};

// Espelha buildPostTitles do server.js — o total aparece no próprio título
// (#NN/TOTAL), então mudar o total exige recalcular todos os títulos, não só
// adicionar/remover o excedente.
function buildPostTitles({ clienteNome, mesAno, total }: { clienteNome: string; mesAno: string; total: number }) {
  const paddedTotal = String(total).padStart(2, '0');
  return Array.from({ length: total }, (_, index) => {
    const sequencial = String(index + 1).padStart(2, '0');
    return `[${clienteNome.toUpperCase()}] ${mesAno} #${sequencial}/${paddedTotal}`;
  });
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro na requisição (status ${response.status})`);
  }
  return body as T;
}

export function CreateCardsPanel({ isSidebarCollapsed = false }: { isSidebarCollapsed?: boolean }) {
  const [designers, setDesigners] = useState<string[]>([]);
  const [selectedDesigner, setSelectedDesigner] = useState('');
  const [loadingDesigners, setLoadingDesigners] = useState(true);
  const [designersError, setDesignersError] = useState<string | null>(null);

  const [calendarios, setCalendarios] = useState<Calendario[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [loadingCalendarios, setLoadingCalendarios] = useState(false);
  const [calendariosError, setCalendariosError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [posts, setPosts] = useState<PreviewPost[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [defaultTotalPosts, setDefaultTotalPosts] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CreateSummary | null>(null);

  useEffect(() => {
    setLoadingDesigners(true);
    setDesignersError(null);
    fetchJson<{ designers: string[] }>('/api/criar-cards/designers')
      .then((data) => setDesigners(data.designers))
      .catch((error) => setDesignersError(error.message))
      .finally(() => setLoadingDesigners(false));
  }, []);

  useEffect(() => {
    setSelectedCalendarId('');
    setCalendarios([]);
    setPreview(null);
    setPosts([]);
    setSummary(null);

    if (!selectedDesigner) return;

    setLoadingCalendarios(true);
    setCalendariosError(null);
    fetchJson<{ calendarios: Calendario[] }>(
      `/api/criar-cards/calendarios?designer=${encodeURIComponent(selectedDesigner)}`,
    )
      .then((data) => setCalendarios(data.calendarios))
      .catch((error) => setCalendariosError(error.message))
      .finally(() => setLoadingCalendarios(false));
  }, [selectedDesigner]);

  useEffect(() => {
    setPreview(null);
    setPosts([]);
    setSummary(null);

    if (!selectedCalendarId) return;

    setLoadingPreview(true);
    setPreviewError(null);
    fetchJson<PreviewResponse>(`/api/criar-cards/preview?calendarId=${encodeURIComponent(selectedCalendarId)}`)
      .then((data) => {
        setPreview(data);
        setPosts(data.posts.map((post) => ({ ...post, status: 'pending' as PostStatus })));
        setTotalPosts(data.posts.length);
        setDefaultTotalPosts(data.posts.length);
      })
      .catch((error) => setPreviewError(error.message))
      .finally(() => setLoadingPreview(false));
  }, [selectedCalendarId]);

  const handleFormatoChange = (index: number, formato: string) => {
    setPosts((prev) => prev.map((post) => (post.index === index ? { ...post, formato } : post)));
  };

  const handleTotalPostsChange = (nextTotal: number) => {
    if (!preview || !Number.isFinite(nextTotal) || nextTotal < 1) return;

    setTotalPosts(nextTotal);
    const titles = buildPostTitles({ clienteNome: preview.calendar.clienteNome, mesAno: preview.calendar.mesAno, total: nextTotal });

    setPosts((prev) =>
      titles.map((title, arrayIndex) => {
        const index = arrayIndex + 1;
        const existing = prev.find((post) => post.index === index);
        return {
          index,
          total: nextTotal,
          title,
          formato: existing?.formato ?? preview.formatoOptions[0],
          status: 'pending' as PostStatus,
        };
      }),
    );
  };

  const handleCreate = async () => {
    if (!selectedCalendarId || !dueDate || posts.length === 0) return;

    setCreating(true);
    setCreateError(null);
    setSummary(null);
    setPosts((prev) => prev.map((post) => ({ ...post, status: 'pending', error: undefined })));

    let createdCount = 0;
    let failedCount = 0;

    for (const post of posts) {
      setPosts((prev) => prev.map((p) => (p.index === post.index ? { ...p, status: 'creating' } : p)));

      try {
        await fetchJson('/api/criar-cards/create-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: selectedCalendarId,
            dueDate,
            title: post.title,
            formato: post.formato,
            hasCopywriter: preview?.calendar.hasCopywriter ?? false,
          }),
        });
        createdCount += 1;
        setPosts((prev) => prev.map((p) => (p.index === post.index ? { ...p, status: 'created' } : p)));
      } catch (error) {
        failedCount += 1;
        const message = (error as Error).message;
        setPosts((prev) => prev.map((p) => (p.index === post.index ? { ...p, status: 'failed', error: message } : p)));
      }
    }

    let calendarMoved = false;
    if (createdCount > 0) {
      try {
        await fetchJson('/api/criar-cards/move-calendar-to-em-andamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarId: selectedCalendarId }),
        });
        calendarMoved = true;
      } catch {
        // Segue sem bloquear o resumo — os posts já foram criados.
      }
    }

    setSummary({ createdCount, failedCount, calendarMoved });
    setCreating(false);
  };

  const canCreate = Boolean(selectedCalendarId && dueDate && posts.length > 0 && !creating);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-5">
        <div className="w-full max-w-xs">
          <label htmlFor="create-cards-designer" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Designer Responsável
          </label>
          <div className="relative mt-2">
            <select
              id="create-cards-designer"
              value={selectedDesigner}
              onChange={(event) => setSelectedDesigner(event.target.value)}
              disabled={loadingDesigners}
              className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 disabled:opacity-60"
            >
              <option value="">Selecione um designer</option>
              {designers.map((designer) => (
                <option key={designer} value={designer}>
                  {designer}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {designersError && <p className="mt-2 text-xs text-destructive">{designersError}</p>}
        </div>

        <div className="w-full max-w-xs">
          <label htmlFor="create-cards-calendario" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Calendário
          </label>
          <div className="relative mt-2">
            <select
              id="create-cards-calendario"
              value={selectedCalendarId}
              onChange={(event) => setSelectedCalendarId(event.target.value)}
              disabled={!selectedDesigner || loadingCalendarios}
              className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 disabled:opacity-60"
            >
              <option value="">
                {loadingCalendarios ? 'Carregando...' : 'Selecione um calendário'}
              </option>
              {calendarios.map((calendario) => (
                <option key={calendario.id} value={calendario.id}>
                  {calendario.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {calendariosError && <p className="mt-2 text-xs text-destructive">{calendariosError}</p>}
          {selectedDesigner && !loadingCalendarios && calendarios.length === 0 && !calendariosError && (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum calendário na fase "Caixa de Entrada" para este designer.
            </p>
          )}
        </div>
      </div>

      {preview && posts.length > 0 && (
        <div className="w-fit">
          <label htmlFor="create-cards-total-posts" className="block whitespace-nowrap text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Selecione a Quantidade
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="create-cards-total-posts"
              type="number"
              min={1}
              value={totalPosts}
              onChange={(event) => handleTotalPostsChange(Number(event.target.value))}
              disabled={creating}
              className="w-24 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary/40 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => handleTotalPostsChange(defaultTotalPosts)}
              disabled={creating || totalPosts === defaultTotalPosts}
              title={`Restaurar para ${defaultTotalPosts} (padrão contratado)`}
              className="rounded-xl border border-border bg-card p-3 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {loadingPreview && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando lista de cards...
        </div>
      )}

      {previewError && <p className="text-sm text-destructive">{previewError}</p>}

      {preview && posts.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {preview.calendar.clienteNome} — {preview.calendar.mesAno}
            </h3>
            <p className="text-xs text-muted-foreground">
              {posts.length} card{posts.length !== 1 ? 's' : ''} {posts.length !== 1 ? 'serão' : 'será'} criado{posts.length !== 1 ? 's' : ''} no board "Posts Produção de Conteúdo"
              {preview.calendar.hasCopywriter ? ' já na fase "Criação das artes" (cliente com Copywriter Dedicado)' : ''}.
            </p>
          </div>

          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
              isSidebarCollapsed ? 'lg:grid-cols-6 xl:grid-cols-8' : 'lg:grid-cols-6'
            }`}
          >
            {posts.map((post) => (
              <div
                key={post.index}
                title={post.error ? `${post.title} — ${post.error}` : post.title}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-3 py-2 transition-colors',
                  post.status === 'created' && 'border-emerald-500/50 bg-emerald-500/10',
                  post.status === 'failed' && 'border-destructive/50 bg-destructive/10',
                  post.status !== 'created' && post.status !== 'failed' && 'border-border bg-card',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium text-foreground">
                    #{String(post.index).padStart(2, '0')}/{post.total}
                  </span>
                  {post.status === 'creating' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                  {post.status === 'created' && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {post.status === 'failed' && <X className="h-4 w-4 shrink-0 text-destructive" />}
                </div>
                <Select
                  value={post.formato}
                  onValueChange={(value) => handleFormatoChange(post.index, value)}
                  disabled={creating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.formatoOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card/40 p-4">
            <div className="flex w-fit flex-col">
              <label htmlFor="create-cards-due-date" className="block whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Data de entrega
              </label>
              <input
                id="create-cards-due-date"
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-2 w-56 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors [color-scheme:dark] hover:border-primary/30 focus:border-primary/40"
              />
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="mt-[1.375rem] inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Cards
            </button>
          </div>

          {createError && <p className="text-sm text-destructive">{createError}</p>}

          {summary && (
            <div
              className={cn(
                'space-y-2 rounded-lg border px-3 py-3 text-sm',
                summary.failedCount === 0
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-border bg-card',
              )}
            >
              <p className={cn('flex items-center gap-2 font-medium', summary.failedCount === 0 ? 'text-emerald-500' : 'text-foreground')}>
                {summary.failedCount === 0 && <Check className="h-4 w-4 shrink-0" />}
                {summary.createdCount} card{summary.createdCount !== 1 ? 's' : ''} criado{summary.createdCount !== 1 ? 's' : ''} com sucesso.
                {summary.calendarMoved && ' Calendário movido para "Em andamento".'}
              </p>
              {summary.failedCount > 0 && (
                <p className="font-medium text-destructive">
                  {summary.failedCount} card{summary.failedCount !== 1 ? 's' : ''} falhou{summary.failedCount !== 1 ? 'ram' : ''} — veja os detalhes passando o mouse sobre os cards marcados em vermelho.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
