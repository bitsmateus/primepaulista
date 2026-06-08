import { describe, it, expect } from "vitest";
import {
  canAccessRoute, canSeeCost, canSell, canUseCRM, canViewBI, canManageUsers,
} from "@/lib/permissions";

describe("acesso a rotas", () => {
  it("admin acessa tudo", () => {
    for (const p of ["/", "/pdv", "/devices", "/crm", "/bi", "/usuarios"]) {
      expect(canAccessRoute("admin", p)).toBe(true);
    }
  });
  it("vendedor: sem BI e sem Usuários", () => {
    expect(canAccessRoute("vendedor", "/pdv")).toBe(true);
    expect(canAccessRoute("vendedor", "/crm")).toBe(true);
    expect(canAccessRoute("vendedor", "/bi")).toBe(false);
    expect(canAccessRoute("vendedor", "/usuarios")).toBe(false);
  });
  it("técnico: sem PDV, sem CRM, sem BI", () => {
    expect(canAccessRoute("tecnico", "/assistencia")).toBe(true);
    expect(canAccessRoute("tecnico", "/devices")).toBe(true);
    expect(canAccessRoute("tecnico", "/pdv")).toBe(false);
    expect(canAccessRoute("tecnico", "/crm")).toBe(false);
    expect(canAccessRoute("tecnico", "/bi")).toBe(false);
  });
  it("rota desconhecida é liberada para logado", () => {
    expect(canAccessRoute("tecnico", "/qualquer")).toBe(true);
  });
  it("sem cargo não acessa rota controlada", () => {
    expect(canAccessRoute(undefined, "/pdv")).toBe(false);
  });
});

describe("ver custo/margem", () => {
  it("só admin", () => {
    expect(canSeeCost("admin")).toBe(true);
    expect(canSeeCost("vendedor")).toBe(false);
    expect(canSeeCost("tecnico")).toBe(false);
  });
});

describe("vender", () => {
  it("admin e vendedor; técnico não", () => {
    expect(canSell("admin")).toBe(true);
    expect(canSell("vendedor")).toBe(true);
    expect(canSell("tecnico")).toBe(false);
  });
});

describe("CRM / BI / usuários", () => {
  it("CRM: admin e vendedor", () => {
    expect(canUseCRM("vendedor")).toBe(true);
    expect(canUseCRM("tecnico")).toBe(false);
  });
  it("BI e usuários: só admin", () => {
    expect(canViewBI("admin")).toBe(true);
    expect(canViewBI("vendedor")).toBe(false);
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("vendedor")).toBe(false);
  });
});
