import {
  formatLocalDate,
  formatLocalTimeRange,
  slipOrt,
  staffName,
  type AppointmentSlipEntry,
} from './api';

/**
 * Die Termine einer Patient:in als vorbereitete E-Mail (CAL-013, ANN-041).
 *
 * **Die Anwendung versendet nichts.** Sie baut eine `mailto:`-Adresse und
 * übergibt sie dem Mailprogramm der Praxis; geschrieben, geprüft und gesendet
 * wird dort von Hand. Es entsteht kein Dienstleister, der vorher keiner war
 * (§3.5) — dasselbe Muster wie der Navigations-Handoff in
 * `src/lib/location/navigation.ts` (ADR-019, ANN-018).
 *
 * Drei Regeln, die diese Datei trägt:
 *
 *   1. **Nur, was auch auf dem Zettel steht.** Datum, Zeit, Ort und
 *      behandelnde Person — die Felder, die
 *      `list_patient_appointment_slip` überhaupt liefert. Kein Status, keine
 *      Verordnung, keine Diagnose, keine Adresse. Was hier nicht im Typ steht,
 *      kann auch nicht mitgehen.
 *   2. **Der Betreff sagt nichts.** „Ihre nächsten Termine" nennt weder die
 *      Praxis noch das Fach. Die Betreffzeile ist der Teil einer E-Mail, den
 *      auf dem Weg und auf dem Sperrbildschirm am ehesten jemand mitliest.
 *   3. **Erst beim Tippen.** Die URL wird im Klickhandler gebaut, nie beim
 *      Rendern, nirgends gespeichert und nie von allein geöffnet.
 */

/**
 * Höchstlänge der `mailto:`-URL.
 *
 * Kein Standard nennt eine Grenze; die Praxisgrenze setzt der Weg über die
 * Kommandozeile des Betriebssystems (unter Windows rund 2048 Zeichen). Wird
 * sie überschritten, schneiden Mailprogramme **still** ab — und die E-Mail
 * enthielte weniger Termine, als die Oberfläche zeigt. Deshalb 1800 mit
 * Abstand, und die weggelassenen Termine werden benannt statt verschwiegen.
 */
export const MAILTO_HOECHSTLAENGE = 1800;

/** Siehe Regel 2 im Kopfkommentar: Der Betreff trägt keine Information. */
export const MAIL_BETREFF = 'Ihre nächsten Termine';

export interface Terminmail {
  readonly betreff: string;
  /** Der Text, wie er im Mailprogramm stehen wird — und wie ihn die Oberfläche vorher zeigt. */
  readonly text: string;
  readonly url: string;
  /** Die Termine, die tatsächlich in der E-Mail stehen — und nur die werden vermerkt. */
  readonly enthalten: readonly AppointmentSlipEntry[];
  /** Wie viele Termine wegen der Länge nicht mitgehen. */
  readonly ausgelassen: number;
}

/** Ein Termin in zwei Zeilen, wie auf dem Zettel: Tag, darunter Zeit, Ort, Person. */
function terminZeilen(eintrag: AppointmentSlipEntry): string {
  const zeit = formatLocalTimeRange(
    eintrag.starts_at,
    eintrag.ends_at,
    eintrag.organization_time_zone,
  );
  return [
    formatLocalDate(eintrag.starts_at, eintrag.organization_time_zone),
    `${zeit} · ${slipOrt(eintrag)} · ${staffName(eintrag)}`,
  ].join('\n');
}

/**
 * Der Nachrichtentext.
 *
 * Neutrale Anrede ohne Anredeform: „Sehr geehrte" bräuchte ein Geschlecht, und
 * das speichert die Anwendung bewusst nicht (ADR-014, Datenminimierung).
 * Unterschrift und Praxisangaben fehlen absichtlich — die setzt das
 * Mailprogramm der Praxis selbst.
 */
export function terminMailText(name: string, eintraege: readonly AppointmentSlipEntry[]): string {
  return [
    `Guten Tag ${name},`,
    '',
    'hier sind Ihre nächsten Termine:',
    '',
    eintraege.map(terminZeilen).join('\n\n'),
    '',
    'Bitte sagen Sie einen Termin rechtzeitig ab, wenn Sie ihn nicht wahrnehmen können.',
  ].join('\n');
}

/**
 * Die `mailto:`-URL nach RFC 6068.
 *
 * `encodeURIComponent` und nicht `URLSearchParams`: Letzteres kodiert ein
 * Leerzeichen als `+`, und im Rumpf einer `mailto:`-Adresse ist ein `+` ein
 * Pluszeichen, kein Leerzeichen — der Text käme mit Pluszeichen zwischen jedem
 * Wort an. Die Kodierung der Empfängeradresse ist zugleich der Schutz davor,
 * dass ein `?` oder `&` in einem Adressfeld weitere Kopfzeilen anhängt; nur
 * das `@` bleibt lesbar stehen.
 *
 * Zeilenumbrüche als CRLF, so verlangt es RFC 6068 für den Rumpf.
 */
export function mailtoUrl(adresse: string, betreff: string, text: string): string {
  const empfaenger = encodeURIComponent(adresse).replace(/%40/g, '@');
  const rumpf = encodeURIComponent(text.replace(/\n/g, '\r\n'));
  return `mailto:${empfaenger}?subject=${encodeURIComponent(betreff)}&body=${rumpf}`;
}

/**
 * Der fertige Entwurf — gekürzt, bis er sicher durch das Mailprogramm passt.
 *
 * Gekürzt wird von hinten: Die nächsten Termine sind die, auf die es ankommt.
 * Der letzte Termin bleibt in jedem Fall stehen, damit nie eine E-Mail ohne
 * Inhalt entsteht.
 */
export function terminmailEntwurf(
  name: string,
  adresse: string,
  eintraege: readonly AppointmentSlipEntry[],
): Terminmail {
  let enthalten = [...eintraege];
  let text = terminMailText(name, enthalten);
  let url = mailtoUrl(adresse, MAIL_BETREFF, text);

  while (url.length > MAILTO_HOECHSTLAENGE && enthalten.length > 1) {
    enthalten = enthalten.slice(0, -1);
    text = terminMailText(name, enthalten);
    url = mailtoUrl(adresse, MAIL_BETREFF, text);
  }

  return {
    betreff: MAIL_BETREFF,
    text,
    url,
    enthalten,
    ausgelassen: eintraege.length - enthalten.length,
  };
}

/**
 * Übergabe an das Mailprogramm.
 *
 * Die eine Stelle, an der die Anwendung den Handoff auslöst — hier und nur
 * hier verlässt der Vorgang die Anwendung. Kein neues Fenster: Ein `mailto:`
 * beantwortet der Browser mit dem Mailprogramm, ein `_blank` ließe je nach
 * Browser eine leere Registerkarte zurück.
 */
export function mailOeffnen(url: string): void {
  window.location.href = url;
}
