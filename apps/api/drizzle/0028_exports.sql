-- The schema "reporting" exists already (0026_reporting_views.sql, written by hand).
CREATE TABLE "reporting"."export_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"document_id" uuid,
	"row_count" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "export_request_kind" CHECK ("reporting"."export_request"."kind" IN ('REGISTRY', 'SUBSCRIPTIONS', 'DISTRIBUTIONS', 'AUDIT')),
	CONSTRAINT "export_request_status" CHECK ("reporting"."export_request"."status" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "reporting"."export_request" ADD CONSTRAINT "export_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting"."export_request" ADD CONSTRAINT "export_request_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "core"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_request_requester" ON "reporting"."export_request" USING btree ("tenant_id","requested_by","created_at");