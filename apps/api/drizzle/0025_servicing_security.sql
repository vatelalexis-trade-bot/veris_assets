-- Security of the servicing tables (docs/ARCHITECTURE.md §4.5), written by hand. The schema
-- belongs to the migrator; the API role gets the least it needs and no DELETE anywhere.
GRANT USAGE ON SCHEMA servicing TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON servicing.coupon_schedule, servicing.distribution, servicing.payment_instruction TO va_app;
--> statement-breakpoint
-- Lines are never changed: a new calculation writes new lines.
GRANT SELECT, INSERT ON servicing.distribution_line TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('servicing.coupon_schedule');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('servicing.distribution');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('servicing.distribution_line');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('servicing.payment_instruction');
--> statement-breakpoint
SELECT core.make_append_only('servicing.distribution_line');
