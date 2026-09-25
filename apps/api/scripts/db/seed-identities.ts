// Demonstration accounts (decision D-017). Accounts of roles that require two-factor
// authentication are enrolled through Better Auth's own API, exactly as a real user would be.
import { createOTP } from '@better-auth/utils/otp';
import { symmetricDecrypt } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requiresMfa } from '../../src/modules/iam/domain/roles.js';
import { createBetterAuth } from '../../src/modules/iam/infrastructure/better-auth.js';
import { DEMO_ACCOUNTS } from '../../src/modules/iam/infrastructure/demo-accounts.js';
import { hashPassword } from '../../src/modules/iam/infrastructure/password-hashing.js';
import {
  account,
  role,
  session,
  twoFactor,
  user,
  userRole,
} from '../../src/modules/iam/infrastructure/schema.js';
import { connectionConfig, withClient } from './admin.js';
import { deterministicUuid } from './deterministic-id.js';
import { tenants } from './seed-data.js';
import { databaseName, type DatabaseTarget, type ToolsEnv } from './tools-env.js';

const TENANT_IDS = { northwind: tenants[0].id, contoso: tenants[1].id } as const;

function cookieHeader(headers: Headers): Headers {
  return new Headers({
    cookie: headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  });
}

export async function seedIdentities(env: ToolsEnv, target: DatabaseTarget): Promise<void> {
  const password = env.DEMO_ACCOUNTS_PASSWORD;
  const secret = env.BETTER_AUTH_SECRET;
  if (!password || !secret) {
    console.log('Demo accounts skipped: DEMO_ACCOUNTS_PASSWORD or BETTER_AUTH_SECRET is not set.');
    return;
  }
  await withClient(connectionConfig(env, databaseName(env, target), 'auth'), async (client) => {
    const db = drizzle({ client, casing: 'snake_case' });
    const auth = createBetterAuth({
      secret,
      webOrigin: env.WEB_ORIGIN,
      db,
      sendResetPassword: async () => {},
    });
    const roleIds = new Map(
      (await db.select({ id: role.id, code: role.code }).from(role)).map((r) => [r.code, r.id]),
    );
    const passwordHash = await hashPassword(password);

    for (const demo of DEMO_ACCOUNTS) {
      const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, demo.email));
      if (existing) continue;
      const userId = deterministicUuid(`user:${demo.email}`);
      const tenantId = demo.tenant ? TENANT_IDS[demo.tenant] : null;
      await db.transaction(async (tx) => {
        await tx.insert(user).values({
          id: userId,
          name: demo.name,
          email: demo.email,
          tenantId,
          locale: demo.locale,
        });
        await tx
          .insert(account)
          .values({ accountId: userId, providerId: 'credential', userId, password: passwordHash });
        await tx.insert(userRole).values({ userId, roleId: roleIds.get(demo.role)!, tenantId });
      });

      if (requiresMfa([demo.role])) {
        const signIn = await auth.api.signInEmail({
          body: { email: demo.email, password },
          returnHeaders: true,
        });
        const headers = cookieHeader(signIn.headers);
        await auth.api.enableTwoFactor({ body: { password, method: 'totp' }, headers });
        const [row] = await db
          .select({ secret: twoFactor.secret })
          .from(twoFactor)
          .where(eq(twoFactor.userId, userId));
        const totpSecret = await symmetricDecrypt({ key: secret, data: row!.secret });
        await auth.api.verifyTOTP({ body: { code: await createOTP(totpSecret).totp() }, headers });
        // The sessions opened to enrol the account are closed: nobody is signed in after seeding.
        await db.delete(session).where(eq(session.userId, userId));
      }
    }
  });
}
