import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { PUNKTE_HOECHSTENS, Wochenleiste } from './Wochenleiste';

/**
 * Die Punkte der Wochenleiste bleiben in ihrer Tageszelle (Jannes,
 * Bildschirmfoto vom 13.10.2026): bis sechs als Punkte in Reihen zu drei,
 * darüber als Zahl.
 */
describe('Wochenleiste', () => {
  const heute = '2026-10-13';

  function zelle(tag: string) {
    const nav = screen.getByRole('navigation', { name: 'Tag wählen' });
    const index = Number(tag.slice(8, 10)) - 13;
    return within(nav).getAllByRole('listitem')[index]!;
  }

  it('zeigt bis sechs Termine als Punkte in Reihen zu drei', () => {
    renderWithProviders(
      <Wochenleiste tag={heute} heute={heute} anzahl={(t) => (t === heute ? 6 : 2)} />,
    );
    const punkte = zelle(heute).querySelector('[data-punkte]')!;
    expect(punkte.children).toHaveLength(PUNKTE_HOECHSTENS);
    expect(punkte).toHaveClass('grid', 'grid-cols-[repeat(3,4px)]');
  });

  it('zeigt mehr als sechs Termine als Zahl statt einer Punktkette', () => {
    renderWithProviders(
      <Wochenleiste tag={heute} heute={heute} anzahl={(t) => (t === '2026-10-14' ? 8 : 0)} />,
    );
    const punkte = zelle('2026-10-14').querySelector('[data-punkte]')!;
    expect(punkte).toHaveTextContent('8');
    expect(punkte.children).toHaveLength(0);
  });
});
