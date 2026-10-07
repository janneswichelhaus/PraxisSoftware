import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { KeyPage } from './KeyPage';

/**
 * Der tägliche Weg zum Schlüssel beginnt ohne vorgewähltes Rad (VOR-18): Bis
 * dahin stand das erste Rad der Liste in der Auswahl - im Demostand eines mit
 * vergebenem Schlüssel -, und die Seite öffnete mit einer Warnung.
 */

function oeffne(pfad = '/betrieb/flotte/schluessel') {
  return renderMitVorschau(<KeyPage user={testUser(['therapist'], 'Anna Beispiel')} />, pfad);
}

describe('Schlüsselentnahme', () => {
  it('beginnt ohne vorgewaehltes Rad und ohne Warnung', () => {
    oeffne();
    expect(screen.getByRole('combobox', { name: 'Rad' })).toHaveValue('');
    expect(screen.queryByText(/Der Schlüssel ist bereits bei/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Entnahme bestätigen' })).toBeDisabled();
  });

  it('sagt am gesperrten Knopf, was fehlt (BEF-069, Handoff Schrift und Knoepfe)', async () => {
    const user = userEvent.setup();
    oeffne();
    const knopf = screen.getByRole('button', { name: 'Entnahme bestätigen' });
    expect(knopf).toHaveAccessibleDescription('Erst ein Rad wählen.');

    const rad = screen.getByRole('combobox', { name: 'Rad' });
    const frei = within(rad)
      .getAllByRole('option')
      .find(
        (o) => o.textContent && !o.textContent.includes('vergeben') && o.getAttribute('value'),
      )!;
    await user.selectOptions(rad, frei);
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    expect(knopf).toHaveAccessibleDescription('Erst einen Namen eintragen.');

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Anna Beispiel');
    expect(knopf).toBeEnabled();
    expect(knopf).not.toHaveAccessibleDescription();
  });

  it('stellt Raeder mit vergebenem Schluessel ans Ende und sagt es vorn im Text', () => {
    oeffne();
    const optionen = within(screen.getByRole('combobox', { name: 'Rad' }))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionen.at(-2)).toBe('Lastenrad 1 (vergeben an Lena Hartmann) · Raddepot Nord');
    expect(optionen.at(-1)).toBe(
      'Lastenrad 5 (Ersatz) (vergeben an Aylin Özdemir) · Raddepot Nord',
    );
    expect(optionen[1]).toBe('Lastenrad 2 · Raddepot Nord');
  });

  it('leert die Auswahl nach der Entnahme, statt erneut zu warnen', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/schluessel?rad=r2');

    await nutzer.click(screen.getByRole('button', { name: 'Entnahme bestätigen' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Schlüssel entnommen: Lastenrad 2/);
    expect(screen.getByRole('combobox', { name: 'Rad' })).toHaveValue('');
    expect(screen.queryByText(/Der Schlüssel ist bereits bei/)).toBeNull();
  });

  it('beschreibt, was die Seite tut, und fuehrt oben zurueck (VOR-18, VOR-21)', () => {
    oeffne();
    expect(screen.getByText('Schlüssel für ein Rad aus dem Tresor nehmen.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Zurück zur Radflotte' })).toHaveAttribute(
      'href',
      '/betrieb/flotte',
    );
  });
});
