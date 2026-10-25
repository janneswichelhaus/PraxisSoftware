import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Dosierungsmarken } from './Dosierungsmarken';
import type { DosisZumAblesen } from './Dosierungsmarken';

const DOSIS: DosisZumAblesen = {
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  duration_seconds: null,
  load: 'Rucksack 3 kg',
  tempo: null,
  rest_seconds: 60,
  double_progression: false,
  hold_seconds: null,
  per_side: false,
  times_per_day: null,
};

const marken = () =>
  within(screen.getByRole('list', { name: 'Dosierung' }))
    .getAllByRole('listitem')
    .map((m) => m.textContent);

/**
 * Die Marken unter der Bühne (Handoff 2026-10-24, Abschnitt 3): Angaben, keine
 * Knöpfe; die Hauptzahl steht in der Bühne. Die Zeilen darunter im Wortlaut
 * der Kacheln, die sie ablösen.
 */
describe('Dosierungsmarken', () => {
  it('zeigt Durchgänge, Pause und Last als Marken, die Wiederholungen nicht', async () => {
    const { container } = render(<Dosierungsmarken dosis={DOSIS} />);
    expect(marken()).toEqual(['3 Durchgänge', '60 Sekunden Pause', 'mit Rucksack 3 kg']);
    expect(screen.queryByRole('button')).toBeNull();
    for (const marke of screen.getAllByRole('listitem')) {
      expect(marke).toHaveClass('bg-surface-sunken', 'rounded-pill', 'min-h-10', 'font-semibold');
      expect(marke.className).not.toMatch(/\bborder\b/);
    }
    await pruefeBarrierefreiheit(container);
  });

  it('lässt weg, was nicht eingetragen ist, und sagt „1 Durchgang“', () => {
    render(<Dosierungsmarken dosis={{ ...DOSIS, sets: 1, rest_seconds: null, load: null }} />);
    expect(marken()).toEqual(['1 Durchgang']);
  });

  it('nimmt eine Pause von 0 Sekunden nicht als Marke', () => {
    render(<Dosierungsmarken dosis={{ ...DOSIS, rest_seconds: 0 }} />);
    expect(marken()).toEqual(['3 Durchgänge', 'mit Rucksack 3 kg']);
  });

  it('hält Halten, Häufigkeit, Tempo und die Regel der Fachperson als Zeilen im alten Wortlaut', () => {
    render(
      <Dosierungsmarken
        dosis={{
          ...DOSIS,
          hold_seconds: 3,
          times_per_day: 2,
          tempo: '3-0-1',
          double_progression: true,
        }}
      />,
    );
    expect(screen.getByText('Jede Wiederholung 3 Sekunden halten.')).toBeInTheDocument();
    expect(screen.getByText('2-mal am Tag.')).toBeInTheDocument();
    expect(screen.getByText('Tempo: 3-0-1')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Beginnen Sie mit 8 und steigern Sie bis 12 Wiederholungen. Schaffen Sie in allen Durchgängen 12, sagen Sie es uns – dann passen wir das Gewicht an.',
      ),
    ).toBeInTheDocument();
  });

  it('sagt „Einmal am Tag.“ und hält ohne Wiederholungen nichts', () => {
    render(
      <Dosierungsmarken
        dosis={{
          ...DOSIS,
          reps_min: null,
          reps_max: null,
          duration_seconds: 30,
          hold_seconds: 5,
          times_per_day: 1,
          double_progression: true,
        }}
      />,
    );
    expect(screen.getByText('Einmal am Tag.')).toBeInTheDocument();
    expect(screen.queryByText(/halten/)).toBeNull();
    expect(screen.queryByText(/steigern Sie/)).toBeNull();
  });
});
