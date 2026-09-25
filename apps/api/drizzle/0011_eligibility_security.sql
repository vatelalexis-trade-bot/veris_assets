-- Eligibility decisions (phase 9), written by hand: append-only, isolated by tenant.
GRANT SELECT, INSERT ON investor.eligibility_assessment TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.eligibility_assessment');
--> statement-breakpoint
SELECT core.make_append_only('investor.eligibility_assessment');
