-- Issuances (phase 10), written by hand: rights of va_app and tenant isolation. Nothing is deleted
-- physically; a revoked invitation keeps its row, and a document is detached by archiving it.
GRANT USAGE ON SCHEMA issuance TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON issuance.issuance, issuance.issuance_terms,
  issuance.eligibility_rule_set, issuance.investor_invitation TO va_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON issuance.issuance_document TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('issuance.issuance');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('issuance.issuance_terms');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('issuance.eligibility_rule_set');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('issuance.issuance_document');
--> statement-breakpoint
SELECT core.enable_tenant_isolation('issuance.investor_invitation');
