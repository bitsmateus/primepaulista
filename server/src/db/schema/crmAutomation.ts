import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { leads } from "./crm";

// Fase 5A: respostas rápidas (modelos de mensagem que o vendedor insere na conversa)
export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("Outro"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Fase 5A: regras de resposta automática por palavra-chave
export const keywordRules = pgTable("keyword_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Outro"),
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  match: text("match").notNull().default("any"), // 'any' | 'all'
  replyBody: text("reply_body").notNull().default(""),
  action: text("action").notNull().default("reply"), // 'reply' | 'ai'
  aiKind: text("ai_kind").notNull().default("geral"), // Fase 5B: preco | troca | os | geral (usado quando action = 'ai')
  priority: integer("priority").notNull().default(1), // menor número = mais prioritária
  active: boolean("active").notNull().default(true),
  schedule: jsonb("schedule").notNull().default(sql`'{}'::jsonb`), // { mode, days, from, to, startDate, endDate }
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cada disparo (tentativa de resposta) de uma regra
export const keywordRuleHits = pgTable("keyword_rule_hits", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => keywordRules.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  inboundText: text("inbound_text").notNull().default(""),
  matched: text("matched").notNull().default(""), // palavras-chave que casaram (separadas por vírgula)
  replied: boolean("replied").notNull().default(false),
  error: text("error"),
  reviewId: uuid("review_id"), // Fase 5B: resposta da IA enviada para a fila de revisão
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ruleIdx: index("keyword_rule_hits_rule_idx").on(t.ruleId, t.createdAt),
  phoneIdx: index("keyword_rule_hits_phone_idx").on(t.phone),
}));

export type QuickReply = typeof quickReplies.$inferSelect;
export type KeywordRuleRow = typeof keywordRules.$inferSelect;
export type KeywordRuleHit = typeof keywordRuleHits.$inferSelect;
