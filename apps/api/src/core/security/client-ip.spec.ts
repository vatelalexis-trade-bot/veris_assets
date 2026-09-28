import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { clientIpFromHeader } from './client-ip.middleware.js';

function run(headers: Record<string, string | string[] | undefined>) {
  const request = { headers } as unknown as Request;
  const next = vi.fn() as NextFunction;
  clientIpFromHeader('X-Real-IP')(request, {} as Response, next);
  expect(next).toHaveBeenCalled();
  return request.headers['x-forwarded-for'];
}

describe('client address behind the hosting proxies', () => {
  it("replaces the forwarded chain by the edge's own header", () => {
    expect(
      run({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '203.0.113.9, 152.233.47.66' }),
    ).toBe('198.51.100.4');
  });

  it('leaves the request unchanged without the header', () => {
    expect(run({ 'x-forwarded-for': '203.0.113.9' })).toBe('203.0.113.9');
  });
});
