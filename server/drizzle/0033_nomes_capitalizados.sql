-- Padroniza nomes de clientes já cadastrados: primeira letra de cada palavra em maiúscula.
UPDATE "customers" SET "name" = initcap("name") WHERE "name" <> initcap("name");--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' De( |$)', ' de\1', 'g') WHERE "name" ~ ' De( |$)';--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' Da( |$)', ' da\1', 'g') WHERE "name" ~ ' Da( |$)';--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' Do( |$)', ' do\1', 'g') WHERE "name" ~ ' Do( |$)';--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' Das( |$)', ' das\1', 'g') WHERE "name" ~ ' Das( |$)';--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' Dos( |$)', ' dos\1', 'g') WHERE "name" ~ ' Dos( |$)';--> statement-breakpoint
UPDATE "customers" SET "name" = regexp_replace("name", ' E( |$)', ' e\1', 'g') WHERE "name" ~ ' E( |$)';
