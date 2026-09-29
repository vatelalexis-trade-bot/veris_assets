import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { NAV_SECTIONS, SectionNav } from './section-nav';

/** Stand-in for the browser's IntersectionObserver (jsdom has none): the test says what is seen. */
let report: (id: string) => void = () => {};
let options: IntersectionObserverInit | undefined;

class FakeObserver {
  private readonly targets: Element[] = [];

  constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    options = init;
    report = (id) =>
      callback(
        this.targets.map(
          (target) => ({ target, isIntersecting: target.id === id }) as IntersectionObserverEntry,
        ),
        this as unknown as IntersectionObserver,
      );
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  for (const id of [...NAV_SECTIONS, 'roles']) {
    const section = document.createElement('section');
    section.id = id;
    document.body.append(section);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const id of [...NAV_SECTIONS, 'roles']) document.getElementById(id)?.remove();
});

const current = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'true')
    .map((link) => link.textContent);

describe('navigation of the public site', () => {
  it('highlights the section crossing the band at a third of the window', () => {
    renderWithIntl(<SectionNav />);
    expect(options?.rootMargin).toBe('-33% 0px -66% 0px');
    expect(current()).toEqual([]);

    act(() => report('security'));
    expect(current()).toEqual(['Security']);
    expect(screen.getByRole('link', { name: 'Security' }).className).toContain('text-accent');
    expect(screen.getByRole('link', { name: 'Security' }).className).toContain('font-semibold');
    expect(screen.getByRole('link', { name: 'Platform' }).className).toContain('text-muted');

    // A section without a menu entry keeps the last highlighted one.
    act(() => report('roles'));
    expect(current()).toEqual(['Security']);
  });

  it('highlights a clicked link at once, whatever the scroll passes over', () => {
    vi.useFakeTimers();
    renderWithIntl(<SectionNav />);
    fireEvent.click(screen.getByRole('link', { name: 'Contact' }));
    expect(current()).toEqual(['Contact']);
    act(() => report('calculator'));
    expect(current()).toEqual(['Contact']);

    vi.advanceTimersByTime(1100);
    act(() => report('calculator'));
    expect(current()).toEqual(['Calculator']);
  });
});
