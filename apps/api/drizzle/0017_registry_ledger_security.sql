-- Security of the registry tables of phase 12 (docs/ARCHITECTURE.md §4.5, §4.6), written by hand.
-- Least privilege for the API role: no DELETE anywhere; the ledger is insert-only, and the
-- database itself refuses any change or deletion of its rows (SPEC §10.4, invariant 4).
GRANT SELECT, INSERT, UPDATE ON registry.allocation_round, registry.allocation TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON registry.logical_account, registry.position, registry.ledger_head TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON registry.ledger_entry TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.allocation_round');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.allocation');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.logical_account');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.position');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.ledger_head');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.ledger_entry');
--> statement-breakpoint
SELECT core.make_append_only('registry.ledger_entry');
