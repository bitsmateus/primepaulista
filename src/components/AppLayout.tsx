import { ReactNode, useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AppSidebar, SidebarContent } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo-prime-paulista.png";

const COLLAPSE_KEY = "pp_sidebar_collapsed";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const navigate = useNavigate();
  const { logout } = useAuth();

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Menu fixo/retrátil (desktop) */}
      <AppSidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Barra superior (mobile/tablet) com menu-gaveta e logoff */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button aria-label="Abrir menu" className="rounded-md p-1.5 text-foreground hover:bg-accent">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src={logo} alt="Prime Paulista" className="h-8 w-8 rounded-full object-cover" />
        <span className="flex-1 truncate text-base font-semibold text-foreground">Prime Paulista</span>
        <button onClick={handleLogout} aria-label="Sair" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className={`min-h-screen transition-[margin] duration-200 ${collapsed ? "lg:ml-16" : "lg:ml-60"}`}>
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
