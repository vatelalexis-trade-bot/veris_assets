import { describe, expect, it } from 'vitest';
import { pdfText, renderPdf } from './pdf.js';

describe('generated PDF documents', () => {
  it('render a PDF with sections, tables and the demonstration mention', async () => {
    const pdf = await renderPdf({
      title: 'Avis de coupon',
      subtitle: 'Northwind Green Notes (NWGN)',
      blocks: [
        { heading: 'Paiement', rows: [['Montant brut', '2 500,00 €']] },
        {
          heading: 'Lignes',
          table: { columns: ['Investisseur', 'Montant'], rows: [['Alpine', '2 500,00 €']] },
        },
        { paragraph: 'Aucun paiement réel n’est effectué.' },
      ],
      footer: 'DÉMONSTRATION — données fictives, sans valeur juridique',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    // One page: the mention is written in the bottom margin, not on a page of its own.
    expect(pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1);
  });

  it('replace the spaces the standard fonts cannot print', () => {
    expect(pdfText('2 500,00 €')).toBe('2 500,00 €');
  });
});
