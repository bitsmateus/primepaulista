import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { funnelColumns, leads } from "../db/schema/index";
import { foldText, formatPhoneBR, phoneKey } from "../lib/crmText";

// As 10 etapas padrão do funil (cada uma com cor em HSL "H S% L%", como o resto do CRM)
export const DEFAULT_FUNNEL_COLUMNS: { name: string; color: string }[] = [
  { name: "Novo Lead", color: "211 100% 45%" },
  { name: "Primeiro Contato", color: "199 89% 48%" },
  { name: "Atendimento", color: "38 92% 50%" },
  { name: "Cliente Interessado", color: "262 83% 58%" },
  { name: "Orçamento Enviado", color: "25 95% 53%" },
  { name: "Negociação", color: "330 80% 55%" },
  { name: "Aguardando Pagamento", color: "45 93% 47%" },
  { name: "Venda Concluída", color: "160 84% 39%" },
  { name: "Pós-venda", color: "173 80% 40%" },
  { name: "Perdido", color: "0 84% 60%" },
];

export const STAGE = {
  newLead: "Novo Lead",
  quoteSent: "Orçamento Enviado",
  saleDone: "Venda Concluída",
  postSale: "Pós-venda",
  lost: "Perdido",
} as const;

export type FunnelColumnRow = typeof funnelColumns.$inferSelect;

// Lista as colunas; instalação NOVA (tabela vazia) já nasce com as 10 etapas.
// Bancos que já têm colunas NÃO são alterados (o botão "Restaurar etapas padrão" cuida disso).
export async function listFunnelColumns(): Promise<FunnelColumnRow[]> {
  let rows = await db.select().from(funnelColumns).orderBy(asc(funnelColumns.position));
  if (rows.length === 0) {
    await db.transaction(async (tx) => {
      const again = await tx.select({ id: funnelColumns.id }).from(funnelColumns).limit(1);
      if (again.length === 0) {
        await tx.insert(funnelColumns).values(DEFAULT_FUNNEL_COLUMNS.map((c, i) => ({ ...c, position: i })));
      }
    });
    rows = await db.select().from(funnelColumns).orderBy(asc(funnelColumns.position));
  }
  return rows;
}

// Cria só as etapas padrão que faltam (comparando o nome sem acento/maiúsculas). Nada é apagado nem renomeado.
export async function restoreDefaultColumns(): Promise<{ created: string[]; columns: FunnelColumnRow[] }> {
  const created: string[] = [];
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(funnelColumns).orderBy(asc(funnelColumns.position));
    const have = new Set(rows.map((r) => foldText(r.name)));
    let pos = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
    for (const def of DEFAULT_FUNNEL_COLUMNS) {
      if (have.has(foldText(def.name))) continue;
      await tx.insert(funnelColumns).values({ name: def.name, color: def.color, position: pos++ });
      created.push(def.name);
    }
  });
  return { created, columns: await db.select().from(funnelColumns).orderBy(asc(funnelColumns.position)) };
}

// Etapa (existente) com o nome dado, sem diferenciar acento/maiúsculas
function findColumn(cols: FunnelColumnRow[], name: string): FunnelColumnRow | undefined {
  const f = foldText(name);
  return cols.find((c) => foldText(c.name) === f);
}

// Nome da etapa de entrada de um lead novo: "Novo Lead" se existir, senão a primeira etapa
export async function entryStageName(): Promise<string> {
  const cols = await listFunnelColumns();
  return (findColumn(cols, STAGE.newLead) ?? cols[0])?.name ?? "Novo";
}

// Nome real de uma etapa pelo nome-alvo, ou a primeira etapa como reserva
export async function stageNameOr(target: string): Promise<string> {
  const cols = await listFunnelColumns();
  return (findColumn(cols, target) ?? cols[0])?.name ?? "Novo";
}

export type LeadRow = typeof leads.$inferSelect;

// Leads cujo telefone é o mesmo (ignora formatação, DDI 55 e o 9º dígito antigo)
export async function findLeadsByPhone(rawPhone: string): Promise<LeadRow[]> {
  const key = phoneKey(rawPhone);
  if (key.length < 10) return [];
  const tail = key.slice(-8);
  // pré-filtro barato pelos 8 últimos dígitos; a comparação exata é feita em JS
  const rows = await db
    .select()
    .from(leads)
    .where(sql`right(regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g'), 8) = ${tail}`);
  return rows.filter((l) => phoneKey(l.phone) === key);
}

export interface FindOrCreateInput {
  phone: string; // qualquer formato
  name?: string;
  origin?: string;
  stage?: string; // nome da etapa desejada para um lead NOVO (se não existir, usa a de entrada)
  modelInterest?: string;
  ownerId?: string | null;
  ownerName?: string | null;
}

// Acha o lead pelo telefone ou cria um (etapa "Novo Lead" se existir). Devolve também se foi criado.
export async function findOrCreateLeadByPhone(input: FindOrCreateInput): Promise<{ lead: LeadRow; created: boolean }> {
  const found = await findLeadsByPhone(input.phone);
  if (found.length > 0) return { lead: found[0], created: false };
  const status = input.stage ? await stageNameOr(input.stage) : await entryStageName();
  const phone = formatPhoneBR(input.phone);
  const [lead] = await db
    .insert(leads)
    .values({
      name: (input.name ?? "").trim().slice(0, 200) || phone || "Contato do WhatsApp",
      phone,
      origin: input.origin ?? "WhatsApp",
      status,
      modelInterest: input.modelInterest ?? "",
      ownerId: input.ownerId ?? null,
      ownerName: input.ownerName ?? null,
    })
    .returning();
  return { lead, created: true };
}

// Integração com Orçamentos/Vendas: leva o lead do telefone para a etapa-alvo, mas só PARA FRENTE
// (nunca volta um lead que já está adiante) e reabre "Perdido" (voltou a comprar/pedir orçamento).
// Só age se a etapa-alvo existir. NUNCA lança: o funil não pode quebrar orçamento/venda.
export async function advanceLeadStage(rawPhone: string | null | undefined, target: string): Promise<number> {
  try {
    if (!rawPhone) return 0;
    const cols = await db.select().from(funnelColumns).orderBy(asc(funnelColumns.position));
    const targetCol = findColumn(cols, target);
    if (!targetCol) return 0;
    const matches = await findLeadsByPhone(rawPhone);
    let moved = 0;
    for (const lead of matches) {
      const cur = findColumn(cols, lead.status);
      const lost = cur ? foldText(cur.name) === foldText(STAGE.lost) : false;
      const behind = !cur || cur.position < targetCol.position;
      if (cur?.id === targetCol.id) continue;
      if (behind || lost) {
        await db.update(leads).set({ status: targetCol.name }).where(eq(leads.id, lead.id));
        moved++;
      }
    }
    return moved;
  } catch (err) {
    console.error("falha ao mover lead no funil", (err as Error).message);
    return 0;
  }
}
