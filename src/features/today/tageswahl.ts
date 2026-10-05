import { tagePlus } from '@/features/appointments/calendar';

// -----------------------------------------------------------------------------
// Tageswechsel in der Übersicht (UBK-003, ANN-234)
//
// Die Übersicht zeigt heute, kann aber auf den Vortag und den Folgetag
// umschalten - abends schon sehen, was morgen kommt und ob die Liege mit muss.
// Der gewählte Tag steht als `?tag=JJJJ-MM-TT` in der Adresse: nur ein
// Datum, nie ein Name (ADR-013 Punkt 9 Nr. 5). Ohne Angabe ist es heute.
// -----------------------------------------------------------------------------

/** Ein Kalendertag in der Form, die `list_day_plan` erwartet. */
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Der Tag, den die Übersicht zeigt: der aus der Adresse, wenn er ein echter
 * Kalendertag ist, sonst heute. Ein unsinniger Wert führt still auf heute
 * zurück - die Seite hat nichts, was er kaputt machen könnte.
 */
export function gewaehlterTag(wert: string | null, heute: string): string {
  if (!wert || !TAG.test(wert)) return heute;
  const datum = new Date(`${wert}T12:00:00Z`);
  if (Number.isNaN(datum.getTime()) || datum.toISOString().slice(0, 10) !== wert) return heute;
  return wert;
}

/** Wohin ein Wechsel auf diesen Tag führt: heute ist die Übersicht ohne Zusatz. */
export function tagesPfad(tag: string, heute: string): string {
  return tag === heute ? '/' : `/?tag=${tag}`;
}

/** Weit hinter jedem Termin - der größte Zeitpunkt, den `Date` kennt. */
const NACH_ALLEM = 8.64e15;

/**
 * Der Zeitpunkt, an dem die Übersicht den gewählten Tag misst.
 *
 * Heute ist es die Uhr. Ein künftiger Tag liegt ganz vor einem - alles wartet,
 * der erste Besuch ist der erste Weg -, ein vergangener ganz hinter einem:
 * Was dort nicht abgehakt ist, steht als „Nicht abgeschlossen“ da. So gelten
 * dieselben Regeln wie heute (ANN-117 Fassung 2), ohne zweite Logik.
 */
export function bezugszeitpunkt(tag: string, heute: string, jetzt: number): number {
  if (tag === heute) return jetzt;
  return tag > heute ? 0 : NACH_ALLEM;
}

const KURZ = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
});

/** „heute", „morgen", „gestern" oder „am Mi., 7.10." - klein, für die Satzmitte. */
export function tagesWort(tag: string, heute: string): string {
  if (tag === heute) return 'heute';
  if (tag === tagePlus(heute, 1)) return 'morgen';
  if (tag === tagePlus(heute, -1)) return 'gestern';
  return `am ${KURZ.format(new Date(`${tag}T12:00:00Z`))}`;
}

/** Dasselbe am Satzanfang. */
export function TagesWort(tag: string, heute: string): string {
  const wort = tagesWort(tag, heute);
  return wort.charAt(0).toUpperCase() + wort.slice(1);
}
