// Creates .env from .env.example on first run, with freshly generated development secrets.
// An existing .env is never modified (the database volume depends on its password).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GENERATORS = {
  __RANDOM_HEX_16__: () => randomBytes(16).toString('hex'),
  __RANDOM_HEX_32__: () => randomBytes(32).toString('hex'),
  // Garage requires access key ids of the form "GK" + 24 hexadecimal characters.
  __RANDOM_GARAGE_KEY_ID__: () => `GK${randomBytes(12).toString('hex')}`,
};

/** Replaces each placeholder occurrence with its own random value. */
export function fillPlaceholders(template) {
  return template.replace(/__RANDOM_[A-Z0-9_]+__/g, (placeholder) => {
    const generate = GENERATORS[placeholder];
    if (!generate) throw new Error(`Unknown placeholder ${placeholder} in .env.example`);
    return generate();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const envPath = new URL('../.env', import.meta.url);
  if (existsSync(envPath)) {
    console.log('.env already exists: kept as is.');
  } else {
    const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    writeFileSync(envPath, fillPlaceholders(template), { mode: 0o600 });
    console.log('.env created from .env.example with new development secrets.');
  }
}
