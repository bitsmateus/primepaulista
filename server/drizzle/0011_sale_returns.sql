CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"refund_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;