import type { ProgressDot } from '@/components/ui/ProgressDots';
import { appointmentTypeHint, formatLocalTime } from '@/features/appointments/api';
import { istOffen, nachUhrzeit, type DayPlanEntry } from './api';

// -----------------------------------------------------------------------------
// Tagesstart (UX-EPIC-003) und Zeitstrahl (Design-Handoff 2026-10-01)
//
// Was am Rad zählt, bevor losgefahren wird: der nächste Weg, wie viel Zeit
// dafür bleibt und ob die Behandlungsliege heute mit muss (§9). Reine
// Funktionen über der Tagesliste - keine eigene Abfrage, kein zweiter
// Lesepfad (ADR-004, Datenminimierung). Die Fahrzeiten kommen von außen
// herein (`fahrzeiten.ts`).
// -----------------------------------------------------------------------------

/**
 * Die Behandlungsbesuche des Tages in Uhrzeitfolge, ohne Absagen.
 *
 * ANN-117: Nach dieser Liste wird gezählt, wenn die Übersicht „ab dem 2.
 * Besuch" sagt. Ein abgeschlossener oder nicht angetroffener Besuch zählt
 * mit - er war der erste des Tages, auch wenn er schon hinter einem liegt. Ein
 * abgesagter zählt nicht: zu ihm fährt niemand.
 *
 * Nur Behandlungen: Dieselbe Grenze zieht `istOffen`, und nur an ihnen trägt
 * die Tagesliste die Liege. Ein Trainingstermin erreicht die Liste nur bei
 * owner, office und der Trainingsbetreuung; gezählt wird er hier nicht.
 */
export function besucheDesTages(plan: readonly DayPlanEntry[]): DayPlanEntry[] {
  return [...plan]
    .filter((termin) => termin.kind === 'therapy' && termin.status !== 'cancelled')
    .sort(nachUhrzeit);
}

/**
 * Die Hausbesuche unter den Besuchen des Tages - nur nach ihnen zählt die
 * Liege (BEF-051, ANN-116 Fassung 2): Sie ist das, was mit aufs Rad muss, und
 * zu einem Praxistermin fährt sie nicht mit.
 */
export function hausbesucheDesTages(plan: readonly DayPlanEntry[]): DayPlanEntry[] {
  return besucheDesTages(plan).filter((termin) => termin.appointment_type === 'home_visit');
}

/**
 * Noch vor einem (ANN-117 Fassung 2): bestätigt - also weder abgehakt noch
 * abgesagt oder nicht angetroffen - und sein Ende ist noch nicht erreicht.
 *
 * Die Uhr entscheidet, nicht der Haken: Wer einen Besuch nicht abhakt, bekommt
 * nach dessen Ende trotzdem den nächsten Weg. Wer früher abhakt, auch. Ein
 * vorbeigegangener, nicht abgehakter Besuch bleibt im Zeitstrahl mit
 * „Nicht abgeschlossen“ stehen (`nichtAbgeschlossen`).
 *
 * `jetzt` kommt von außen, damit die Grenze prüfbar bleibt - und damit ein
 * anderer Tag der Übersicht (ANN-234) ganz vor oder ganz hinter einem liegt.
 */
export function stehtAus(termin: DayPlanEntry, jetzt: number): boolean {
  return termin.status === 'confirmed' && Date.parse(termin.ends_at) > jetzt;
}

/** Vorbei, aber nicht abgehakt: Das Ende ist erreicht, der Termin steht noch auf bestätigt. */
export function nichtAbgeschlossen(termin: DayPlanEntry, jetzt: number): boolean {
  return (
    (termin.kind === 'therapy' || termin.kind === 'training') &&
    termin.status === 'confirmed' &&
    Date.parse(termin.ends_at) <= jetzt
  );
}

export interface Wege {
  /** Der nächste anzufahrende Besuch, oder `null`, wenn keiner mehr aussteht. */
  erster: DayPlanEntry | null;
  /** Ob vor ihm heute schon ein Besuch lag - dann heißt er „Nächster Weg". */
  istErsterDesTages: boolean;
}

export function wegeDesTages(plan: readonly DayPlanEntry[], jetzt: number): Wege {
  const besuche = besucheDesTages(plan);
  const erster = besuche.find((termin) => stehtAus(termin, jetzt)) ?? null;
  return {
    erster,
    istErsterDesTages: erster !== null && besuche[0]?.id === erster.id,
  };
}

/**
 * Der eine Termin, den der Zeitstrahl ausgeklappt zeigt.
 *
 *   * `besuch` - der nächste noch anzufahrende Behandlungsbesuch
 *     (`wegeDesTages`, ANN-117 Fassung 2: nach der Uhr); steht keiner mehr
 *     aus, der nächste ausstehende Trainingstermin: Für die
 *     Trainingsbetreuung ist er der Besuch, und nur die Karte trägt Anschrift
 *     und Rufnummer;
 *   * `dokumentation` - kein Besuch steht mehr aus, aber einer ist nicht
 *     abgehakt oder eine Dokumentation ist noch nicht festgeschrieben
 *     (`istOffen`). Die Karte führt dann in den Abschluss, eine Navigation
 *     gibt es nicht mehr (UEB-04).
 */
export interface Fokus {
  termin: DayPlanEntry;
  art: 'besuch' | 'dokumentation';
}

export function fokusDesTages(
  plan: readonly DayPlanEntry[],
  darfDokumentieren: boolean,
  jetzt: number,
): Fokus | null {
  const besuch = wegeDesTages(plan, jetzt).erster;
  if (besuch) return { termin: besuch, art: 'besuch' };

  const sortiert = [...plan].sort(nachUhrzeit);
  const training = sortiert.find((termin) => termin.kind === 'training' && stehtAus(termin, jetzt));
  if (training) return { termin: training, art: 'besuch' };

  const ohneDoku = sortiert.find((termin) => istOffen(termin, darfDokumentieren));
  return ohneDoku ? { termin: ohneDoku, art: 'dokumentation' } : null;
}

/**
 * Wo ein ausstehender Besuch gerade steht (Design-Handoff 2026-10-01,
 * Abschnitt 5a Punkt 7): Er `wartet` bis zu seinem Beginn, `laeuft` bis zu
 * seinem Ende und ist danach `ueberfaellig` - begonnen, aber noch nicht
 * abgeschlossen. Ab dem Beginn wird die Karte zur Arbeitskarte.
 *
 * `jetzt` kommt von außen, damit die Grenze prüfbar bleibt.
 */
export type Besuchsphase = 'wartet' | 'laeuft' | 'ueberfaellig';

export function besuchsphase(termin: DayPlanEntry, jetzt: number): Besuchsphase {
  if (jetzt < Date.parse(termin.starts_at)) return 'wartet';
  return jetzt < Date.parse(termin.ends_at) ? 'laeuft' : 'ueberfaellig';
}

/** „in 25 Minuten" - nur in den letzten drei Stunden vor dem Beginn. */
export function bisBeginn(termin: DayPlanEntry, jetzt: number): string | null {
  const minuten = Math.ceil((Date.parse(termin.starts_at) - jetzt) / 60_000);
  if (!Number.isFinite(minuten) || minuten <= 0 || minuten >= 180) return null;
  return minuten === 1 ? 'in 1 Minute' : `in ${minuten} Minuten`;
}

export interface Tagesfortschritt {
  /** Ein Punkt je Behandlungstermin in Uhrzeitfolge, auch für eine Absage. */
  punkte: ProgressDot[];
  /** Besuche, an denen heute nichts mehr zu fahren ist. */
  erledigt: number;
  /** Besuche des Tages ohne Absagen (`besucheDesTages`). */
  gesamt: number;
  /** Davon mit festgeschriebener Dokumentation. */
  dokumentiert: number;
}

/**
 * Der Tagesfortschritt im Kopf der Übersicht (Design-Handoff 2026-10-01,
 * Abschnitt 5a Punkt 3).
 *
 * Gezählt werden die Behandlungsbesuche wie bei der Liege (ANN-117):
 * Fehlzeiten und Training zählen nicht, eine Absage auch nicht - sie bekommt
 * aber ihren Punkt, damit die Reihe den Tag zeigt, wie er im Kalender stand.
 * „Erledigt" ist ein Besuch, der abgehakt ist: abgeschlossen, dokumentiert,
 * abgerechnet oder nicht angetroffen. Hier zählt der Haken, nicht die Uhr
 * (ANN-117 Fassung 2): Der Satz sagt, was getan ist.
 */
export function tagesfortschritt(
  plan: readonly DayPlanEntry[],
  naechsterId: string | null,
): Tagesfortschritt {
  const behandlungen = [...plan].filter((termin) => termin.kind === 'therapy').sort(nachUhrzeit);
  const besuche = behandlungen.filter((termin) => termin.status !== 'cancelled');
  return {
    punkte: behandlungen.map((termin) => {
      if (termin.status === 'cancelled') return 'abgesagt';
      if (termin.status === 'no_show') return 'nicht_angetroffen';
      if (termin.status === 'confirmed') return termin.id === naechsterId ? 'naechster' : 'offen';
      return 'erledigt';
    }),
    erledigt: besuche.filter((termin) => termin.status !== 'confirmed').length,
    gesamt: besuche.length,
    dokumentiert: besuche.filter(
      (termin) =>
        termin.documentation_status === 'final' ||
        termin.status === 'documented' ||
        termin.status === 'invoiced',
    ).length,
  };
}

/** „1 von 4 Besuchen erledigt" - der Satz neben den Punkten. */
export function fortschrittText(fortschritt: Tagesfortschritt): string {
  const besuche = fortschritt.gesamt === 1 ? 'Besuch' : 'Besuchen';
  return `${fortschritt.erledigt} von ${fortschritt.gesamt} ${besuche} erledigt`;
}

/** „3 Dokus festgeschrieben" - oder `null`, wenn noch keine festgeschrieben ist. */
export function dokuText(fortschritt: Tagesfortschritt): string | null {
  if (fortschritt.dokumentiert === 0) return null;
  return fortschritt.dokumentiert === 1
    ? '1 Doku festgeschrieben'
    : `${fortschritt.dokumentiert} Dokus festgeschrieben`;
}

export type LiegeHeute =
  | { noetig: false }
  | {
      noetig: true;
      /** Position in `hausbesucheDesTages`, ab 1 gezählt. */
      besuch: number;
      termin: DayPlanEntry;
    };

/**
 * Muss die Behandlungsliege heute noch mit (§9, ANN-116)?
 *
 * Maßgeblich ist der früheste noch **anzufahrende** Hausbesuch, dessen Person
 * sie braucht: Ist der Besuch mit Liege schon vorbei - nach der Uhr oder
 * abgehakt (ANN-117 Fassung 2) -, muss sie für den Rest des Tages nicht mehr
 * aufs Rad. Gezählt wird nur unter Hausbesuchen (BEF-051, ANN-116 Fassung 2):
 * Zum Praxistermin fährt keine Liege mit, und „ab 2. Besuch“ meint den
 * zweiten Halt mit dem Rad. Das Merkmal liefert die Tagesliste nur am
 * Behandlungstermin; am Training ist es leer und zählt als nein.
 */
export function liegeHeute(plan: readonly DayPlanEntry[], jetzt: number): LiegeHeute {
  const besuche = hausbesucheDesTages(plan);
  const index = besuche.findIndex(
    (termin) => stehtAus(termin, jetzt) && termin.treatment_table_required === true,
  );
  if (index < 0) return { noetig: false };
  return { noetig: true, besuch: index + 1, termin: besuche[index]! };
}

/**
 * „Ja · ab 2. Besuch 10:30" oder „Nein" - der Zustand als Wort, nicht als
 * Farbe. Seit dem Design-Handoff vom 2026-10-01 steht die Antwort in der
 * Liege-Zeile neben der Beschriftung „Liege heute"; bis dahin lautete der
 * Satz „ja, ab 2. Besuch (10:30 Uhr)".
 */
export function liegeText(liege: LiegeHeute): string {
  if (!liege.noetig) return 'Nein';
  const uhrzeit = formatLocalTime(liege.termin.starts_at, liege.termin.organization_time_zone);
  return `Ja · ab ${liege.besuch}. Besuch ${uhrzeit}`;
}

/**
 * Die geschätzte Anfahrt zu einem Termin und woher sie kommt (`fahrzeiten.ts`).
 * `vorher` ist der Termin davor in der Fahrtreihenfolge - `null`, wenn die
 * Fahrt am Startort der Praxis beginnt.
 */
export interface Anfahrt {
  minuten: number;
  vorher: DayPlanEntry | null;
}

/** Ein Ende des Wegbalkens: Uhrzeit und was dort ist. */
export interface Wegende {
  zeit: string;
  label: string;
}

export interface NaechsterWeg {
  titel: string;
  von: Wegende;
  bis: Wegende;
  fahrtMin: number;
}

/** Was zur Einordnung in der Nebenzeile steht - der Hausbesuch trägt kein Wort (ANN-192). */
export function einordnung(termin: DayPlanEntry): string {
  // Eine Fehlzeit ohne Bezeichnung heißt in der Namenszeile schon „Fehlzeit"
  // und braucht das Wort nicht zweimal (UX-005h).
  return [
    termin.kind === 'internal'
      ? termin.title
        ? 'Fehlzeit'
        : null
      : termin.kind === 'training'
        ? 'Training'
        : null,
    appointmentTypeHint(termin.appointment_type),
    termin.location_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Der Name, unter dem ein Termin in der Übersicht steht. */
export function terminName(termin: DayPlanEntry): string {
  if (termin.kind === 'training') {
    const name = `${termin.training_given_name ?? ''} ${termin.training_family_name ?? ''}`.trim();
    return name || 'Trainingstermin';
  }
  if (termin.kind === 'internal' || !termin.patient_id) return termin.title ?? 'Fehlzeit';
  return `${termin.patient_given_name ?? ''} ${termin.patient_family_name ?? ''}`.trim();
}

/**
 * Der Weg, den der große Wegbalken zeigt (Design-Handoff 2026-10-01,
 * Abschnitte 5 und 5a Punkt 7).
 *
 * Wartet der nächste Besuch noch, ist es der Weg **zu ihm**. Hat er begonnen,
 * ist es der Weg **danach** - zum nächsten ausstehenden Termin mit bekannter
 * Anfahrt. Ohne geschätzte Fahrzeit gibt es keinen Balken: ungeprüft ist
 * nicht „kurz" (MAP-004b).
 *
 * ANN-196: Der Balken beginnt am Ende des Termins davor - und **jetzt**,
 * sobald dieses Ende vorbei ist oder es keinen Termin davor gibt (der erste
 * Weg des Tages, vom Startort der Praxis). Einen geplanten Aufbruch kennt die
 * Anwendung nicht, und eine erfundene Uhrzeit rechnete einen Puffer vor, den
 * es nicht gibt. Bis zum Ende des Termins davor zeigt der Balken also den
 * geplanten Abstand, danach das, was davon noch übrig ist: Der Puffer
 * schrumpft mit der Uhr, und wer zu spät dran ist, liest es.
 */
export function naechsterWeg(
  plan: readonly DayPlanEntry[],
  fokus: Fokus | null,
  anfahrten: ReadonlyMap<string, Anfahrt>,
  jetzt: number,
): NaechsterWeg | null {
  if (!fokus || fokus.art !== 'besuch') return null;

  const wartet = besuchsphase(fokus.termin, jetzt) === 'wartet';
  const ziel = wartet
    ? fokus.termin
    : [...plan]
        .sort(nachUhrzeit)
        .find(
          (termin) =>
            termin.id !== fokus.termin.id &&
            stehtAus(termin, jetzt) &&
            termin.starts_at >= fokus.termin.starts_at &&
            anfahrten.has(termin.id),
        );
  const anfahrt = ziel ? anfahrten.get(ziel.id) : undefined;
  if (!ziel || !anfahrt) return null;

  const zone = ziel.organization_time_zone;
  const { vorher } = anfahrt;
  const erster = wartet && wegeDesTages(plan, jetzt).istErsterDesTages && vorher === null;
  return {
    titel: wartet ? (erster ? 'Erster Weg' : 'Nächster Weg') : 'Nächster Weg danach',
    von:
      vorher !== null && jetzt <= Date.parse(vorher.ends_at)
        ? {
            zeit: formatLocalTime(vorher.ends_at, zone),
            label: `Ende ${terminName(vorher)}`,
          }
        : {
            zeit: formatLocalTime(new Date(jetzt).toISOString(), zone),
            label: vorher ? 'Jetzt' : 'Jetzt, Start am Rad',
          },
    bis: { zeit: formatLocalTime(ziel.starts_at, zone), label: terminName(ziel) },
    fahrtMin: anfahrt.minuten,
  };
}
