-- Rights for user, role and tenant management (phase 6, docs/ARCHITECTURE.md §4.5).

-- Platform scope: set by the API only (withPlatformTransaction), after checking that the user has
-- a platform permission. It opens the tenant list to the Platform Administrator, and nothing else:
-- business tables keep their tenant isolation policy only.
CREATE FUNCTION core.is_platform_scope() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.platform_scope', true), '') = 'on' $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.is_platform_scope() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.is_platform_scope() TO va_app;
--> statement-breakpoint
CREATE POLICY platform_administration ON iam.tenant TO va_app
  USING (core.is_platform_scope()) WITH CHECK (core.is_platform_scope());
--> statement-breakpoint
GRANT INSERT, UPDATE ON iam.tenant TO va_app;
--> statement-breakpoint

-- Permission catalogue: reference data, read by the API and the authentication component.
GRANT SELECT ON iam.permission, iam.role_permission TO va_app, va_auth;
--> statement-breakpoint

-- User management inside the session's tenant (row level security still applies).
GRANT UPDATE (name, locale, status, updated_at) ON iam.user TO va_app;
--> statement-breakpoint
GRANT INSERT, DELETE ON iam.user_role TO va_app;
--> statement-breakpoint

-- The authentication component refuses sign-in and sessions of users of a deactivated tenant:
-- it may read the status of every tenant (id and status columns only).
GRANT SELECT (id, status) ON iam.tenant TO va_auth;
--> statement-breakpoint
CREATE POLICY authentication_service ON iam.tenant TO va_auth USING (true);
