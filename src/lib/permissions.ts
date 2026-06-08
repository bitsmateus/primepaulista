import { UserRole } from "@/lib/api";

export type Role = UserRole;

// Rotas que cada cargo pode acessar. Rota ausente = liberada para todos os logados.
export const NAV_PERMISSIONS: Record<string, Role[]> = {
  "/": ["admin", "vendedor", "tecnico"],
  "/pdv": ["admin", "vendedor"],
  "/devices": ["admin", "vendedor", "tecnico"],
  "/accessories": ["admin", "vendedor", "tecnico"],
  "/customers": ["admin", "vendedor", "tecnico"],
  "/crm": ["admin", "vendedor"],
  "/assistencia": ["admin", "vendedor", "tecnico"],
  "/bi": ["admin"],
  "/usuarios": ["admin"],
};

export function canAccessRoute(role: Role | undefined, path: string): boolean {
  const allowed = NAV_PERMISSIONS[path];
  if (!allowed) return true;
  return !!role && allowed.includes(role);
}

// Custo e margem dos produtos são informação sensível: apenas admin.
export function canSeeCost(role: Role | undefined): boolean {
  return role === "admin";
}

export function canSell(role: Role | undefined): boolean {
  return role === "admin" || role === "vendedor";
}

export function canUseCRM(role: Role | undefined): boolean {
  return role === "admin" || role === "vendedor";
}

export function canViewBI(role: Role | undefined): boolean {
  return role === "admin";
}

export function canManageUsers(role: Role | undefined): boolean {
  return role === "admin";
}
