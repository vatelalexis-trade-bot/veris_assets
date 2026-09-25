import { AppError } from '../errors/app-error.js';

/** Antivirus check of an uploaded file (SPEC §16). */
export interface FileScanner {
  scan(content: Buffer): Promise<'CLEAN' | 'REJECTED'>;
}

export const FILE_SCANNER = Symbol('FILE_SCANNER');

/**
 * Standard harmless test string that every antivirus reports as a virus (EICAR), so that the
 * refusal can be demonstrated without any real malware.
 */
const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

/** Fictitious scanner: rejects the EICAR test file; `reject` rejects everything, `outage` fails. */
export class FakeFileScanner implements FileScanner {
  constructor(private readonly mode: 'success' | 'reject' | 'outage') {}

  scan(content: Buffer): Promise<'CLEAN' | 'REJECTED'> {
    if (this.mode === 'outage') return Promise.reject(new AppError('PROVIDER_UNAVAILABLE'));
    if (this.mode === 'reject' || content.includes(EICAR_SIGNATURE)) {
      return Promise.resolve('REJECTED');
    }
    return Promise.resolve('CLEAN');
  }
}
