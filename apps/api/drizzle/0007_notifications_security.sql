-- Notifications (phase 7), written by hand: rights of va_app and tenant isolation.
-- Rows of platform users have no tenant: they are visible only when no tenant is set.

-- A notification is never deleted or rewritten; only its read date changes.
GRANT SELECT, INSERT ON core.notification TO va_app;
--> statement-breakpoint
GRANT UPDATE (read_at) ON core.notification TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.notification_preference TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.notification', 'tenant_id', true);
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.notification_preference', 'tenant_id', true);
--> statement-breakpoint

-- Background jobs working across tenants, in the platform scope (decision D-036, extended by
-- D-040). The safety net of the outbox reads the pending events of every tenant (identifiers
-- only); the daily cleanup deletes the expired idempotency keys of every tenant. Nothing else.
CREATE POLICY platform_outbox_sweep ON core.outbox_event
  FOR SELECT TO va_app
  USING (core.is_platform_scope() AND processed_at IS NULL);
--> statement-breakpoint
CREATE POLICY platform_idempotency_cleanup ON core.idempotency_key
  FOR DELETE TO va_app
  USING (core.is_platform_scope() AND expires_at < now());
--> statement-breakpoint
-- A DELETE with a WHERE clause must also be allowed to read the rows it deletes.
CREATE POLICY platform_idempotency_cleanup_read ON core.idempotency_key
  FOR SELECT TO va_app
  USING (core.is_platform_scope() AND expires_at < now());
