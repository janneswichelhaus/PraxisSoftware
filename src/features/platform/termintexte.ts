import type { Ton } from '@/components/ui/Badge';
import type { Artzeichen } from '@/components/ui/Terminsymbole';
import type { Plattformzugang, Termin, Terminwunsch } from './api';
import { WOCHENTAGE, WOCHENTAG_NAME, type Wochentag } from './terminablauf';
import { kuenftig, tageBis, tagUndMonat, uhrzeit } from './zeit';

/**
 * Die Wörter der Termine (Handoff 2026-10-24 „Termine“, Abschnitte 3 und
 * 5; Schritt 3a): reine Funktionen ohne Oberfläche für Terminzeile, Hero,
 * „Wer und wo“, Wunschzeile und „Diese Woche“. Gerechnet wird auf der Uhr
 * des Geräts wie jede Zeit der Plattform (`zeit.ts`) - auch „Heute“ und
 * „Morgen“, damit Zeile und Hero denselben Tag meinen wie `terminTitel`
 * (ANN-732).
 */

type Bereich = Plattformzugang['relationship_kind'];
type Art = Termin['appointment_type'];

/**
 * Im Training trägt jede Einheit außer Video das Zeichen „Training“, wie
 * `terminTitel` dort „Training“ sagt (Festlegung „Zeichen der Art“).
 */
export function artzeichen(art: Art, bereich: Bereich): Artzeichen {
  if (art === 'video') return 'video';
  if (bereich === 'training') return 'training';
  return art === 'home_visit' ? 'haus' : 'praxis';
}

const KURZ: Record<Artzeichen, string> = {
  haus: 'Hausbesuch',
  praxis: 'Praxis',
  video: 'Video',
  training: 'Training',
};

const LANG: Record<Artzeichen, string> = {
  haus: 'Hausbesuch',
  praxis: 'In der Praxis',
  video: 'Videotermin',
  training: 'Training',
};

/** Die Art kurz für die Terminzeile: „Hausbesuch“, „Praxis“, „Video“, „Training“. */
export function artKurz(art: Art, bereich: Bereich): string {
  return KURZ[artzeichen(art, bereich)];
}

/** Die Art für den Kopf der Seite des Termins: „In der Praxis“, „Videotermin“ … */
export function artLang(art: Art, bereich: Bereich): string {
  return LANG[artzeichen(art, bereich)];
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const WOCHENTAG_KURZ = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

/** „Montag“ oder „Mo.“ für einen Zeitpunkt oder Kalendertag `YYYY-MM-DD`. */
function wochentag(wert: string, kurz = false): string {
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(wert) ? new Date(`${wert}T12:00:00`) : new Date(wert);
  return (kurz ? WOCHENTAG_KURZ : WOCHENTAG).format(tag).replace(/\.?$/, kurz ? '.' : '');
}

/** Tag und Monat brechen nicht auseinander („4. November“ mit geschütztem Leerzeichen). */
function fest(text: string): string {
  return text.replace(/(\d+\.) /, '$1\u00a0');
}

/**
 * Der Tag eines Termins in Worten (Terminzeile und Kopf der Seite):
 * „Heute, 24. Oktober“, „Morgen, 25. Oktober“, sonst „Mittwoch, 4.
 * November“; ein anderes Jahr steht dabei.
 */
export function tagInWorten(zeitpunkt: string, jetzt: Date = new Date()): string {
  const tage = tageBis(zeitpunkt, jetzt);
  const wort = tage === 0 ? 'Heute' : tage === 1 ? 'Morgen' : wochentag(zeitpunkt);
  return `${wort}, ${fest(tagUndMonat(zeitpunkt, jetzt))}`;
}

/** „Mi., 4. November“ - der Tag eines Termins im Titel eines Wunschs. */
export function tagKurzInWorten(zeitpunkt: string, jetzt: Date = new Date()): string {
  return `${wochentag(zeitpunkt, true)}, ${fest(tagUndMonat(zeitpunkt, jetzt))}`;
}

/** Die dritte Zeile der Terminzeile: „Praxis · Jannes Test“; ohne Namen nur das Wort. */
export function artUndPerson(termin: Termin, bereich: Bereich): string {
  const art = artKurz(termin.appointment_type, bereich);
  return termin.staff_name ? `${art} · ${termin.staff_name}` : art;
}

/** Ist der Termin vorbei, abgesagt oder nicht angetroffen? Dann gedämpft. */
export function gedaempft(termin: Termin, jetzt: Date = new Date()): boolean {
  return termin.status !== 'confirmed' || !kuenftig(termin.ends_at, jetzt);
}

const ZUSTAND: Record<Termin['status'], { wort: string; ton: Ton } | null> = {
  confirmed: null,
  completed: { wort: 'durchgeführt', ton: 'positiv' },
  cancelled: { wort: 'abgesagt', ton: 'kritisch' },
  no_show: { wort: 'nicht angetroffen', ton: 'warnung' },
};

/**
 * Das Statuszeichen eines Termins: der offene Wunsch („Änderung angefragt“,
 * „Absage angefragt“) oder der Zustand („durchgeführt“, „abgesagt“, „nicht
 * angetroffen“); ein bestätigter Termin trägt keins.
 */
export function terminZustand(termin: Termin): { wort: string; ton: Ton } | null {
  if (termin.status === 'confirmed' && termin.open_request_kind) {
    return {
      wort: termin.open_request_kind === 'change' ? 'Änderung angefragt' : 'Absage angefragt',
      ton: 'akzent',
    };
  }
  return ZUSTAND[termin.status];
}

/** „14:00 bis 15:00“ wie im Hero (`terminZeit`). */
export function vonBis(termin: Pick<Termin, 'starts_at' | 'ends_at'>): string {
  return `${uhrzeit(termin.starts_at)} bis ${uhrzeit(termin.ends_at)}`;
}

/**
 * Der Name der Terminzeile für Vorlesesoftware (Handoff, Abschnitt 6): Tag,
 * Zeit, Art, Person und Zustand in einem Satz.
 */
export function terminzeileName(
  termin: Termin,
  bereich: Bereich,
  jetzt: Date = new Date(),
): string {
  const zustand = terminZustand(termin);
  return [
    tagInWorten(termin.starts_at, jetzt),
    vonBis(termin),
    artUndPerson(termin, bereich),
    zustand?.wort,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Die Rolle unter dem Namen in „Wer und wo“ (Handoff, Abschnitt 3): kommend
 * „kommt zu Ihnen“, „erwartet Sie in der Praxis“, „per Video“; durchgeführt
 * beim Hausbesuch „war bei Ihnen“; sonst nur der Name (`null`). Für eine
 * Vertretung „kommt“ bzw. „erwartet {Name} in der Praxis“. Die Daten kennen
 * nur den Namen - ein Geschlecht steht nirgends (ANN-734).
 */
export function rolle(
  termin: Termin,
  vertretung: string | null,
  jetzt: Date = new Date(),
): string | null {
  const art = termin.appointment_type;
  if (termin.status === 'completed') return art === 'home_visit' ? 'war bei Ihnen' : null;
  if (termin.status !== 'confirmed' || !kuenftig(termin.ends_at, jetzt)) return null;
  if (art === 'home_visit') return vertretung ? 'kommt' : 'kommt zu Ihnen';
  if (art === 'video') return 'per Video';
  return vertretung ? `erwartet ${vertretung} in der Praxis` : 'erwartet Sie in der Praxis';
}

/**
 * Das Etikett des nächsten Termins als Hero (Handoff, Abschnitt 3):
 * „Ihr nächster Besuch“, „Ihr nächster Termin“, „Ihr nächstes Training“,
 * beim ersten „Ihr erster …“; für eine Vertretung ohne „Ihr“.
 */
export function heroEtikett(
  art: Art,
  bereich: Bereich,
  erster: boolean,
  vertretung: boolean,
): string {
  const zeichen = artzeichen(art, bereich);
  const sache = zeichen === 'haus' ? 'Besuch' : zeichen === 'training' ? 'Training' : 'Termin';
  const neutrum = sache === 'Training';
  const welcher = erster ? (neutrum ? 'erstes' : 'erster') : neutrum ? 'nächstes' : 'nächster';
  if (!vertretung) return `Ihr ${welcher} ${sache}`;
  return `${welcher.charAt(0).toUpperCase()}${welcher.slice(1)} ${sache}`;
}

const TAGESZEIT_ADVERB: Record<Terminwunsch['preferred_times'][number], string> = {
  morning: 'vormittags',
  midday: 'mittags',
  afternoon: 'nachmittags',
};

/** „Dienstag oder Donnerstag“, alle fünf „Montag bis Freitag“. */
function tageMitOder(tage: readonly Wochentag[]): string {
  const gewaehlt = WOCHENTAGE.filter((t) => tage.includes(t));
  if (gewaehlt.length === WOCHENTAGE.length) return 'Montag bis Freitag';
  return gewaehlt.map((t) => WOCHENTAG_NAME[t]).join(' oder ');
}

/**
 * Was gewünscht ist, in Worten (Wunschzeile, Handoff Abschnitt 3): die
 * Tage nach Wochentag zusammengefasst mit „oder“ - jeder einzelne passt -,
 * dann die Tageszeit: „Dienstag oder Donnerstag, vormittags“; ohne Angabe
 * „zu jeder Tageszeit“. Ohne Tage (Absage) `null` (ANN-735).
 */
export function wunschInWorten(
  wunsch: Pick<Terminwunsch, 'preferred_days' | 'preferred_times'>,
): string | null {
  const tage = [
    ...new Set(
      wunsch.preferred_days.map((tag) => new Date(`${tag}T12:00:00`).getDay() as Wochentag),
    ),
  ];
  if (tage.length === 0) return null;
  const zeiten = wunsch.preferred_times.map((z) => TAGESZEIT_ADVERB[z]);
  return `${tageMitOder(tage)}, ${zeiten.length > 0 ? zeiten.join(' oder ') : 'zu jeder Tageszeit'}`;
}

/**
 * Der Satz unter den Tagen im Wunsch (Handoff Abschnitt 3, „Tage“):
 * „Dienstag oder Donnerstag – bis Donnerstag, 12. November.“ mit dem
 * letzten gesendeten Tag; ohne Tag die Bitte zu wählen.
 */
export function tageSatz(
  tage: readonly Wochentag[],
  kalendertage: readonly string[],
  jetzt: Date = new Date(),
): string {
  const letzter = kalendertage[kalendertage.length - 1];
  if (tage.length === 0 || !letzter) return 'Wählen Sie einen oder mehrere Tage.';
  return `${tageMitOder(tage)} – bis ${wochentag(letzter)}, ${fest(tagUndMonat(letzter, jetzt))}.`;
}

/**
 * Der Titel einer Wunschzeile: „Terminwunsch“, „Änderung für Mi., 4.
 * November“, „Absage für Mi., 4. November“ - das Datum aus dem Termin des
 * Wunschs; ist er nicht in der Liste, „Änderungswunsch“ bzw. „Absagewunsch“.
 */
export function wunschTitel(
  wunsch: Pick<Terminwunsch, 'kind' | 'appointment_id'>,
  termine: readonly Termin[],
  jetzt: Date = new Date(),
): string {
  if (wunsch.kind === 'new') return 'Terminwunsch';
  const termin = termine.find((t) => t.id === wunsch.appointment_id);
  const [was, ohneTermin] =
    wunsch.kind === 'change' ? ['Änderung', 'Änderungswunsch'] : ['Absage', 'Absagewunsch'];
  return termin ? `${was} für ${tagKurzInWorten(termin.starts_at, jetzt)}` : ohneTermin;
}

/** „Gesendet am 22. Oktober“ - das Jahr nur, wenn es nicht das laufende ist. */
export function gesendetAm(wunsch: Pick<Terminwunsch, 'created_at'>, jetzt = new Date()): string {
  return `Gesendet am ${fest(tagUndMonat(wunsch.created_at, jetzt))}`;
}

/**
 * Die leeren Tage von „Diese Woche“ in einer Zeile (Handoff Abschnitt 3):
 * „So., Di., Do., Fr.“; drei und mehr aufeinanderfolgende als Spanne „So.,
 * Di. bis Fr.“. Erwartet Kalendertage `YYYY-MM-DD` in ihrer Folge.
 */
export function leereTage(kalendertage: readonly string[]): string {
  const laeufe: string[][] = [];
  for (const tag of kalendertage) {
    const lauf = laeufe[laeufe.length - 1];
    const vorher = lauf?.[lauf.length - 1];
    if (lauf && vorher && naechsterTag(vorher) === tag) lauf.push(tag);
    else laeufe.push([tag]);
  }
  return laeufe
    .flatMap((lauf) =>
      lauf.length >= 3
        ? [`${wochentag(lauf[0]!, true)} bis ${wochentag(lauf[lauf.length - 1]!, true)}`]
        : lauf.map((tag) => wochentag(tag, true)),
    )
    .join(', ');
}

function naechsterTag(kalendertag: string): string {
  const d = new Date(`${kalendertag}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
