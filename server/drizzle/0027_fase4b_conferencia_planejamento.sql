CREATE TABLE "weekly_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"weekday" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assignee_id" uuid,
	"assignee_name" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"remind_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"reminder_message" text DEFAULT '' NOT NULL,
	"whatsapp_status" text,
	"whatsapp_error" text,
	"whatsapp_at" timestamp with time zone,
	"created_by" uuid,
	"created_by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "audit_status" text DEFAULT 'Aguardando' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "audit_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "audited_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "audited_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "audited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekly_tasks" ADD CONSTRAINT "weekly_tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_tasks" ADD CONSTRAINT "weekly_tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_tasks_week_idx" ON "weekly_tasks" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "weekly_tasks_assignee_idx" ON "weekly_tasks" USING btree ("assignee_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_audited_by_profiles_id_fk" FOREIGN KEY ("audited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_audit_status_idx" ON "payments" USING btree ("audit_status");