-- Security of the transfer requests of phase 13 (docs/ARCHITECTURE.md §4.5), written by hand.
GRANT SELECT, INSERT, UPDATE ON registry.transfer_request TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.transfer_request');
