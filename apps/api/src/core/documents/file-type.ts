import { ALLOWED_DOCUMENT_MIME_TYPES, type DocumentMimeType } from '@virtus/shared';
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED = new Set<string>(ALLOWED_DOCUMENT_MIME_TYPES);

/**
 * CSV has no signature: it is accepted when the content is valid UTF-8 text without control
 * characters (other than tab and line breaks) whose first line holds a separator.
 */
function looksLikeCsv(content: Buffer): boolean {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return false;
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return /[,;\t]/.test(firstLine);
}

/**
 * Real type of a file, detected from its content (SPEC §16), never from its name. Null when the
 * type is not one of the allowed ones.
 */
export async function detectDocumentType(content: Buffer): Promise<DocumentMimeType | null> {
  const detected = await fileTypeFromBuffer(content);
  if (detected) return ALLOWED.has(detected.mime) ? (detected.mime as DocumentMimeType) : null;
  return looksLikeCsv(content) ? 'text/csv' : null;
}
