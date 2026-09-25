-- Security of the identity tables (docs/ARCHITECTURE.md §4.5 and §4.12, decision D-030).
-- va_auth is the role of the authentication component: it must find a user by email before any
-- tenant is known, so it may read every user, but it has no right on any business table.

GRANT USAGE ON SCHEMA iam TO va_auth;
--> statement-breakpoint
-- The tenant isolation policies are evaluated for every role, including va_auth.
GRANT EXECUTE ON FUNCTION core.current_tenant_id() TO va_auth;
--> statement-breakpoint

-- Session, credentials, short-lived tokens and TOTP secrets: authentication component only.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON iam.session, iam.account, iam.verification, iam.two_factor TO va_auth;
--> statement-breakpoint
GRANT SELECT ON iam.role TO va_app, va_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON iam.user TO va_auth;
--> statement-breakpoint
GRANT SELECT, INSERT ON iam.user_role TO va_auth;
--> statement-breakpoint
GRANT SELECT, UPDATE ON iam.user_invitation TO va_auth;
--> statement-breakpoint
-- The API role manages users of its own tenant only (screens in phase 6).
GRANT SELECT ON iam.user, iam.user_role TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON iam.user_invitation TO va_app;
--> statement-breakpoint

-- Tenant isolation (platform users and invitations have no tenant).
SELECT core.enable_tenant_isolation('iam.user', 'tenant_id', true);
--> statement-breakpoint
SELECT core.enable_tenant_isolation('iam.user_role', 'tenant_id', true);
--> statement-breakpoint
SELECT core.enable_tenant_isolation('iam.user_invitation', 'tenant_id', true);
--> statement-breakpoint
-- The authentication component sees every row of these three tables, and only of these.
CREATE POLICY authentication_service ON iam.user TO va_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY authentication_service ON iam.user_role TO va_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY authentication_service ON iam.user_invitation TO va_auth USING (true) WITH CHECK (true);
--> statement-breakpoint

-- The six system roles of SPEC §4 are reference data, created with the schema.
INSERT INTO iam.role (code) VALUES
  ('PLATFORM_ADMIN'), ('ISSUER_ADMIN'), ('ISSUER_OPERATOR'),
  ('COMPLIANCE_OFFICER'), ('AUDITOR'), ('INVESTOR');
