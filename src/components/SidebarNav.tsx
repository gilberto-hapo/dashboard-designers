import { CalendarCheck2, FileText, LogOut, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, PlusSquare, RefreshCw, Users } from 'lucide-react';
import hapoLogo from '@/assets/hapo-logo.svg';
import hapoLogoSmall from '@/assets/hapo-logo-menor.svg';

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'hapo:sidebar-collapsed';
export const SIDEBAR_WIDTH_EXPANDED_CLASS = 'lg:w-60';
export const SIDEBAR_WIDTH_COLLAPSED_CLASS = 'lg:w-[4.5rem]';
export const SIDEBAR_MARGIN_EXPANDED_CLASS = 'lg:ml-60';
export const SIDEBAR_MARGIN_COLLAPSED_CLASS = 'lg:ml-[4.5rem]';

export const navItems: Array<{
  id: string;
  label: string;
  icon: typeof CalendarCheck2;
}> = [
  {
    id: 'calendars',
    label: 'Calendários',
    icon: FileText,
  },
  {
    id: 'calendar',
    label: 'Agenda',
    icon: CalendarCheck2,
  },
  {
    id: 'feedback',
    label: 'Feedback',
    icon: MessageSquareWarning,
  },
  {
    id: 'client-score',
    label: 'Clientes',
    icon: Users,
  },
  {
    id: 'create-cards',
    label: 'Criar Cards',
    icon: PlusSquare,
  },
];

export function formatLastUpdated(lastUpdatedAt: number) {
  if (!lastUpdatedAt) return 'Ainda não atualizado';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(lastUpdatedAt));
}

export function SidebarNav({
  activeView,
  onChange,
  onRefresh,
  isRefreshing,
  lastUpdatedAt,
  onLogout,
  isCollapsed,
  onToggleCollapsed,
  badgeCounts,
}: {
  activeView: string;
  onChange: (view: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdatedAt: number;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  badgeCounts?: Record<string, number>;
}) {
  return (
    <aside
      className={`w-full lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 ${
        isCollapsed ? SIDEBAR_WIDTH_COLLAPSED_CLASS : SIDEBAR_WIDTH_EXPANDED_CLASS
      }`}
    >
      <div className="flex min-h-[100dvh] flex-col border-r border-border bg-card px-3 py-5 lg:h-screen lg:min-h-0">
        <div className="flex items-center gap-2 border-b border-border pb-5">
          {isCollapsed ? (
            <div className="flex w-full flex-col items-center gap-3">
              <img src={hapoLogoSmall} alt="Hapo" className="h-6 w-auto" />
              <button
                onClick={onToggleCollapsed}
                className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Expandir menu"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <img src={hapoLogo} alt="Hapo" className="h-8 w-auto" />
              <button
                onClick={onToggleCollapsed}
                className="shrink-0 rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Encolher menu"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <nav className="mt-5 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const badgeCount = badgeCounts?.[item.id] ?? 0;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isCollapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-transparent hover:border-border hover:bg-muted/60'
                }`}
              >
                <div
                  className={`relative rounded-lg p-2 ${
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {badgeCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title={isCollapsed ? 'Atualizar dados' : undefined}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <RefreshCw className={`h-4 w-4 shrink-0 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            {!isCollapsed && (
              <span>
                {isRefreshing
                  ? 'Atualizando...'
                  : 'Atualizar dados'}
              </span>
            )}
          </button>
          {!isCollapsed && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Última atualização: <span className="text-foreground">{formatLastUpdated(lastUpdatedAt)}</span>
            </p>
          )}

          <div
            className={`mt-3 flex items-center rounded-xl border border-border bg-muted/40 px-3 py-3 ${
              isCollapsed ? 'justify-center' : 'justify-center gap-2'
            }`}
          >
            <button
              onClick={onLogout}
              title="Sair"
              className={`flex items-center gap-2 rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${
                isCollapsed ? 'p-2' : 'w-full justify-center px-3 py-2 text-sm font-medium'
              }`}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>Sair</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
