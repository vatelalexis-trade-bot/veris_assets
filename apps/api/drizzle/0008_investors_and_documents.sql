CREATE SCHEMA "investor";
--> statement-breakpoint
CREATE TABLE "core"."document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"confidentiality" text NOT NULL,
	"owner_type" text NOT NULL,
	"issuance_id" uuid,
	"investor_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_status" CHECK ("core"."document"."status" IN ('ACTIVE', 'ARCHIVED')),
	CONSTRAINT "document_confidentiality" CHECK ("core"."document"."confidentiality" IN ('INVESTOR_VISIBLE', 'INTERNAL', 'CONFIDENTIAL')),
	CONSTRAINT "document_owner_type" CHECK ("core"."document"."owner_type" IN ('INVESTOR', 'ISSUANCE', 'TENANT'))
);
--> statement-breakpoint
CREATE TABLE "core"."document_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" char(64) NOT NULL,
	"scan_status" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_number" UNIQUE("document_id","version"),
	CONSTRAINT "document_version_scan_status" CHECK ("core"."document_version"."scan_status" IN ('CLEAN', 'REJECTED')),
	CONSTRAINT "document_version_size" CHECK ("core"."document_version"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "investor"."beneficial_owner" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"nationality" char(2),
	"ownership_percentage" numeric(5, 2) NOT NULL,
	"date_of_birth" date,
	"pseudonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "beneficial_owner_percentage" CHECK ("investor"."beneficial_owner"."ownership_percentage" > 0 AND "investor"."beneficial_owner"."ownership_percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "investor"."compliance_comment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor"."investor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"legal_form" text,
	"registration_number" text,
	"tax_id" text,
	"country_of_incorporation" char(2) NOT NULL,
	"address" jsonb,
	"contact_email" text,
	"phone" text,
	"classification" text NOT NULL,
	"profile_status" text DEFAULT 'DRAFT' NOT NULL,
	"kyc_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"kyc_last_review_date" date,
	"kyc_expiry_date" date,
	"risk_level" text,
	"eligibility_status" text DEFAULT 'NOT_ASSESSED' NOT NULL,
	"recipient_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "investor_recipient_code" UNIQUE("tenant_id","recipient_code"),
	CONSTRAINT "investor_type" CHECK ("investor"."investor"."type" IN ('LEGAL_ENTITY', 'NATURAL_PERSON')),
	CONSTRAINT "investor_classification" CHECK ("investor"."investor"."classification" IN ('PROFESSIONAL', 'ELIGIBLE_COUNTERPARTY')),
	CONSTRAINT "investor_profile_status" CHECK ("investor"."investor"."profile_status" IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
	CONSTRAINT "investor_kyc_status" CHECK ("investor"."investor"."kyc_status" IN ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')),
	CONSTRAINT "investor_eligibility_status" CHECK ("investor"."investor"."eligibility_status" IN ('NOT_ASSESSED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED')),
	CONSTRAINT "investor_risk_level" CHECK ("investor"."investor"."risk_level" IN ('LOW', 'MEDIUM', 'HIGH'))
);
--> statement-breakpoint
CREATE TABLE "investor"."investor_representative" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"date_of_birth" date,
	"pseudonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor"."kyc_case" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"prepared_by" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"valid_until" date,
	"provider_reference" text,
	"provider_outcome" text,
	"suggested_risk_level" text,
	"expiry_warning_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "kyc_case_four_eyes" CHECK ("investor"."kyc_case"."decided_by" IS NULL OR "investor"."kyc_case"."decided_by" <> "investor"."kyc_case"."prepared_by"),
	CONSTRAINT "kyc_case_status" CHECK ("investor"."kyc_case"."status" IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')),
	CONSTRAINT "kyc_case_provider_outcome" CHECK ("investor"."kyc_case"."provider_outcome" IN ('CLEAR', 'REVIEW'))
);
--> statement-breakpoint
CREATE TABLE "investor"."kyc_document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kyc_case_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_document_once" UNIQUE("kyc_case_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "core"."document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "core"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."beneficial_owner" ADD CONSTRAINT "beneficial_owner_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."beneficial_owner" ADD CONSTRAINT "beneficial_owner_nationality_country_code_fk" FOREIGN KEY ("nationality") REFERENCES "core"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."compliance_comment" ADD CONSTRAINT "compliance_comment_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."investor" ADD CONSTRAINT "investor_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."investor" ADD CONSTRAINT "investor_country_of_incorporation_country_code_fk" FOREIGN KEY ("country_of_incorporation") REFERENCES "core"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."investor_representative" ADD CONSTRAINT "investor_representative_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."kyc_case" ADD CONSTRAINT "kyc_case_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."kyc_document" ADD CONSTRAINT "kyc_document_kyc_case_id_kyc_case_id_fk" FOREIGN KEY ("kyc_case_id") REFERENCES "investor"."kyc_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor"."kyc_document" ADD CONSTRAINT "kyc_document_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "core"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_tenant_investor" ON "core"."document" USING btree ("tenant_id","investor_id");--> statement-breakpoint
CREATE INDEX "investor_tenant_legal_name" ON "investor"."investor" USING btree ("tenant_id","legal_name");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_case_one_open_per_investor" ON "investor"."kyc_case" USING btree ("investor_id") WHERE "investor"."kyc_case"."status" IN ('IN_PROGRESS', 'PENDING_REVIEW');--> statement-breakpoint
CREATE INDEX "kyc_case_tenant_status" ON "investor"."kyc_case" USING btree ("tenant_id","status");