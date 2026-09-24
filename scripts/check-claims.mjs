// Fails when user-facing sources contain a forbidden regulatory claim or the abandoned
// working name (SPEC §2.4, §19.1, §31.2 rule 1; decision D-018).
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// `\b` ignores accented letters in JavaScript, so words are delimited with Unicode-aware lookarounds.
const word = (source) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, 'iu');

export const FORBIDDEN_PATTERNS = [
  {
    id: 'mica-compliant',
    regex: word(String.raw`MiCA[-\s]*(compliant|compliance|approved|certified)`),
  },
  { id: 'compliant-with-mica', regex: word(String.raw`compliant\s+with\s+MiCA`) },
  { id: 'conforme-mica', regex: word(String.raw`conformes?\s+(à\s+|au\s+règlement\s+)?MiCA`) },
  { id: 'certified', regex: word('certified') },
  { id: 'certifie', regex: word('certifiée?s?') },
  { id: 'regulator-approved', regex: word(String.raw`(AMF|ACPR|ESMA)[-\s]*(approved|agréée?)`) },
  { id: 'agree-par', regex: word(String.raw`agréée?s?\s+par\s+(l'|la\s+|le\s+)?(AMF|ACPR|ESMA)`) },
  { id: 'old-name', regex: word('Astraea') },
];

const SCANNED_ROOTS = ['apps', 'packages', 'README.md'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.next', 'coverage', 'out']);
// Files that are allowed to name the forbidden patterns because they define or describe the check.
const ALLOWED_FILES = new Set([]);

/** Returns the forbidden claims found in a text, with their 1-based line numbers. */
export function findClaims(text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    for (const { id, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) findings.push({ id, line: index + 1, text: line.trim() });
    }
  });
  return findings;
}

async function* walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      yield path;
      return;
    }
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* walk(join(path, entry.name));
    } else {
      yield join(path, entry.name);
    }
  }
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let failures = 0;
  for (const scanned of SCANNED_ROOTS) {
    for await (const file of walk(join(root, scanned))) {
      const relativePath = relative(root, file);
      if (!SCANNED_EXTENSIONS.has(extname(file)) || ALLOWED_FILES.has(relativePath)) continue;
      for (const finding of findClaims(await readFile(file, 'utf8'))) {
        failures += 1;
        console.error(`${relativePath}:${finding.line} [${finding.id}] ${finding.text}`);
      }
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} forbidden claim(s) found. See docs/SPEC.md §31.2 rule 1.`);
    process.exit(1);
  }
  console.log('No forbidden regulatory claim found.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
