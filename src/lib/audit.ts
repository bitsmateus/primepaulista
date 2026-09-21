// Textos legíveis da auditoria (ação e entidade) e utilitários de exibição.

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.login_failed": "Login sem sucesso",
  "auth.change_password": "Alterou a própria senha",
  "auth.change_password_failed": "Troca de senha recusada",
  "user.create": "Criou usuário",
  "user.role_change": "Mudou o cargo",
  "user.activate": "Reativou usuário",
  "user.deactivate": "Desativou usuário",
  "user.password_reset": "Redefiniu senha de usuário",
  "user.rename": "Renomeou usuário",
  "device.delete": "Excluiu aparelho",
  "device.import": "Importou aparelhos",
  "device.bulk_clear_price": "Zerou preços de venda",
  "device.move_location": "Moveu aparelhos de local",
  "device.stock_check_reset": "Iniciou novo balanço",
  "device.price_change": "Alterou custo/preço do aparelho",
  "accessory.delete": "Excluiu acessório",
  "accessory.price_change": "Alterou custo/preço do acessório",
  "customer.delete": "Excluiu cliente",
  "os.create_from_stock": "Abriu OS de aparelho do estoque",
  "os.delete": "Excluiu OS",
  "quote.delete": "Excluiu orçamento",
  "sale.create": "Registrou venda",
  "sale.update": "Editou venda",
  "sale.return": "Devolveu venda",
  "sale_attachment.delete": "Excluiu anexo de venda",
  "supplier.create": "Cadastrou fornecedor",
  "supplier.update": "Editou fornecedor",
  "supplier.inactivate": "Inativou fornecedor",
  "supplier.reactivate": "Reativou fornecedor",
  "supplier.delete": "Excluiu fornecedor",
  "expense.create": "Lançou despesa",
  "expense.delete": "Excluiu despesa",
  "sangria.create": "Registrou sangria",
  "commission.update": "Alterou comissão",
  "receivable.create": "Criou conta a receber",
  "receivable.update": "Atualizou conta a receber",
  "receivable.delete": "Excluiu conta a receber",
  "payable.create": "Criou conta a pagar",
  "payable.update": "Atualizou conta a pagar",
  "payable.delete": "Excluiu conta a pagar",
  "settings.update": "Alterou configuração",
  "custom_var.create": "Criou variável",
  "custom_var.update": "Alterou variável",
  "custom_var.delete": "Excluiu variável",
  "custom_var.reveal": "Consultou valor de variável",
  "backup.export": "Exportou backup",
  "backup.restore_settings": "Restaurou configurações",
};

export const ENTITY_LABELS: Record<string, string> = {
  auth: "Acesso",
  user: "Usuário",
  device: "Aparelho",
  accessory: "Acessório",
  customer: "Cliente",
  service_order: "Ordem de serviço",
  quote: "Orçamento",
  sale: "Venda",
  supplier: "Fornecedor",
  expense: "Despesa",
  sangria: "Sangria",
  commission: "Comissão",
  receivable: "Conta a receber",
  payable: "Conta a pagar",
  settings: "Configuração",
  custom_var: "Variável",
  backup: "Backup",
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
export const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e;

// Tom visual da linha: ações sensíveis em destaque
export function actionTone(a: string): "danger" | "warn" | "neutral" {
  if (a === "auth.login_failed" || a === "auth.change_password_failed" || a.endsWith(".delete") || a === "sale.return") return "danger";
  if (a.includes("price") || a === "custom_var.reveal" || a.startsWith("backup.") || a === "user.role_change" || a === "user.password_reset") return "warn";
  return "neutral";
}
