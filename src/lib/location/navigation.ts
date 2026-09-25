import type { NavigationApp, NavigationTarget, PostalAddress } from './contract';

/**
 * Übergabe an eine externe Navigations-App (UX-002, MAP-005, ADR-019 Punkt 20
 * bis 23).
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
 * **Seit MAP-005 kennt die Datei alle drei Ziel-Apps aus ADR-019 Punkt 22.**
 * Bis dahin war es allein Google Maps, weil die Roadmap-Zeile von UX-EPIC-001
 * nicht mehr verlangte. Eine Einstellung, welche App die bevorzugte ist, gibt
 * es weiterhin **nicht**: Welche auf den tatsächlich genutzten Geräten
 * zuverlässig im Fahrradmodus öffnet, beantwortet die Gerätebewertung
 * (MAP-005c, `docs/sichtung/kartendienst.md`) - erst deren Ergebnis
 * begründet eine Vorauswahl (ADR-019, „Bewusst nicht Bestandteil").
 */

/**
 * Höchstzahl der Zwischenziele einer Google-Maps-URL laut Anbieter:
 * „up to three waypoints supported on mobile browsers, and a maximum of nine
 * waypoints supported otherwise".
 *
 * **Erzwungen wird die kleinere der beiden Zahlen** (`MAX_ZWISCHENZIELE`), und
 * zwar für jede Ziel-App. Der Grund ist nicht Vorsicht, sondern dass die
 * Anwendung die entscheidende Frage nicht beantworten kann: Ob ein Tippen auf
 * dem Telefon in der Google-Maps-App landet (neun) oder im mobilen Browser
 * (drei), entscheidet das Gerät, nicht diese Datei. Wer neun übergibt und im
 * Browser landet, verliert die Stopps ab dem vierten **still** - genau das,
 * was das Teilen in Abschnitte verhindern soll.
 *
 * Der Preis sind mehr Abschnitte auf dem Schreibtisch, und der ist sichtbar:
 * Ein Abschnitt ist ein beschrifteter Knopf, ein verschluckter Stopp ist
 * nichts. Ob die Ziel-Apps auf den Geräten der Praxis mehr tragen, beantwortet
 * Schritt 4 der Gerätebewertung (MAP-005c); fällt sie positiv aus, wandert die
 * Zahl hier von drei auf neun - eine Zeile.
 *
 * **Belegtiefe.** Suchauszug von
 * `developers.google.com/maps/documentation/urls/get-started`; die Seite selbst
 * ist aus der Cloud-Umgebung gesperrt (Egress-Proxy, 403), zuletzt geprüft am
 * 2026-09-22. Derselbe Auszug deckt Koordinaten als Wegpunkt und eine
 * Obergrenze von 2 048 Zeichen je URL
 * (`docs/decisions/providerpruefung-kartendienst.md`, Teil 6).
 */
export const MAX_ZWISCHENZIELE_DOKUMENTIERT = 9;

/** Dieselbe Quelle, mobiler Browser: drei. */
export const MAX_ZWISCHENZIELE_MOBIL = 3;

/**
 * Was die Anwendung tatsächlich erzwingt: die strengere der beiden Zahlen.
 *
 * Als eigene Konstante und nicht als Literal, damit die Herkunft am Wert
 * steht; `navigation.test.ts` prüft, dass hier nie die größere landet.
 */
export const MAX_ZWISCHENZIELE = MAX_ZWISCHENZIELE_MOBIL;

/**
 * Zwischenziele, die eine URL je Ziel-App trägt.
 *
 * Apple Maps kennt sie als wiederholbaren Parameter `waypoint` (Primärquelle,
 * siehe `apple()`), nennt aber **keine** Höchstzahl. Eine undokumentierte
 * Grenze ist kein Freibrief: Hier gilt dieselbe Zahl wie bei Google Maps, bis
 * die Gerätebewertung eine belegte nennt.
 *
 * Die Systemnavigation (`geo:`) kennt genau ein Ziel und keinen Umweg - dort
 * ist der „Abschnitt" schlicht der einzelne Stopp.
 */
const ZWISCHENZIELE_JE_APP: Record<NavigationApp, number> = {
  google_maps: MAX_ZWISCHENZIELE,
  apple_maps: MAX_ZWISCHENZIELE,
  system: 0,
};

/** Stopps je Abschnitt: die Zwischenziele der Ziel-App plus deren Ziel. */
export function stoppsJeAbschnitt(app: NavigationApp): number {
  return ZWISCHENZIELE_JE_APP[app] + 1;
}

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
  /** Kartenposition des Hausbesuchs (MAP-006a/d) — hat sie Vorrang vor der Anschrift. */
  readonly visit_lat?: number | null | undefined;
  readonly visit_lon?: number | null | undefined;
}

/**
 * Das Navigationsziel eines Termins - oder `null`, wenn es keines gibt.
 *
 * Übergeben wird die Koordinate, sobald der Hausbesuch eine trägt (ANN-016,
 * seit MAP-006d), sonst die Postanschrift ohne Namen. Die Stelle ist genau
 * diese Funktion.
 *
 * `null` für alles außer einem Hausbesuch und für einen unvollständigen
 * Adress-Snapshot. Die Datenbank lässt eine halbe Adresse zwar nicht zu; die
 * Prüfung steht hier trotzdem, damit kein Ziel ohne Hausnummer als scheinbar
 * gültiger Link erscheint.
 */
export function navigationsZiel(besuch: Besuchsadresse): NavigationTarget | null {
  if (besuch.appointment_type !== 'home_visit') return null;
  // ANN-018, seit MAP-006d: Liegt eine Koordinate vor, geht nur sie hinaus.
  if (typeof besuch.visit_lat === 'number' && typeof besuch.visit_lon === 'number') {
    return { kind: 'coordinate', position: { lat: besuch.visit_lat, lon: besuch.visit_lon } };
  }
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
 * Ein Abschnitt für Google Maps: der letzte Stopp ist das Ziel, der Rest sind
 * Zwischenziele, getrennt durch `|`.
 *
 * Kein `origin`: den Startpunkt bestimmt das Gerät. Ihn zu setzen hieße, den
 * Standort der Therapeutin zu kennen und zu übergeben - genau das soll nicht
 * passieren (§20).
 */
function google(ziel: NavigationTarget, zwischenziele: readonly NavigationTarget[]): string {
  const parameter = new URLSearchParams({ api: '1', destination: zielText(ziel) });
  if (zwischenziele.length > 0) {
    parameter.set('waypoints', zwischenziele.map(zielText).join('|'));
  }
  parameter.set('travelmode', 'bicycling');
  return `https://www.google.com/maps/dir/?${parameter.toString()}`;
}

/**
 * Dasselbe für Apple Maps - „unified Maps URLs", belegt aus der
 * Anbieterdokumentation (`developer.apple.com`, „Adopting unified Maps URLs",
 * abgerufen am 2026-09-22): Pfad `/directions`, Ziel in `destination`
 * („Specify an address, coordinate, or a place name"), Zwischenziele als
 * **wiederholter** Parameter `waypoint`, Verkehrsmittel in `mode` mit
 * `driving`, `walking`, `transit` oder `cycling`.
 *
 * Kein `source`: derselbe Grund wie bei `origin` oben.
 *
 * Die ältere Form (`maps.apple.com/?daddr=…&dirflg=…`) bleibt ungenutzt - ihre
 * Verkehrsmittel sind `d`, `w` und `r`, ein Fahrrad ist nicht dabei. Dafür
 * setzen die unified URLs iOS 18.4 oder neuer voraus; ob die Geräte der Praxis
 * das erfüllen, beantwortet die Gerätebewertung.
 */
function apple(ziel: NavigationTarget, zwischenziele: readonly NavigationTarget[]): string {
  const parameter = new URLSearchParams({ destination: zielText(ziel) });
  for (const zwischenziel of zwischenziele) {
    parameter.append('waypoint', zielText(zwischenziel));
  }
  parameter.set('mode', 'cycling');
  return `https://maps.apple.com/directions?${parameter.toString()}`;
}

/**
 * Die Systemnavigation über einen `geo:`-URI (ADR-019 Punkt 22).
 *
 * Belegt aus `developer.android.com/guide/components/intents-common`
 * (abgerufen am 2026-09-22): `geo:latitude,longitude` für einen Punkt,
 * `geo:0,0?q=my+street+address` für eine Adresse, und „all strings passed in
 * the geo URI must be encoded".
 *
 * **Ohne Verkehrsmittel** - der URI kennt keins. Welche App das Gerät öffnet
 * und ob sie dann aufs Rad umstellt, entscheidet das Gerät; genau das prüft
 * die Gerätebewertung.
 */
function geo(ziel: NavigationTarget): string {
  if (ziel.kind === 'coordinate') return `geo:${ziel.position.lat},${ziel.position.lon}`;
  return `geo:0,0?${new URLSearchParams({ q: adressZeile(ziel.address) }).toString()}`;
}

/**
 * Ein Abschnitt als URL: der letzte Stopp ist das Ziel, alles davor sind
 * Zwischenziele.
 *
 * Die Systemnavigation bekommt nur das Ziel - sie kennt keine Zwischenziele,
 * und `buildNavigationDayUrls` schneidet die Abschnitte deshalb so, dass dort
 * nie eines anfällt.
 */
function abschnittUrl(abschnitt: readonly NavigationTarget[], app: NavigationApp): string {
  const ziel = abschnitt[abschnitt.length - 1]!;
  const zwischenziele = abschnitt.slice(0, -1);

  switch (app) {
    case 'google_maps':
      return google(ziel, zwischenziele);
    case 'apple_maps':
      return apple(ziel, zwischenziele);
    case 'system':
      return geo(ziel);
  }
}

/**
 * Die URL für ein einzelnes Ziel im Fahrradmodus.
 *
 * Das ist `NavigationHandoff.buildUrl` aus `contract.ts` als Funktion: ein
 * Ziel, eine Ziel-App, eine Zeichenkette - und keine Nebenwirkung. Wer sie
 * aufruft, hat nichts geöffnet; das Öffnen ist `navigationOeffnen` und
 * passiert nur im Tap-Handler.
 */
export function buildNavigationUrl(ziel: NavigationTarget, app: NavigationApp): string {
  return abschnittUrl([ziel], app);
}

/**
 * Der ganze Tag in Terminreihenfolge - als ein Link, oder als mehrere, wenn
 * das Wegpunktlimit der Ziel-App nicht reicht.
 *
 * Abschnitte überlappen bewusst nicht: Ohne Startpunkt beginnt jeder Abschnitt
 * dort, wo das Gerät gerade steht. Ein wiederholter letzter Stopp würde die
 * Navigation zurück zum bereits besuchten Punkt schicken.
 *
 * Ein leerer Tag ergibt keine URL - und keinen Link, den man ins Leere tippen
 * kann.
 */
export function buildNavigationDayUrls(
  ziele: readonly NavigationTarget[],
  app: NavigationApp,
): string[] {
  const urls: string[] = [];
  const jeAbschnitt = stoppsJeAbschnitt(app);

  for (let start = 0; start < ziele.length; start += jeAbschnitt) {
    const abschnitt = ziele.slice(start, start + jeAbschnitt);
    if (abschnitt.length > 0) urls.push(abschnittUrl(abschnitt, app));
  }

  return urls;
}

/**
 * Übergibt das Ziel an das Gerät.
 *
 * **Ein Verweis, der erst im Tap-Handler entsteht** — kein vorgebautes
 * `<a href>` im Seitenquelltext: Ein href stünde ab dem Rendern da, ließe sich
 * kopieren und würde vom Vorausladen des Browsers unter Umständen ohne Zutun
 * der Person angefasst (ADR-019 Punkt 20). Das Element lebt genau so lange wie
 * der Klick.
 *
 * `noopener noreferrer` ist dabei nicht Formsache: ohne `noreferrer` schickt
 * der Browser die Adresse der aufrufenden Seite mit, und ohne `noopener`
 * behält das geöffnete Fenster einen Verweis auf die Anwendung.
 *
 * **Nur `http(s)` bekommt einen eigenen Tab** (BEF-030): Ein `geo:`-Verweis in
 * einem neuen Tab hinterlässt einen **leeren Tab**, wenn kein Programm das
 * Schema übernimmt — am Laptop beobachtet, wo es keins gibt. Im selben Fenster
 * übernimmt das Gerät den Verweis, und wo niemand ihn übernimmt, bleibt die
 * Seite einfach stehen. Das ist der richtige Ausgang: Die Anwendung kann nicht
 * wissen, ob eine Navigations-App vorhanden ist, und darf deshalb keinen
 * Erfolg vortäuschen.
 */
export function navigationOeffnen(url: string): void {
  const verweis = document.createElement('a');
  verweis.href = url;
  verweis.rel = 'noopener noreferrer';
  if (url.startsWith('http')) verweis.target = '_blank';

  // Angehängt und sofort wieder entfernt: Ein Klick auf ein Element ausserhalb
  // des Dokuments wirkt nicht in jedem Browser, und im Dokument bleiben soll
  // der Verweis auf keinen Fall.
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
}
