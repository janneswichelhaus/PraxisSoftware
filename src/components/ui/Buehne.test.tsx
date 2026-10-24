import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Buehne } from './Buehne';

/**
 * Die Bühne (Handoff 2026-10-24, Abschnitt 3): der Name als Titel, darunter
 * Zahl und Einheit - ohne Schatten, das Laufrad stumm.
 */
describe('Buehne', () => {
  it('nennt die Übung als Seitentitel und darunter Zahl und Einheit', async () => {
    const { container } = render(
      <Buehne
        name="Mit Halt leicht in die Knie gehen"
        zahl="8 bis 12"
        einheit="Wiederholungen je Durchgang"
      />,
    );
    const buehne = screen.getByRole('region', { name: 'Mit Halt leicht in die Knie gehen' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mit Halt leicht in die Knie gehen' }),
    ).toBeInTheDocument();
    expect(buehne).toHaveTextContent('8 bis 12Wiederholungen je Durchgang');
    // Keine Karte zum Antippen: kein Schatten (ANN-678).
    expect(buehne.className).not.toMatch(/shadow/);
    expect(buehne.querySelector('[data-laufrad]')).toHaveAttribute('aria-hidden', 'true');
    await pruefeBarrierefreiheit(container);
  });

  it('trennt den Namen nur unter 23rem und hält Zahl und Einheit in eigenen Zeilen', () => {
    render(<Buehne name="Treppengeländer" zahl="10" einheit="Wiederholungen je Seite" />);
    expect(screen.getByRole('heading', { name: 'Treppengeländer' })).toHaveClass(
      'trennen-schmal',
      'text-hero',
      'text-balance',
    );
    expect(screen.getByText('10')).toHaveClass('text-hauptzahl', 'tabular-nums');
    expect(screen.getByText('Wiederholungen je Seite')).toHaveClass('font-semibold');
  });

  it('steht im Fenster als h2 und nimmt in der Durchführung beim Wechsel den Fokus', () => {
    const titel = createRef<HTMLHeadingElement>();
    const { rerender } = render(
      <Buehne name="Becken anheben" zahl="30" einheit="Sekunden je Durchgang" ebene={2} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Becken anheben' })).not.toHaveAttribute(
      'tabindex',
    );
    rerender(
      <Buehne name="Becken anheben" zahl="30" einheit="Sekunden je Durchgang" titelRef={titel} />,
    );
    titel.current?.focus();
    expect(screen.getByRole('heading', { level: 1, name: 'Becken anheben' })).toHaveFocus();
  });
});
