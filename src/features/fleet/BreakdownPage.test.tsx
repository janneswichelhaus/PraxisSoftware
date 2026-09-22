import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau } from '@/test-utils';
import { BreakdownPage } from './BreakdownPage';

/**
 * Der Pannenassistent muss bedienbar sein - einschließlich Rückweg - und darf
 * am Ende nur behaupten, was tatsächlich passiert ist.
 */

function oeffne(pfad = '/betrieb/flotte/panne?rad=r1') {
  return renderMitVorschau(<BreakdownPage />, pfad);
}

describe('Pannenassistent', () => {
  // Der Vorschaubanner ist am 2026-09-22 gefallen; die Prüfung darauf mit ihm.
  // Dass der Ablauf niemanden benachrichtigt, sagt weiter die Zustandsmeldung
  // am Ende (`ehrlichkeit.test.tsx`).

  it('kennzeichnet die Kölner Herkunft der Standortangaben', () => {
    oeffne();
    expect(screen.getByText(/für Tübingen noch zu prüfen/)).toBeInTheDocument();
  });

  it('beginnt mit der Radauswahl, wenn kein Rad vorgegeben ist', () => {
    oeffne('/betrieb/flotte/panne');
    expect(screen.getByRole('combobox', { name: 'Rad' })).toBeInTheDocument();
  });

  it('ueberspringt die Radauswahl bei bekanntem Rad', () => {
    oeffne();
    expect(screen.getByRole('heading', { name: /Weiterfahrt gehindert/ })).toBeInTheDocument();
  });

  it('fuehrt eine Meldung ohne Sperre bis zum Ergebnis', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.type(screen.getByRole('textbox', { name: /Was ist auffällig/ }), 'Licht flackert');
    await nutzer.click(screen.getByRole('button', { name: 'Melden' }));

    expect(screen.getByText(/Panne gemeldet/)).toBeInTheDocument();
    expect(screen.getByText(/bleibt nutzbar/)).toBeInTheDocument();
    expect(
      screen.getByText(/Keine Benachrichtigung an Werkstatt, Teamleitung oder Praxismanagement/),
    ).toBeInTheDocument();
  });

  it('verlangt vor dem Melden eine Beschreibung', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    expect(screen.getByRole('button', { name: 'Melden' })).toBeDisabled();
  });

  it('fuehrt den grossen Schaden ueber Ruhetag und Depot zum Abschluss mit Sperre', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Weiterfahrt gehindert
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    expect(screen.getByRole('heading', { name: /Ist heute Mittwoch/ })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Ruhetag
    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Depot erreichbar
    expect(
      screen.getByText(/Der Zugangscode wird nicht in der Anwendung gespeichert/),
    ).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: /In Reparatur/ }));
    expect(screen.getByText(/als „In Reparatur" markiert/)).toBeInTheDocument();
    expect(screen.getByText(/Keine Termine abgesagt oder verschoben/)).toBeInTheDocument();
  });

  it('fuehrt den Transportzweig bis zur Zusammenfassung', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // gehindert
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' })); // kein Ruhetag
    await nutzer.click(screen.getByRole('button', { name: 'Nein' })); // Werkstatt nicht in der Naehe

    await nutzer.type(screen.getByRole('textbox', { name: /Standort/ }), 'Beispielweg 3');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));

    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Fuehrerschein
    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Fahrzeug erreichbar

    expect(screen.getByRole('heading', { name: /Zusammenfassung/ })).toBeInTheDocument();
    expect(screen.getByText(/Beispielweg 3/)).toBeInTheDocument();
    expect(screen.getByText(/Carsharing/)).toBeInTheDocument();
  });

  it('bietet ohne Fuehrerschein den Fahrdienst an', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.type(screen.getByRole('textbox', { name: /Standort/ }), 'Beispielweg 3');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' })); // kein Fuehrerschein

    expect(screen.getByText(/Fahrdienst\/Taxi/)).toBeInTheDocument();
  });

  it('erlaubt den Rueckweg und zeigt ihn erst nach dem ersten Schritt', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    expect(screen.queryByRole('button', { name: /Zurück/ })).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    expect(screen.getByRole('heading', { name: /Wie groß ist der Schaden/ })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: /Zurück/ }));
    expect(screen.getByRole('heading', { name: /Weiterfahrt gehindert/ })).toBeInTheDocument();
  });

  it('behaelt den eingegebenen Standort beim Zurueckgehen', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.type(screen.getByRole('textbox', { name: /Standort/ }), 'Beispielweg 3');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: /Zurück/ }));

    expect(screen.getByRole('textbox', { name: /Standort/ })).toHaveValue('Beispielweg 3');
  });

  it('nennt in den Anweisungen keine Telefonnummer und keinen Zugangscode', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Werkstatt in der Naehe

    const inhalt = document.body.textContent ?? '';
    expect(inhalt).toMatch(/nicht hinterlegt/);
    expect(inhalt).not.toMatch(/\b\d{4,}\b/);
  });
});
