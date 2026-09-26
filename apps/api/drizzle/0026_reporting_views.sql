-- Reporting views (docs/ARCHITECTURE.md §4.1: the reporting-audit module reads the other modules
-- through these views only, read-only). `security_invoker` makes the row level security of the
-- underlying tables apply to the reader: a view never shows another tenant's rows.
CREATE SCHEMA reporting;
--> statement-breakpoint
GRANT USAGE ON SCHEMA reporting TO va_app;
--> statement-breakpoint

-- Figures of each issuance (SPEC §13.1, §18).
CREATE VIEW reporting.issuance_figures WITH (security_invoker = true) AS
SELECT
  i.tenant_id,
  i.id AS issuance_id,
  i.code,
  i.name,
  i.status,
  i.currency,
  i.legal_issuer_name,
  t.nominal_value,
  t.total_units,
  t.target_amount,
  t.interest_rate,
  t.maturity_date,
  t.subscription_end_date,
  COALESCE(s.subscribed_amount, 0) AS subscribed_amount,
  COALESCE(s.subscription_count, 0) AS subscription_count,
  COALESCE(s.allocated_units, 0) AS allocated_units,
  COALESCE(p.held_by_investors, 0) AS held_by_investors,
  COALESCE(p.holders, 0) AS holders,
  COALESCE(d.distributed_amount, 0) AS distributed_amount,
  c.next_payment_date
FROM issuance.issuance i
JOIN issuance.issuance_terms t ON t.issuance_id = i.id
LEFT JOIN (
  SELECT issuance_id,
    sum(requested_amount) AS subscribed_amount,
    count(*) AS subscription_count,
    sum(allocated_units) FILTER (WHERE status IN ('PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ALLOCATED')) AS allocated_units
  FROM registry.subscription
  WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ALLOCATED')
  GROUP BY issuance_id
) s ON s.issuance_id = i.id
LEFT JOIN (
  SELECT issuance_id, sum(quantity_held) AS held_by_investors,
    count(*) FILTER (WHERE quantity_held > 0) AS holders
  FROM registry.position WHERE investor_id IS NOT NULL
  GROUP BY issuance_id
) p ON p.issuance_id = i.id
LEFT JOIN (
  SELECT issuance_id, sum(total_gross_amount) AS distributed_amount
  FROM servicing.distribution WHERE status = 'PAID'
  GROUP BY issuance_id
) d ON d.issuance_id = i.id
LEFT JOIN (
  SELECT issuance_id, min(payment_date) AS next_payment_date
  FROM servicing.coupon_schedule WHERE status = 'SCHEDULED' AND payment_date >= current_date
  GROUP BY issuance_id
) c ON c.issuance_id = i.id;
--> statement-breakpoint

-- Investors of each tenant (SPEC §13.1, §18).
CREATE VIEW reporting.investor_figures WITH (security_invoker = true) AS
SELECT
  tenant_id,
  count(*) AS investor_count,
  count(*) FILTER (WHERE eligibility_status = 'ELIGIBLE') AS eligible_count,
  count(*) FILTER (WHERE kyc_status = 'APPROVED') AS kyc_approved_count,
  count(*) FILTER (WHERE kyc_status = 'APPROVED' AND kyc_expiry_date BETWEEN current_date AND current_date + 30) AS kyc_expiring_count
FROM investor.investor
GROUP BY tenant_id;
--> statement-breakpoint

-- Actions waiting for a decision (SPEC §13.5): the permission needed, and who initiated them (four
-- eyes: the initiator never decides).
CREATE VIEW reporting.task WITH (security_invoker = true) AS
SELECT s.tenant_id, 'SUBSCRIPTION_TO_REVIEW' AS kind, 'subscription' AS resource_type, s.id AS resource_id,
  i.code AS reference, 'subscription:review' AS permission, NULL::uuid AS initiated_by,
  s.submitted_at AS waiting_since, NULL::date AS due_date
FROM registry.subscription s JOIN issuance.issuance i ON i.id = s.issuance_id WHERE s.status = 'SUBMITTED'
UNION ALL
SELECT s.tenant_id, 'SUBSCRIPTION_TO_DECIDE', 'subscription', s.id, i.code, 'subscription:approve', NULL,
  s.updated_at, NULL
FROM registry.subscription s JOIN issuance.issuance i ON i.id = s.issuance_id WHERE s.status = 'UNDER_REVIEW'
UNION ALL
SELECT p.tenant_id, 'SUBSCRIPTION_PAYMENT_TO_CONFIRM', 'subscription', p.subscription_id, i.code, 'payment:confirm',
  p.prepared_by, p.prepared_at, NULL
FROM registry.subscription_payment p
JOIN registry.subscription s ON s.id = p.subscription_id
JOIN issuance.issuance i ON i.id = s.issuance_id
WHERE p.status = 'PREPARED'
UNION ALL
SELECT k.tenant_id, 'KYC_TO_DECIDE', 'investor', k.investor_id, v.legal_name, 'kyc:decide', k.prepared_by,
  k.prepared_at, NULL
FROM investor.kyc_case k JOIN investor.investor v ON v.id = k.investor_id WHERE k.status = 'PENDING_REVIEW'
UNION ALL
SELECT i.tenant_id, 'ISSUANCE_TO_APPROVE', 'issuance', i.id, i.code, 'issuance:approve', i.submitted_by,
  i.submitted_at, NULL
FROM issuance.issuance i WHERE i.status = 'UNDER_REVIEW'
UNION ALL
SELECT r.tenant_id, 'ALLOCATION_TO_VALIDATE', 'issuance', r.issuance_id, i.code, 'allocation:validate',
  r.proposed_by, r.proposed_at, NULL
FROM registry.allocation_round r JOIN issuance.issuance i ON i.id = r.issuance_id WHERE r.status = 'PROPOSED'
UNION ALL
SELECT t.tenant_id, 'TRANSFER_TO_REVIEW', 'transfer', t.id, i.code, 'transfer:approve', NULL,
  t.submitted_at, NULL
FROM registry.transfer_request t JOIN issuance.issuance i ON i.id = t.issuance_id WHERE t.status = 'COMPLIANCE_REVIEW'
UNION ALL
SELECT c.tenant_id, 'CORRECTION_TO_APPROVE', 'issuance', c.issuance_id, i.code, 'registry-correction:approve',
  c.requested_by, c.created_at, NULL
FROM registry.correction_request c JOIN issuance.issuance i ON i.id = c.issuance_id WHERE c.status = 'PROPOSED'
UNION ALL
SELECT d.tenant_id, 'DISTRIBUTION_TO_APPROVE', 'distribution', d.id, i.code, 'distribution:approve',
  d.prepared_by, d.updated_at, c.payment_date
FROM servicing.distribution d
JOIN issuance.issuance i ON i.id = d.issuance_id
JOIN servicing.coupon_schedule c ON c.id = d.coupon_schedule_id
WHERE d.status = 'UNDER_REVIEW'
UNION ALL
SELECT d.tenant_id, 'DISTRIBUTION_PAYMENT_TO_CONFIRM', 'distribution', d.id, i.code, 'payment:confirm',
  p.prepared_by, p.prepared_at, c.payment_date
FROM servicing.payment_instruction p
JOIN servicing.distribution d ON d.id = p.distribution_id
JOIN issuance.issuance i ON i.id = d.issuance_id
JOIN servicing.coupon_schedule c ON c.id = d.coupon_schedule_id
WHERE p.status = 'PREPARED';
--> statement-breakpoint

-- Positions of the investors with their issuance (SPEC §14.1, §14.3).
CREATE VIEW reporting.investor_position WITH (security_invoker = true) AS
SELECT
  p.tenant_id, p.id AS position_id, p.investor_id, p.issuance_id, i.code, i.name, i.status,
  i.legal_issuer_name, i.currency, t.nominal_value, t.interest_rate, t.maturity_date,
  t.distribution_frequency, p.quantity_held, p.quantity_blocked, p.quantity_available,
  p.acquisition_amount, c.next_payment_date
FROM registry.position p
JOIN issuance.issuance i ON i.id = p.issuance_id
JOIN issuance.issuance_terms t ON t.issuance_id = p.issuance_id
LEFT JOIN (
  SELECT issuance_id, min(payment_date) AS next_payment_date
  FROM servicing.coupon_schedule WHERE status = 'SCHEDULED' AND payment_date >= current_date
  GROUP BY issuance_id
) c ON c.issuance_id = p.issuance_id
WHERE p.investor_id IS NOT NULL;
--> statement-breakpoint

-- What each investor received (lines of the current calculation of paid distributions).
CREATE VIEW reporting.investor_distribution WITH (security_invoker = true) AS
SELECT l.tenant_id, l.investor_id, d.id AS distribution_id, d.issuance_id, d.type, c.payment_date,
  l.gross_amount, l.currency
FROM servicing.distribution_line l
JOIN servicing.distribution d ON d.id = l.distribution_id AND d.calculation_no = l.calculation_no
JOIN servicing.coupon_schedule c ON c.id = d.coupon_schedule_id
WHERE d.status = 'PAID';
--> statement-breakpoint
-- Scheduled payments not distributed yet, overdue ones included (SPEC §13.1 "prochaines échéances").
CREATE VIEW reporting.scheduled_payment WITH (security_invoker = true) AS
SELECT c.tenant_id, c.id AS schedule_id, c.issuance_id, i.code, i.name, c.sequence, c.type,
  c.record_date, c.payment_date, c.distribution_id, d.status AS distribution_status
FROM servicing.coupon_schedule c
JOIN issuance.issuance i ON i.id = c.issuance_id
LEFT JOIN servicing.distribution d ON d.id = c.distribution_id
WHERE c.status = 'SCHEDULED';
--> statement-breakpoint

-- Requests of each investor still in progress (SPEC §14.1 "demandes en attente").
CREATE VIEW reporting.investor_request WITH (security_invoker = true) AS
SELECT s.tenant_id, s.investor_id, 'SUBSCRIPTION' AS kind, s.id AS resource_id, i.code AS reference,
  s.status, s.updated_at
FROM registry.subscription s JOIN issuance.issuance i ON i.id = s.issuance_id
WHERE s.status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED')
UNION ALL
SELECT t.tenant_id, t.from_investor_id, 'TRANSFER', t.id, i.code, t.status, t.updated_at
FROM registry.transfer_request t JOIN issuance.issuance i ON i.id = t.issuance_id
WHERE t.status IN ('SUBMITTED', 'COMPLIANCE_REVIEW');
--> statement-breakpoint

-- Activity of a tenant, for the platform indicators (SPEC §18): read tenant by tenant.
CREATE VIEW reporting.tenant_activity WITH (security_invoker = true) AS
SELECT
  t.id AS tenant_id,
  (SELECT count(*) FROM iam."user" u WHERE u.tenant_id = t.id AND u.status = 'ACTIVE') AS active_users,
  (SELECT count(*) FROM issuance.issuance i WHERE i.tenant_id = t.id) AS issuances,
  (SELECT count(*) FROM issuance.issuance i WHERE i.tenant_id = t.id AND i.status = 'ACTIVE') AS active_issuances,
  (SELECT count(*) FROM investor.investor v WHERE v.tenant_id = t.id) AS investors,
  (SELECT COALESCE(sum(p.quantity_held * x.nominal_value), 0)
     FROM registry.position p JOIN issuance.issuance_terms x ON x.issuance_id = p.issuance_id
     WHERE p.tenant_id = t.id AND p.investor_id IS NOT NULL) AS nominal_administered,
  (SELECT count(*) FROM registry.ledger_entry e WHERE e.tenant_id = t.id) AS ledger_operations,
  (SELECT count(*) FROM audit.audit_event a WHERE a.tenant_id = t.id
     AND a.result = 'FAILED' AND a.occurred_at >= now() - interval '30 days') AS failures_30_days,
  (SELECT avg(extract(epoch FROM s.decided_at - s.submitted_at) / 3600)
     FROM registry.subscription s WHERE s.tenant_id = t.id AND s.decided_at IS NOT NULL) AS average_decision_hours
FROM iam.tenant t;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO va_app;
