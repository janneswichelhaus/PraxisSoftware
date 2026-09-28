import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { CheckupPage } from './CheckupPage';

/**
 * Check-Up: Bedienung der Bewertungschips und Auswahl des Rads. Dass jeder
 * Check-Up leer beginnt und nichts vortäuscht, prüft `ehrlichkeit.test.tsx`.
 */

function oeffne(pfad = '/betrieb/flotte/checkup?rad=r1') {
  return renderMitVorschau(<CheckupPage user={testUser(['therapist'])} />, pfad);
}

describe('Fahrrad-Check-Up', () => {
  it('zeigt den Tastaturfokus am Chip, nicht am ausgeblendeten Radio (VOR-02)', () => {
    oeffne();
    const chip = screen.getAllByRole('radio', { name: 'Problem' })[0]!.closest('label');
    expect(chip).toHaveClass(
      'has-[:focus-visible]:outline-2',
      'has-[:focus-visible]:outline-accent',
      'has-[:focus-visible]:outline-offset-2',
    );
  });

  it('kennzeichnet die gewaehlte Bewertung mit einem Zeichen, nicht nur mit Farbe', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const problem = screen.getAllByRole('radio', { name: 'Problem' })[0]!;

    await nutzer.click(problem);

    expect(problem).toBeChecked();
    expect(problem.closest('label')).toHaveTextContent('✓Problem');
    expect(
      screen.getAllByRole('radio', { name: 'In Ordnung' })[0]!.closest('label'),
    ).not.toHaveTextContent('✓');
  });

  it('nennt Rad und Standort in der Auswahl ohne Doppelklammer (VOR-24)', () => {
    oeffne('/betrieb/flotte/checkup');
    expect(
      screen.getByRole('option', { name: 'Lastenrad 5 (Ersatz) · Raddepot Nord' }),
    ).toBeInTheDocument();
  });

  it('fuehrt oben zur Radflotte zurueck (VOR-21)', () => {
    oeffne();
    expect(screen.getByRole('link', { name: '← Zurück zur Radflotte' })).toHaveAttribute(
      'href',
      '/betrieb/flotte',
    );
  });

  it('verwirft beim Zurueck zur Radwahl die Eingaben des Rads (VOR-03)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getAllByRole('radio', { name: 'Beobachten' })[0]!);

    await nutzer.click(screen.getByRole('button', { name: 'Zurück' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(screen.getAllByRole('radio', { name: 'In Ordnung' })[0]).toBeChecked();
  });
});
