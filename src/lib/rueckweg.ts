/**
 * Der Rückweg: Wo war ich, bevor ich hierhergekommen bin? (UX-012)
 *
 * Detailseiten hatten bisher einen **festen** Rückweg: Vom Termin ging es
 * immer zur Patientenliste, aus der Akte immer zur Liste — auch dann, wenn man
 * aus dem Kalender kam. Wer im Kalender eine Woche eingestellt, eine Person
 * gefiltert und einen Termin geöffnet hatte, verlor mit einem Klick alles
 * davon und musste sich von vorn durchklicken.
 *
 * Der Rückweg reist deshalb in der Adresszeile, nach demselben Muster wie die
 * Kalenderparameter und die Terminvorbelegung: Er überlebt ein Neuladen, lässt
 * sich teilen und funktioniert von jeder Seite aus gleich. Ein Zustand im
 * Arbeitsspeicher täte das nicht.
 *
 * **Nur anwendungsinterne Pfade.** Ein Rückweg kommt aus der Adresszeile und
 * ist damit veränderbar; ohne Prüfung wäre er eine Weiterleitung auf ein
 * fremdes Ziel (offene Weiterleitung). Erlaubt ist deshalb ausschließlich ein
 * Pfad, der mit genau einem `/` beginnt — kein Schema, kein `//host`, kein
 * Backslash, keine Steuerzeichen.
 *
 * **Keine Namen im Rückweg.** Er trägt Pfade und Kennungen, wie jede andere
 * Adresse der Anwendung auch. Adressen landen in Verläufen und Protokollen;
 * ein Name hat dort nichts zu suchen (ADR-011).
 */

export const RUECKWEG_PARAM = 'zurueck';

/**
 * Obergrenze für einen Rückweg.
 *
 * Die längste echte Adresse ist der Kalender mit allen Parametern (rund 150
 * Zeichen). 512 lässt Luft und schließt zugleich aus, dass jemand über den
 * Parameter beliebig viel Text in die Adresszeile schreibt.
 */
const HOECHSTLAENGE = 512;

/** Steuerzeichen und Zeilenumbrüche haben in einer Adresse nichts zu suchen. */
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/;

/**
 * Ist der Pfad ein anwendungsinterner Rückweg?
 *
 * Geprüft wird die Zeichenkette selbst, nicht ein daraus gebautes `URL`-Objekt:
 * Ein relativer Pfad hat keinen Ursprung, und ein Vergleich gegen
 * `window.location` wäre in Tests und beim Serverbau nicht dasselbe.
 */
export function istInternerPfad(pfad: string | null | undefined): pfad is string {
  if (!pfad) return false;
  if (pfad.length > HOECHSTLAENGE) return false;
  if (STEUERZEICHEN.test(pfad)) return false;
  // Genau ein führender Schrägstrich: `//fremder.host` und `/\fremder.host`
  // werden von Browsern als absolute Adresse gelesen.
  if (!pfad.startsWith('/')) return false;
  if (pfad.startsWith('//') || pfad.startsWith('/\\')) return false;
  return true;
}

/**
 * Der Rückweg aus der Adresszeile — oder der Standard.
 *
 * Ein fehlender, zu langer oder fremder Wert fällt still auf den Standard
 * zurück. Eine Fehlermeldung für eine verstellte Adresszeile wäre für die
 * bedienende Person wertlos (wie in `leseParameter` des Kalenders).
 */
export function leseRueckweg(suche: URLSearchParams, standard: string): string {
  const wert = suche.get(RUECKWEG_PARAM);
  return istInternerPfad(wert) ? wert : standard;
}

/**
 * Hängt einen Rückweg an ein Ziel an.
 *
 * Der Rückweg wird dabei kodiert; er enthält selbst Parameter (der Kalender
 * bringt Ansicht, Datum und Filter mit).
 */
export function mitRueckweg(ziel: string, rueckweg: string | null | undefined): string {
  if (!istInternerPfad(rueckweg)) return ziel;
  const trenner = ziel.includes('?') ? '&' : '?';
  return `${ziel}${trenner}${RUECKWEG_PARAM}=${encodeURIComponent(rueckweg)}`;
}

/**
 * Die Beschriftung des Rückwegs, aus dem Pfad abgeleitet.
 *
 * Bewusst abgeleitet und nicht mitgeschickt: Eine Beschriftung in der
 * Adresszeile wäre übersetzbarer Text an einer Stelle, an der er nicht
 * hingehört — und sie ließe sich verstellen. Aus dem Pfad folgt sie eindeutig.
 */
export function rueckwegBeschriftung(pfad: string): string {
  const ohneSuche = pfad.split('?')[0] ?? pfad;

  if (ohneSuche === '/') return 'Zurück zur Übersicht';
  if (ohneSuche.startsWith('/kalender')) return 'Zurück zum Kalender';
  if (ohneSuche === '/patienten') return 'Zurück zur Patientenliste';
  if (ohneSuche.startsWith('/patienten/')) {
    if (ohneSuche.endsWith('/termine')) return 'Zurück zu den Terminen der Akte';
    if (ohneSuche.endsWith('/verordnungen')) return 'Zurück zu den Verordnungen der Akte';
    if (ohneSuche.endsWith('/verlauf')) return 'Zurück zum Behandlungsverlauf';
    if (ohneSuche.endsWith('/stammdaten')) return 'Zurück zu den Stammdaten';
    if (ohneSuche.endsWith('/terminzettel')) return 'Zurück zum Terminzettel';
    return 'Zurück zur Akte';
  }
  if (ohneSuche === '/termine/neu') return 'Zurück zur Terminanlage';
  if (ohneSuche.startsWith('/termine/')) return 'Zurück zum Termin';
  if (ohneSuche.startsWith('/praxis/team')) return 'Zurück zu den Mitarbeitenden';
  if (ohneSuche.startsWith('/verordner')) return 'Zurück zur Verordnerkartei';
  return 'Zurück';
}
