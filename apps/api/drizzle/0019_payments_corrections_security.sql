-- Security of the payment and correction tables of phase 12b (docs/ARCHITECTURE.md §4.5), by hand.
GRANT SELECT, INSERT, UPDATE ON registry.subscription_payment, registry.correction_request TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.subscription_payment');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.correction_request');
