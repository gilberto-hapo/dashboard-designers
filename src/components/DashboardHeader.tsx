import { LogOut, Bell, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import hapoMktLogo from '@/assets/hapo-mkt-logo.svg';

interface DashboardHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function DashboardHeader({ onRefresh, isRefreshing = false }: DashboardHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <img src={hapoMktLogo} alt="hapo.mkt" className="h-7 w-auto" />
        <span className="text-muted-foreground text-base hidden md:inline">|</span>
        <span className="text-muted-foreground text-base hidden md:inline">Gestão de Produção de Conteúdo</span>
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-base text-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {isRefreshing ? 'Atualizando...' : 'Atualizar dados'}
            </span>
          </button>
        )}
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-base font-semibold">
            G
          </div>
          <span className="text-base text-foreground hidden md:inline">{user?.name}</span>
        </div>
        <button
          onClick={() => void logout()}
          className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
