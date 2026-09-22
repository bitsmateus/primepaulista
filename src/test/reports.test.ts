import { describe, it, expect } from "vitest";
import type { Accessory, Customer, Device, Sale } from "@/types/inventory";
import type { ServiceOrder } from "@/types/serviceOrder";
import type { Quote } from "@/types/quote";
import { buildStockReport, DEFAULT_STOCK_FILTERS } from "@/lib/reports/stock";
import { buildSalesReport, DEFAULT_SALES_FILTERS } from "@/lib/reports/sales";
import { buildFinanceReport } from "@/lib/reports/finance";
import { buildOSReport, DEFAULT_OS_REPORT_FILTERS } from "@/lib/reports/serviceOrders";
import { buildCustomerReport, DEFAULT_CUSTOMER_REPORT_FILTERS } from "@/lib/reports/customers";
import { buildQuoteReport, DEFAULT_QUOTE_REPORT_FILTERS } from "@/lib/reports/quotes";
import { buildWarrantyReport } from "@/lib/reports/warranties";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";
import { fmtMoney, formatCell, inRange, toExcelData, toTextTable, stripCost } from "@/lib/reports/format";
import { REPORTS, reportCsv, reportFileName, visibleReports } from "@/lib/reports";
import { sanitizePdfText, isLandscape } from "@/lib/reports/pdf";
import { cleanFilters, filtersToQuery, paymentLabel, type ReconciliationRow } from "@/lib/reconciliation";
import { can } from "@/lib/permissions";

const ME = { canSeeCost: true, now: new Date(2026, 8, 21, 12, 0) };
const NO_COST = { canSeeCost: false, now: ME.now };

const dev = (o: Partial<Device>): Device => ({
  id: "d1", category: "iPhone", brand: "Apple", location: "Estoque", model: "iPhone 15", capacity: "128", color: "Preto", condition: "Lacrado", batteryHealth: 100,
  supplier: "", cost: 4000, salePrice: 5000, serialImei: "111", internalSerial: "", status: "Disponível", createdAt: new Date(2026, 8, 1), ...o,
});
const acc = (o: Partial<Accessory>): Accessory => ({
  id: "a1", name: "Capa Silicone", category: "Capas", subcategory: "Silicone", compatibleModel: "iPhone 15", quantity: 10, minQuantity: 3, cost: 20, price: 80, barcode: "ACC-1", createdAt: new Date(2026, 8, 1), ...o,
});
const cust = (o: Partial<Customer> = {}): Customer => ({ id: "c1", name: "Maria Cliente", cpf: "12345678901", whatsapp: "11988887777", birthday: "1990-09-15", leadOrigin: "Instagram", createdAt: new Date(2026, 0, 1), ...o });
const sale = (o: Partial<Sale> = {}): Sale => ({
  id: "abcdef123456", customer: cust(), seller: "Gabriel", subtotal: 5000, tradeInDiscount: 0, discount: 0, total: 5000, giftsCost: 0, requiresInvoice: false, origin: "Balcão",
  items: [{ id: "i1", type: "device", deviceId: "d1", name: "iPhone 15 128GB", serial: "111", price: 5000, quantity: 1, warrantyDays: 365 }],
  payments: [{ id: "p1", method: "PIX", amount: 5000 }], createdAt: new Date(2026, 8, 10, 15, 30), ...o,
});
const devices = [dev({}), dev({ id: "d2", model: "iPhone 13", condition: "Seminovo", cost: 2000, salePrice: 2800, location: "Vitrine 1", status: "Reservado" }), dev({ id: "d3", model: "Galaxy S24", brand: "Samsung", category: "Celular", cost: 3000, salePrice: null as unknown as undefined, status: "Vendido" })];
const accessories = [acc({}), acc({ id: "a2", name: "Película 3D", category: "Películas", quantity: 0, cost: 8, price: 39 }), acc({ id: "a3", name: "Cabo", category: "Cabos e Fontes", quantity: 2, minQuantity: 5, cost: 10, price: undefined })];

describe("formatação", () => {
  it("fmtMoney (sem NBSP, milhar e negativo)", () => {
    expect(fmtMoney(1234.5)).toBe("R$ 1.234,50");
    expect(fmtMoney(-9.9)).toBe("-R$ 9,90");
    expect(fmtMoney(0)).toBe("R$ 0,00");
    expect(fmtMoney(1234567.891)).toBe("R$ 1.234.567,89");
    expect(fmtMoney(-0.001)).toBe("R$ 0,00");
    expect(fmtMoney(1)).not.toContain(" ");
  });
  it("formatCell", () => {
    expect(formatCell(new Date(2026, 8, 5, 9, 7), "datetime")).toBe("05/09/2026 09:07");
    expect(formatCell(new Date(2026, 8, 5, 9, 7), "date")).toBe("05/09/2026");
    expect(formatCell(12.345, "percent")).toBe("12,3%");
    expect(formatCell(2.6, "int")).toBe("3");
    expect(formatCell(null)).toBe("");
    expect(formatCell("ção ã é")).toBe("ção ã é");
  });
  it("inRange inclui o dia inteiro dos dois extremos", () => {
    const from = new Date(2026, 8, 10), to = new Date(2026, 8, 10);
    expect(inRange(new Date(2026, 8, 10, 0, 0, 1), from, to)).toBe(true);
    expect(inRange(new Date(2026, 8, 10, 23, 59), from, to)).toBe(true);
    expect(inRange(new Date(2026, 8, 11, 0, 0), from, to)).toBe(false);
    expect(inRange(new Date(2026, 8, 9, 23, 59), from, to)).toBe(false);
    expect(inRange(null, from, to)).toBe(false);
    expect(inRange(null)).toBe(true);
  });
});

describe("relatório de estoque", () => {
  it("padrão: sem vendidos; aparelhos e acessórios; totais corretos", () => {
    const r = buildStockReport(devices, accessories, DEFAULT_STOCK_FILTERS, ME);
    expect(r.rows).toHaveLength(5); // 2 aparelhos + 3 acessórios
    expect(r.rows.some((row) => row[3] === "Galaxy S24")).toBe(false);
    const qty = 1 + 1 + 10 + 0 + 2;
    expect(r.totals![10]).toBe(qty);
    const keys = r.columns.map((c) => c.key);
    const costTotal = 4000 + 2000 + 10 * 20 + 0 + 2 * 10;
    expect(r.totals![keys.indexOf("valorCusto")]).toBe(costTotal);
    const saleTotal = 5000 + 2800 + 10 * 80 + 0; // película sem estoque = 0 un.; cabo sem preço fora
    expect(r.totals![keys.indexOf("preco")]).toBe(saleTotal);
    expect(r.summary.find((s) => s.label === "Unidades sem preço de venda")?.value).toBe("2"); // cabo (2)
  });
  it("status do acessório: Disponível / Estoque baixo / Sem estoque", () => {
    const r = buildStockReport([], accessories, { ...DEFAULT_STOCK_FILTERS, status: "todos" }, ME);
    expect(r.rows.map((x) => x[8])).toEqual(["Disponível", "Sem estoque", "Estoque baixo"]);
  });
  it("filtros: condição, local, marca, categoria, status e tipo", () => {
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, condition: "Seminovo" }, ME).rows).toHaveLength(1);
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, location: "Vitrine 1" }, ME).rows).toHaveLength(1);
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, status: "Vendido" }, ME).rows.map((r) => r[3])).toEqual(["Galaxy S24"]);
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, status: "todos", brand: "Samsung" }, ME).rows).toHaveLength(1);
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, kind: "acessorios", category: "Capas" }, ME).rows).toHaveLength(1);
    expect(buildStockReport(devices, accessories, { ...DEFAULT_STOCK_FILTERS, kind: "aparelhos" }, ME).rows).toHaveLength(2);
  });
  it("SEM viewCost: nenhuma coluna, total ou resumo de custo/margem", () => {
    const r = buildStockReport(devices, accessories, DEFAULT_STOCK_FILTERS, NO_COST);
    const labels = r.columns.map((c) => c.label.toLowerCase());
    expect(labels.some((l) => /custo|margem|lucro/.test(l))).toBe(false);
    expect(r.summary.some((s) => /custo|margem|lucro/i.test(s.label))).toBe(false);
    expect(r.rows.every((row) => row.length === r.columns.length)).toBe(true);
    expect(r.totals!.length).toBe(r.columns.length);
    const flat = JSON.stringify(r);
    expect(flat).not.toContain("4000"); // custo do iPhone não aparece em lugar nenhum
    expect(flat).not.toContain("2000");
    expect(r.hasCost).toBe(false);
  });
});

describe("relatório de vendas", () => {
  const sales = [
    sale(),
    sale({ id: "bbbb00000000", seller: "Marina", total: 100, subtotal: 100, items: [{ id: "i2", type: "accessory", accessoryId: "a1", name: "Capa", price: 100, quantity: 1, warrantyDays: 0 }], payments: [{ id: "p2", method: "Cartão de Crédito", amount: 100, installments: 3 }], createdAt: new Date(2026, 8, 12, 10, 0), origin: "Orçamento" }),
    sale({ id: "cccc00000000", returnedAt: new Date(2026, 8, 13), createdAt: new Date(2026, 8, 11) }),
  ];
  it("totais, ticket médio e lucro; devolvida fora dos totais", () => {
    const r = buildSalesReport(sales, devices, accessories, DEFAULT_SALES_FILTERS, ME);
    expect(r.rows).toHaveLength(2);
    const keys = r.columns.map((c) => c.key);
    expect(r.totals![keys.indexOf("total")]).toBe(5100);
    expect(r.summary.find((s) => s.label === "Ticket médio")?.value).toBe("R$ 2.550,00");
    // lucro = (5000-4000) + (100-20)
    expect(r.totals![keys.indexOf("lucro")]).toBe(1080);
    expect(r.rows[0][1]).toBe("ABCDEF12");
    expect(r.rows[1][5]).toBe("Cartão de Crédito 3x");
  });
  it("situação: todas / devolvidas", () => {
    const all = buildSalesReport(sales, devices, accessories, { ...DEFAULT_SALES_FILTERS, status: "todas" }, ME);
    expect(all.rows).toHaveLength(3);
    expect(all.totals![8]).toBe(5100); // devolvida não soma
    expect(all.summary.find((s) => s.label.startsWith("Devolvidas"))?.value).toBe("1");
    const ret = buildSalesReport(sales, devices, accessories, { ...DEFAULT_SALES_FILTERS, status: "devolvidas" }, ME);
    expect(ret.rows).toHaveLength(1);
    expect(ret.rows[0][7]).toBe("Devolvida");
    expect(ret.rows[0][9]).toBeNull();
  });
  it("filtros: período, vendedor, forma de pagamento e origem", () => {
    const f = DEFAULT_SALES_FILTERS;
    expect(buildSalesReport(sales, devices, accessories, { ...f, from: new Date(2026, 8, 11), to: new Date(2026, 8, 12) }, ME).rows).toHaveLength(1);
    expect(buildSalesReport(sales, devices, accessories, { ...f, seller: "Marina" }, ME).rows).toHaveLength(1);
    expect(buildSalesReport(sales, devices, accessories, { ...f, method: "PIX" }, ME).rows).toHaveLength(1);
    expect(buildSalesReport(sales, devices, accessories, { ...f, origin: "Orçamento" }, ME).rows).toHaveLength(1);
    expect(buildSalesReport(sales, devices, accessories, { ...f, seller: "Ninguém" }, ME).rows).toHaveLength(0);
    const empty = buildSalesReport([], devices, accessories, f, ME);
    expect(empty.summary.find((s) => s.label === "Ticket médio")?.value).toBe("R$ 0,00");
  });
  it("SEM viewCost: sem custo e sem lucro em coluna, total nem resumo", () => {
    const r = buildSalesReport(sales, devices, accessories, DEFAULT_SALES_FILTERS, NO_COST);
    expect(r.columns.map((c) => c.key)).not.toContain("custo");
    expect(r.columns.map((c) => c.key)).not.toContain("lucro");
    expect(r.summary.some((s) => /lucro/i.test(s.label))).toBe(false);
    expect(r.rows.every((row) => row.length === r.columns.length)).toBe(true);
    expect(toTextTable(r).head.join("|")).not.toMatch(/Custo|Lucro/);
    // o lucro (1080) nunca aparece no conteúdo
    expect(JSON.stringify(r)).not.toContain("1080");
  });
});

describe("relatório financeiro", () => {
  const data = {
    sales: [sale(), sale({ id: "zz", payments: [{ id: "p2", method: "Dinheiro", amount: 200 }, { id: "p3", method: "PIX", amount: 300 }], total: 500, subtotal: 500, items: [{ id: "i", type: "accessory", accessoryId: "a1", name: "Capa", price: 500, quantity: 1, warrantyDays: 0 }] }), sale({ id: "ret", returnedAt: new Date(2026, 8, 20) })],
    devices, accessories,
    expenses: [{ id: "e1", description: "Aluguel", category: "Aluguel" as const, amount: 1000, date: new Date(2026, 8, 5), recurring: true }, { id: "e2", description: "Antigo", category: "Outros" as const, amount: 50, date: new Date(2026, 7, 1), recurring: false }],
    sangrias: [{ id: "s1", amount: 300, justification: "Retirada do dono", date: new Date(2026, 8, 6) }],
    payables: [{ description: "Fornecedor X", category: "Fornecedor", amount: 700, dueDate: new Date(2026, 8, 25), status: "pendente" as const }, { description: "Luz", category: "Contas", amount: 100, dueDate: new Date(2026, 8, 8), status: "pago" as const }],
    receivables: [{ customerName: "Maria", amount: 400, dueDate: new Date(2026, 8, 28), status: "atrasado" as const }],
  };
  const range = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) };
  it("receita por forma, despesas do período, sangrias, contas e resultado", () => {
    const r = buildFinanceReport(data, range, ME);
    const rev = r.rows.filter((x) => x[0] === "Receita por forma de pagamento");
    expect(rev.map((x) => x[1])).toEqual(["PIX (2 pagamentos)", "Dinheiro (1 pagamento)", "Total da receita"]);
    expect(rev.at(-1)![3]).toBe(5500);
    expect(r.rows.find((x) => x[1] === "Total das despesas")![3]).toBe(1000); // a despesa antiga fica fora
    expect(r.rows.find((x) => x[1] === "Total das sangrias")![3]).toBe(300);
    const opens = r.rows.filter((x) => x[1] === "Em aberto (pendentes e atrasadas)");
    expect(opens.map((x) => x[3])).toEqual([700, 400]);
    // custo = 4000 (aparelho) + 20 (acessório) => 5500 - 1000 - 4020
    expect(r.rows.find((x) => x[0] === "Custo dos produtos vendidos")![3]).toBe(4020);
    expect(r.totals![3]).toBe(480);
  });
  it("SEM viewCost: sem linha nem valor de custo; resultado = receita - despesas", () => {
    const r = buildFinanceReport(data, range, NO_COST);
    expect(r.rows.some((x) => x[0] === "Custo dos produtos vendidos")).toBe(false);
    expect(r.summary.some((s) => /custo/i.test(s.label))).toBe(false);
    expect(r.totals![3]).toBe(4500);
    expect(JSON.stringify(r)).not.toContain("4020");
    expect(r.filters.join(" ")).not.toMatch(/custo/i);
  });
});

describe("relatório de OS", () => {
  const os = (o: Partial<ServiceOrder>): ServiceOrder => ({
    id: "os1234567890", customerName: "Joana", customerPhone: "", customerCpf: "", model: "iPhone 12", color: "", serialImei: "", batteryHealth: 100, reportedIssue: "", technicalNotes: "",
    checklist: { capa: false, chip: false, carregador: false }, status: "Em Reparo", priority: "Normal", partCost: 100, laborCost: 30, partDescription: "", partFromStock: false, chargedAmount: 400, taxes: 10,
    origin: "Cliente", costResponsibility: "Cliente", createdAt: new Date(2026, 8, 10), updatedAt: new Date(2026, 8, 10), ...o,
  });
  const list = [os({}), os({ id: "os2", costResponsibility: "Garantia da Loja", chargedAmount: 500, status: "Entregue / Finalizado" }), os({ id: "os3", origin: "Estoque da loja", customerName: "" })];
  it("totais usam o valor efetivo (garantia = 0) e lucro = cobrado - peça - impostos", () => {
    const r = buildOSReport(list, DEFAULT_OS_REPORT_FILTERS, ME);
    const k = r.columns.map((c) => c.key);
    expect(r.rows).toHaveLength(3);
    expect(r.totals![k.indexOf("cobrado")]).toBe(800); // 400 + 0 + 400
    expect(r.totals![k.indexOf("custo")]).toBe(390);
    expect(r.totals![k.indexOf("lucro")]).toBe(800 - 300 - 30);
    expect(r.rows[2][2]).toBe("Estoque da loja");
  });
  it("filtros: status, quem paga, origem e período", () => {
    const f = DEFAULT_OS_REPORT_FILTERS;
    expect(buildOSReport(list, { ...f, status: "Entregue / Finalizado" }, ME).rows).toHaveLength(1);
    expect(buildOSReport(list, { ...f, responsibility: "Garantia da Loja" }, ME).rows).toHaveLength(1);
    expect(buildOSReport(list, { ...f, origin: "Estoque da loja" }, ME).rows).toHaveLength(1);
    expect(buildOSReport(list, { ...f, from: new Date(2026, 8, 11) }, ME).rows).toHaveLength(0);
  });
  it("SEM viewCost: sem custo nem lucro", () => {
    const r = buildOSReport(list, DEFAULT_OS_REPORT_FILTERS, NO_COST);
    expect(r.columns.map((c) => c.key)).toEqual(["os", "entrada", "cliente", "aparelho", "origem", "status", "quemPaga", "cobrado"]);
    expect(r.summary.map((s) => s.label)).toEqual(["Ordens de serviço", "Total cobrado"]);
    expect(r.totals).toHaveLength(8);
  });
});

describe("relatório de clientes", () => {
  const customers = [cust({}), cust({ id: "c2", name: "Ana", birthday: "1985-12-03", leadOrigin: "Indicação" }), cust({ id: "c3", name: "Bruno", birthday: "", cpf: "" })];
  const sales = [sale(), sale({ id: "s2", total: 300, createdAt: new Date(2026, 8, 15) }), sale({ id: "s3", customer: cust({ id: "c2", name: "Ana" }), total: 900, returnedAt: new Date(2026, 8, 16) })];
  it("compras, total e última compra (devolvida não conta); ordenado por nome", () => {
    const r = buildCustomerReport(customers, sales, DEFAULT_CUSTOMER_REPORT_FILTERS, ME);
    expect(r.rows.map((x) => x[0])).toEqual(["Ana", "Bruno", "Maria Cliente"]);
    const maria = r.rows[2];
    expect(maria[5]).toBe(2);
    expect(maria[6]).toBe(5300);
    expect((maria[7] as Date).getDate()).toBe(15);
    expect(r.rows[0][5]).toBe(0);
    expect(r.rows[0][7]).toBeNull();
    expect(r.totals![6]).toBe(5300);
  });
  it("aniversariantes do mês, origem e quem nunca comprou", () => {
    expect(buildCustomerReport(customers, sales, { ...DEFAULT_CUSTOMER_REPORT_FILTERS, birthdayMonth: 9 }, ME).rows.map((x) => x[0])).toEqual(["Maria Cliente"]);
    expect(buildCustomerReport(customers, sales, { ...DEFAULT_CUSTOMER_REPORT_FILTERS, birthdayMonth: 12 }, ME).rows.map((x) => x[0])).toEqual(["Ana"]);
    expect(buildCustomerReport(customers, sales, { ...DEFAULT_CUSTOMER_REPORT_FILTERS, origin: "Indicação" }, ME).rows).toHaveLength(1);
    expect(buildCustomerReport(customers, sales, { ...DEFAULT_CUSTOMER_REPORT_FILTERS, buyers: "semCompras" }, ME).rows.map((x) => x[0])).toEqual(["Ana", "Bruno"]);
    expect(buildCustomerReport(customers, sales, { ...DEFAULT_CUSTOMER_REPORT_FILTERS, buyers: "comCompras" }, ME).rows).toHaveLength(1);
  });
});

describe("relatório de orçamentos", () => {
  const q = (o: Partial<Quote>): Quote => ({
    id: "q1", number: 1, customerName: "Maria", customerPhone: "", sellerName: "Gabriel", status: "Aberto", validUntil: new Date(2026, 8, 30), subtotal: 1000, discount: 0, total: 1000,
    paymentTerms: "", notes: "", createdAt: new Date(2026, 8, 5), updatedAt: new Date(2026, 8, 5), items: [], ...o,
  });
  const list = [q({}), q({ id: "q2", number: 2, status: "Convertido", total: 3000 }), q({ id: "q3", number: 3, status: "Recusado", total: 500 }), q({ id: "q4", number: 4, validUntil: new Date(2026, 8, 1), total: 200, sellerName: "Marina" })];
  it("taxa de conversão e totais; Expirado é calculado pela validade", () => {
    const r = buildQuoteReport(list, DEFAULT_QUOTE_REPORT_FILTERS, ME);
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((x) => x[5])).toEqual(["Aberto", "Convertido", "Recusado", "Expirado"]);
    expect(r.summary.find((s) => s.label === "Taxa de conversão")?.value).toBe("25,0%");
    expect(r.summary.find((s) => s.label === "Valor convertido")?.value).toBe("R$ 3.000,00");
    expect(r.totals![7]).toBe(4700);
  });
  it("filtros: status, vendedor, período", () => {
    expect(buildQuoteReport(list, { ...DEFAULT_QUOTE_REPORT_FILTERS, status: "Expirado" }, ME).rows).toHaveLength(1);
    expect(buildQuoteReport(list, { ...DEFAULT_QUOTE_REPORT_FILTERS, seller: "Marina" }, ME).rows).toHaveLength(1);
    expect(buildQuoteReport(list, { ...DEFAULT_QUOTE_REPORT_FILTERS, from: new Date(2026, 8, 6) }, ME).rows).toHaveLength(0);
    expect(buildQuoteReport([], DEFAULT_QUOTE_REPORT_FILTERS, ME).summary.find((s) => s.label === "Taxa de conversão")?.value).toBe("0,0%");
  });
});

describe("relatório de garantias", () => {
  const s1 = sale({ createdAt: new Date(2026, 5, 1) }); // 365 dias: vence em jun/2027
  const s2 = sale({ id: "s2", createdAt: new Date(2026, 4, 1), items: [{ id: "i", type: "device", deviceId: "d2", name: "iPhone 13", serial: "222", price: 1, quantity: 1, warrantyDays: 150 }] }); // vence 28/09/2026 (7 dias)
  const s3 = sale({ id: "s3", createdAt: new Date(2026, 0, 1), items: [{ id: "i", type: "device", name: "iPhone 11", price: 1, quantity: 1, warrantyDays: 90 }] }); // vencida
  const s4 = sale({ id: "s4", returnedAt: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1) });
  const s5 = sale({ id: "s5", items: [{ id: "i", type: "accessory", name: "Capa", price: 1, quantity: 1, warrantyDays: 0 }] });
  it("vencendo em N dias / vigentes / vencidas; ignora devolvidas e sem garantia", () => {
    const all = [s1, s2, s3, s4, s5];
    const v30 = buildWarrantyReport(all, { mode: "vencendo", days: 30 }, ME);
    expect(v30.rows.map((r) => r[2])).toEqual(["iPhone 13"]);
    expect(v30.rows[0][6]).toBeGreaterThanOrEqual(6);
    expect(v30.rows[0][6]).toBeLessThanOrEqual(8);
    expect(buildWarrantyReport(all, { mode: "vencendo", days: 1 }, ME).rows).toHaveLength(0);
    expect(buildWarrantyReport(all, { mode: "vencendo", days: 400 }, ME).rows).toHaveLength(2);
    expect(buildWarrantyReport(all, { mode: "vigentes", days: 0 }, ME).rows.map((r) => r[2])).toEqual(["iPhone 13", "iPhone 15 128GB"]);
    const venc = buildWarrantyReport(all, { mode: "vencidas", days: 0 }, ME);
    expect(venc.rows.map((r) => r[2])).toEqual(["iPhone 11"]);
    expect(venc.rows[0][6]).toBeNull();
    expect(venc.rows[0][7]).toBe("Vencida");
  });
});

describe("relatório de conferência", () => {
  const row = (o: Partial<ReconciliationRow>): ReconciliationRow => ({
    id: "1", saleId: "s", saleCode: "ABC12345", createdAt: new Date(2026, 8, 10, 10, 0), customerName: "Maria", sellerName: "Gabriel", method: "PIX", installments: 1, amount: 100,
    auditStatus: "Aguardando", auditNote: "", auditedByName: "", auditedAt: null, ...o,
  });
  it("totais e resumo por status; parcelas na forma", () => {
    const r = buildReconciliationReport([row({}), row({ id: "2", method: "Cartão de Crédito", installments: 3, amount: 250, auditStatus: "Conferido", auditNote: "NSU 1", auditedByName: "Ana", auditedAt: new Date(2026, 8, 11) }), row({ id: "3", auditStatus: "Divergente", amount: 50 })], ["Período: hoje"], ME);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1][4]).toBe("Cartão de Crédito 3x");
    expect(r.totals![5]).toBe(400);
    expect(r.summary.map((s) => s.value)).toEqual(["1 (R$ 100,00)", "1 (R$ 250,00)", "1 (R$ 50,00)"]);
    expect(r.summary[2].label).toBe("Divergente / Em análise");
    expect(r.filters).toEqual(["Período: hoje"]);
  });
  it("sem linhas", () => {
    const r = buildReconciliationReport([], [], NO_COST);
    expect(r.rows).toHaveLength(0);
    expect(r.filters).toEqual(["Todos os pagamentos"]);
  });
});

describe("exportação: Excel, CSV e nomes", () => {
  const r = buildStockReport(devices, accessories, DEFAULT_STOCK_FILTERS, ME);
  it("Excel: números e datas nativos, total em negrito no fim", () => {
    const x = toExcelData(r);
    expect(x.header).toHaveLength(r.columns.length);
    const first = x.rows[0];
    const costCell = first[r.columns.findIndex((c) => c.key === "custo")] as { value: number; format: string };
    expect(costCell.value).toBe(4000);
    expect(costCell.format).toBe("#,##0.00");
    expect(x.rows.at(-2)!.every((c) => c === null)).toBe(true);
    expect((x.rows.at(-1)![0] as { fontWeight: string }).fontWeight).toBe("bold");
    const sales = toExcelData(buildSalesReport([sale()], devices, accessories, DEFAULT_SALES_FILTERS, ME));
    expect(((sales.rows[0][0]) as { value: Date; format: string }).value).toBeInstanceOf(Date);
  });
  it("CSV: linhas de texto formatado, totais no fim", () => {
    const c = reportCsv(r);
    expect(c.header[0]).toBe("Tipo");
    expect(c.rows.at(-1)![0]).toMatch(/^TOTAL/);
    expect(c.rows[0][11]).toBe("R$ 4.000,00");
  });
  it("stripCost é idempotente e não altera a entrada", () => {
    const before = JSON.stringify(r);
    const s = stripCost(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(stripCost(s).columns).toEqual(s.columns);
  });
  it("nome do arquivo", () => {
    expect(reportFileName("estoque", "pdf", new Date(2026, 8, 5))).toBe("relatorio-estoque-2026-09-05.pdf");
    expect(reportFileName("vendas", "xlsx", new Date(2026, 11, 31))).toBe("relatorio-vendas-2026-12-31.xlsx");
  });
});

describe("PDF: texto e página", () => {
  it("mantém acentos do latin-1 (ção, ã, é, ü, ñ, º)", () => {
    expect(sanitizePdfText("Conferência de Ação, não é útil: ü ñ 2º")).toBe("Conferência de Ação, não é útil: ü ñ 2º");
  });
  it("remove emoji e símbolos que a fonte padrão não desenha; troca NBSP", () => {
    expect(sanitizePdfText("Sua loja no ❤️ de SP")).toBe("Sua loja no de SP");
    expect(sanitizePdfText("R$ 1,00 → ok 🍎")).toBe("R$ 1,00 ok");
    expect(sanitizePdfText("a\tb\nc")).toBe("a b c");
    expect(sanitizePdfText(null)).toBe("");
    expect(sanitizePdfText("“aspas” – travessão — €")).toBe("“aspas” – travessão — €");
  });
  it("A4 paisagem quando há muitas colunas", () => {
    const wide = buildStockReport(devices, accessories, DEFAULT_STOCK_FILTERS, ME);
    expect(isLandscape(wide)).toBe(true);
    expect(isLandscape(buildFinanceReport({ sales: [], devices: [], accessories: [], expenses: [], sangrias: [], payables: [], receivables: [] }, {}, ME))).toBe(false);
    expect(isLandscape(buildStockReport(devices, accessories, DEFAULT_STOCK_FILTERS, NO_COST))).toBe(true); // 13 colunas
  });
});

describe("central de relatórios: quem vê o quê", () => {
  it("vendedor, técnico: nenhum; estoquista: estoque, OS e garantias; financeiro e gerente: os demais", () => {
    expect(visibleReports("vendedor")).toEqual([]);
    expect(visibleReports("tecnico")).toEqual([]);
    expect(visibleReports("estoquista").map((r) => r.id)).toEqual(["estoque", "os", "garantias"]);
    expect(visibleReports("financeiro").map((r) => r.id).sort()).toEqual(["clientes", "conferencia", "estoque", "financeiro", "garantias", "orcamentos", "os", "vendas"]);
    expect(visibleReports("admin")).toHaveLength(REPORTS.length);
    expect(visibleReports("gerente")).toHaveLength(REPORTS.length);
    expect(visibleReports(undefined)).toEqual([]);
  });
  it("financeiro (viewBI) e conferência (reconcile) só para quem tem", () => {
    expect(can("estoquista", "viewBI")).toBe(false);
    expect(visibleReports("estoquista").some((r) => r.id === "financeiro" || r.id === "conferencia")).toBe(false);
  });
});

describe("conferência: helpers", () => {
  it("filtersToQuery ignora vazios e codifica", () => {
    expect(filtersToQuery({})).toBe("");
    expect(filtersToQuery({ from: "2026-09-01", status: "", q: "maria silva" }, { limit: 50, offset: 0 })).toBe("?from=2026-09-01&q=maria+silva&limit=50&offset=0");
  });
  it("cleanFilters remove vazios (o servidor recusa data vazia)", () => {
    expect(cleanFilters({ from: "", to: "2026-09-30", method: " ", status: "Conferido", q: " ab " })).toEqual({ to: "2026-09-30", status: "Conferido", q: "ab" });
    expect(cleanFilters({})).toEqual({});
  });
  it("paymentLabel", () => {
    expect(paymentLabel("PIX", 1)).toBe("PIX");
    expect(paymentLabel("Cartão de Crédito", 3)).toBe("Cartão de Crédito 3x");
    expect(paymentLabel("Dinheiro", null)).toBe("Dinheiro");
  });
});
