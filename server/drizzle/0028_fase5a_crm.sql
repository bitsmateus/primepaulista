CREATE TABLE "keyword_rule_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"lead_id" uuid,
	"inbound_text" text DEFAULT '' NOT NULL,
	"matched" text DEFAULT '' NOT NULL,
	"replied" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Outro' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"match" text DEFAULT 'any' NOT NULL,
	"reply_body" text DEFAULT '' NOT NULL,
	"action" text DEFAULT 'reply' NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'Outro' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "message_logs" ADD COLUMN "direction" text DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_logs" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "message_logs" ADD COLUMN "instance_id" uuid;--> statement-breakpoint
ALTER TABLE "message_logs" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_instances" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "keyword_rule_hits" ADD CONSTRAINT "keyword_rule_hits_rule_id_keyword_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."keyword_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rule_hits" ADD CONSTRAINT "keyword_rule_hits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_rule_hits_rule_idx" ON "keyword_rule_hits" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "keyword_rule_hits_phone_idx" ON "keyword_rule_hits" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "message_logs_recipient_idx" ON "message_logs" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_logs_instance_ext_uidx" ON "message_logs" USING btree ("instance_id","external_id") WHERE external_id is not null;--> statement-breakpoint
-- Fase 5A: segredo do webhook para os numeros de WhatsApp que ja existem (aleatorio, 64 hex)
UPDATE "whatsapp_instances" SET "webhook_secret" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "webhook_secret" IS NULL;
