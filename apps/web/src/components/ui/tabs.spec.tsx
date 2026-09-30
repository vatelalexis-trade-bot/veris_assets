import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './tabs';

const ITEMS = [
  { value: 'investor', label: 'Investor', content: <p>Five steps</p> },
  { value: 'issuer', label: 'Issuer', content: <p>Six steps</p> },
  { value: 'compliance', label: 'Compliance', content: <p>Audit trail</p> },
];

describe('tabs', () => {
  it('shows the panel of the selected tab only, all panels staying in the page', () => {
    render(<Tabs label="Journeys" items={ITEMS} />);
    expect(screen.getByRole('tablist', { name: 'Journeys' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Investor' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('Five steps');
    expect(screen.getByText('Six steps', { selector: 'p' }).closest('[hidden]')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Issuer' }));
    expect(screen.getByRole('tabpanel', { name: 'Issuer' }).textContent).toBe('Six steps');
  });

  it('moves with the arrow keys, Home and End, with a single tab in the focus order', () => {
    render(<Tabs label="Journeys" items={ITEMS} defaultValue="issuer" />);
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(ITEMS.map((item) => tab(item.label).tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(tab('Issuer'), { key: 'ArrowRight' });
    expect(tab('Compliance').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Compliance'));
    fireEvent.keyDown(tab('Compliance'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Investor'));
    fireEvent.keyDown(tab('Investor'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tab('Compliance'));
    fireEvent.keyDown(tab('Compliance'), { key: 'Home' });
    expect(document.activeElement).toBe(tab('Investor'));
    fireEvent.keyDown(tab('Investor'), { key: 'End' });
    expect(screen.getByRole('tabpanel').textContent).toBe('Audit trail');
  });
});
