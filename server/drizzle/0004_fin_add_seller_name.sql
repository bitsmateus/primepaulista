ALTER TABLE "seller_commissions" ALTER COLUMN "seller_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_commissions" ADD COLUMN "seller_name" text;