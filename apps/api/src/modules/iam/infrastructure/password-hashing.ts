import { hash, verify, type Algorithm } from '@node-rs/argon2';

// Value of Algorithm.Argon2id (a compile-time enum that cannot be read in isolated modules);
// the tests check that the produced hashes start with $argon2id$.
const ARGON2ID = 2 as Algorithm;

// Argon2id with the library defaults (19 MiB of memory, 2 iterations, 1 lane), which match the
// OWASP minimum recommendation (SPEC §24).
export function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: ARGON2ID });
}

export function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return verify(data.hash, data.password);
}
