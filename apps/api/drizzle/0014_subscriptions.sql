CREATE SCHEMA "registry";
--> statement-breakpoint
CREATE TABLE "registry"."subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"requested_units" numeric(20, 0) NOT NULL,
	"requested_amount" numeric(24, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"allocated_units" numeric(20, 0),
	"amount_due" numeric(24, 4),
	"payment_reference" text,
	"documents_accepted_at" timestamp with time zone,
	"eligibility_declared_at" timestamp with time zone,
	"comment" text,
	"submitted_at" timestamp with time zone,
	"eligibility_assessment_id" uuid,
	"reviewed_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "subscription_status" CHECK ("registry"."subscription"."status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ALLOCATED', 'CANCELLED')),
	CONSTRAINT "subscription_units_positive" CHECK ("registry"."subscription"."requested_units" > 0),
	CONSTRAINT "subscription_amount_positive" CHECK ("registry"."subscription"."requested_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "registry"."subscription" ADD CONSTRAINT "subscription_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."subscription" ADD CONSTRAINT "subscription_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."subscription" ADD CONSTRAINT "subscription_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_issuance_status" ON "registry"."subscription" USING btree ("tenant_id","issuance_id","status");--> statement-breakpoint
CREATE INDEX "subscription_investor" ON "registry"."subscription" USING btree ("tenant_id","investor_id");