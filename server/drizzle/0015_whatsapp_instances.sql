CREATE TABLE "whatsapp_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Principal' NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"instance_url" text DEFAULT '' NOT NULL,
	"instance_name" text DEFAULT '' NOT NULL,
	"owner_id" uuid,
	"owner_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
