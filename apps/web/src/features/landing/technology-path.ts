/**
 * Address of the technology page in each language: /en/technology and /fr/technologie. Each
 * route sends the other language to its own address (the language switcher keeps the path).
 */
export function technologyPath(locale: string): '/technology' | '/technologie' {
  return locale === 'fr-FR' ? '/technologie' : '/technology';
}
