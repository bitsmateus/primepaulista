ALTER TABLE "seller_commissions" DROP CONSTRAINT "seller_commissions_seller_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "seller_commissions" ALTER COLUMN "seller_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_commissions" DROP COLUMN "seller_id";--> statement-breakpoint
ALTER TABLE "seller_commissions" ADD CONSTRAINT "seller_commissions_seller_name_unique" UNIQUE("seller_name");