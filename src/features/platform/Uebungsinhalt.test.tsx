import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Dosis } from '@/features/exercise-plans/dosierung';
import { Dosierungskacheln } from './Uebungsinhalt';

/**
 * Die Dosierung zum Ablesen (ANN-466): Zahlen als Kacheln, der Rest als Zeile.
 * Halten, je Seite und wie oft am Tag (UEB-012) gehen dabei nicht verloren.
 */

const DOSIS: Dosis = {
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  duration_seconds: null,
  load: null,
  tempo: null,
  rest_seconds: 60,
  double_progression: false,
};

describe('Dosierungskacheln', () => {
  it('zeigt Durchgänge, Wiederholungen und Pause groß, ohne Zusatzzeilen', () => {
    render(<Dosierungskacheln dosis={DOSIS} />);
    expect(screen.getByText('Durchgänge')).toBeInTheDocument();
    expect(screen.getByText('8 bis 12')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.queryByText(/je Seite/)).toBeNull();
    expect(screen.queryByText(/halten/)).toBeNull();
    expect(screen.queryByText(/am Tag/)).toBeNull();
  });

  it('zeigt Halten, je Seite und die Häufigkeit am Tag, wenn die Fachperson sie einträgt', () => {
    render(
      <Dosierungskacheln dosis={{ ...DOSIS, hold_seconds: 3, per_side: true, times_per_day: 2 }} />,
    );
    expect(screen.getByText('je Seite')).toBeInTheDocument();
    expect(screen.getByText('Jede Wiederholung 3 Sekunden halten.')).toBeInTheDocument();
    expect(screen.getByText('2-mal am Tag.')).toBeInTheDocument();
  });

  it('zeigt bei einer Dauer kein Halten und „Einmal am Tag“ in Worten', () => {
    render(
      <Dosierungskacheln
        dosis={{
          ...DOSIS,
          reps_min: null,
          reps_max: null,
          duration_seconds: 30,
          hold_seconds: 5,
          times_per_day: 1,
        }}
      />,
    );
    expect(screen.getByText('Dauer')).toBeInTheDocument();
    expect(screen.queryByText(/halten/)).toBeNull();
    expect(screen.getByText('Einmal am Tag.')).toBeInTheDocument();
  });
});
