import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Smartphone, Package, ShoppingCart, Receipt, Users, MessageSquare, Wrench, BarChart3, LogOut, ShieldCheck, BadgeCheck } from "lucide-react";
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
  { to: "/accessories", label: "Acessórios", icon: Package },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/crm", label: "CRM", icon: MessageSquare },
  { to: "/assistencia", label: "Assistência", icon: Wrench },
  { to: "/garantias", label: "Garantias", icon: BadgeCheck },
  { to: "/bi", label: "BI Financeiro", icon: BarChart3 },
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 border-b px-4">
        <img src={logo} alt="Prime Paulista" className="h-9 w-9 rounded-full object-cover" />
        <span className="text-base font-semibold text-foreground">Prime Paulista</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems
          .filter((item) => canAccessRoute(user?.role, item.to))
          .map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t px-3 py-3">
        {user && (
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">
              {roleLabels[user.role] ?? user.role}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
        <p className="mt-2 px-3 text-center text-[11px] text-muted-foreground">
          Prime Paulista · v{APP_VERSION}
        </p>
      </div>
    </aside>
  );
}
