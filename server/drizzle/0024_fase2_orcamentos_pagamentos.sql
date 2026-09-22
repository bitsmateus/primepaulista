CREATE TYPE "public"."quote_status" AS ENUM('Aberto', 'Enviado', 'Aprovado', 'Recusado', 'Convertido');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'Mercado Pago / Link de Pagamento';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'Outro / Verificação Externa';--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_type" "product_type" NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"serial" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "quotes_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" uuid,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"seller_id" uuid,
	"seller_name" text DEFAULT '' NOT NULL,
	"status" "quote_status" DEFAULT 'Aberto' NOT NULL,
	"valid_until" timestamp with time zone,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"converted_sale_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "origin" text DEFAULT 'Balcão' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at");