import { eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { suppliers } from "../db/schema/index";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export class SupplierError extends Error {
  statusCode = 400;
}

export interface SupplierInput {
  supplierId?: string | null;
  supplier?: string;
}

// Decide o fornecedor de um aparelho a partir do que veio da tela:
//  - supplierId (escolhido na lista): valida e usa o nome cadastrado;
//  - só o texto: tenta casar pelo nome (sem diferenciar maiúsculas); se `create`, cadastra o que faltar;
//  - supplierId nulo: desfaz o vínculo (o texto continua como veio).
// `keepId` = vínculo atual do aparelho (permite regravar um fornecedor que ficou inativo).
export async function resolveSupplier(
  tx: Db,
  input: SupplierInput,
  opts: { create: boolean; keepId?: string | null }
): Promise<{ supplierId: string | null; supplier: string }> {
  if (input.supplierId) {
    const [s] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!s) throw new SupplierError("Fornecedor não encontrado.");
    if (!s.active && s.id !== opts.keepId) throw new SupplierError("Este fornecedor está inativo.");
    return { supplierId: s.id, supplier: s.name };
  }
  const text = (input.supplier ?? "").trim().replace(/\s+/g, " ");
  if (input.supplierId === null || !text) return { supplierId: null, supplier: text };
  const [found] = await tx
    .select()
    .from(suppliers)
    .where(sql`lower(btrim(${suppliers.name})) = ${normName(text)}`)
    .limit(1);
  if (found) return { supplierId: found.id, supplier: found.name };
  if (!opts.create) return { supplierId: null, supplier: text };
  const [created] = await tx.insert(suppliers).values({ name: text }).returning();
  return { supplierId: created.id, supplier: created.name };
}
