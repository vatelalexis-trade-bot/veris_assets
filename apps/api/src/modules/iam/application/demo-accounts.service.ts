import { createOTP } from '@better-auth/utils/otp';
import { Inject, Injectable } from '@nestjs/common';
import { symmetricDecrypt } from 'better-auth/crypto';
import { ENV, type Env } from '../../../core/config/env.js';
import { AppError } from '../../../core/errors/app-error.js';
import { DEMO_ACCOUNTS, type DemoTenant } from '../infrastructure/demo-accounts.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';

const TOTP_PERIOD_SECONDS = 30;

/**
 * Demonstration login page data (decision D-016, SPEC §28): accounts, their shared password and,
 * for accounts with two-factor authentication, the current code. Only when DEMO_MODE=true.
 */
@Injectable()
export class DemoAccountsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly identities: IdentityRepository,
  ) {}

  async list(now = new Date()) {
    if (!this.env.DEMO_MODE || !this.env.DEMO_ACCOUNTS_PASSWORD)
      throw new AppError('RESOURCE_NOT_FOUND');
    const accounts = await Promise.all(
      DEMO_ACCOUNTS.map(async (account) => {
        const identity = await this.identities.findUserByEmail(account.email);
        if (!identity) return null;
        let totpCode: string | null = null;
        if (identity.twoFactorEnabled) {
          const encrypted = await this.identities.findEncryptedTotpSecret(identity.id);
          if (encrypted) {
            const secret = await symmetricDecrypt({
              key: this.env.BETTER_AUTH_SECRET,
              data: encrypted,
            });
            totpCode = await createOTP(secret, { digits: 6, period: TOTP_PERIOD_SECONDS }).totp();
          }
        }
        return {
          email: account.email,
          name: account.name,
          role: account.role,
          tenant: account.tenant satisfies DemoTenant,
          totpCode,
        };
      }),
    );
    const epochSeconds = (now.getTime() - (now.getTime() % 1000)) / 1000;
    const secondsLeft = TOTP_PERIOD_SECONDS - (epochSeconds % TOTP_PERIOD_SECONDS);
    return {
      password: this.env.DEMO_ACCOUNTS_PASSWORD,
      totpValidForSeconds: secondsLeft,
      accounts: accounts.filter((account) => account !== null),
    };
  }
}
