import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Área restrita a administradores
  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  // Gating por cargo conforme o mapa de permissões da rota atual
  if (!canAccessRoute(user.role, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
