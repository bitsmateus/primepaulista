import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Smartphone, Package, ShoppingCart, Receipt, Users, MessageSquare,
  Wrench, BarChart3, LogOut, ShieldCheck, BadgeCheck, PanelLeftClose, PanelLeftOpen, Table2, RefreshCw, FileText,
  Truck, ScrollText, Settings, UserCircle, Lock, CalendarDays, FileBarChart, Bot, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, ROLE_LABELS } from "@/lib/permissions";
import { useLogoSrc, useStoreSnapshot } from "@/hooks/useAppSettings";
import { useLock } from "@/contexts/LockContext";
import { AccountDialog } from "@/components/AccountDialog";
import { clearAppCache } from "@/lib/cache";
import { APP_VERSION } from "@/version";

// Item avulso (sem grupo) ou grupo com subitens. "Dashboard" fica avulso, de propósito,
// por ser a tela mais usada — o resto entra em grupos para não virar uma lista enorme.
type NavEntry =
  | { kind: "item"; to: string; label: string; icon: typeof LayoutDashboard }
  | { kind: "group"; key: string; label: string; icon: typeof LayoutDashboard; items: { to: string; label: string }[] };

const navEntries: NavEntry[] = [
  { kind: "item", to: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    kind: "group", key: "vendas", label: "Vendas", icon: ShoppingCart,
    items: [
      { to: "/pdv", label: "Frente de Caixa" },
      { to: "/vendas", label: "Vendas" },
      { to: "/orcamentos", label: "Orçamentos" },
    ],
  },
  {
    kind: "group", key: "estoque", label: "Estoque", icon: Package,
    items: [
      { to: "/devices", label: "Aparelhos" },
      { to: "/estoque", label: "Estoque Geral" },
      { to: "/accessories", label: "Acessórios" },
      { to: "/fornecedores", label: "Fornecedores" },
    ],
  },
  {
    kind: "group", key: "atendimento", label: "Atendimento", icon: MessageSquare,
    items: [
      { to: "/customers", label: "Clientes" },
      { to: "/crm", label: "CRM" },
      { to: "/ia", label: "IA Atendimento" },
      { to: "/assistencia", label: "Assistência" },
      { to: "/garantias", label: "Garantias" },
    ],
  },
  {
    kind: "group", key: "financeiro", label: "Financeiro", icon: BarChart3,
    items: [
      { to: "/bi", label: "BI Financeiro" },
      { to: "/relatorios", label: "Relatórios" },
    ],
  },
  {
    kind: "group", key: "gestao", label: "Gestão", icon: Settings,
    items: [
      { to: "/planejamento", label: "Planejamento" },
      { to: "/usuarios", label: "Usuários" },
      { to: "/auditoria", label: "Auditoria" },
      { to: "/configuracoes", label: "Configurações" },
    ],
  },
];

const OPEN_GROUPS_KEY = "pp_sidebar_open_groups";

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void; // presente só no desktop
  onNavigate?: () => void; // fecha a gaveta no mobile
}

// Guarda a posição da rolagem entre navegações: cada troca de tela recria o menu do zero
// (cada página monta seu próprio <AppLayout>), então sem isso o menu voltava ao topo a
// cada clique. Variável de módulo: sobrevive à desmontagem/remontagem do componente.
let savedScrollTop = 0;

// Conteúdo do menu — reutilizado no desktop (fixo/retrátil) e no mobile (gaveta)
export function SidebarContent({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { lock } = useLock();
  const logo = useLogoSrc();
  const store = useStoreSnapshot();
  const [accountOpen, setAccountOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const visibleEntries = useMemo(
    () =>
      navEntries
        .map((entry) =>
          entry.kind === "item"
            ? entry
            : { ...entry, items: entry.items.filter((i) => canAccessRoute(user?.role, i.to)) }
        )
        .filter((entry) => (entry.kind === "item" ? canAccessRoute(user?.role, entry.to) : entry.items.length > 0)),
    [user?.role]
  );

  // Grupo com a tela atual aberto = sempre acessível de primeira; os demais lembram
  // o que o usuário deixou aberto/fechado (por navegador, em localStorage).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {};
    try { stored = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? "{}"); } catch { /* ignora */ }
    const initial: Record<string, boolean> = {};
    for (const entry of navEntries) {
      if (entry.kind !== "group") continue;
      initial[entry.key] = entry.key in stored
        ? stored[entry.key]
        : entry.items.some((i) => i.to === location.pathname);
    }
    return initial;
  });

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignora */ }
      return next;
    });

  // Restaura a rolagem assim que o menu é desenhado, antes do usuário ver o "pulo" para o topo.
  useEffect(() => {
    if (navRef.current) navRef.current.scrollTop = savedScrollTop;
  }, []);

  const handleLogout = () => {
    onNavigate?.();
    logout();
    navigate("/login", { replace: true });
  };

  const handleClearCache = async () => {
    toast.loading("Limpando cache e atualizando…", { id: "clear-cache" });
    await clearAppCache(); // recarrega a página ao final
  };

  const linkClass = (isActive: boolean, sub = false) =>
    `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
      collapsed ? "justify-center px-2" : sub ? "gap-3 py-2 pl-10 pr-3" : "gap-3 px-3"
    } ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={`flex h-16 items-center border-b ${collapsed ? "justify-center gap-1 px-1" : "gap-2.5 px-4"}`}>
        <img src={logo} alt={store.name} className={`shrink-0 rounded-full object-cover ${collapsed ? "h-8 w-8" : "h-9 w-9"}`} />
        {!collapsed && <span className="flex-1 truncate text-base font-semibold text-foreground">{store.name}</span>}
        {onToggle && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav
        ref={navRef}
        onScroll={(e) => { savedScrollTop = e.currentTarget.scrollTop; }}
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {visibleEntries.map((entry) => {
          if (entry.kind === "item") {
            const isActive = location.pathname === entry.to;
            return (
              <NavLink key={entry.to} to={entry.to} onClick={onNavigate} title={collapsed ? entry.label : undefined} className={linkClass(isActive)}>
                <entry.icon className="h-4 w-4 shrink-0" />
                {!collapsed && entry.label}
              </NavLink>
            );
          }

          const groupActive = entry.items.some((i) => i.to === location.pathname);
          const open = openGroups[entry.key] ?? groupActive;

          // Recolhido: mostra só os ícones dos subitens direto na lista, sem o cabeçalho do grupo.
          if (collapsed) {
            return (
              <div key={entry.key} className="space-y-1">
                {entry.items.map((i) => (
                  <NavLink key={i.to} to={i.to} onClick={onNavigate} title={i.label} className={linkClass(location.pathname === i.to)}>
                    <entry.icon className="h-4 w-4 shrink-0" />
                  </NavLink>
                ))}
              </div>
            );
          }

          return (
            <div key={entry.key}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.key)}
                aria-expanded={open}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  groupActive && !open
                    ? "text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <entry.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="space-y-1 pt-1">
                  {entry.items.map((i) => (
                    <NavLink key={i.to} to={i.to} onClick={onNavigate} className={linkClass(location.pathname === i.to, true)}>
                      {i.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t px-3 py-3">
        {user && !collapsed && (
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        )}
        <button
          onClick={() => setAccountOpen(true)}
          title={collapsed ? "Minha conta" : undefined}
          aria-label="Minha conta"
          className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          {!collapsed && "Minha conta"}
        </button>
        <button
          onClick={() => {
            onNavigate?.();
            lock();
          }}
          title={collapsed ? "Bloquear tela (Alt+L)" : "Bloquear tela (Alt+L)"}
          aria-label="Bloquear tela"
          className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <Lock className="h-4 w-4 shrink-0" />
          {!collapsed && "Bloquear tela"}
        </button>
        <button
          onClick={handleClearCache}
          title={collapsed ? "Limpar cache" : undefined}
          className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <RefreshCw className="h-4 w-4 shrink-0" />
          {!collapsed && "Limpar cache"}
        </button>
        <button
          onClick={handleLogout}
          title={collapsed ? "Sair" : undefined}
          className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sair"}
        </button>
        {!collapsed && (
          <p className="mt-2 px-3 text-center text-[11px] text-muted-foreground">
            {store.name} · v{APP_VERSION}
          </p>
        )}
      </div>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}

// Barra fixa (somente desktop ≥ lg), com largura retrátil
export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`fixed left-0 top-0 z-30 hidden h-screen border-r transition-[width] duration-200 lg:block ${
        collapsed ? "w-20" : "w-60"
      }`}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}
