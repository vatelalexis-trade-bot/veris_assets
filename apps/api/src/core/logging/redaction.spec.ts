import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS, REDACTION_CENSOR } from './redaction.js';

function logOnce(payload: object): Record<string, unknown> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  pino({ redact: { paths: REDACTED_PATHS, censor: REDACTION_CENSOR } }, stream).info(payload);
  return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
}

describe('log redaction', () => {
  it('masks sensitive values at the top level and one level deep', () => {
    const line = JSON.stringify(
      logOnce({ password: 'hunter2', user: { email: 'jane@example.com', id: 'u-1' } }),
    );
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('jane@example.com');
    expect(line).toContain('u-1');
    expect(line).toContain(REDACTION_CENSOR);
  });

  it('masks session cookies and authorization headers of HTTP requests', () => {
    const line = JSON.stringify(
      logOnce({
        req: { headers: { cookie: 'session=abc', authorization: 'Bearer xyz', host: 'api' } },
      }),
    );
    expect(line).not.toContain('session=abc');
    expect(line).not.toContain('Bearer xyz');
    expect(line).toContain('"host":"api"');
  });
});
