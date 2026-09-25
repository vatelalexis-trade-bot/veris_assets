-- Investors, KYC/KYB and documents (phase 8), written by hand: rights of va_app, tenant isolation
-- and append-only tables. Nothing is ever deleted physically (SPEC §21.2).
GRANT USAGE ON SCHEMA investor TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON core.document, core.document_version TO va_app;
--> statement-breakpoint
-- A document changes only by a new version or by being archived.
GRANT UPDATE (status, current_version, version, updated_at) ON core.document TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON investor.investor, investor.investor_representative,
  investor.beneficial_owner, investor.kyc_case TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON investor.kyc_document, investor.compliance_comment TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.document');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('core.document_version');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.investor');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.investor_representative');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.beneficial_owner');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.kyc_case');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.kyc_document');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('investor.compliance_comment');
--> statement-breakpoint
SELECT core.make_append_only('core.document_version');
--> statement-breakpoint
SELECT core.make_append_only('investor.compliance_comment');
