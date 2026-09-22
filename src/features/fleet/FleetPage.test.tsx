import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { FleetPage } from './FleetPage';

/**
 * Die Radflotte ist die umfangreichste Übernahme aus der Vorlage. Geprüft wird
 * hier vor allem, was leicht verloren geht: die geschützten Angaben, die
 * Verbindung zur Abwesenheit und die ehrliche Rückmeldung nach einer Aktion.
 */

function oeffne(rollen: Parameters<typeof testUser>[0] = ['owner'], pfad = '/betrieb/flotte') {
  return renderMitVorschau(<FleetPage user={testUser(rollen)} />, pfad);
}

describe('Radflotte', () => {
  // Der Vorschaubanner ist am 2026-09-22 gefallen; die Prüfung darauf mit ihm.
  // Was nach einer Aktion nicht passiert ist, sagt weiter die Zustandsmeldung
  // weiter unten — das ist die Aussage, die niemand erraten kann.

  it('zeigt die Räder nach Standort gruppiert', () => {
    oeffne();
    expect(screen.getByRole('heading', { name: /Raddepot Nord/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Raddepot Süd/ })).toBeInTheDocument();
  });

  it('nennt den Bestand nach Status', () => {
    oeffne();
    expect(screen.getByText(/in Reparatur/)).toBeInTheDocument();
    expect(screen.getByText(/8 Räder insgesamt/)).toBeInTheDocument();
  });

  it('weist ein Rad am falschen Standort ausdruecklich aus', () => {
    oeffne();
    expect(screen.getByText(/Steht nicht im Stammdepot/)).toBeInTheDocument();
  });

  it('zeigt den Schluesselcode nur der administrativen Praxisrolle', () => {
    oeffne(['owner']);
    expect(screen.getAllByText('SC-0001').length).toBeGreaterThan(0);
  });

  it('zeigt den Schluesselcode einer behandelnden Rolle nicht', () => {
    oeffne(['therapist']);
    expect(screen.queryByText('SC-0001')).toBeNull();
  });

  /**
   * Ein Rad steht an zwei Stellen: als Karte in der gefilterten Liste und als
   * Zeile in der Wochenübersicht. Die Übersicht zeigt bewusst immer alle Räder,
   * damit die Frage „welches Rad ist am Donnerstag frei" ohne Zurücksetzen der
   * Filter zu beantworten ist. Ein gefiltertes Rad kommt deshalb einmal vor,
   * ein sichtbares zweimal.
   */
  function vorkommen(name: string): number {
    return screen.queryAllByText(name).length;
  }

  it('filtert nach Status und laesst die Wochenuebersicht vollstaendig', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'reparatur');
    expect(vorkommen('Lastenrad 4')).toBe(2);
    expect(vorkommen('Lastenrad 1')).toBe(1);
  });

  it('filtert nach Suchbegriff', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.type(screen.getByRole('searchbox', { name: 'Suche' }), 'Lastenrad 7');
    expect(vorkommen('Lastenrad 7')).toBe(2);
    expect(vorkommen('Lastenrad 1')).toBe(1);
  });

  it('filtert auf Räder, die an einem bestimmten Tag frei sind', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    // Lastenrad 4 ist Mo-Fr belegt, Lastenrad 7 hat gar keinen Wochenplan.
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Freier Tag' }), 'mi');
    expect(vorkommen('Lastenrad 7')).toBe(2);
    expect(vorkommen('Lastenrad 4')).toBe(1);
  });

  it('meldet ehrlich, was das Zuruecklegen eines Schluessels bewirkt hat', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getAllByRole('button', { name: 'Zurückgelegt' })[0]!);

    const meldung = screen.getByRole('status');
    expect(within(meldung).getByText(/Schlüssel zurückgelegt/)).toBeInTheDocument();
    expect(
      within(meldung).getByText(/Kein Vorgang gespeichert, keine Benachrichtigung versendet/),
    ).toBeInTheDocument();
  });

  it('gibt ein gesperrtes Rad frei, ohne eine Rueckmeldung an die Werkstatt zu behaupten', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Freigeben' }));

    const meldung = screen.getByRole('status');
    expect(within(meldung).getByText(/Rad freigegeben: Lastenrad 4/)).toBeInTheDocument();
    expect(within(meldung).getByText(/Keine Rückmeldung an die Werkstatt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Freigeben' })).toBeNull();
  });

  it('erklaert die Standortvorlage als ungeprueft und ohne Zugangscode', async () => {
    const nutzer = userEvent.setup();
    oeffne(['owner']);

    await nutzer.click(screen.getByText(/Kontakte, Standortvorlage und Check-Up-Fragen/));
    expect(screen.getAllByText(/für Tübingen noch zu prüfen/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Der Zugangscode wird nicht in der Anwendung gespeichert/),
    ).toBeInTheDocument();
  });

  it('bietet die Standortvorlage einer behandelnden Rolle nicht an', () => {
    oeffne(['therapist']);
    expect(screen.queryByText(/Kontakte, Standortvorlage und Check-Up-Fragen/)).toBeNull();
  });

  it('fuehrt die Einstiege in Panne, Schluessel und Check-Up', () => {
    oeffne();
    expect(screen.getByRole('link', { name: 'Panne melden' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/panne',
    );
    expect(screen.getByRole('link', { name: 'Schlüssel entnehmen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fahrrad-Check-Up' })).toBeInTheDocument();
  });
});
