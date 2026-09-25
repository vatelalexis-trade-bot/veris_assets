import { expect, type Page } from '@playwright/test';

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
