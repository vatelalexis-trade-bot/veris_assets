// Content Security Policy (SPEC §24, P16-1, D-100): the pages work with their nonce, and the
// browser never reports a blocked script, style or request.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  page.on('pageerror', (error) => violations.push(error.message));
  return violations;
}

test('public site, sign-in and issuer portal run under the Content Security Policy', async ({
  page,
}) => {
  const violations = watchViolations(page);
  const home = await page.goto('/fr');
  expect(home!.headers()['content-security-policy']).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  // The calculator runs in the browser: it only works if the page's scripts were allowed.
  await page.getByLabel('Nombre d’investisseurs').fill('80');
  await expect(page.getByText('158 300 €').first()).toBeVisible();

  await signIn(page, 'northwind.admin1@example.com');
  await page.goto('/en/issuer/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(violations).toEqual([]);
});
