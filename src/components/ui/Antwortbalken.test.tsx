import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Antwortbalken } from './Antwortbalken';

describe('Antwortbalken', () => {
  it('zeigt jede Antwort mit Tag, Balken nach dem Bereich und Zahl, ohne Linie und ohne Deutung', async () => {
    const { container } = render(
      <Antwortbalken
        beschriftung="Ihre Angaben"
        min={0}
        max={10}
        antworten={[
          { datum: '21.10.2026', wert: 3, text: '3' },
          { datum: '14.10.2026', wert: 5, text: '5', vermerk: 'Vertretung' },
        ]}
      />,
    );
    const zeilen = within(screen.getByRole('list', { name: 'Ihre Angaben' })).getAllByRole(
      'listitem',
    );
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent('21.10.2026: 3');
    expect(zeilen[1]).toHaveTextContent('14.10.2026 · Vertretung: 5');
    const balken = zeilen[0]!.querySelector('[data-fortschritt]') as HTMLElement;
    expect(balken.style.width).toBe('30%');
    expect(balken.closest('[aria-hidden="true"]')).toHaveClass('border-line-strong', 'h-3');
    expect(container.querySelector('polyline, path')).toBeNull();
    expect(screen.queryByText(/besser|schlechter|Trend/)).toBeNull();
    await pruefeBarrierefreiheit(container);
  });
});
