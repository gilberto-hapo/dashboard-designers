import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ClientPortalFeed, getAvailableSocialTags, TagFilterDropdown, type PortalPost } from '@/components/ClientPortalFeed';
import hapoLogo from '@/assets/hapo-logo.svg';

type PortalCalendarioResumo = {
  id: string;
  title: string;
  mesAno: string;
  linkDriveArtes: string;
  posts: PortalPost[];
};

type PortalCliente = {
  id: string;
  nome: string;
  calendarios: PortalCalendarioResumo[];
  tagFilterEnabled?: boolean;
};

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [cliente, setCliente] = useState<PortalCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);

    fetch(`/api/public/portal/${token}?refresh=1`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error || 'Não foi possível carregar este link.');
        }
        return body;
      })
      .then((data) => setCliente(data.cliente))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Link inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">{error || 'Cliente não encontrado.'}</p>
        </div>
      </div>
    );
  }

  const allPosts = cliente.calendarios.flatMap((calendario) =>
    calendario.posts.map((post) => ({ ...post, calendarLabel: calendario.mesAno || calendario.title })),
  );
  const postsWithMedia = allPosts.filter((post) => (post.media?.files?.length ?? 0) > 0);
  const availableTags = getAvailableSocialTags(postsWithMedia);
  const showTagFilter = Boolean(cliente.tagFilterEnabled) && availableTags.length > 0;

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <img src={hapoLogo} alt="hapo" className="h-6 w-auto shrink-0" />
          <div className="h-5 w-px shrink-0 bg-border" />
          <h1 className="truncate text-base font-semibold text-foreground">{cliente.nome}</h1>
          {showTagFilter && (
            <div className="ml-auto shrink-0">
              <TagFilterDropdown availableTags={availableTags} selectedTags={selectedTags} onToggleTag={toggleTag} />
            </div>
          )}
        </div>
      </header>

      <main className="py-1">
        {postsWithMedia.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Seus posts estão sendo produzidos e logo estarão aqui para aprovação.
          </p>
        ) : (
          <ClientPortalFeed token={token!} posts={allPosts} selectedTags={showTagFilter ? selectedTags : undefined} />
        )}
      </main>
    </div>
  );
}
