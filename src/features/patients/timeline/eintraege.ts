import { ereignisartTexte, type Ereignisart } from '@/lib/verlaufsereignisse';
import { formatLocalTime, monatsBeginn } from '@/lib/datum';
import type { Zeitstrahleintrag } from './api';

// Was eine Zeile des Zeitstrahls sagt und wohin sie führt. Der Regelfall trägt kein Abzeichen;
// ein Abzeichen ist ein Stand, nie eine Bewertung (ADR-006 Punkt 11).

export interface Zeile {
  titel: string;
  meta: string | null;
  abzeichen: string | null;
  ziel: string | null;
}

export interface Namen {
  /** Name eines Instruments aus der Bibliothek, sonst die Kennung. */
  instrument: (kennung: string) => string;
  /** Thema einer Rückfrage. */
  thema: (thema: string) => string;
  /** Bauart einer Grundlage. */
  bauart: (bauart: string) => string;
}

const TERMINART: Record<string, string> = {
  home_visit: 'Hausbesuch',
  practice: 'Termin in der Praxis',
  video: 'Videotermin',
  nutrition_counselling: 'Ernährungsberatung',
};

const TERMINSTAND: Record<string, string> = {
  cancelled: 'Abgesagt',
  no_show: 'Ausfall',
};

const PLANWECHSEL: Record<string, string> = {
  plan_assigned: 'Übungsplan zugewiesen',
  plan_version: 'Neue Fassung des Übungsplans',
  plan_ended: 'Übungsplan beendet',
};

function vertretung(stand: string | null): string | null {
  return stand === 'legal_representative' ? 'Von der Vertretung' : null;
}

export function zeile(
  e: Zeitstrahleintrag,
  patientId: string,
  zeitzone: string,
  namen: Namen,
): Zeile {
  const akte = `/patienten/${patientId}`;
  const uhrzeit = e.at ? formatLocalTime(e.at, zeitzone) : null;
  switch (e.kind) {
    case 'appointment': {
      const abgesagt = e.state === 'cancelled' || e.state === 'no_show';
      // Stand der Doku nur für begonnene, nicht abgesagte Termine; „final“ ist der Regelfall.
      const doku =
        abgesagt || e.state === 'confirmed' || e.detail === null || e.detail === 'final'
          ? null
          : e.detail === 'draft'
            ? 'Doku im Entwurf'
            : 'Doku fehlt';
      return {
        titel: TERMINART[e.label ?? ''] ?? 'Termin',
        meta: uhrzeit,
        abzeichen: (e.state && TERMINSTAND[e.state]) ?? doku,
        ziel: e.detail !== null && e.ref ? `${akte}/doku?termin=${e.ref}` : null,
      };
    }
    case 'addendum':
      return {
        titel: 'Nachtrag zur Doku',
        meta: uhrzeit,
        abzeichen: e.state === 'draft' ? 'Entwurf' : null,
        ziel: e.ref ? `${akte}/doku?termin=${e.ref}` : null,
      };
    case 'questionnaire':
      return {
        titel: namen.instrument(e.label ?? ''),
        meta: e.state === 'platform' ? 'Von der Person über die Plattform' : null,
        abzeichen: e.detail === 'correction' ? 'Korrektur' : null,
        ziel: `${akte}/doku/befund`,
      };
    case 'course_event':
      return {
        titel: ereignisartTexte[e.label as Ereignisart] ?? 'Ereignis',
        meta: e.detail,
        abzeichen: null,
        ziel: `${akte}/doku/befund`,
      };
    case 'therapy_report':
      return {
        titel: 'Therapiebericht',
        meta: null,
        abzeichen: e.detail === 'correction' ? 'Korrektur' : null,
        ziel: `${akte}/verordnungen`,
      };
    case 'plan_assigned':
    case 'plan_version':
    case 'plan_ended':
      return { titel: PLANWECHSEL[e.kind]!, meta: e.label, abzeichen: null, ziel: null };
    case 'session':
      return {
        titel: 'Einheit',
        meta: [e.label, vertretung(e.state)].filter(Boolean).join(' · ') || null,
        abzeichen: null,
        ziel: null,
      };
    case 'checkin':
      return { titel: 'Check-in', meta: vertretung(e.state), abzeichen: null, ziel: null };
    case 'message':
      return {
        titel: `Rückfrage: ${namen.thema(e.label ?? '')}`,
        meta: uhrzeit,
        abzeichen: e.state === 'open' ? 'Offen' : null,
        ziel: e.ref ? `/rueckfragen/${e.ref}` : null,
      };
    case 'message_closed':
      return {
        titel: `Rückfrage erledigt: ${namen.thema(e.label ?? '')}`,
        meta: e.state === 'person' ? 'Von der Person' : null,
        abzeichen: null,
        ziel: e.ref ? `/rueckfragen/${e.ref}` : null,
      };
    case 'treatment_basis':
      return {
        titel: namen.bauart(e.label ?? ''),
        meta: null,
        abzeichen: null,
        ziel: `${akte}/verordnungen`,
      };
    case 'invoice':
      return {
        titel: `Rechnung ${e.label ?? ''}`.trim(),
        meta: null,
        abzeichen: e.state === 'cancelled' ? 'Storniert' : null,
        ziel: e.ref ? `/abrechnung/rechnungen/${e.ref}` : null,
      };
    default:
      return { titel: 'Eintrag', meta: null, abzeichen: null, ziel: null };
  }
}

export interface Monat {
  monat: string;
  eintraege: Zeitstrahleintrag[];
}

/** Nach Monat gruppiert, in der Reihenfolge des Servers (neueste zuerst). */
export function nachMonat(eintraege: readonly Zeitstrahleintrag[]): Monat[] {
  const monate: Monat[] = [];
  for (const e of eintraege) {
    const monat = monatsBeginn(e.on);
    const letzter = monate.at(-1);
    if (letzter?.monat === monat) letzter.eintraege.push(e);
    else monate.push({ monat, eintraege: [e] });
  }
  return monate;
}
