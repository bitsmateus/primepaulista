// Cargos e capacidades (matriz de permissões).
//
// ATENÇÃO: existe uma cópia idêntica no front (src/lib/permissions.ts), porque a API é
// implantada separada do site. O teste src/test/permissionsSync.test.ts falha se as
// duas divergirem. Ao mudar a matriz, altere as DUAS cópias.

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
  "manageAutomations", // automações do CRM
  "manageWhatsapp", // gerenciar números de WhatsApp de qualquer dono
  "viewOS", // ver ordens de serviço
  "editOS", // criar/editar OS
  "viewAudit", // auditoria
  "editSettings", // loja, logo, termos, mensagens, segurança
  "manageSecrets", // variáveis customizadas e backup
  "viewReports", // relatórios (estoque etc.)
  "managePlanning", // planejamento semanal: criar, atribuir, editar e excluir tarefas
  "reconcile", // conferência financeira dos pagamentos (conciliação)
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ALL: readonly Capability[] = CAPABILITIES;

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: ALL,
  gerente: ALL.filter((c) => c !== "manageUsers" && c !== "manageSecrets"),
  vendedor: ["sell", "viewSales", "viewSalesData", "viewStock", "editStock", "editCustomers", "useCRM", "viewOS", "editOS"],
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

