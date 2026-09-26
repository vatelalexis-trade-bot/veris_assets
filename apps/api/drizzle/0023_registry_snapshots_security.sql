-- Security of the registry snapshots (SPEC §12.3), written by hand: insert-only for the API role
-- and append-only in the database, like the ledger.
GRANT SELECT, INSERT ON registry.registry_snapshot, registry.registry_snapshot_line TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.registry_snapshot');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('registry.registry_snapshot_line');
--> statement-breakpoint
SELECT core.make_append_only('registry.registry_snapshot');
--> statement-breakpoint
SELECT core.make_append_only('registry.registry_snapshot_line');
