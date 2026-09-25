// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Reads the tokens from the stylesheet itself, so the test checks what the browser receives.
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [
    match[1]!,
    match[2]!.toLowerCase(),
  ]),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(tokens[foreground]!), luminance(tokens[background]!)].sort(
    (a, b) => b - a,
  );
  return (light! + 0.05) / (dark! + 0.05);
}

const BACKGROUNDS = ['background', 'surface', 'surface-raised'];

describe('theme tokens (SPEC §23.1, D-021)', () => {
  it('uses the colours of the specification', () => {
    expect(tokens).toMatchObject({
      background: '#0a1020',
      surface: '#111827',
      'surface-raised': '#182131',
      primary: '#4f52d6',
      accent: '#45d6e6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      foreground: '#f9fafb',
      muted: '#9ca3af',
      'primary-text': '#8b8ef0',
      'error-text': '#f87171',
    });
  });

  it.each(['foreground', 'muted', 'primary-text', 'accent', 'success', 'warning', 'error-text'])(
    'makes %s text readable on every background (WCAG AA 4.5:1)',
    (text) => {
      for (const background of BACKGROUNDS) {
        expect(contrast(text, background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each([
    ['primary-foreground', 'primary'],
    ['background', 'error'],
    ['background', 'accent'],
    ['background', 'success'],
    ['background', 'warning'],
  ])('makes %s text readable on %s buttons and badges (4.5:1)', (text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('makes form field borders visible on every background (WCAG 1.4.11, 3:1)', () => {
    for (const background of BACKGROUNDS) {
      expect(contrast('input-border', background), background).toBeGreaterThanOrEqual(3);
    }
  });
});
