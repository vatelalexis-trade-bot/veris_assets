// Creates .env from .env.example on first run, with freshly generated development secrets.
// On later runs, only appends the variables added to .env.example since then: existing values
// are never changed (the database volume depends on its passwords).
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const VARIABLE_LINE = /^([A-Z][A-Z0-9_]*)=/;

function variableNames(text) {
  return new Set(
    text
      .split('\n')
      .map((line) => VARIABLE_LINE.exec(line)?.[1])
      .filter(Boolean),
  );
}

/** Returns the lines of the template (placeholders filled) whose variable is absent from `existing`. */
export function missingVariableLines(existing, template) {
  const present = variableNames(existing);
  return template
    .split('\n')
    .filter((line) => {
      const name = VARIABLE_LINE.exec(line)?.[1];
      return name !== undefined && !present.has(name);
    })
    .map(fillPlaceholders);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const envPath = new URL('../.env', import.meta.url);
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  if (!existsSync(envPath)) {
    writeFileSync(envPath, fillPlaceholders(template), { mode: 0o600 });
    console.log('.env created from .env.example with new development secrets.');
  } else {
    const missing = missingVariableLines(readFileSync(envPath, 'utf8'), template);
    if (missing.length > 0) {
      appendFileSync(envPath, `\n# Added from .env.example\n${missing.join('\n')}\n`);
      const names = missing.map((line) => VARIABLE_LINE.exec(line)?.[1]).join(', ');
      console.log(`.env completed with new variables: ${names}.`);
    }
  }
}
