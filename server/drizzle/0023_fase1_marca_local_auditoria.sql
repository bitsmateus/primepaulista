CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"entity_id" text,
	"description" text DEFAULT '' NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "brand" text DEFAULT 'Apple' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "location" text DEFAULT 'Estoque' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");