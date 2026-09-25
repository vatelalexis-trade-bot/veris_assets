CREATE TABLE "iam"."permission" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."role_permission" (
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_code_pk" PRIMARY KEY("role_id","permission_code"),
	CONSTRAINT "role_permission_scope" CHECK ("iam"."role_permission"."scope" IN ('all', 'own'))
);
--> statement-breakpoint
ALTER TABLE "iam"."role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "iam"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."role_permission" ADD CONSTRAINT "role_permission_permission_code_permission_code_fk" FOREIGN KEY ("permission_code") REFERENCES "iam"."permission"("code") ON DELETE no action ON UPDATE no action;