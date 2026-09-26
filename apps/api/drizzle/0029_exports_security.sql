-- Security of the export requests and the views the exports read (phase 15b, written by hand).
-- An export request is changed by its worker (status, document) and never deleted.
GRANT SELECT, INSERT, UPDATE ON reporting.export_request TO va_app;
--> statement-breakpoint
SELECT core.enable_tenant_isolation('reporting.export_request');
--> statement-breakpoint

-- The registry of each issuance: every position, the treasury included (SPEC §10, P15-3).
CREATE VIEW reporting.registry_export WITH (security_invoker = true) AS
SELECT p.tenant_id, p.issuance_id, i.code AS issuance_code, a.type AS account_type,
  p.account_id, p.investor_id, v.legal_name AS investor_name, p.quantity_held,
  p.quantity_blocked, p.quantity_available, t.nominal_value,
  p.quantity_held * t.nominal_value AS nominal_amount, i.currency, p.updated_at
FROM registry.position p
JOIN issuance.issuance i ON i.id = p.issuance_id
JOIN issuance.issuance_terms t ON t.issuance_id = p.issuance_id
JOIN registry.logical_account a ON a.id = p.account_id
LEFT JOIN investor.investor v ON v.id = p.investor_id;
--> statement-breakpoint

-- Subscriptions with their issuance and investor (SPEC §9).
CREATE VIEW reporting.subscription_export WITH (security_invoker = true) AS
SELECT s.tenant_id, s.id AS subscription_id, s.issuance_id, i.code AS issuance_code,
  s.investor_id, v.legal_name AS investor_name, s.status, s.requested_units, s.requested_amount,
  s.allocated_units, s.amount_due, s.currency, s.payment_reference, s.submitted_at, s.decided_at,
  s.rejection_reason, s.cancellation_reason, s.created_at
FROM registry.subscription s
JOIN issuance.issuance i ON i.id = s.issuance_id
JOIN investor.investor v ON v.id = s.investor_id;
--> statement-breakpoint

-- Lines of the current calculation of every distribution not cancelled (SPEC §12).
CREATE VIEW reporting.distribution_line_export WITH (security_invoker = true) AS
SELECT l.tenant_id, d.id AS distribution_id, d.issuance_id, i.code AS issuance_code,
  c.sequence, d.type, d.status, c.record_date, c.payment_date, l.investor_id,
  v.legal_name AS investor_name, l.account_id, l.eligible_quantity, l.gross_amount_unrounded,
  l.gross_amount, l.currency
FROM servicing.distribution_line l
JOIN servicing.distribution d ON d.id = l.distribution_id AND d.calculation_no = l.calculation_no
JOIN servicing.coupon_schedule c ON c.id = d.coupon_schedule_id
JOIN issuance.issuance i ON i.id = d.issuance_id
LEFT JOIN investor.investor v ON v.id = l.investor_id
WHERE d.status <> 'CANCELLED';
--> statement-breakpoint

-- The organisation's audit log with the actors' names (SPEC §17). Without IP addresses, user
-- agents and changed values: an export leaves the platform, so it carries the least data.
CREATE VIEW reporting.audit_export WITH (security_invoker = true) AS
SELECT a.tenant_id, a.id AS audit_event_id, a.occurred_at, a.actor_user_id, u.name AS actor_name,
  a.actor_role, a.action, a.resource_type, a.resource_id, a.result, a.reason, a.source,
  a.correlation_id
FROM audit.audit_event a
LEFT JOIN iam."user" u ON u.id = a.actor_user_id
WHERE a.tenant_id IS NOT NULL;
--> statement-breakpoint
GRANT SELECT ON reporting.registry_export, reporting.subscription_export,
  reporting.distribution_line_export, reporting.audit_export TO va_app;
