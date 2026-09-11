import type { NavigationTarget, PostalAddress } from './contract';

/**
 * Übergabe an eine externe Navigations-App (UX-002, ADR-019 Punkt 20 bis 23).
 *
 * ANN-018 (docs/decisions/ASSUMPTIONS.md): Übergabeziel und URL-Format. Dies
 * ist die eine Stelle, an der die Annahme greift - ändert die
 * Datenschutzprüfung das Ziel, den Feldzuschnitt oder die Ziel-App, ändert sich
 * genau diese Datei.
 *
 * Drei Regeln, die diese Datei trägt und die im Review geprüft werden:
 *
 *   1. **Nur das Ziel und der Fahrradmodus.** Kein Name, keine Uhrzeit, keine
 *      Termin- oder Patientenkennung, keine Notiz, keine Diagnose. Was hier
 *      nicht im Typ steht, kann auch nicht mitgehen.
 *   2. **Erst beim Tippen.** Die Funktionen hier werden im Klickhandler
 *      aufgerufen, nie beim Rendern. Eine gebaute URL wird nirgends
 *      gespeichert und nie automatisch geöffnet (ADR-019 Punkt 20).
 *   3. **Kein eingebetteter Rahmen.** Die Anwendung übermittelt nichts; die
 *      Verbindung baut das Gerät der Person nach ihrem Tippen auf.
 *
 * Ziel-App ist in dieser Stufe ausschließlich Google Maps - so steht es in der
 * Roadmap-Zeile von UX-EPIC-001. Apple Maps und die Systemnavigation (`geo:`)
 * gehören zu MAP-005, das sie auf echten Geräten bewertet; sie werden hier
 * nicht auf Vorrat gebaut (PROJECT_PRINCIPLES.md §11, ADR-014).
 */

/**
 * Höchstzahl der Zwischenziele einer Google-Maps-URL.
 *
 * Neun laut Anbieterdokumentation; in mobilen Browsern sind es nach demselben
 * Stand drei. MAP-005 prüft beides auf echten Geräten nach (ANN-018). Bis
 * dahin gilt die dokumentierte Zahl, und ein längerer Tag wird in Abschnitte
 * geteilt, statt still abgeschnitten zu werden.
 */
export const MAX_ZWISCHENZIELE = 9;

/** Stopps je Abschnitt: die Zwischenziele plus das Ziel des Abschnitts. */
export const STOPPS_JE_ABSCHNITT = MAX_ZWISCHENZIELE + 1;

/**
 * Die Adresse als eine Zeile - ohne Namen, ohne Zusatz.
 *
 * Genau die vier Felder des Adress-Snapshots plus Ländercode. Kein Feld mehr:
 * die Feldliste ist der datenschutzrechtlich geprüfte Teil (ANN-018).
 */
function adressZeile(adresse: PostalAddress): string {
  const strasse = [adresse.street, adresse.houseNumber].filter(Boolean).join(' ');
  const ort = [adresse.postalCode, adresse.city].filter(Boolean).join(' ');
  return [strasse, ort, adresse.countryCode].filter(Boolean).join(', ');
}

/**
 * Der Adress-Snapshot eines Termins, so weit der Handoff ihn braucht.
 *
 * Bewusst ein struktureller Typ und nicht der volle Termin: Was diese Funktion
 * nicht entgegennimmt, kann sie auch nicht übergeben. Name, Uhrzeit,
 * Zugangshinweis und Kennungen sind hier schlicht nicht vorhanden.
 */
export interface Besuchsadresse {
  readonly appointment_type: 'home_visit' | 'practice' | 'video';
  readonly visit_street: string | null;
  readonly visit_house_number: string | null;
  readonly visit_postal_code: string | null;
  readonly visit_city: string | null;
}

/**
 * Das Navigationsziel eines Termins - oder `null`, wenn es keines gibt.
 *
 * Übergeben wird ausschließlich die Postanschrift ohne Namen. Sobald die
 * Adresse eine Koordinate trägt (ANN-016, ab MAP-006), tritt sie an diese
 * Stelle; die Stelle ist genau diese Funktion.
 *
 * `null` für alles außer einem Hausbesuch und für einen unvollständigen
 * Adress-Snapshot. Die Datenbank lässt eine halbe Adresse zwar nicht zu; die
 * Prüfung steht hier trotzdem, damit kein Ziel ohne Hausnummer als scheinbar
 * gültiger Link erscheint.
 */
export function navigationsZiel(besuch: Besuchsadresse): NavigationTarget | null {
  if (besuch.appointment_type !== 'home_visit') return null;
  const { visit_street, visit_house_number, visit_postal_code, visit_city } = besuch;
  if (!visit_street || !visit_house_number || !visit_postal_code || !visit_city) return null;

  return {
    kind: 'address',
    address: {
      street: visit_street,
      houseNumber: visit_house_number,
      postalCode: visit_postal_code,
      city: visit_city,
      // Der Ländercode ist keine zusätzliche Angabe über die Person, sondern
      // die Auflösung der Postleitzahl. Die Praxis fährt in Deutschland; ein
      // Feld dafür gibt es im Adress-Snapshot nicht.
      countryCode: 'DE',
    },
  };
}

/** Ein Ziel in der Schreibweise, die die Navigation versteht. */
function zielText(ziel: NavigationTarget): string {
  if (ziel.kind === 'coordinate') return `${ziel.position.lat},${ziel.position.lon}`;
  return adressZeile(ziel.address);
}

/**
 * Die URL für ein einzelnes Ziel im Fahrradmodus.
 *
 * Kein `origin`: den Startpunkt bestimmt das Gerät. Ihn zu setzen hieße, den
 * Standort der Therapeutin zu kennen und zu übergeben - genau das soll nicht
 * passieren (§20).
 */
export function buildGoogleMapsUrl(ziel: NavigationTarget): string {
  const parameter = new URLSearchParams({
    api: '1',
    destination: zielText(ziel),
    travelmode: 'bicycling',
  });
  return `https://www.google.com/maps/dir/?${parameter.toString()}`;
}

/**
 * Der ganze Tag in Terminreihenfolge - als ein Link, oder als mehrere, wenn
 * das Wegpunktlimit der Ziel-App nicht reicht.
 *
 * Abschnitte überlappen bewusst nicht: Ohne `origin` startet jeder Abschnitt
 * dort, wo das Gerät gerade steht. Ein wiederholter letzter Stopp würde die
 * Navigation zurück zum bereits besuchten Punkt schicken.
 *
 * Ein leerer Tag ergibt keine URL - und keinen Link, den man ins Leere tippen
 * kann.
 */
export function buildGoogleMapsDayUrls(ziele: readonly NavigationTarget[]): string[] {
  const urls: string[] = [];

  for (let start = 0; start < ziele.length; start += STOPPS_JE_ABSCHNITT) {
    const abschnitt = ziele.slice(start, start + STOPPS_JE_ABSCHNITT);
    const letzter = abschnitt[abschnitt.length - 1];
    if (!letzter) continue;

    const parameter = new URLSearchParams({ api: '1', destination: zielText(letzter) });
    const zwischenziele = abschnitt.slice(0, -1);
    if (zwischenziele.length > 0) {
      parameter.set('waypoints', zwischenziele.map(zielText).join('|'));
    }
    parameter.set('travelmode', 'bicycling');

    urls.push(`https://www.google.com/maps/dir/?${parameter.toString()}`);
  }

  return urls;
}

/**
 * Öffnet die Navigation in einem eigenen Kontext.
 *
 * `noopener,noreferrer` ist hier nicht Formsache: ohne `noreferrer` schickt
 * der Browser die Adresse der aufrufenden Seite als Referrer mit, und ohne
 * `noopener` behält das geöffnete Fenster einen Verweis auf die Anwendung.
 */
export function navigationOeffnen(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
