CREATE TABLE "investor"."eligibility_assessment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"issuance_id" uuid,
	"context" text NOT NULL,
	"result" text NOT NULL,
	"rules" jsonb NOT NULL,
	"rule_set" jsonb,
	"rules_version" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_by_system" boolean NOT NULL,
	"justification" text,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_assessment_context" CHECK ("investor"."eligibility_assessment"."context" IN ('INVITATION', 'SUBSCRIPTION', 'TRANSFER', 'MANUAL')),
	CONSTRAINT "eligibility_assessment_result" CHECK ("investor"."eligibility_assessment"."result" IN ('ELIGIBLE', 'NOT_ELIGIBLE')),
	CONSTRAINT "eligibility_assessment_decider" CHECK ("investor"."eligibility_assessment"."decided_by_system" OR "investor"."eligibility_assessment"."decided_by_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "investor"."eligibility_assessment" ADD CONSTRAINT "eligibility_assessment_investor_id_investor_id_fk" FOREIGN KEY ("investor_id") REFERENCES "investor"."investor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eligibility_assessment_investor" ON "investor"."eligibility_assessment" USING btree ("tenant_id","investor_id","assessed_at");