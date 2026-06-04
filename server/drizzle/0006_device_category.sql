ALTER TABLE "devices" ALTER COLUMN "capacity" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "category" text DEFAULT 'iPhone' NOT NULL;