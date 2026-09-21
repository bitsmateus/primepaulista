ALTER TYPE "public"."os_status" ADD VALUE 'Em Diagnóstico' BEFORE 'Aguardando Peça';--> statement-breakpoint
ALTER TYPE "public"."os_status" ADD VALUE 'Aguardando Aprovação' BEFORE 'Aguardando Peça';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "os_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"event" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "message_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "origin" text DEFAULT 'Cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "prev_device_status" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "prev_device_location" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "cost_responsibility" text DEFAULT 'Cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_notifications" ADD CONSTRAINT "os_notifications_os_id_service_orders_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."service_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_notifications" ADD CONSTRAINT "os_notifications_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_notifications_os_id_idx" ON "os_notifications" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "os_notifications_created_at_idx" ON "os_notifications" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_orders_device_id_idx" ON "service_orders" USING btree ("device_id");