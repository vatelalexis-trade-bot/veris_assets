CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "iam";
--> statement-breakpoint
CREATE TABLE "audit"."audit_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"source" text NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"correlation_id" uuid,
	"result" text NOT NULL,
	"reason" text,
	CONSTRAINT "audit_event_source" CHECK ("audit"."audit_event"."source" IN ('WEB', 'API', 'JOB', 'SYSTEM')),
	CONSTRAINT "audit_event_result" CHECK ("audit"."audit_event"."result" IN ('SUCCESS', 'DENIED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "core"."country" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."currency" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"minor_units" smallint NOT NULL,
	CONSTRAINT "currency_minor_units_range" CHECK ("core"."currency"."minor_units" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "core"."idempotency_key" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_key_user_key" UNIQUE("user_id","key"),
	CONSTRAINT "idempotency_key_status" CHECK ("core"."idempotency_key"."status" IN ('IN_PROGRESS', 'COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "core"."reference_data" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"category" text NOT NULL,
	"code" text NOT NULL,
	"label_en" text NOT NULL,
	"label_fr" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reference_data_category_code" UNIQUE("category","code")
);
--> statement-breakpoint
CREATE TABLE "core"."workflow_transition" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"comment" text,
	"correlation_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."tenant" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"country_code" char(2) NOT NULL,
	"base_currency" char(3) NOT NULL,
	"default_locale" text DEFAULT 'en-GB' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"organization_type" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"logo_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tenant_status" CHECK ("iam"."tenant"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "tenant_default_locale" CHECK ("iam"."tenant"."default_locale" IN ('en-GB', 'fr-FR')),
	CONSTRAINT "tenant_organization_type" CHECK ("iam"."tenant"."organization_type" IN ('ISSUER', 'ASSET_MANAGER', 'FUND'))
);
--> statement-breakpoint
ALTER TABLE "iam"."tenant" ADD CONSTRAINT "tenant_country_code_country_code_fk" FOREIGN KEY ("country_code") REFERENCES "core"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."tenant" ADD CONSTRAINT "tenant_base_currency_currency_code_fk" FOREIGN KEY ("base_currency") REFERENCES "core"."currency"("code") ON DELETE no action ON UPDATE no action;