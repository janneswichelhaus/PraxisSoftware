import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubNav, type SubNavEintrag } from './SubNav';

/**
 * Vorschauen in der Unterleiste (UX-002h, ANN-493): ab zwei stehen sie hinter
 * „Vorschau (n)“, eine einzelne steht offen mit ihrer Marke. Bis ZK-001 prüfte
 * das AppShell.test.tsx am Menü „Organisatorisches“; dort ist seither nur eine
 * Vorschau übrig.
 */

function leiste(eintraege: SubNavEintrag[], pfad = '/echt') {
  render(
    <MemoryRouter initialEntries={[pfad]}>
      <SubNav label="Bereich Test" eintraege={eintraege} />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'Bereich Test' });
}

const ECHT: SubNavEintrag = { to: '/echt', label: 'Echt' };
const ZWEITER: SubNavEintrag = { to: '/zweiter', label: 'Zweiter' };

describe('SubNav: Vorschauen', () => {
  it('klappt zwei Vorschauen hinter die echten Punkte ein', () => {
    const menue = leiste([
      ECHT,
      ZWEITER,
      { to: '/vorschau-a', label: 'Vorschau A', vorschau: true },
      { to: '/vorschau-b', label: 'Vorschau B', vorschau: true },
    ]);
    expect(within(menue).queryByRole('link', { name: /Vorschau A/ })).toBeNull();
    const knopf = within(menue).getByRole('button', { name: 'Vorschau (2)' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(knopf);
    expect(within(menue).getByRole('link', { name: /Vorschau A/ })).toHaveTextContent('Vorschau');
    expect(within(menue).getByRole('button', { name: 'Vorschau einklappen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('zeigt eine einzelne Vorschau offen mit ihrer Marke', () => {
    const menue = leiste([
      ECHT,
      ZWEITER,
      { to: '/vorschau-a', label: 'Vorschau A', vorschau: true },
    ]);
    expect(within(menue).getByRole('link', { name: /Vorschau A/ })).toBeInTheDocument();
    expect(within(menue).queryByRole('button', { name: /^Vorschau/ })).toBeNull();
  });

  it('klappt nicht ein, solange eine Vorschau die aktive Seite ist', () => {
    const menue = leiste(
      [
        ECHT,
        { to: '/vorschau-a', label: 'Vorschau A', vorschau: true },
        { to: '/vorschau-b', label: 'Vorschau B', vorschau: true },
      ],
      '/vorschau-b',
    );
    expect(within(menue).getByRole('link', { name: /Vorschau B/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menue).queryByRole('button', { name: /^Vorschau/ })).toBeNull();
  });
});
