import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index";
import * as schema from "../db/schema/index";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { SETTINGS, isSettingKey, saveSetting } from "../services/settings";

// Backup e restauração de CONFIGURAÇÕES (capacidade manageSecrets = admin).
//  - Exportar: todos os dados de negócio em JSON, SEM hashes de senha e SEM valores de variáveis.
//  - Restaurar: só chaves de app_settings da whitelist (loja, logo, garantia, mensagens de OS…),
//    validadas por zod. Dados de negócio (vendas, estoque…) NÃO são restaurados por aqui
//    (risco de corromper o banco); para isso use o backup do banco de dados.
const BUSINESS_TABLES = {
  profiles: schema.profiles,
  customers: schema.customers,
  suppliers: schema.suppliers,
  devices: schema.devices,
  accessories: schema.accessories,
  stockMovements: schema.stockMovements,
  sales: schema.sales,
  saleItems: schema.saleItems,
  payments: schema.payments,
  tradeIns: schema.tradeIns,
  saleReturns: schema.saleReturns,
  quotes: schema.quotes,
  quoteItems: schema.quoteItems,
  serviceOrders: schema.serviceOrders,
  osNotifications: schema.osNotifications,
  expenses: schema.expenses,
  sangrias: schema.sangrias,
  accountsReceivable: schema.accountsReceivable,
  accountsPayable: schema.accountsPayable,
  sellerCommissions: schema.sellerCommissions,
  funnelColumns: schema.funnelColumns,
  leads: schema.leads,
  leadTasks: schema.leadTasks,
  messageLogs: schema.messageLogs,
  campaigns: schema.campaigns,
  automations: schema.automations,
  quickReplies: schema.quickReplies,
  keywordRules: schema.keywordRules,
  keywordRuleHits: schema.keywordRuleHits,
  aiDocuments: schema.aiDocuments,
  aiEvents: schema.aiEvents,
  aiReviews: schema.aiReviews,
  appSettings: schema.appSettings,
  auditLogs: schema.auditLogs,
} as const;

// Campos que jamais saem no backup
const STRIP: Record<string, string[]> = {
  profiles: ["passwordHash"],
};

export async function backupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("manageSecrets"));

  // GET /backup/export
  app.get("/backup/export", async (req, reply) => {
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const [key, table] of Object.entries(BUSINESS_TABLES)) {
      const rows = (await db.select().from(table as never)) as Record<string, unknown>[];
      const strip = STRIP[key] ?? [];
      tables[key] = rows.map((r) => {
        const o = { ...r };
        for (const f of strip) delete o[f];
        return o;
      });
      counts[key] = rows.length;
    }
    const settings: Record<string, unknown> = {};
    for (const row of tables.appSettings as { key: string; value: unknown }[]) settings[row.key] = row.value;

    await logAudit(req, {
      action: "backup.export",
      entity: "backup",
      description: "Exportou o backup dos dados (JSON)",
      details: { tables: Object.keys(counts).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) },
    });
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="backup-prime-paulista-${new Date().toISOString().slice(0, 10)}.json"`);
    return {
      app: "prime-paulista",
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: (req.user as JwtUser).name,
      note: "Sem hashes de senha e sem valores de variáveis customizadas.",
      settings,
      tables,
    };
  });

  // POST /backup/restore-settings  { settings: { chave: valor, ... } }
  app.post("/backup/restore-settings", { bodyLimit: 3 * 1024 * 1024 }, async (req, reply) => {
    const p = z.object({ settings: z.record(z.string().max(100), z.unknown()) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Arquivo de configurações inválido." });
    const userId = (req.user as JwtUser).sub;
    const restored: string[] = [];
    const ignored: string[] = [];
    const invalid: { key: string; error: string }[] = [];
    for (const [key, value] of Object.entries(p.data.settings)) {
      if (!isSettingKey(key)) {
        ignored.push(key);
        continue;
      }
      const parsed = SETTINGS[key].schema.safeParse(value);
      if (!parsed.success) {
        invalid.push({ key, error: parsed.error.issues[0]?.message ?? "inválido" });
        continue;
      }
      await saveSetting(key, parsed.data, userId);
      restored.push(key);
    }
    await logAudit(req, {
      action: "backup.restore_settings",
      entity: "backup",
      description: `Restaurou ${restored.length} configuração(ões) a partir de um arquivo`,
      details: { restored, ignored, invalid: invalid.map((i) => i.key) },
    });
    return { restored, ignored, invalid };
  });
}
