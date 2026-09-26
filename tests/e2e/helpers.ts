import { expect, type APIRequestContext, type Page } from '@playwright/test';

interface DemoAccounts {
  password: string;
  accounts: { email: string; totpCode: string | null }[];
}

/**
 * Signs a demo account in through the real screens. The password and the current two-factor
 * code come from the demo accounts route (DEMO_MODE only, decision D-016).
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const demo = (await (
    await page.request.get('/api/v1/auth/demo-accounts')
  ).json()) as DemoAccounts;
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(demo.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Accounts with two-factor authentication get the code screen; the others are signed in.
  const codeField = page.getByLabel('Code');
  await expect(
    codeField.or(page.getByRole('navigation', { name: 'Main navigation' })),
  ).toBeVisible();
  if (await codeField.isVisible()) {
    // A fresh code, read just before typing it.
    const fresh = (await (
      await page.request.get('/api/v1/auth/demo-accounts')
    ).json()) as DemoAccounts;
    const code = fresh.accounts.find((account) => account.email === email)?.totpCode;
    if (!code) throw new Error(`No two-factor code for ${email}`);
    await codeField.fill(code);
    await page.getByRole('button', { name: 'Verify' }).click();
  }
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

const HEADERS = { Origin: 'http://localhost:3000' };

/** A call of the API with the session of the page; fails the test on an unexpected answer. */
export async function call<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { data?: object; version?: number } = {},
): Promise<T> {
  const request: APIRequestContext = page.request;
  const response = await request.fetch(path, {
    method,
    headers: {
      ...HEADERS,
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...(options.version !== undefined ? { 'If-Match': `"${options.version}"` } : {}),
    },
    ...(options.data ? { data: options.data } : {}),
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/** Today in the organisation's time zone (Europe/Paris, D-015), as YYYY-MM-DD. */
export function parisDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);
}

interface Issuance {
  id: string;
  version: number;
  terms: { version: number };
  eligibilityRules: { version: number };
}

/**
 * Through the API: an issuance of 1 000 units of 1 000 €, approved (four eyes), opened, the
 * investors invited and their requests approved, then subscriptions closed. `pages` holds a
 * signed-in page per email: the operator, both administrators and every investor.
 */
export async function closedIssuance(
  pages: Record<string, Page>,
  options: {
    code: string;
    name: string;
    /** [email, first word of the investor's name, units] */
    requests: [string, string, string][];
    minimumAmount?: string;
  },
): Promise<{ id: string; subscriptions: Record<string, string> }> {
  const operator = pages['northwind.operator@example.com']!;
  const admin1 = pages['northwind.admin1@example.com']!;
  const created = await call<Issuance>(operator, 'POST', '/api/v1/issuances', {
    data: { name: options.name, code: options.code },
  });
  const general = await call<Issuance>(operator, 'PATCH', `/api/v1/issuances/${created.id}`, {
    version: created.version,
    data: {
      assetCategory: 'INFRASTRUCTURE',
      countryCode: 'FR',
      currency: 'EUR',
      legalIssuerName: `${options.name} SAS (demo)`,
    },
  });
  const terms = await call<Issuance>(operator, 'PATCH', `/api/v1/issuances/${created.id}/terms`, {
    version: general.terms.version,
    data: {
      targetAmount: '1000000.00',
      minimumAmount: options.minimumAmount ?? '500000.00',
      maximumAmount: '1000000.00',
      nominalValue: '1000.00',
      totalUnits: '1000',
      interestRate: '0.04',
      rateType: 'FIXED',
      distributionFrequency: 'ANNUAL',
      dayCount: '30E_360',
      subscriptionStartDate: parisDate(),
      subscriptionEndDate: parisDate(30),
      issueDate: parisDate(45),
      maturityDate: parisDate(45 + 3 * 365),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '700000.00',
    },
  });
  await call(operator, 'PATCH', `/api/v1/issuances/${created.id}/eligibility-rules`, {
    version: terms.eligibilityRules.version,
    data: { kycMinRemainingValidityDays: 30, transfersAllowed: true },
  });
  await call(operator, 'POST', `/api/v1/issuances/${created.id}/submit`);
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/approve`);
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/open-subscription`);
  const subscriptions: Record<string, string> = {};
  for (const [email, investorName, units] of options.requests) {
    const found = await call<{ data: { id: string }[] }>(
      operator,
      'GET',
      `/api/v1/investors?q=${investorName}`,
    );
    await call(operator, 'POST', `/api/v1/issuances/${created.id}/invitations`, {
      data: { investorId: found.data[0]!.id },
    });
    const investor = pages[email]!;
    const draft = await call<{ id: string }>(investor, 'POST', '/api/v1/subscriptions', {
      data: { issuanceId: created.id, requestedUnits: units, requestedAmount: `${units}000.00` },
    });
    await call(investor, 'POST', `/api/v1/subscriptions/${draft.id}/submit`, {
      data: { documentsAccepted: true, eligibilityDeclared: true },
    });
    await call(operator, 'POST', `/api/v1/subscriptions/${draft.id}/start-review`);
    await call(admin1, 'POST', `/api/v1/subscriptions/${draft.id}/approve`);
    subscriptions[investorName] = draft.id;
  }
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/close-subscription`);
  return { id: created.id, subscriptions };
}
