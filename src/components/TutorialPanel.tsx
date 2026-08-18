import { AlertTriangle, Check } from 'lucide-react';

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span className="text-sm leading-relaxed text-foreground">{children}</span>
    </li>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="inline-block rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-600">
        {title}
      </h3>
      <ul className="space-y-2 pl-1">{children}</ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="inline-block w-fit rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-primary">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function TutorialPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O dashboard só mostra certo o que estiver certo no Drive e na Goalfy. Poucas regras, mas importantes:
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section title="No Drive">
        <SubSection title="Ordem">
          <Tip>
            A ordem das pastas precisa ser a mesma da ordem dos posts (a primeira pasta se conectará com o post 1, a
            segunda com o post 2, etc).
          </Tip>
          <Tip>
            Se dentro da pasta do post tiver diversas imagens de um carrossel, as imagens precisam também estar na
            ordem correta.
          </Tip>
          <Tip>
            O número de pastas precisa ser exatamente igual ao número de posts criados na Goalfy (se tiver 4 cards
            criados na Goalfy para aquele calendário, é preciso ter 4 pastas no Drive).
          </Tip>
        </SubSection>

        <SubSection title="Legenda">
          <Tip>
            Se o post tiver legenda, ela precisa estar em um documento de texto (Word ou Google Docs) na mesma pasta
            do post, com a palavra <code className="rounded bg-muted px-1 py-0.5 text-xs">LEGENDA</code> antes do
            texto. O sistema irá considerar uma legenda tudo o que vier depois desta palavra.
          </Tip>
          <Tip>
            Se o formato de entrega do post for <strong>"Stories"</strong>, a legenda será oculta automaticamente.
          </Tip>
        </SubSection>

        <SubSection title="Vídeo">
          <Tip>Se for vídeo, a imagem da capa precisa estar na mesma pasta do vídeo.</Tip>
        </SubSection>
      </Section>

      <Section title="Na Goalfy">
        <SubSection title="Ordem">
          <Tip>
            Cada card criado precisa estar vinculado corretamente ao calendário e com o número sequencial no título
            (ex: <code className="rounded bg-muted px-1 py-0.5 text-xs">01/08</code>). Esta numeração é o que irá
            conectar este card à pasta no Drive — ou seja, o card com a numeração{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">01/08</code> se conectará à primeira pasta, o
            card com a numeração <code className="rounded bg-muted px-1 py-0.5 text-xs">02/08</code> se conectará
            com a segunda pasta.
          </Tip>
        </SubSection>

        <SubSection title="Formato">
          <Tip>Preencha sempre o "Formato de entrega" (Estático, Carrossel, Stories).</Tip>
        </SubSection>

        <SubSection title="Fase">
          <Tip>
            No link do cliente, só irá aparecer os cards que estiverem na fase "Validação do Cliente".
          </Tip>
        </SubSection>
      </Section>

      <Section title="Conexão entre Goalfy e Drive">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Lembre-se: o sistema só sabe em qual fase o card está, e qual o formato dele, se o card estiver conectado
          corretamente com a pasta do Drive. Para conectar, verifique:
        </p>
        <ul className="space-y-2">
          <Tip>Cada card precisa estar vinculado ao calendário correto.</Tip>
          <Tip>Cada card precisa ter o número sequencial no título.</Tip>
          <Tip>O número de pastas no Drive precisa ser igual ao número de cards criados.</Tip>
          <Tip>Cada pasta do Drive precisa estar na ordem correta.</Tip>
        </ul>
      </Section>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Se algo aparecer errado</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O sistema só copia o que está no Drive e na Goalfy. Corrigindo a pasta ou o card, o dashboard se corrige
            sozinho na próxima atualização.
          </p>
        </div>
      </div>
    </div>
  );
}
