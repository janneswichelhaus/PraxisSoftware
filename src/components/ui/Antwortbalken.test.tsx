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

  it('stellt den Vermerk unter den Tag und eine Einheit klein hinter die Zahl', () => {
    render(
      <Antwortbalken
        beschriftung="Ihre Angaben zu Schmerz wieder wie vorher nach"
        min={0}
        max={72}
        antworten={[
          { datum: '26.10.2026', wert: 18, text: '18', einheit: 'Stunden' },
          {
            datum: '14.10.2026',
            wert: 24,
            text: '24',
            einheit: 'Stunden',
            vermerk: 'Heimprogramm Knie · Vertretung',
          },
        ]}
      />,
    );
    const [ohne, mit] = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(ohne).toHaveTextContent('26.10.2026: 18 Stunden');
    expect(mit).toHaveTextContent('14.10.2026 · Heimprogramm Knie · Vertretung: 24 Stunden');
    // Eine eigene Zeile über die ganze Breite: Ein langer Plantitel bricht nie in der Spalte des Tags.
    expect(within(mit!).getByText('Heimprogramm Knie · Vertretung')).toHaveClass(
      'col-span-full',
      'row-start-2',
      'text-ink-muted',
    );
    expect(within(mit!).getByText('Stunden')).toHaveClass('text-ink-muted');
    // Gestapelt stehen Balken und Zahl unter Tag und Vermerk, sonst unter dem Tag.
    expect(mit!.querySelector('[data-fortschritt]')!.closest('.row-start-1')).toHaveClass(
      'max-[23rem]:row-start-3',
    );
    expect(ohne!.querySelector('[data-fortschritt]')!.closest('.row-start-1')).toHaveClass(
      'max-[23rem]:row-start-2',
    );
    expect((mit!.querySelector('[data-fortschritt]') as HTMLElement).style.width).toBe('33%');
  });
});
