CREATE TABLE "registry"."transfer_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"from_investor_id" uuid NOT NULL,
	"to_investor_id" uuid NOT NULL,
	"recipient_code" text NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"indicative_price" numeric(24, 4),
	"indicative_price_currency" char(3),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"block_entry_id" uuid,
	"transfer_entry_id" uuid,
	"eligibility_assessment_id" uuid,
	"requested_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transfer_request_status" CHECK ("registry"."transfer_request"."status" IN ('DRAFT', 'SUBMITTED', 'COMPLIANCE_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
	CONSTRAINT "transfer_request_quantity_positive" CHECK ("registry"."transfer_request"."quantity" > 0),
	CONSTRAINT "transfer_request_not_to_self" CHECK ("registry"."transfer_request"."from_investor_id" <> "registry"."transfer_request"."to_investor_id")
);
--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_from_investor_id_investor_id_fk" FOREIGN KEY ("from_investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_to_investor_id_investor_id_fk" FOREIGN KEY ("to_investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_block_entry_id_ledger_entry_id_fk" FOREIGN KEY ("block_entry_id") REFERENCES "registry"."ledger_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."transfer_request" ADD CONSTRAINT "transfer_request_transfer_entry_id_ledger_entry_id_fk" FOREIGN KEY ("transfer_entry_id") REFERENCES "registry"."ledger_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_request_issuance_status" ON "registry"."transfer_request" USING btree ("tenant_id","issuance_id","status");--> statement-breakpoint
CREATE INDEX "transfer_request_from" ON "registry"."transfer_request" USING btree ("tenant_id","from_investor_id");