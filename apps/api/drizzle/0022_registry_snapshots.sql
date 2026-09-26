CREATE TABLE "registry"."registry_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"record_date" date NOT NULL,
	"last_sequence_included" bigint NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checksum" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry"."registry_snapshot_line" (
	"snapshot_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"quantity_held" numeric(20, 4) NOT NULL,
	CONSTRAINT "registry_snapshot_line_snapshot_id_account_id_pk" PRIMARY KEY("snapshot_id","account_id"),
	CONSTRAINT "registry_snapshot_line_positive" CHECK ("registry"."registry_snapshot_line"."quantity_held" > 0)
);
--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot" ADD CONSTRAINT "registry_snapshot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot" ADD CONSTRAINT "registry_snapshot_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot_line" ADD CONSTRAINT "registry_snapshot_line_snapshot_id_registry_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "registry"."registry_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot_line" ADD CONSTRAINT "registry_snapshot_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot_line" ADD CONSTRAINT "registry_snapshot_line_account_id_logical_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "registry"."logical_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."registry_snapshot_line" ADD CONSTRAINT "registry_snapshot_line_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;