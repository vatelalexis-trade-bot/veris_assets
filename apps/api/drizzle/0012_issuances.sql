CREATE SCHEMA "issuance";
--> statement-breakpoint
CREATE TABLE "issuance"."eligibility_rule_set" (
	"issuance_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"professional_only" boolean DEFAULT true NOT NULL,
	"allowed_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_investor_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_classifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"kyc_required" boolean DEFAULT true NOT NULL,
	"kyc_min_remaining_validity_days" integer DEFAULT 0 NOT NULL,
	"transfers_allowed" boolean DEFAULT false NOT NULL,
	"manual_transfer_approval" boolean DEFAULT true NOT NULL,
	"max_investors" integer,
	"lockup_end_date" date,
	"rules_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "eligibility_rule_set_kyc_days" CHECK ("issuance"."eligibility_rule_set"."kyc_min_remaining_validity_days" >= 0),
	CONSTRAINT "eligibility_rule_set_max_investors" CHECK ("issuance"."eligibility_rule_set"."max_investors" IS NULL OR "issuance"."eligibility_rule_set"."max_investors" > 0)
);
--> statement-breakpoint
CREATE TABLE "issuance"."investor_invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"status" text DEFAULT 'INVITED' NOT NULL,
	"eligibility_assessment_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "investor_invitation_once" UNIQUE("issuance_id","investor_id"),
	CONSTRAINT "investor_invitation_status" CHECK ("issuance"."investor_invitation"."status" IN ('INVITED', 'REVOKED'))
);
--> statement-breakpoint
CREATE TABLE "issuance"."issuance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"asset_category" text,
	"country_code" char(2),
	"currency" char(3),
	"legal_issuer_name" text,
	"spv_name" text,
	"illustration_document_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"wizard_step" text DEFAULT 'GENERAL' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"status_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "issuance_code" UNIQUE("tenant_id","code"),
	CONSTRAINT "issuance_status" CHECK ("issuance"."issuance"."status" IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED', 'ALLOCATED', 'ACTIVE', 'MATURED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "issuance"."issuance_document" (
	"issuance_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuance_document_issuance_id_document_id_pk" PRIMARY KEY("issuance_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "issuance"."issuance_terms" (
	"issuance_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_amount" numeric(24, 4),
	"minimum_amount" numeric(24, 4),
	"maximum_amount" numeric(24, 4),
	"nominal_value" numeric(24, 4),
	"total_units" numeric(20, 0),
	"interest_rate" numeric(9, 6),
	"rate_type" text DEFAULT 'FIXED',
	"distribution_frequency" text,
	"day_count" text,
	"issue_date" date,
	"maturity_date" date,
	"subscription_start_date" date,
	"subscription_end_date" date,
	"min_subscription_amount" numeric(24, 4),
	"max_amount_per_investor" numeric(24, 4),
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"principal_repayment" text DEFAULT 'AT_MATURITY' NOT NULL,
	"rounding_method" text DEFAULT 'HALF_EVEN' NOT NULL,
	"business_day_convention" text DEFAULT 'FOLLOWING' NOT NULL,
	"record_date_offset_business_days" integer DEFAULT 1 NOT NULL,
	"early_redemption_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "issuance_terms_grace" CHECK ("issuance"."issuance_terms"."grace_period_days" >= 0),
	CONSTRAINT "issuance_terms_record_offset" CHECK ("issuance"."issuance_terms"."record_date_offset_business_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "issuance"."eligibility_rule_set" ADD CONSTRAINT "eligibility_rule_set_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."investor_invitation" ADD CONSTRAINT "investor_invitation_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."investor_invitation" ADD CONSTRAINT "investor_invitation_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance" ADD CONSTRAINT "issuance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance" ADD CONSTRAINT "issuance_country_code_country_code_fk" FOREIGN KEY ("country_code") REFERENCES "core"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance" ADD CONSTRAINT "issuance_currency_currency_code_fk" FOREIGN KEY ("currency") REFERENCES "core"."currency"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance" ADD CONSTRAINT "issuance_illustration_document_id_document_id_fk" FOREIGN KEY ("illustration_document_id") REFERENCES "core"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance_document" ADD CONSTRAINT "issuance_document_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance_document" ADD CONSTRAINT "issuance_document_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "core"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance"."issuance_terms" ADD CONSTRAINT "issuance_terms_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issuance_tenant_status" ON "issuance"."issuance" USING btree ("tenant_id","status");