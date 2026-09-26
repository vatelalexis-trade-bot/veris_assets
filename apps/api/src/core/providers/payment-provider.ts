import { createHash } from 'node:crypto';
import { AppError } from '../errors/app-error.js';

export interface PaymentInstruction {
  /** Identifier of the payment, never personal data. */
  paymentId: string;
  /** Decimal string in the currency's minor units, e.g. "400000.00". */
  amount: string;
  currency: string;
}

/**
 * Payment provider (SPEC §27): tells the bank what to expect, then whether it was received. The
 * MVP only has the fictitious one: no real payment is ever made (SPEC §31.2).
 */
export interface PaymentProvider {
  /** Registers the expected payment; returns the provider's reference. */
  prepare(instruction: PaymentInstruction): Promise<{ reference: string }>;
  /** Whether the payment of this reference was received. */
  confirm(reference: string): Promise<{ received: boolean }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/**
 * Fictitious provider. `success`: every payment is received; `reject`: never received;
 * `outage`: unavailable (503 PROVIDER_UNAVAILABLE).
 */
export class FakePaymentProvider implements PaymentProvider {
  constructor(private readonly mode: 'success' | 'reject' | 'outage') {}

  prepare(instruction: PaymentInstruction): Promise<{ reference: string }> {
    if (this.mode === 'outage') return Promise.reject(new AppError('PROVIDER_UNAVAILABLE'));
    const digest = createHash('sha256').update(instruction.paymentId).digest('hex');
    return Promise.resolve({ reference: `FAKE-PAY-${digest.slice(0, 12).toUpperCase()}` });
  }

  confirm(): Promise<{ received: boolean }> {
    if (this.mode === 'outage') return Promise.reject(new AppError('PROVIDER_UNAVAILABLE'));
    return Promise.resolve({ received: this.mode === 'success' });
  }
}
