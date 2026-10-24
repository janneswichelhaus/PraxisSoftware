import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Wochenleiste, type Wochentag } from './Wochenleiste';

const WOCHE: readonly Wochentag[] = [
  { nummer: 1, kurz: 'Mo', lang: 'Montag' },
  { nummer: 2, kurz: 'Di', lang: 'Dienstag' },
  { nummer: 3, kurz: 'Mi', lang: 'Mittwoch' },
  { nummer: 4, kurz: 'Do', lang: 'Donnerstag' },
  { nummer: 5, kurz: 'Fr', lang: 'Freitag' },
  { nummer: 6, kurz: 'Sa', lang: 'Samstag' },
  { nummer: 7, kurz: 'So', lang: 'Sonntag' },
];

function leiste(teil: { tage?: number[]; gesperrt?: boolean; onUmschalten?: () => void } = {}) {
  return (
    <Wochenleiste
      titel="Ihre Übungstage"
      wochentage={WOCHE}
      tage={teil.tage ?? [1, 3, 6]}
      onUmschalten={teil.onUmschalten ?? (() => undefined)}
      satz="Sie üben an 3 Tagen."
      gesperrt={teil.gesperrt ?? false}
    />
  );
}

/**
 * Die Wochenleiste (Handoff 2026-10-24, Abschnitt 3; ANN-708): sieben
 * Schalter mit vollem Tagesnamen in einer benannten Gruppe, aneinander -
 * ohne Netz gesperrt statt eines Tipps, der zurückspringt.
 */
describe('Wochenleiste', () => {
  it('zeigt sieben Schalter in einer benannten Gruppe und meldet den Tipp', async () => {
    const umschalten = vi.fn();
    const { container } = render(leiste({ onUmschalten: umschalten }));
    const gruppe = screen.getByRole('group', { name: 'Ihre Übungstage' });
    expect(screen.getByRole('heading', { level: 3, name: 'Ihre Übungstage' })).toBeInTheDocument();
    const tage = within(gruppe).getAllByRole('button');
    expect(tage.map((t) => t.textContent)).toEqual([
      'MoMontag',
      'DiDienstag',
      'MiMittwoch',
      'DoDonnerstag',
      'FrFreitag',
      'SaSamstag',
      'SoSonntag',
    ]);
    expect(tage.map((t) => t.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
      'false',
      'false',
      'true',
      'false',
    ]);
    // Gewählt heißt gefüllt, mit Haken und fett - nicht nur Farbe.
    const montag = screen.getByRole('button', { name: 'Montag' });
    expect(montag).toHaveClass('bg-accent', 'text-surface', 'font-bold', 'min-h-14');
    expect(montag.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Dienstag' }).querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dienstag' }));
    expect(umschalten).toHaveBeenCalledWith(2);
    expect(screen.getByRole('status')).toHaveTextContent('Sie üben an 3 Tagen.');
    // Ein Segment: aneinander, Abstand nur unter 23rem.
    expect(gruppe.className.split(' ').filter((k) => k.startsWith('gap-'))).toEqual([]);
    await pruefeBarrierefreiheit(container);
  });

  it('ist gesperrt lesbar, gestrichelt und nicht bedienbar', () => {
    const umschalten = vi.fn();
    render(leiste({ gesperrt: true, onUmschalten: umschalten }));
    const gruppe = screen.getByRole('group', { name: 'Ihre Übungstage' });
    expect(gruppe).toHaveClass('border-dashed');
    for (const tag of within(gruppe).getAllByRole('button')) expect(tag).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Montag' })).toHaveClass(
      'bg-accent-soft',
      'text-accent',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dienstag' }));
    expect(umschalten).not.toHaveBeenCalled();
  });
});
