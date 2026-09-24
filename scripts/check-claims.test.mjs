import { describe, expect, it } from 'vitest';
import { findClaims } from './check-claims.mjs';

describe('findClaims', () => {
  it.each([
    'Our platform is MiCA compliant.',
    'Fully compliant with MiCA.',
    'Plateforme conforme MiCA',
    'Solution conforme au règlement MiCA',
    'ISO certified infrastructure',
    'Infrastructure certifiée par un tiers',
    'Données certifiées.',
    'Approved: AMF-approved issuer',
    "Plateforme agréée par l'AMF",
    'Formerly Astraea RWA',
  ])('flags "%s"', (text) => {
    expect(findClaims(text)).not.toHaveLength(0);
  });

  it.each([
    'Architecture designed to integrate your compliance controls.',
    'Architecture conçue pour intégrer vos contrôles de conformité.',
    'Compatible with a future ERC-3643 integration.',
    'Compatible avec une future intégration ERC-3643.',
  ])('accepts the allowed wording "%s"', (text) => {
    expect(findClaims(text)).toHaveLength(0);
  });

  it('reports the line number', () => {
    expect(findClaims('first line\nMiCA compliant')[0]).toMatchObject({
      id: 'mica-compliant',
      line: 2,
    });
  });
});
