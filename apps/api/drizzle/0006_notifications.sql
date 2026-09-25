CREATE TABLE "core"."notification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"event_type" text NOT NULL,
	"title_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"source_event_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_source_event_user" UNIQUE("source_event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."notification_preference" (
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE INDEX "notification_user_created_at" ON "core"."notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_tenant_occurred_at" ON "audit"."audit_event" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idempotency_key_expires_at" ON "core"."idempotency_key" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_event_pending" ON "core"."outbox_event" USING btree ("tenant_id","occurred_at") WHERE "core"."outbox_event"."processed_at" IS NULL;