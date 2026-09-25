import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { customers, devices, profiles, saleItems, sales, stockMovements, suppliers } from "../db/schema/index";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { brl, diffFields, logAudit } from "../services/audit";
import { SupplierError, normName, resolveSupplier } from "../services/suppliers";

const deviceInput = z.object({
  category: z.string().max(50).optional().default("iPhone"),
  brand: z.string().trim().max(60).optional().default("Apple"),
  location: z.string().trim().max(60).optional().default("Estoque"),
  model: z.string().min(1).max(100),
  capacity: z.string().max(50).optional().default(""),
  color: z.string().max(60).optional().default(""),
  condition: z.enum(["Lacrado", "Seminovo"]),
  batteryHealth: z.coerce.number().int().min(0).max(100).default(100),
  supplier: z.string().optional().default(""),
  supplierId: z.string().uuid().nullable().optional(), // fornecedor cadastrado (o texto acima é o nome exibido)
  cost: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).optional(),
  serialImei: z.string().optional().default(""), // IMEI 1
  imei2: z.string().optional().default(""), // IMEI 2
  serial: z.string().optional().default(""), // número de série
  internalSerial: z.string().optional().default(""),
  entryDate: z.coerce.date().optional(),
  notes: z.string().optional().default(""),
  status: z
    .enum(["Disponível", "Vendido", "Em Manutenção", "Reservado"])
    .default("Disponível"),
});

// Status em que o aparelho ainda está "vivo" no estoque (não vendido)
const ACTIVE_STATUSES = ["Disponível", "Reservado", "Em Manutenção"] as const;

// Identificadores viram texto limpo (sem espaços internos, comuns ao colar do Excel)
const cleanId = (v: string | undefined) => (v ?? "").replace(/\s+/g, "").trim();

const importInput = z.object({
  devices: z.array(deviceInput).min(1).max(2000),
  // Apaga antes o estoque atual (não vendido e sem histórico de venda)
  replaceStock: z.boolean().optional().default(false),
});

const uuidList = z.array(z.string().uuid()).min(1).max(2000);

// ids de aparelhos que já aparecem em alguma venda (histórico que não pode sumir)
async function idsWithSaleHistory(ids?: string[]): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ productId: saleItems.productId })
    .from(saleItems)
    .where(
      and(
        eq(saleItems.productType, "device"),
        ids ? inArray(saleItems.productId, ids) : isNotNull(saleItems.productId)
      )
    );
  return new Set(rows.map((r) => r.productId!).filter(Boolean));
}

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /devices
  app.get("/devices", { preHandler: requireCapability("viewStock") }, async () => {
    const rows = await db.select().from(devices).orderBy(desc(devices.createdAt));
    return { devices: rows };
  });

  // POST /devices
  app.post("/devices", { preHandler: requireCapability("editStock") }, async (req, reply) => {
    const parsed = deviceInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const d = parsed.data;
    let row;
    try {
      row = await db.transaction(async (tx) => {
      const sup = await resolveSupplier(tx, { supplierId: d.supplierId, supplier: d.supplier }, { create: false });
      const [created] = await tx
        .insert(devices)
        .values({
          ...d,
          supplier: sup.supplier,
          supplierId: sup.supplierId,
          cost: String(d.cost),
          salePrice: d.salePrice !== undefined ? String(d.salePrice) : null,
        })
        .returning();
      await tx.insert(stockMovements).values({
        productType: "device",
        productId: created.id,
        movementType: "entrada",
        quantity: 1,
        reason: "Cadastro",
        userId: (req.user as JwtUser).sub,
      });
      return created;
      });
    } catch (err) {
      if (err instanceof SupplierError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return reply.code(201).send({ device: row });
  });

  // POST /devices/import — importação em lote (CSV/Excel já lido no navegador). Só admin.
  // Valida duplicidade de IMEI/serial contra o estoque ativo e dentro do próprio arquivo.
  app.post("/devices/import", { preHandler: requireCapability("importStock") }, async (req, reply) => {
    const parsed = importInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const { devices: items, replaceStock } = parsed.data;
    const userId = (req.user as JwtUser).sub;

    const result = await db.transaction(async (tx) => {
      let removed = 0;
      if (replaceStock) {
        const history = [...(await idsWithSaleHistory())];
        const removable = await tx
          .delete(devices)
          .where(
            and(
              inArray(devices.status, [...ACTIVE_STATUSES]),
              history.length ? notInArray(devices.id, history) : undefined
            )
          )
          .returning({ id: devices.id });
        removed = removable.length;
      }

      // identificadores já presentes no estoque ativo (após a limpeza, se houve)
      const active = await tx
        .select({ serialImei: devices.serialImei, imei2: devices.imei2, serial: devices.serial })
        .from(devices)
        .where(ne(devices.status, "Vendido"));
      const taken = new Set<string>();
      for (const a of active) {
        for (const v of [a.serialImei, a.imei2, a.serial]) if (v) taken.add(v.toLowerCase());
      }

      // fornecedores já cadastrados (nome sem diferenciar maiúsculas); o que faltar é criado
      const supMap = new Map<string, { id: string; name: string }>();
      for (const s of await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers)) {
        supMap.set(normName(s.name), s);
      }
      let suppliersCreated = 0;

      const skipped: { index: number; reason: string }[] = [];
      let created = 0;
      for (let i = 0; i < items.length; i++) {
        const d = items[i];
        const imei1 = cleanId(d.serialImei);
        const imei2 = cleanId(d.imei2);
        const serial = cleanId(d.serial);
        const ids = [imei1, imei2, serial].filter(Boolean).map((v) => v.toLowerCase());
        const dup = ids.find((v) => taken.has(v));
        if (dup) {
          skipped.push({ index: i, reason: "IMEI/serial já consta no estoque ativo" });
          continue;
        }
        ids.forEach((v) => taken.add(v));

        const internalSerial =
          d.internalSerial ||
          (ids.length === 0
            ? `INT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`
            : "");

        let supplierId: string | null = null;
        let supplierName = (d.supplier ?? "").trim().replace(/\s+/g, " ");
        if (supplierName) {
          let s = supMap.get(normName(supplierName));
          if (!s) {
            const [c] = await tx.insert(suppliers).values({ name: supplierName }).returning({ id: suppliers.id, name: suppliers.name });
            s = c;
            supMap.set(normName(supplierName), s);
            suppliersCreated++;
          }
          supplierId = s.id;
          supplierName = s.name;
        }

        const [row] = await tx
          .insert(devices)
          .values({
            ...d,
            supplier: supplierName,
            supplierId,
            serialImei: imei1,
            imei2,
            serial,
            internalSerial,
            status: "Disponível",
            cost: String(d.cost),
            salePrice: d.salePrice !== undefined ? String(d.salePrice) : null,
          })
          .returning({ id: devices.id });
        await tx.insert(stockMovements).values({
          productType: "device",
          productId: row.id,
          movementType: "entrada",
          quantity: 1,
          reason: "Importação",
          userId,
        });
        created++;
      }
      return { created, skipped, removed, suppliersCreated };
    });

    await logAudit(req, {
      action: "device.import",
      entity: "device",
      description: `Importou ${result.created} aparelho(s)${
        result.removed ? ` (apagou ${result.removed} do estoque antes)` : ""
      }`,
      details: { created: result.created, skipped: result.skipped.length, removed: result.removed, suppliersCreated: result.suppliersCreated },
    });
    return reply.code(201).send(result);
  });

  // POST /devices/bulk/clear-sale-price — zera o preço de venda de todo o estoque ativo (admin)
  app.post(
    "/devices/bulk/clear-sale-price",
    { preHandler: requireCapability("bulkStockActions") },
    async (req) => {
      const rows = await db
        .update(devices)
        .set({ salePrice: null })
        .where(ne(devices.status, "Vendido"))
        .returning({ id: devices.id });
      await logAudit(req, {
        action: "device.bulk_clear_price",
        entity: "device",
        description: `Zerou o preço de venda de ${rows.length} aparelho(s) do estoque`,
        details: { count: rows.length },
      });
      return { updated: rows.length };
    }
  );

  // POST /devices/bulk/rename-model — padroniza o nome de um modelo (ex.: "16 PM" -> "iPhone 16 Pro Max")
  // em todos os aparelhos daquela categoria com o nome antigo. Não mexe em aparelhos de outras categorias.
  app.post(
    "/devices/bulk/rename-model",
    { preHandler: requireCapability("bulkStockActions") },
    async (req, reply) => {
      const parsed = z
        .object({
          category: z.string().trim().min(1).max(50).default("iPhone"),
          from: z.string().min(1).max(100),
          to: z.string().trim().min(1).max(100),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Dados inválidos" });
      const { category, from, to } = parsed.data;
      if (from === to) return reply.code(400).send({ error: "O nome novo é igual ao atual." });
      const rows = await db
        .update(devices)
        .set({ model: to })
        .where(and(eq(devices.category, category), eq(devices.model, from)))
        .returning({ id: devices.id });
      if (rows.length > 0) {
        await logAudit(req, {
          action: "device.rename_model",
          entity: "device",
          description: `Padronizou o modelo "${from}" para "${to}" em ${rows.length} aparelho(s)`,
          details: { category, from, to, count: rows.length },
        });
      }
      return { updated: rows.length };
    }
  );

  // POST /devices/bulk/move-location — muda a localização de vários aparelhos
  app.post("/devices/bulk/move-location", { preHandler: requireCapability("editStock") }, async (req, reply) => {
    const parsed = z
      .object({ ids: uuidList, location: z.string().trim().min(1).max(60) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados inválidos" });
    const { ids, location } = parsed.data;
    const rows = await db
      .update(devices)
      .set({ location })
      .where(and(inArray(devices.id, ids), ne(devices.status, "Vendido")))
      .returning({ id: devices.id });
    await logAudit(req, {
      action: "device.move_location",
      entity: "device",
      description: `Moveu ${rows.length} aparelho(s) para "${location}"`,
      details: { count: rows.length, location },
    });
    return { updated: rows.length };
  });

  // POST /devices/stock-check — marca aparelhos como conferidos fisicamente (balanço)
  app.post("/devices/stock-check", { preHandler: requireCapability("editStock") }, async (req, reply) => {
    const parsed = z.object({ ids: uuidList }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados inválidos" });
    const rows = await db
      .update(devices)
      .set({ checkedAt: new Date() })
      .where(and(inArray(devices.id, parsed.data.ids), ne(devices.status, "Vendido")))
      .returning({ id: devices.id });
    return { updated: rows.length };
  });

  // POST /devices/stock-check/reset — começa um novo balanço (limpa as conferências). Só admin.
  app.post("/devices/stock-check/reset", { preHandler: requireCapability("bulkStockActions") }, async (req) => {
    const rows = await db
      .update(devices)
      .set({ checkedAt: null })
      .where(isNotNull(devices.checkedAt))
      .returning({ id: devices.id });
    await logAudit(req, {
      action: "device.stock_check_reset",
      entity: "device",
      description: "Iniciou um novo balanço de estoque",
      details: { cleared: rows.length },
    });
    return { cleared: rows.length };
  });

  // GET /devices/:id/history — movimentações + vendas em que o aparelho apareceu (ficha)
  app.get("/devices/:id/history", { preHandler: requireCapability("viewStock") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: "Identificador inválido" });
    }
    const movements = await db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        userName: profiles.name,
      })
      .from(stockMovements)
      .leftJoin(profiles, eq(stockMovements.userId, profiles.id))
      .where(and(eq(stockMovements.productType, "device"), eq(stockMovements.productId, id)))
      .orderBy(desc(stockMovements.createdAt));

    const saleRows = await db
      .select({
        saleId: sales.id,
        createdAt: sales.createdAt,
        returnedAt: sales.returnedAt,
        sellerName: sales.sellerName,
        price: saleItems.price,
        warrantyDays: saleItems.warrantyDays,
        customerName: customers.name,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(eq(saleItems.productType, "device"), eq(saleItems.productId, id)))
      .orderBy(desc(sales.createdAt));

    return { movements, sales: saleRows };
  });

  // PATCH /devices/:id  (status e/ou outros campos)
  app.patch("/devices/:id", { preHandler: requireCapability("editStock") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const partial = deviceInput.partial().safeParse(req.body);
    if (!partial.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const data = partial.data;
    const values: Record<string, unknown> = { ...data };
    if (data.cost !== undefined) values.cost = String(data.cost);
    if (data.salePrice !== undefined) values.salePrice = String(data.salePrice);
    const [before] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!before) return reply.code(404).send({ error: "Aparelho não encontrado" });
    if ("supplierId" in data || "supplier" in data) {
      try {
        const sup = await resolveSupplier(
          db,
          { supplierId: data.supplierId, supplier: data.supplier ?? (data.supplierId === undefined ? before.supplier ?? "" : undefined) },
          { create: false, keepId: before.supplierId }
        );
        values.supplier = sup.supplier;
        values.supplierId = sup.supplierId;
      } catch (err) {
        if (err instanceof SupplierError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    }
    const [row] = await db
      .update(devices)
      .set(values)
      .where(eq(devices.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Aparelho não encontrado" });
    // Mudança de custo/preço de venda: registra antes -> depois
    const changes = diffFields(before as Record<string, unknown>, { cost: data.cost, salePrice: data.salePrice }, ["cost", "salePrice"]);
    if (Object.keys(changes).length) {
      const parts: string[] = [];
      if (changes.cost) parts.push(`custo ${brl(before.cost)} → ${brl(row.cost)}`);
      if (changes.salePrice) parts.push(`preço de venda ${before.salePrice == null ? "—" : brl(before.salePrice)} → ${row.salePrice == null ? "—" : brl(row.salePrice)}`);
      await logAudit(req, {
        action: "device.price_change",
        entity: "device",
        entityId: id,
        description: `Alterou ${parts.join("; ")} do aparelho ${`${row.model} ${row.capacity} ${row.color}`.trim()}`,
        details: changes,
      });
    }
    return { device: row };
  });

  // DELETE /devices/:id (somente admin). Aparelho vendido — ou que já apareceu
  // em alguma venda — fica no histórico permanente e não pode ser excluído.
  app.delete("/devices/:id", { preHandler: requireCapability("deleteRecords") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [device] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!device) return reply.code(404).send({ error: "Aparelho não encontrado" });

    if (device.status === "Vendido" || (await idsWithSaleHistory([id])).has(id)) {
      return reply.code(409).send({
        error: "Não é permitido excluir um aparelho vendido. Ele deve ser mantido no histórico permanente.",
      });
    }
    await db.delete(devices).where(eq(devices.id, id));
    await logAudit(req, {
      action: "device.delete",
      entity: "device",
      entityId: id,
      description: `Excluiu o aparelho ${device.model} ${device.capacity} ${device.color}`.trim(),
      details: { serialImei: device.serialImei, serial: device.serial, internalSerial: device.internalSerial },
    });
    return { ok: true };
  });
}
