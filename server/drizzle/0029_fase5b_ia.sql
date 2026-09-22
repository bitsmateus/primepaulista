CREATE TABLE "ai_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'OUTRO' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"file_name" text,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'geral' NOT NULL,
	"origin" text DEFAULT 'sugestao' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"lead_id" uuid,
	"question" text DEFAULT '' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"confidence" real,
	"needs_human" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'sugerida' NOT NULL,
	"error" text,
	"latency_ms" integer,
	"tokens" integer,
	"model" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"phone" text NOT NULL,
	"lead_id" uuid,
	"instance_id" uuid,
	"kind" text DEFAULT 'geral' NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"suggested_reply" text DEFAULT '' NOT NULL,
	"confidence" real,
	"reason" text DEFAULT '' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"final_reply" text,
	"reviewed_by" uuid,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone,
	"sent" boolean DEFAULT false NOT NULL,
	"send_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_rule_hits" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_rules" ADD COLUMN "ai_kind" text DEFAULT 'geral' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_event_id_ai_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ai_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_events_created_idx" ON "ai_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_events_phone_idx" ON "ai_events" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "ai_reviews_status_idx" ON "ai_reviews" USING btree ("status","created_at");