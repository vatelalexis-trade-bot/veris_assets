import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { FakeFileScanner } from './file-scanner.js';
import { FakeKycProvider } from './kyc-provider.js';

const failing = () => Promise.reject(new Error('connection refused'));
const codeOf = (error: unknown) => (error as AppError).code;

describe('circuit breaker', () => {
  it('fails fast after three failures in a row, then tries again after the pause', async () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 30_000, () => now);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(breaker.call(failing)).rejects.toSatisfy(
        (error) => codeOf(error) === 'PROVIDER_UNAVAILABLE',
      );
    }
    expect(breaker.isOpen).toBe(true);
    let called = false;
    await expect(
      breaker.call(() => {
        called = true;
        return Promise.resolve('ok');
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(called).toBe(false);
    now = 30_001;
    await expect(breaker.call(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('is reset by a success', async () => {
    const breaker = new CircuitBreaker(2);
    await expect(breaker.call(failing)).rejects.toBeInstanceOf(AppError);
    await breaker.call(() => Promise.resolve(1));
    await expect(breaker.call(failing)).rejects.toBeInstanceOf(AppError);
    expect(breaker.isOpen).toBe(false);
  });
});

describe('fictitious KYC provider', () => {
  const request = { caseId: 'case-1', investorType: 'LEGAL_ENTITY' as const, countryCode: 'FR' };

  it('answers according to its mode, always with the same reference for a case', async () => {
    const clear = await new FakeKycProvider('success').check(request);
    expect(clear).toMatchObject({ outcome: 'CLEAR', suggestedRiskLevel: 'LOW' });
    expect(clear.reference).toMatch(/^FAKE-KYC-[0-9A-F]{12}$/);
    expect((await new FakeKycProvider('success').check(request)).reference).toBe(clear.reference);
    expect(
      await new FakeKycProvider('success').check({ ...request, countryCode: 'US' }),
    ).toMatchObject({
      suggestedRiskLevel: 'MEDIUM',
    });
    expect(await new FakeKycProvider('reject').check(request)).toMatchObject({
      outcome: 'REVIEW',
      suggestedRiskLevel: 'HIGH',
    });
    await expect(new FakeKycProvider('outage').check(request)).rejects.toSatisfy(
      (error) => codeOf(error) === 'PROVIDER_UNAVAILABLE',
    );
  });
});

describe('fictitious file scanner', () => {
  it('rejects the EICAR test file, everything in reject mode, and fails in outage mode', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    expect(await new FakeFileScanner('success').scan(Buffer.from('%PDF-1.4'))).toBe('CLEAN');
    expect(await new FakeFileScanner('success').scan(eicar)).toBe('REJECTED');
    expect(await new FakeFileScanner('reject').scan(Buffer.from('%PDF-1.4'))).toBe('REJECTED');
    await expect(new FakeFileScanner('outage').scan(Buffer.from('x'))).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
