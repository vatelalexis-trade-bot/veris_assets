import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { createOriginCheck } from './origin.middleware.js';

function run(method: string, origin?: string) {
  const next = vi.fn();
  const req = { method, headers: origin ? { origin } : {} } as Request;
  createOriginCheck(['https://app.example.com'])(req, {} as Response, next as NextFunction);
  return next.mock.calls[0]?.[0] as unknown;
}

describe('origin check', () => {
  it('lets through reads, same-origin writes and requests without Origin', () => {
    expect(run('GET', 'https://evil.example')).toBeUndefined();
    expect(run('POST', 'https://app.example.com')).toBeUndefined();
    expect(run('POST')).toBeUndefined();
  });

  it('refuses a write coming from another site', () => {
    const error = run('POST', 'https://evil.example');
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('PERMISSION_DENIED');
  });
});
