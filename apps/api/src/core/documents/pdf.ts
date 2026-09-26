import PDFDocument from 'pdfkit';

/** One block of a generated document. */
export type PdfBlock =
  | { heading: string; rows: readonly (readonly [string, string])[] }
  | { heading: string; table: { columns: readonly string[]; rows: readonly (readonly string[])[] } }
  | { paragraph: string };

export interface PdfSpec {
  title: string;
  subtitle?: string;
  blocks: readonly PdfBlock[];
  /** Mention printed on every page (SPEC §3.3: fictitious data, no legal value). */
  footer: string;
}

const BRAND = '#4F52D6';
/** Thin space (U+2009) and narrow no-break space (U+202F). */
const RARE_SPACES = new RegExp('[\\u2009\\u202F]', 'g');
const MUTED = '#5B6475';

/**
 * The standard PDF fonts only know the Windows-1252 characters: the narrow no-break spaces that
 * `Intl` puts in French amounts ("1 000,00 €") and other rare spaces become plain spaces.
 */
export function pdfText(value: string): string {
  return value.replace(RARE_SPACES, ' ');
}

/**
 * Renders a simple A4 document: the Virtus Assets wordmark, a title, key/value sections, tables,
 * paragraphs, and the demonstration mention in the footer of every page. Only the standard
 * Helvetica font is used: nothing to install, nothing downloaded.
 */
export function renderPdf(spec: PdfSpec): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    info: { Title: pdfText(spec.title), Author: 'Virtus Assets (demo)' },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND).text('VIRTUS ASSETS');
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(pdfText(spec.title));
  if (spec.subtitle)
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(pdfText(spec.subtitle));
  doc.moveDown(1);

  for (const block of spec.blocks) {
    if ('paragraph' in block) {
      doc.font('Helvetica').fontSize(10).fillColor('#111111').text(pdfText(block.paragraph));
      doc.moveDown(0.8);
      continue;
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND).text(pdfText(block.heading));
    doc.moveDown(0.3);
    if ('rows' in block) {
      for (const [label, value] of block.rows) {
        const y = doc.y;
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(MUTED)
          .text(pdfText(label), doc.page.margins.left, y, {
            width: width * 0.45,
          });
        const labelBottom = doc.y;
        doc
          .font('Helvetica')
          .fillColor('#111111')
          .text(pdfText(value), doc.page.margins.left + width * 0.45, y, {
            width: width * 0.55,
            align: 'right',
          });
        doc.y = Math.max(labelBottom, doc.y) + 2;
      }
    } else {
      const columnWidth = width / block.table.columns.length;
      const line = (cells: readonly string[], bold: boolean) => {
        const y = doc.y;
        let bottom = y;
        cells.forEach((cell, index) => {
          doc
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9)
            .fillColor('#111111')
            .text(pdfText(cell), doc.page.margins.left + index * columnWidth, y, {
              width: columnWidth - 6,
              align: index === 0 ? 'left' : 'right',
            });
          bottom = Math.max(bottom, doc.y);
        });
        doc.y = bottom + 3;
      };
      line(block.table.columns, true);
      for (const row of block.table.rows) line(row, false);
    }
    doc.x = doc.page.margins.left;
    doc.moveDown(0.8);
  }

  // The demonstration mention on every page.
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const { margins } = doc.page;
    const bottom = doc.page.height - margins.bottom + 20;
    // Below the bottom margin: without this, the text would open a new page.
    doc.page.margins = { ...margins, bottom: 0 };
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(pdfText(spec.footer), doc.page.margins.left, bottom, {
        width,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins = margins;
  }
  doc.end();
  return done;
}
