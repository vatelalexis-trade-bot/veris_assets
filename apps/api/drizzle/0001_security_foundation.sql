-- Security foundation (docs/ARCHITECTURE.md §4.5), written by hand.
-- Every new table must be registered here or in a later custom migration: rights of va_app,
-- tenant isolation (row level security) and, for append-only tables, the protective triggers.
-- Integration tests fail if a table with a tenant column is left without forced row level security.

-- Tenant of the current transaction, set by the API with set_config('app.tenant_id', <uuid>, true).
-- NULL when no tenant is set: then no tenant-scoped row is visible.
CREATE FUNCTION core.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
-- Enables and forces row level security (also for the table owner) with the standard policy.
-- nullable_tenant: rows without tenant (platform level) are visible only when no tenant is set.
CREATE FUNCTION core.enable_tenant_isolation(
  target regclass,
  tenant_column name DEFAULT 'tenant_id',
  nullable_tenant boolean DEFAULT false
) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  condition text;
BEGIN
  IF nullable_tenant THEN
    condition := format('%I IS NOT DISTINCT FROM core.current_tenant_id()', tenant_column);
  ELSE
    condition := format('%I = core.current_tenant_id()', tenant_column);
  END IF;
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (%s) WITH CHECK (%s)',
    target, condition, condition
  );
END;
$$;
--> statement-breakpoint
-- Append-only tables (SPEC §10.3, §17.2): UPDATE, DELETE and TRUNCATE are refused by the database
-- itself, whatever the role. Corrections are made with new rows.
CREATE FUNCTION core.reject_append_only_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'Table %.% is append-only: % is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION core.make_append_only(target regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER append_only_row BEFORE UPDATE OR DELETE ON %s '
    'FOR EACH ROW EXECUTE FUNCTION core.reject_append_only_change()',
    target
  );
  EXECUTE format(
    'CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON %s '
    'FOR EACH STATEMENT EXECUTE FUNCTION core.reject_append_only_change()',
    target
  );
END;
$$;
--> statement-breakpoint
-- Functions are executable by everyone by default in PostgreSQL: restrict them.
REVOKE EXECUTE ON FUNCTION core.current_tenant_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.enable_tenant_isolation(regclass, name, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.reject_append_only_change() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.make_append_only(regclass) FROM PUBLIC;
--> statement-breakpoint
-- The isolation policies call current_tenant_id() with the rights of the querying role.
GRANT EXECUTE ON FUNCTION core.current_tenant_id() TO va_app;
--> statement-breakpoint

-- Rights of the API role (least privilege; no physical deletion of business data, SPEC §21.2).
GRANT USAGE ON SCHEMA core, audit, iam TO va_app;
--> statement-breakpoint
GRANT SELECT ON core.country, core.currency, core.reference_data TO va_app;
--> statement-breakpoint
-- Expired idempotency keys are purged by a daily job.
GRANT SELECT, INSERT, UPDATE, DELETE ON core.idempotency_key TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.outbox_event TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON core.workflow_transition, audit.audit_event TO va_app;
--> statement-breakpoint
-- Tenant management by the Platform Administrator arrives in phase 6.
GRANT SELECT ON iam.tenant TO va_app;
--> statement-breakpoint

-- Tenant isolation.
SELECT core.enable_tenant_isolation('core.idempotency_key', 'tenant_id', true);
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.outbox_event');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.workflow_transition');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('audit.audit_event', 'tenant_id', true);
--> statement-breakpoint
SELECT core.enable_tenant_isolation('iam.tenant', 'id');
--> statement-breakpoint

-- Append-only tables.
SELECT core.make_append_only('core.workflow_transition');
--> statement-breakpoint
SELECT core.make_append_only('audit.audit_event');
