ALTER TABLE "sales" ADD COLUMN "gifts_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "requires_invoice" boolean DEFAULT false NOT NULL;