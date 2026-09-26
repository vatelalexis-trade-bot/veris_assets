CREATE SCHEMA "servicing";
--> statement-breakpoint
CREATE TABLE "servicing"."coupon_schedule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_date" date NOT NULL,
	"record_date" date NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"distribution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_schedule_sequence" UNIQUE("issuance_id","sequence"),
	CONSTRAINT "coupon_schedule_type" CHECK ("servicing"."coupon_schedule"."type" IN ('COUPON', 'PRINCIPAL')),
	CONSTRAINT "coupon_schedule_status" CHECK ("servicing"."coupon_schedule"."status" IN ('SCHEDULED', 'DISTRIBUTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "servicing"."distribution" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuance_id" uuid NOT NULL,
	"coupon_schedule_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"snapshot_id" uuid,
	"calculation_no" integer DEFAULT 0 NOT NULL,
	"day_count" text,
	"period_fraction" numeric(40, 20),
	"rate" numeric(12, 8),
	"nominal_value" numeric(24, 4),
	"currency" char(3) NOT NULL,
	"rounding_method" text,
	"total_gross_amount" numeric(24, 4),
	"total_unrounded_amount" numeric(40, 20),
	"rounding_difference" numeric(40, 20),
	"beneficiary_count" integer,
	"calculation_version" text,
	"calculated_at" timestamp with time zone,
	"prepared_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"status_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "distribution_status" CHECK ("servicing"."distribution"."status" IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PAYMENT_INSTRUCTION_GENERATED', 'PAID', 'FAILED', 'CANCELLED')),
	CONSTRAINT "distribution_type" CHECK ("servicing"."distribution"."type" IN ('COUPON', 'PRINCIPAL')),
	CONSTRAINT "distribution_four_eyes" CHECK ("servicing"."distribution"."approved_by" <> "servicing"."distribution"."prepared_by")
);
--> statement-breakpoint
CREATE TABLE "servicing"."distribution_line" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"calculation_no" integer NOT NULL,
	"investor_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"eligible_quantity" numeric(20, 4) NOT NULL,
	"gross_amount_unrounded" numeric(40, 20) NOT NULL,
	"gross_amount" numeric(24, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"anomaly_code" text,
	CONSTRAINT "distribution_line_account" UNIQUE("distribution_id","calculation_no","account_id")
);
--> statement-breakpoint
CREATE TABLE "servicing"."payment_instruction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"status" text DEFAULT 'GENERATED' NOT NULL,
	"total_amount" numeric(24, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"line_count" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"prepared_by" uuid,
	"prepared_at" timestamp with time zone,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payment_instruction_distributionId_unique" UNIQUE("distribution_id"),
	CONSTRAINT "payment_instruction_status" CHECK ("servicing"."payment_instruction"."status" IN ('GENERATED', 'PREPARED', 'CONFIRMED', 'FAILED')),
	CONSTRAINT "payment_instruction_four_eyes" CHECK ("servicing"."payment_instruction"."confirmed_by" <> "servicing"."payment_instruction"."prepared_by")
);
--> statement-breakpoint
ALTER TABLE "servicing"."coupon_schedule" ADD CONSTRAINT "coupon_schedule_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."coupon_schedule" ADD CONSTRAINT "coupon_schedule_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."distribution" ADD CONSTRAINT "distribution_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."distribution" ADD CONSTRAINT "distribution_issuance_id_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "issuance"."issuance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."distribution" ADD CONSTRAINT "distribution_coupon_schedule_id_coupon_schedule_id_fk" FOREIGN KEY ("coupon_schedule_id") REFERENCES "servicing"."coupon_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."distribution_line" ADD CONSTRAINT "distribution_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."distribution_line" ADD CONSTRAINT "distribution_line_distribution_id_distribution_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "servicing"."distribution"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."payment_instruction" ADD CONSTRAINT "payment_instruction_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing"."payment_instruction" ADD CONSTRAINT "payment_instruction_distribution_id_distribution_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "servicing"."distribution"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_one_per_schedule" ON "servicing"."distribution" USING btree ("coupon_schedule_id") WHERE "servicing"."distribution"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "distribution_issuance" ON "servicing"."distribution" USING btree ("tenant_id","issuance_id");--> statement-breakpoint
CREATE INDEX "distribution_line_investor" ON "servicing"."distribution_line" USING btree ("tenant_id","investor_id");