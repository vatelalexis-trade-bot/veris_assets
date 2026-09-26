CREATE TABLE "registry"."correction_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"target_entry_id" uuid NOT NULL,
	"proposed_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "correction_request_status" CHECK ("registry"."correction_request"."status" IN ('PROPOSED', 'APPROVED', 'REJECTED')),
	CONSTRAINT "correction_request_four_eyes" CHECK ("registry"."correction_request"."decided_by" <> "registry"."correction_request"."requested_by")
);
--> statement-breakpoint
CREATE TABLE "registry"."subscription_payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"amount" numeric(24, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"prepared_by" uuid,
	"prepared_at" timestamp with time zone,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "subscription_payment_subscriptionId_unique" UNIQUE("subscription_id"),
	CONSTRAINT "subscription_payment_status" CHECK ("registry"."subscription_payment"."status" IN ('PENDING', 'PREPARED', 'CONFIRMED', 'FAILED')),
	CONSTRAINT "subscription_payment_amount_positive" CHECK ("registry"."subscription_payment"."amount" > 0),
	CONSTRAINT "subscription_payment_four_eyes" CHECK ("registry"."subscription_payment"."confirmed_by" <> "registry"."subscription_payment"."prepared_by")
);
--> statement-breakpoint
ALTER TABLE "registry"."correction_request" ADD CONSTRAINT "correction_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."correction_request" ADD CONSTRAINT "correction_request_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."correction_request" ADD CONSTRAINT "correction_request_target_entry_id_ledger_entry_id_fk" FOREIGN KEY ("target_entry_id") REFERENCES "registry"."ledger_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."subscription_payment" ADD CONSTRAINT "subscription_payment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."subscription_payment" ADD CONSTRAINT "subscription_payment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "registry"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_request_issuance" ON "registry"."correction_request" USING btree ("tenant_id","issuance_id","status");