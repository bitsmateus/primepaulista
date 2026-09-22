ALTER TYPE "public"."role" ADD VALUE 'gerente';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'estoquista';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'financeiro';--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"document" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"value_enc" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_variables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill (idempotente): cria fornecedores a partir dos nomes ja digitados nos aparelhos e liga supplier_id
INSERT INTO "suppliers" ("name")
SELECT DISTINCT ON (lower(btrim(d."supplier"))) btrim(d."supplier")
FROM "devices" d
WHERE d."supplier" IS NOT NULL AND btrim(d."supplier") <> ''
  AND NOT EXISTS (SELECT 1 FROM "suppliers" s WHERE lower(btrim(s."name")) = lower(btrim(d."supplier")))
ORDER BY lower(btrim(d."supplier")), (btrim(d."supplier") = lower(btrim(d."supplier"))), btrim(d."supplier");
--> statement-breakpoint
UPDATE "devices" d SET "supplier_id" = s."id"
FROM "suppliers" s
WHERE d."supplier_id" IS NULL AND d."supplier" IS NOT NULL AND btrim(d."supplier") <> ''
  AND lower(btrim(s."name")) = lower(btrim(d."supplier"));
