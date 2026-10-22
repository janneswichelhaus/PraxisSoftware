import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Notfallkarte } from './Notfallkarte';
import { NICHT_AKUT, zusage } from './nachrichtentexte';

/**
 * Zusage und Notfallhinweis als Karte (Handoff 2026-10-22, Abschnitt 3): der
 * Wortlaut unverändert, die Nummern zum Antippen.
 */
describe('Notfallkarte', () => {
  it('trägt Zusage, Hinweis und beide Notrufnummern, als Hinweis benannt', async () => {
    const { container } = render(<Notfallkarte werktage={2} />);
    const karte = screen.getByRole('note', { name: 'Hinweis zu Antwortzeit und Notfällen' });
    expect(karte).toHaveTextContent(zusage(2));
    expect(karte).toHaveTextContent(NICHT_AKUT);
    expect(screen.getByRole('link', { name: '112 anrufen' })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByRole('link', { name: '116117 anrufen' })).toHaveAttribute(
      'href',
      'tel:116117',
    );
    expect(karte.className).toContain('bg-surface-sunken');
    expect(karte.className).toContain('rounded-card');
    await pruefeBarrierefreiheit(container);
  });
});
