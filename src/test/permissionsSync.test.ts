import { describe, it, expect } from "vitest";
import * as front from "@/lib/permissions";
import * as server from "../../server/src/lib/permissions";

// A API é implantada separada do site, então a matriz existe em duas cópias.
// Este teste garante que elas são IDÊNTICAS.
describe("matriz de permissões: front = servidor", () => {
  it("cargos e rótulos idênticos", () => {
    expect([...front.ROLES]).toEqual([...server.ROLES]);
    expect(front.ROLE_LABELS).toEqual(server.ROLE_LABELS);
  });
  it("capacidades idênticas (mesma ordem)", () => {
    expect([...front.CAPABILITIES]).toEqual([...server.CAPABILITIES]);
  });
  it("matriz cargo -> capacidades idêntica", () => {
    for (const r of front.ROLES) {
      expect([...front.ROLE_CAPABILITIES[r]].sort()).toEqual([...server.ROLE_CAPABILITIES[r]].sort());
    }
  });
  it("can() responde igual nas duas cópias para todo cargo x capacidade", () => {
    for (const r of front.ROLES) {
      for (const c of front.CAPABILITIES) expect(front.can(r, c)).toBe(server.can(r, c));
    }
    expect(front.can("hacker", "viewCost")).toBe(false);
    expect(server.can(undefined, "viewCost")).toBe(false);
  });
});

describe("matriz de permissões (proposta da Fase 4A)", () => {
  const caps = (r: front.Role) => new Set(front.ROLE_CAPABILITIES[r]);

  it("admin tem tudo", () => {
    expect(caps("admin").size).toBe(front.CAPABILITIES.length);
  });
  it("gerente = admin menos usuários e variáveis/backup", () => {
    const missing = front.CAPABILITIES.filter((c) => !caps("gerente").has(c));
    expect(missing.sort()).toEqual(["manageSecrets", "manageUsers"]);
    expect(front.can("gerente", "viewCost")).toBe(true);
    expect(front.can("gerente", "returnSales")).toBe(true);
    expect(front.can("gerente", "viewAudit")).toBe(true);
    expect(front.can("gerente", "editSettings")).toBe(true);
  });
  it("vendedor e técnico mantêm o comportamento anterior", () => {
    for (const r of ["vendedor", "tecnico"] as const) {
      for (const c of ["viewCost", "manageUsers", "viewBI", "manageFinance", "editSales", "returnSales", "deleteRecords", "importStock", "bulkStockActions", "viewAudit", "editSettings", "manageSecrets", "manageSuppliers"] as const) {
        expect(front.can(r, c), `${r} ${c}`).toBe(false);
      }
    }
    expect(front.can("vendedor", "sell")).toBe(true);
    expect(front.can("vendedor", "useCRM")).toBe(true);
    expect(front.can("tecnico", "sell")).toBe(false);
    expect(front.can("tecnico", "useCRM")).toBe(false);
    expect(front.can("tecnico", "editOS")).toBe(true);
  });
  it("estoquista: estoque completo com custo, sem PDV/CRM/BI", () => {
    for (const c of ["editStock", "importStock", "bulkStockActions", "manageSuppliers", "viewCost"] as const) expect(front.can("estoquista", c)).toBe(true);
    for (const c of ["sell", "useCRM", "viewBI", "manageFinance", "editOS", "viewSales"] as const) expect(front.can("estoquista", c)).toBe(false);
  });
  it("financeiro: BI e contas com custo, estoque somente leitura, sem PDV/CRM", () => {
    for (const c of ["viewBI", "manageFinance", "viewCost", "viewSales", "viewStock", "viewReports"] as const) expect(front.can("financeiro", c)).toBe(true);
    for (const c of ["sell", "useCRM", "editStock", "editSales", "returnSales", "editOS"] as const) expect(front.can("financeiro", c)).toBe(false);
  });
  it("Fase 4B: conferência financeira só para admin, gerente e financeiro", () => {
    for (const r of ["admin", "gerente", "financeiro"] as const) expect(front.can(r, "reconcile"), r).toBe(true);
    for (const r of ["vendedor", "tecnico", "estoquista"] as const) expect(front.can(r, "reconcile"), r).toBe(false);
  });
  it("Fase 4B: planejamento (criar/atribuir) só para admin e gerente; relatórios para quem já tinha", () => {
    for (const r of front.ROLES) expect(front.can(r, "managePlanning"), r).toBe(r === "admin" || r === "gerente");
    for (const r of ["admin", "gerente", "financeiro", "estoquista"] as const) expect(front.can(r, "viewReports"), r).toBe(true);
    for (const r of ["vendedor", "tecnico"] as const) expect(front.can(r, "viewReports"), r).toBe(false);
  });
  it("todo cargo tem ao menos uma capacidade e toda capacidade pertence a algum cargo", () => {
    for (const r of front.ROLES) expect(caps(r).size).toBeGreaterThan(0);
    for (const c of front.CAPABILITIES) expect(front.ROLES.some((r) => front.can(r, c))).toBe(true);
  });
});

describe("menu e rotas derivados da matriz", () => {
  it("novas rotas seguem a matriz", () => {
    expect(front.canAccessRoute("admin", "/configuracoes")).toBe(true);
    expect(front.canAccessRoute("gerente", "/configuracoes")).toBe(true);
    expect(front.canAccessRoute("gerente", "/usuarios")).toBe(false);
    expect(front.canAccessRoute("gerente", "/auditoria")).toBe(true);
    expect(front.canAccessRoute("vendedor", "/auditoria")).toBe(false);
    expect(front.canAccessRoute("tecnico", "/configuracoes")).toBe(false);
    expect(front.canAccessRoute("estoquista", "/fornecedores")).toBe(true);
    expect(front.canAccessRoute("financeiro", "/fornecedores")).toBe(true);
    expect(front.canAccessRoute("vendedor", "/fornecedores")).toBe(false);
    expect(front.canAccessRoute("financeiro", "/bi")).toBe(true);
    expect(front.canAccessRoute("estoquista", "/bi")).toBe(false);
    expect(front.canAccessRoute("estoquista", "/pdv")).toBe(false);
    expect(front.canAccessRoute("financeiro", "/pdv")).toBe(false);
  });
  it("Fase 4B: /planejamento para todos; /relatorios só quem tem viewReports", () => {
    for (const r of front.ROLES) expect(front.canAccessRoute(r, "/planejamento"), r).toBe(true);
    for (const r of front.ROLES) expect(front.canAccessRoute(r, "/relatorios"), r).toBe(front.can(r, "viewReports"));
  });
  it("rotas antigas: mesmo acesso para admin, vendedor e técnico", () => {
    const old: Record<string, string[]> = {
      "/": ["admin", "vendedor", "tecnico"],
      "/pdv": ["admin", "vendedor"],
      "/vendas": ["admin", "vendedor"],
      "/orcamentos": ["admin", "vendedor"],
      "/devices": ["admin", "vendedor", "tecnico"],
      "/estoque": ["admin", "vendedor", "tecnico"],
      "/accessories": ["admin", "vendedor", "tecnico"],
      "/customers": ["admin", "vendedor", "tecnico"],
      "/crm": ["admin", "vendedor"],
      "/assistencia": ["admin", "vendedor", "tecnico"],
      "/garantias": ["admin", "vendedor", "tecnico"],
      "/bi": ["admin"],
      "/usuarios": ["admin"],
    };
    for (const [path, roles] of Object.entries(old)) {
      for (const r of ["admin", "vendedor", "tecnico"] as const) {
        expect(front.canAccessRoute(r, path), `${r} ${path}`).toBe(roles.includes(r));
      }
    }
  });
  it("rota fora do mapa é liberada para logado; sem cargo não acessa rota controlada", () => {
    expect(front.canAccessRoute("tecnico", "/qualquer")).toBe(true);
    expect(front.canAccessRoute(undefined, "/pdv")).toBe(false);
  });
});
