import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { leads } from "./crm";

// Fase 5B: IA (Gemini) no atendimento.

// Base de conhecimento (manuais, tabela de preços, políticas...). Só documentos ATIVOS entram no prompt.
export const aiDocuments = pgTable("ai_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category").notNull().default("OUTRO"), // MANUAL | TABELA_PRECOS | POLITICA_GARANTIA | POLITICA_PAGAMENTO | OUTRO
  content: text("content").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  fileName: text("file_name"),
  tokenEstimate: integer("token_estimate").notNull().default(0),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cada pergunta respondida (ou tentada) pela IA: métricas e auditoria.
// LGPD: `question` guarda o texto JÁ SEM CPF, e-mail, telefone e endereço (o mesmo que foi enviado ao Google).
export const aiEvents = pgTable("ai_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull().default("geral"), // preco | troca | os | geral
  origin: text("origin").notNull().default("sugestao"), // webhook | sugestao | playground
  phone: text("phone").notNull().default(""),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  question: text("question").notNull().default(""),
  reply: text("reply").notNull().default(""),
  confidence: real("confidence"),
  needsHuman: boolean("needs_human").notNull().default(false),
  // sugerida | usada | enviada_humano | descartada | enviada_auto | em_revisao | aprovada | editada | simulada | erro | falha_envio
  status: text("status").notNull().default("sugerida"),
  error: text("error"),
  latencyMs: integer("latency_ms"),
  tokens: integer("tokens"),
  model: text("model"),
  sources: jsonb("sources").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  createdIdx: index("ai_events_created_idx").on(t.createdAt),
  phoneIdx: index("ai_events_phone_idx").on(t.phone, t.createdAt),
}));

// Fila de revisão: respostas da IA que um humano precisa aprovar antes de sair
export const aiReviews = pgTable("ai_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => aiEvents.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  instanceId: uuid("instance_id"), // número de WhatsApp que recebeu a pergunta (a resposta sai por ele)
  kind: text("kind").notNull().default("geral"),
  question: text("question").notNull().default(""),
  suggestedReply: text("suggested_reply").notNull().default(""),
  confidence: real("confidence"),
  reason: text("reason").notNull().default(""), // por que foi para revisão
  sources: jsonb("sources").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pendente"), // pendente | aprovado | editado | descartado
  finalReply: text("final_reply"),
  reviewedBy: uuid("reviewed_by"),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  sent: boolean("sent").notNull().default(false),
  sendError: text("send_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("ai_reviews_status_idx").on(t.status, t.createdAt),
}));

export type AiDocument = typeof aiDocuments.$inferSelect;
export type AiEvent = typeof aiEvents.$inferSelect;
export type AiReview = typeof aiReviews.$inferSelect;
