// Cargos e capacidades (matriz de permissões).
//
// ATENÇÃO: existe uma cópia idêntica no servidor (server/src/lib/permissions.ts), porque a API
// é implantada separada do site. O teste src/test/permissionsSync.test.ts falha se as duas
// divergirem (cargos, capacidades, rótulos e matriz). Ao mudar a matriz, altere as DUAS cópias.
// Tudo que é "só admin" na tela deve usar `can(role, "...")`, nunca `role === "admin"`.

export const ROLES = ["admin", "gerente", "vendedor", "tecnico", "estoquista", "financeiro"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
  tecnico: "Técnico",
  estoquista: "Estoquista",
  financeiro: "Financeiro",
};

export const CAPABILITIES = [
  "viewCost", // ver custo, margem e lucro
  "manageUsers", // usuários e cargos
  "viewBI", // BI financeiro
  "manageFinance", // despesas, sangrias, comissões, contas a pagar/receber
  "sell", // PDV e orçamentos
  "viewSales", // tela de Vendas
  "viewSalesData", // ler dados de vendas (garantias, dashboard)
  "editSales", // editar venda
  "returnSales", // devolver/estornar venda
  "deleteRecords", // excluir registros (aparelho, acessório, cliente, OS, anexo, orçamento, fornecedor)
  "viewStock", // ver aparelhos/acessórios/estoque
  "editStock", // cadastrar/editar estoque, mover local, balanço, fotos
  "importStock", // importar aparelhos (CSV/Excel)
  "bulkStockActions", // ações em lote (zerar preços, novo balanço)
  "viewSuppliers", // tela de fornecedores
  "manageSuppliers", // cadastrar/editar/inativar fornecedores
  "editCustomers", // cadastrar/editar clientes
  "useCRM", // CRM e WhatsApp
  "manageAutomations", // automações do CRM, respostas rápidas e respostas automáticas (editar)
  "manageWhatsapp", // gerenciar números de WhatsApp de qualquer dono
  "viewOS", // ver ordens de serviço
  "editOS", // criar/editar OS
  "viewAudit", // auditoria
  "editSettings", // loja, logo, termos, mensagens, segurança
  "manageSecrets", // variáveis customizadas e backup
  "viewReports", // relatórios (estoque etc.)
  "managePlanning", // planejamento semanal: criar, atribuir, editar e excluir tarefas
  "reconcile", // conferência financeira dos pagamentos (conciliação)
  "useAI", // IA no atendimento: sugerir resposta na conversa e revisar as respostas da IA
  "manageAI", // IA: configuração, base de conhecimento, simulador e métricas
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Descrição de cada capacidade (usada na tabela "O que cada cargo pode")
export const CAPABILITY_LABELS: Record<Capability, string> = {
  viewCost: "Ver custo, margem e lucro",
  manageUsers: "Gerenciar usuários e cargos",
  viewBI: "Ver o BI Financeiro",
  manageFinance: "Despesas, sangrias, comissões e contas",
  sell: "Vender (PDV) e fazer orçamentos",
  viewSales: "Ver a tela de Vendas",
  viewSalesData: "Consultar dados de vendas (garantias, painel)",
  editSales: "Editar vendas",
  returnSales: "Devolver / estornar vendas",
  deleteRecords: "Excluir registros",
  viewStock: "Ver estoque (aparelhos e acessórios)",
  editStock: "Cadastrar e editar estoque",
  importStock: "Importar aparelhos (CSV/Excel)",
  bulkStockActions: "Ações em lote no estoque",
  viewSuppliers: "Ver fornecedores",
  manageSuppliers: "Cadastrar e editar fornecedores",
  editCustomers: "Cadastrar e editar clientes",
  useCRM: "Usar o CRM e o WhatsApp",
  manageAutomations: "Automações, respostas rápidas e respostas automáticas do CRM",
  manageWhatsapp: "Gerenciar números de WhatsApp de todos",
  viewOS: "Ver ordens de serviço",
  editOS: "Criar e editar ordens de serviço",
  viewAudit: "Ver a auditoria",
  editSettings: "Configurações da loja (identidade, termos, mensagens)",
  manageSecrets: "Variáveis customizadas e backup",
  viewReports: "Relatórios",
  managePlanning: "Planejar a semana (criar e atribuir tarefas)",
  reconcile: "Conferência financeira dos pagamentos",
  useAI: "IA: sugerir respostas na conversa e revisar as respostas da IA",
  manageAI: "IA: configuração, base de conhecimento, simulador e métricas",
};

const ALL: readonly Capability[] = CAPABILITIES;

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: ALL,
  gerente: ALL.filter((c) => c !== "manageUsers" && c !== "manageSecrets"),
  vendedor: ["sell", "viewSales", "viewSalesData", "viewStock", "editStock", "editCustomers", "useCRM", "viewOS", "editOS", "useAI"],
  tecnico: ["viewSalesData", "viewStock", "editStock", "editCustomers", "viewOS", "editOS"],
  estoquista: [
    "viewCost", "viewSalesData", "viewStock", "editStock", "importStock", "bulkStockActions",
    "viewSuppliers", "manageSuppliers", "viewOS", "viewReports",
  ],
  financeiro: [
    "viewCost", "viewBI", "manageFinance", "viewSales", "viewSalesData", "viewStock", "viewSuppliers", "viewOS", "viewReports",
    "reconcile",
  ],
};

export function can(role: string | undefined | null, capability: Capability): boolean {
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role as Role].includes(capability);
}

// Cargo tem ao menos UMA das capacidades
export function canAny(role: string | undefined | null, ...capabilities: Capability[]): boolean {
  return capabilities.some((c) => can(role, c));
}

// ---------- Só front: menu e rotas ----------
// Rota -> capacidade exigida (null = qualquer usuário logado)
export const ROUTE_CAPABILITY: Record<string, Capability | null> = {
  "/": null,
  "/pdv": "sell",
  "/vendas": "viewSales",
  "/orcamentos": "sell",
  "/devices": "viewStock",
  "/estoque": "viewStock",
  "/accessories": "viewStock",
  "/fornecedores": "viewSuppliers",
  "/customers": "editCustomers",
  "/crm": "useCRM",
  "/assistencia": "viewOS",
  "/garantias": null,
  "/bi": "viewBI",
  "/planejamento": null,
  "/relatorios": "viewReports",
  "/ia": "manageAI",
  "/auditoria": "viewAudit",
  "/configuracoes": "editSettings",
  "/usuarios": "manageUsers",
};

// Rotas que cada cargo pode acessar (derivado da matriz). Rota ausente = liberada para todos os logados.
export const NAV_PERMISSIONS: Record<string, Role[]> = Object.fromEntries(
  Object.entries(ROUTE_CAPABILITY).map(([path, cap]) => [
    path,
    ROLES.filter((r) => cap === null || can(r, cap)),
  ])
);

export function canAccessRoute(role: string | undefined | null, path: string): boolean {
  const allowed = NAV_PERMISSIONS[path];
  if (!allowed) return true;
  return !!role && (allowed as readonly string[]).includes(role);
}

// Atalhos usados em várias telas
export const canSeeCost = (role: string | undefined | null) => can(role, "viewCost");
export const canSell = (role: string | undefined | null) => can(role, "sell");
export const canUseCRM = (role: string | undefined | null) => can(role, "useCRM");
export const canViewBI = (role: string | undefined | null) => can(role, "viewBI");
export const canManageUsers = (role: string | undefined | null) => can(role, "manageUsers");
