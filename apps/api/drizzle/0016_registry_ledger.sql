CREATE TABLE "registry"."allocation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"allocation_round_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"allocated_units" numeric(20, 4) NOT NULL,
	"amount" numeric(24, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "allocation_round_subscription" UNIQUE("allocation_round_id","subscription_id"),
	CONSTRAINT "allocation_units_not_negative" CHECK ("registry"."allocation"."allocated_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "registry"."allocation_round" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"method" text DEFAULT 'MANUAL' NOT NULL,
	"rule_applied" text,
	"total_allocated_units" numeric(20, 4) DEFAULT '0' NOT NULL,
	"minimum_waiver_justification" text,
	"proposed_by" uuid,
	"proposed_at" timestamp with time zone,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"rejection_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "allocation_round_status" CHECK ("registry"."allocation_round"."status" IN ('DRAFT', 'PROPOSED', 'VALIDATED', 'REJECTED')),
	CONSTRAINT "allocation_round_method" CHECK ("registry"."allocation_round"."method" IN ('MANUAL')),
	CONSTRAINT "allocation_round_four_eyes" CHECK ("registry"."allocation_round"."validated_by" <> "registry"."allocation_round"."proposed_by")
);
--> statement-breakpoint
CREATE TABLE "registry"."ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"sequence_no" bigint NOT NULL,
	"type" text NOT NULL,
	"source_account_id" uuid,
	"destination_account_id" uuid,
	"quantity" numeric(20, 4) NOT NULL,
	"effective_date" date NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"business_reference" text NOT NULL,
	"status" text DEFAULT 'POSTED' NOT NULL,
	"reverses_entry_id" uuid,
	"previous_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"initiated_by_user_id" uuid,
	"initiated_by_service" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text,
	CONSTRAINT "ledger_entry_sequence" UNIQUE("issuance_id","sequence_no"),
	CONSTRAINT "ledger_entry_type" CHECK ("registry"."ledger_entry"."type" IN ('ISSUANCE', 'ALLOCATION', 'TRANSFER', 'BLOCK', 'UNBLOCK', 'REDEMPTION', 'CANCELLATION', 'CORRECTION')),
	CONSTRAINT "ledger_entry_status" CHECK ("registry"."ledger_entry"."status" IN ('POSTED')),
	CONSTRAINT "ledger_entry_quantity_positive" CHECK ("registry"."ledger_entry"."quantity" > 0),
	CONSTRAINT "ledger_entry_has_account" CHECK ("registry"."ledger_entry"."source_account_id" IS NOT NULL OR "registry"."ledger_entry"."destination_account_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "registry"."ledger_head" (
	"issuance_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"last_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry"."logical_account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"investor_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logical_account_owner_unique" UNIQUE NULLS NOT DISTINCT("issuance_id","investor_id"),
	CONSTRAINT "logical_account_type" CHECK ("registry"."logical_account"."type" IN ('ISSUER_TREASURY', 'INVESTOR')),
	CONSTRAINT "logical_account_status" CHECK ("registry"."logical_account"."status" IN ('ACTIVE', 'FROZEN')),
	CONSTRAINT "logical_account_owner" CHECK (("registry"."logical_account"."type" = 'ISSUER_TREASURY') = ("registry"."logical_account"."investor_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "registry"."position" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"investor_id" uuid,
	"quantity_held" numeric(20, 4) DEFAULT '0' NOT NULL,
	"quantity_blocked" numeric(20, 4) DEFAULT '0' NOT NULL,
	"quantity_available" numeric(20, 4) GENERATED ALWAYS AS (quantity_held - quantity_blocked) STORED NOT NULL,
	"acquisition_amount" numeric(24, 4) DEFAULT '0' NOT NULL,
	"currency" char(3) NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_accountId_unique" UNIQUE("account_id"),
	CONSTRAINT "position_held_not_negative" CHECK ("registry"."position"."quantity_held" >= 0),
	CONSTRAINT "position_blocked_not_negative" CHECK ("registry"."position"."quantity_blocked" >= 0),
	CONSTRAINT "position_blocked_within_held" CHECK ("registry"."position"."quantity_blocked" <= "registry"."position"."quantity_held"),
	CONSTRAINT "position_acquisition_not_negative" CHECK ("registry"."position"."acquisition_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "registry"."allocation" ADD CONSTRAINT "allocation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."allocation" ADD CONSTRAINT "allocation_allocation_round_id_allocation_round_id_fk" FOREIGN KEY ("allocation_round_id") REFERENCES "registry"."allocation_round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."allocation" ADD CONSTRAINT "allocation_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "registry"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."allocation" ADD CONSTRAINT "allocation_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."allocation_round" ADD CONSTRAINT "allocation_round_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."allocation_round" ADD CONSTRAINT "allocation_round_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_entry" ADD CONSTRAINT "ledger_entry_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_entry" ADD CONSTRAINT "ledger_entry_source_account_id_logical_account_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "registry"."logical_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_entry" ADD CONSTRAINT "ledger_entry_destination_account_id_logical_account_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "registry"."logical_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_head" ADD CONSTRAINT "ledger_head_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."ledger_head" ADD CONSTRAINT "ledger_head_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."logical_account" ADD CONSTRAINT "logical_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."logical_account" ADD CONSTRAINT "logical_account_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."logical_account" ADD CONSTRAINT "logical_account_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."position" ADD CONSTRAINT "position_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."position" ADD CONSTRAINT "position_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."position" ADD CONSTRAINT "position_account_id_logical_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "registry"."logical_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."position" ADD CONSTRAINT "position_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_round_one_active" ON "registry"."allocation_round" USING btree ("issuance_id") WHERE "registry"."allocation_round"."status" <> 'REJECTED';--> statement-breakpoint
CREATE INDEX "ledger_entry_source" ON "registry"."ledger_entry" USING btree ("tenant_id","source_account_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_destination" ON "registry"."ledger_entry" USING btree ("tenant_id","destination_account_id");--> statement-breakpoint
CREATE INDEX "position_issuance" ON "registry"."position" USING btree ("tenant_id","issuance_id");--> statement-breakpoint
CREATE INDEX "position_investor" ON "registry"."position" USING btree ("tenant_id","investor_id");