import { AlertTriangle, Check } from 'lucide-react';

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span className="text-sm leading-relaxed text-foreground">{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

export function TutorialPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O dashboard só mostra certo o que estiver certo no Drive e na Goalfy. Poucas regras, mas importantes:
      </p>

      <Section title="Drive">
        <Tip>
          <strong>Organize as pastas de post na ordem correta</strong> — o sistema mostra os posts exatamente na
          ordem em que as pastas estão no Drive.
        </Tip>
        <Tip>
          <strong>Se for carrossel</strong>, organize as imagens na ordem correta dentro da pasta — o carrossel
          segue essa mesma ordem.
        </Tip>
        <Tip>
          <strong>Se for vídeo</strong>, coloque uma imagem de capa junto na pasta — se for só uma imagem, o sistema
          já usa ela como capa automaticamente. Se houver mais de uma imagem, coloque a palavra "capa" no nome da
          que deve ser usada (ex: <code className="rounded bg-muted px-1 py-0.5 text-xs">capa.png</code>).
        </Tip>
        <Tip>
          <strong>A legenda vai num documento de texto</strong> (Word ou Google Docs) na mesma pasta do post, com a
          palavra "legenda" antes do texto (ex: "Legenda:"). Tudo depois dela é copiado.
        </Tip>
        <Tip>
          <strong>Se o formato de entrega do post for "Stories"</strong>, então a legenda será oculta
          automaticamente.
        </Tip>
      </Section>

      <Section title="Goalfy">
        <Tip>
          <strong>Preencha os cards com o número sequencial</strong> (ex:{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">01/08</code>). A numeração usada nos cards é o que
          conecta o card à ordem da pasta criada no Drive — ou seja, o card{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">01/08</code> será conectado à primeira pasta do
          Drive, o card <code className="rounded bg-muted px-1 py-0.5 text-xs">02/08</code> à segunda pasta, e assim
          por diante. Essa conexão é o que permite ao sistema saber em qual fase o card está na Goalfy e atualizar
          o status dele no sistema. Sem essa numeração, o post continua aparecendo normalmente, mas o status
          (aprovado, publicado) não atualiza.
        </Tip>
        <Tip>
          <strong>Preencha o "Formato de entrega"</strong> (Estático, Carrossel, Stories) sempre.
        </Tip>
        <Tip>
          <strong>Mova o card de fase</strong> quando o status mudar — é isso que atualiza o que o cliente vê.
        </Tip>
      </Section>

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
