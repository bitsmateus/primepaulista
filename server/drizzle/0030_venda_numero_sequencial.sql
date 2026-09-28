CREATE SEQUENCE "sales_sale_number_seq";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_number" integer;--> statement-breakpoint
UPDATE "sales" SET "sale_number" = sub.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS rn FROM "sales") sub
WHERE "sales"."id" = sub."id";--> statement-breakpoint
SELECT setval('sales_sale_number_seq', COALESCE((SELECT MAX("sale_number") FROM "sales"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "sale_number" SET DEFAULT nextval('sales_sale_number_seq');--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "sale_number" SET NOT NULL;--> statement-breakpoint
ALTER SEQUENCE "sales_sale_number_seq" OWNED BY "sales"."sale_number";--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_number_unique" UNIQUE("sale_number");
