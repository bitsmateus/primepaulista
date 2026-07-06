ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "imei2" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "serial" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "imei2" text;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "serial" text;