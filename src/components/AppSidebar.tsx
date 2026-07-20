import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Smartphone, Package, ShoppingCart, Receipt, Users, MessageSquare,
  Wrench, BarChart3, LogOut, ShieldCheck, BadgeCheck, PanelLeftClose, PanelLeftOpen, Table2,
} from "lucide-react";
import logo from "@/assets/logo-prime-paulista.png";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";
import { APP_VERSION } from "@/version";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  tecnico: "Técnico",
};

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pdv", label: "Frente de Caixa", icon: ShoppingCart },
  { to: "/vendas", label: "Vendas", icon: Receipt },
  { to: "/devices", label: "Aparelhos", icon: Smartphone },
  { to: "/estoque", label: "Estoque Geral", icon: Table2 },
  { to: "/accessories", label: "Acessórios", icon: Package },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/crm", label: "CRM", icon: MessageSquare },
  { to: "/assistencia", label: "Assistência", icon: Wrench },
  { to: "/garantias", label: "Garantias", icon: BadgeCheck },
  { to: "/bi", label: "BI Financeiro", icon: BarChart3 },
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void; // presente só no desktop
  onNavigate?: () => void; // fecha a gaveta no mobile
}

// Conteúdo do menu — reutilizado no desktop (fixo/retrátil) e no mobile (gaveta)
export function SidebarContent({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    onNavigate?.();
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={`flex h-16 items-center border-b ${collapsed ? "justify-center gap-1 px-1" : "gap-2.5 px-4"}`}>
        <img src={logo} alt="Prime Paulista" className={`shrink-0 rounded-full object-cover ${collapsed ? "h-8 w-8" : "h-9 w-9"}`} />
        {!collapsed && <span className="flex-1 truncate text-base font-semibold text-foreground">Prime Paulista</span>}
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems
          .filter((item) => canAccessRoute(user?.role, item.to))
          .map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : "gap-3 px-3"
                } ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && label}
              </NavLink>
            );
          })}
      </nav>

      <div className="border-t px-3 py-3">
        {user && !collapsed && (
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{roleLabels[user.role] ?? user.role}</p>
          </div>
        )}
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
            Prime Paulista · v{APP_VERSION}
          </p>
        )}
      </div>
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
