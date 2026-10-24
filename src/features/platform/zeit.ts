/**
 * Zeitpunkte in der Sprache der Person (POR-008).
 *
 * Die Plattform rechnet in der Zeitzone des Geräts, nicht in der der Praxis:
 * Wer seine Termine auf dem eigenen Telefon liest, erwartet die Uhrzeit, die
 * dort auch die Uhr zeigt. Die Praxisoberfläche formatiert anders
 * (`@/features/appointments/api`, Zeitzone der Praxis) - das ist kein Import
 * für die Plattform (ADR-023 Punkt 26).
 */

const TAG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});
const TAG_LANG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const TAG_OHNE_JAHR = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const UHR = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

/** „Di 14.10." */
export function tagKurz(zeitpunkt: string): string {
  return TAG.format(new Date(zeitpunkt)).replace(/\.$/, '');
}

/** „Dienstag, 14. Oktober 2026" */
export function tagLang(zeitpunkt: string): string {
  return TAG_LANG.format(new Date(zeitpunkt));
}

/** „Samstag, 24. Oktober" - der Tag eines nahen Termins, ohne Jahr. */
export function tagOhneJahr(zeitpunkt: string): string {
  return TAG_OHNE_JAHR.format(new Date(zeitpunkt));
}

const TAG_MONAT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
const TAG_MONAT_JAHR = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * „23. Oktober" - ein Tag ohne Wochentag; das Jahr nur, wenn es nicht das
 * laufende ist („4. Januar 2027"). Ein Kalendertag `YYYY-MM-DD` gilt als
 * dieser Tag auf dem Gerät.
 */
export function tagUndMonat(wert: string, jetzt: Date = new Date()): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(wert) ? new Date(`${wert}T12:00:00`) : new Date(wert);
  return (d.getFullYear() === jetzt.getFullYear() ? TAG_MONAT : TAG_MONAT_JAHR).format(d);
}

/**
 * „12. August bis 15. Oktober 2026" - ein abgeschlossener Zeitraum, das Jahr
 * am Ende; an einem Tag nur dieser („17. Oktober 2026").
 */
export function zeitraumLang(von: string, bis: string): string {
  const a = new Date(von);
  const b = new Date(bis);
  if (kalendertag(a) === kalendertag(b)) return TAG_MONAT_JAHR.format(b);
  const anfang = (a.getFullYear() === b.getFullYear() ? TAG_MONAT : TAG_MONAT_JAHR).format(a);
  return `${anfang} bis ${TAG_MONAT_JAHR.format(b)}`;
}

/**
 * Der letzte Tag vor einem Ende, das der Server als Mitternacht danach
 * liefert (`read_until`, `app.retention_due_at`): „bis 12. November“, nicht
 * bis zum 13., an dem schon nichts mehr geht.
 */
export function letzterTag(endeExklusiv: string): string {
  return new Date(new Date(endeExklusiv).getTime() - 1).toISOString();
}

/**
 * Wie viele Kalendertage bis zum Zeitpunkt? 0 heute, 1 morgen - gezählt auf
 * der Uhr des Geräts, nicht in Stunden.
 */
export function tageBis(zeitpunkt: string, jetzt: Date = new Date()): number {
  const ziel = new Date(zeitpunkt);
  const a = Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  const b = Date.UTC(ziel.getFullYear(), ziel.getMonth(), ziel.getDate());
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Der Gruß der Übersicht nach der Tageszeit (Handoff 2026-10-22, 5.1):
 * Morgen von 5 bis 11 Uhr, Tag bis 18 Uhr, dann Abend - auf der Uhr des
 * Geräts wie jede Zeit der Plattform (ANN-697).
 */
export function grussNachTageszeit(jetzt: Date = new Date()): string {
  const stunde = jetzt.getHours();
  if (stunde >= 5 && stunde < 11) return 'Guten Morgen';
  if (stunde >= 11 && stunde < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** „9:30" bzw. „09:30" nach den Regeln des Geräts. */
export function uhrzeit(zeitpunkt: string): string {
  return UHR.format(new Date(zeitpunkt));
}

/** „09:30–10:30" */
export function zeitraum(von: string, bis: string): string {
  return `${uhrzeit(von)}–${uhrzeit(bis)}`;
}

/** Ein Kalendertag `YYYY-MM-DD` oder Zeitpunkt als „14.10.2026". */
export function datum(wert: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(wert) ? new Date(`${wert}T00:00:00`) : new Date(wert);
  return DATUM.format(d);
}

/** Liegt der Zeitpunkt in der Zukunft? */
export function kuenftig(zeitpunkt: string, jetzt: Date = new Date()): boolean {
  return new Date(zeitpunkt).getTime() >= jetzt.getTime();
}

const WOCHENTAG_DATUM = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
});

/** Ein Kalendertag als `YYYY-MM-DD` in der Zeitzone des Geräts. */
export function kalendertag(d: Date): string {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  const tag = String(d.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Die nächsten `anzahl` Werktage ab morgen (POR-009): die Tage, die eine
 * Person im Wunschformular ankreuzt. Samstag und Sonntag fehlen, weil die
 * Praxis dann keine Termine vergibt; wer einen anderen Tag braucht, schreibt
 * ihn in die Zeile.
 */
export function naechsteWerktage(anzahl: number, ab: Date = new Date()): string[] {
  const tage: string[] = [];
  const d = new Date(ab);
  d.setHours(12, 0, 0, 0);
  while (tage.length < anzahl) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tage.push(kalendertag(d));
  }
  return tage;
}

/** „Dienstag, 14.10." */
export function wochentagMitDatum(kalendertagIso: string): string {
  return WOCHENTAG_DATUM.format(new Date(`${kalendertagIso}T12:00:00`)).replace(/\.$/, '.');
}
