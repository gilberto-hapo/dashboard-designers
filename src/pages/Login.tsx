import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import hapoLogo from '@/assets/hapo-logo.svg';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(identifier, password);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error || 'Credenciais inválidas. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <img src={hapoLogo} alt="Hapo" className="h-10 w-auto mx-auto mb-3" />
          <p className="text-muted-foreground text-base">Gestão de Produção de Conteúdo</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="text-base font-medium text-foreground mb-1.5 block">E-mail ou usuario</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Digite seu e-mail ou usuário"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>

          <div>
            <label className="text-base font-medium text-foreground mb-1.5 block">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 pr-10 text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-base text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-base font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          © 2026 Hapo Marketing · Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
