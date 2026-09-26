-- Subscriptions (phase 11), written by hand: rights of va_app and tenant isolation. A subscription
-- is never deleted: it ends REJECTED or CANCELLED.
GRANT USAGE ON SCHEMA registry TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON registry.subscription TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.subscription');
