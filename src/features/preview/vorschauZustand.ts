import {
  demoErstattungen,
  demoDepots,
  demoKanaele,
  demoKatalog,
  demoLeistungen,
  demoMitarbeitende,
  demoNachrichten,
  demoRaeder,
  demoRechnungen,
  demoTouren,
  demoUrlaub,
  demoZahlungen,
  demoZeitbuchungen,
  demoCheckupfragen,
  tagesschluessel,
} from './demodaten';
import type { Vorschauzustand } from './vorschauContext';

/**
 * Aufbau des Vorschaustands aus den synthetischen Daten.
 *
 * Bewusst getrennt vom Provider: Der Aufbau ist reine Datenlogik und wird
 * auch von Tests verwendet, ohne dass dafuer eine React-Komponente noetig
 * waere.
 */
export function erzeugeVorschauzustand(heute = new Date()): Vorschauzustand {
  const stichtag = tagesschluessel(heute);
  return {
    depots: demoDepots,
    raeder: demoRaeder(stichtag),
    mitarbeitende: demoMitarbeitende,
    urlaub: demoUrlaub(stichtag),
    zeitbuchungen: demoZeitbuchungen(stichtag),
    erstattungen: demoErstattungen(stichtag),
    kanaele: demoKanaele,
    nachrichten: demoNachrichten(stichtag),
    touren: demoTouren(stichtag),
    katalog: demoKatalog,
    leistungen: demoLeistungen(stichtag),
    rechnungen: demoRechnungen(stichtag),
    zahlungen: demoZahlungen(stichtag),
    checkupfragen: demoCheckupfragen,
    stromsatzCent: 37,
    stichtag,
  };
}

let laufendeNummer = 0;

/**
 * Kennung fuer Vorschauobjekte.
 *
 * Kein UUID-Ersatz: Diese Kennungen verlassen die Sitzung nie und stehen
 * bewusst erkennbar als Vorschauwerte da.
 */
export function vorschauId(praefix: string): string {
  laufendeNummer += 1;
  return `${praefix}-vorschau-${laufendeNummer}`;
}
