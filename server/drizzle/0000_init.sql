CREATE TYPE "public"."accessory_category" AS ENUM('Capas', 'Películas', 'Cabos e Fontes');--> statement-breakpoint
CREATE TYPE "public"."device_condition" AS ENUM('Lacrado', 'Seminovo');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('Disponível', 'Vendido', 'Em Manutenção', 'Reservado');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('Aluguel', 'Condomínio', 'Impostos (MEI)', 'Tráfego Pago', 'Salários', 'Pro-labore', 'Outros');--> statement-breakpoint
CREATE TYPE "public"."lead_origin" AS ENUM('Instagram', 'Indicação', 'Tráfego Pago');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'failed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."os_photo_type" AS ENUM('antes', 'depois');--> statement-breakpoint
CREATE TYPE "public"."os_priority" AS ENUM('Normal', 'Urgente', 'Crítico');--> statement-breakpoint
CREATE TYPE "public"."os_status" AS ENUM('Aguardando Diagnóstico', 'Aguardando Peça', 'Em Reparo', 'Pronto para Retirada', 'Entregue / Finalizado');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('device', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('pendente', 'pago', 'atrasado');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'vendedor', 'tecnico');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'vendedor' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cpf" text,
	"whatsapp" text,
	"birthday" text,
	"lead_origin" "lead_origin",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accessories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "accessory_category" NOT NULL,
	"subcategory" text,
	"compatible_model" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 0 NOT NULL,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"price" numeric(12, 2),
	"barcode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"capacity" text NOT NULL,
	"color" text NOT NULL,
	"condition" "device_condition" NOT NULL,
	"battery_health" integer DEFAULT 100 NOT NULL,
	"supplier" text,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"serial_imei" text,
	"internal_serial" text,
	"status" "device_status" DEFAULT 'Disponível' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_type" "product_type" NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" "movement_type" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"installments" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_type" "product_type" NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"serial" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"seller_id" uuid,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trade_in_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"imei" text,
	"model" text,
	"health_description" text,
	"value" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_order_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_order_id" uuid NOT NULL,
	"type" "os_photo_type" NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_cpf" text,
	"model" text NOT NULL,
	"color" text,
	"serial_imei" text,
	"battery_health" integer,
	"reported_issue" text NOT NULL,
	"technical_notes" text,
	"checklist_capa" boolean DEFAULT false NOT NULL,
	"checklist_chip" boolean DEFAULT false NOT NULL,
	"checklist_carregador" boolean DEFAULT false NOT NULL,
	"status" "os_status" DEFAULT 'Aguardando Diagnóstico' NOT NULL,
	"priority" "os_priority" DEFAULT 'Normal' NOT NULL,
	"part_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"labor_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"part_description" text,
	"part_from_stock" boolean DEFAULT false NOT NULL,
	"stock_accessory_id" uuid,
	"charged_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxes" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"template_type" text,
	"message" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"model_interest" text,
	"origin" text,
	"status" text DEFAULT 'Novo' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid,
	"recipient_name" text,
	"recipient_phone" text,
	"template_type" text,
	"message" text,
	"status" "message_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid,
	"customer_id" uuid,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"due_date" timestamp with time zone,
	"status" "receivable_status" DEFAULT 'pendente' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sangrias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"justification" text,
	"user_id" uuid,
	"date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"device_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"accessory_percent" numeric(5, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_photos" ADD CONSTRAINT "service_order_photos_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_stock_accessory_id_accessories_id_fk" FOREIGN KEY ("stock_accessory_id") REFERENCES "public"."accessories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sangrias" ADD CONSTRAINT "sangrias_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_commissions" ADD CONSTRAINT "seller_commissions_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;