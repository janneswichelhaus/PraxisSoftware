import { zurueck, type Abfolge } from '@/components/ui/abfolge';
import type { Fleet } from '@/features/fleet';
import {
  canManageStaffAccounts,
  canManageWorkingHours,
  isTherapyStaff,
  type RoleKey,
} from '@/features/core';
import type { VorlageKey } from './arbeitszeitvorlagen';
import type { Zustellung } from './konto-api';

/**
 * Neue:n Mitarbeiter:in einrichten (Überholung 6, G5) - die Abfolge ohne
 * Oberfläche: welche Seite wem erscheint, wann alles beantwortet ist, der
 * wievielte Schritt gerade gilt, was „… einrichten“ schreibt und wie jeder
 * Schritt danach steht.
 *
 *   1. `person` - Wer kommt ins Team? Name und dienstlicher Kontakt; alle.
 *   2. `rolle` - Welche Rolle? Nur wer Zugänge vergibt (owner); „Später“
 *      heißt: keine Einladung.
 *   3. `arbeitszeit` - Wann arbeitet sie? Wochenplan aus einer Vorlage;
 *      siehe `kontextFuer`, falls die Person behandelt.
 *   4. `rad` - Fährt sie ein Lastenrad? Den Schlüssel gleich eintragen; für
 *      alle, die die Radflotte nutzen, falls die Person behandelt.
 *   5. `einladung` - Zugang einladen? Nur owner und nur mit gewählter Rolle.
 *   6. `abschluss` - Alles richtig? Erst sein Knopf schreibt.
 *
 * Die Rollen der angemeldeten Person steuern nur, welche Seiten erscheinen.
 * Verbindlich prüft der Server jeden Schreibweg (ADR-004).
 */
export const SEITEN = ['person', 'rolle', 'arbeitszeit', 'rad', 'einladung', 'abschluss'] as const;
export type Seite = (typeof SEITEN)[number];
/** Die Seiten mit einer Frage - alle außer dem Abschluss. */
export type Frage = Exclude<Seite, 'abschluss'>;

/** Was die angemeldete Person in diesem Ablauf darf - nur Darstellung. */
export interface Kontext {
  /** Rollen wählen und einladen (owner, `app.can_manage_staff_accounts`). */
  zugang: boolean;
  /** Den Wochenplan gleich setzen (siehe `kontextFuer`). */
  arbeitszeiten: boolean;
  /** Einen Schlüssel eintragen - alle Praxisrollen der Behandlung (BEF-066). */
  radflotte: boolean;
}

export function kontextFuer(rollen: readonly RoleKey[]): Kontext {
  const zugang = canManageStaffAccounts(rollen);
  return {
    zugang,
    // ANN-581 (Überholung 6, G5): Arbeitszeiten nimmt `set_staff_working_hours`
    // nur für eine zuordenbare Person an (`app.is_assignable_therapist`). Eine
    // neue Person ist das erst, wenn owner sie in den Kalender nimmt (ANN-226)
    // oder wenn sie ihre Einladung angenommen hat. Die Seite sieht deshalb nur,
    // wer beides darf - der Ablauf nimmt die Person mit dem Wochenplan in den
    // Kalender für Behandlungen. office sieht den Weg im Abschluss. Darf
    // office das Merkmal einmal setzen (ANN-226, Änderungspfad), genügt hier
    // `canManageWorkingHours`.
    arbeitszeiten: canManageWorkingHours(rollen) && zugang,
    radflotte: isTherapyStaff(rollen),
  };
}

export interface Personangaben {
  given_name: string;
  family_name: string;
  work_email: string;
  work_phone: string;
}

export type Rollenwahl = readonly RoleKey[] | 'spaeter';
export type Arbeitszeitwahl = VorlageKey | 'spaeter';
export type Radwahl = { radId: string } | 'spaeter' | 'kein';
export type Einladungswahl = { email: string } | 'spaeter';

/** Die Antworten je Seite; eine fehlende Antwort heißt: noch nicht gefragt. */
export interface Antworten {
  person?: Personangaben;
  rolle?: Rollenwahl;
  arbeitszeit?: Arbeitszeitwahl;
  rad?: Radwahl;
  einladung?: Einladungswahl;
}

/** Die Felder der ersten Seite, in ihrer Reihenfolge - auch für den Fokus auf den ersten Fehler. */
export const PERSONFELDER: readonly (keyof Personangaben)[] = [
  'given_name',
  'family_name',
  'work_email',
  'work_phone',
];

export function vollerName(person: Pick<Personangaben, 'given_name' | 'family_name'>): string {
  return `${person.given_name.trim()} ${person.family_name.trim()}`.trim();
}

/**
 * Die Räder, deren Schlüssel im Tresor liegt: nicht gesperrt, nicht entnommen
 * - wie beim Eintragen (`KeyPage`); der Server prüft es ebenso.
 */
export function freieRaeder(flotte: Pick<Fleet, 'bikes'>): Fleet['bikes'] {
  return flotte.bikes.filter((rad) => !rad.key && !rad.block);
}

/** Rollen, mit denen eine Person behandelt - wie `app.is_assignable_therapist`. */
const BEHANDELND: readonly RoleKey[] = ['therapist', 'team_lead'];

/**
 * Behandelt die neue Person (ANN-582)? Ohne gewählte Rolle (office fragt nicht danach,
 * owner hat „Später“ gewählt) wie eine Therapeut:in: Arbeitszeiten und Rad
 * werden gefragt, statt still zu entfallen. Mit Rollen nur, wenn eine
 * behandelnde dabei ist - Praxismanagement und Trainingsbetreuung haben keinen
 * Behandlungsplan, und die Trainingsbetreuung nutzt die Radflotte nicht.
 */
export function behandelt(antworten: Antworten): boolean {
  const { rolle } = antworten;
  return (
    rolle === undefined ||
    rolle === 'spaeter' ||
    rolle.some((eintrag) => BEHANDELND.includes(eintrag))
  );
}

/** Mit Rolle - oder noch ungefragt: Dann zählt die Einladung im Weg mit. */
function einladbar(antworten: Antworten): boolean {
  const { rolle } = antworten;
  return rolle === undefined || (rolle !== 'spaeter' && rolle.length > 0);
}

export function erscheint(seite: Seite, kontext: Kontext, antworten: Antworten): boolean {
  switch (seite) {
    case 'rolle':
      return kontext.zugang;
    case 'arbeitszeit':
      return kontext.arbeitszeiten && behandelt(antworten);
    case 'rad':
      return kontext.radflotte && behandelt(antworten);
    case 'einladung':
      return kontext.zugang && einladbar(antworten);
    case 'person':
    case 'abschluss':
      return true;
  }
}

/** Der Weg, der aus Rechten und Antworten folgt, mit dem Abschluss am Ende. */
export function seitenfolge(kontext: Kontext, antworten: Antworten): Seite[] {
  return SEITEN.filter((seite) => erscheint(seite, kontext, antworten));
}

export function beantwortet(seite: Frage, antworten: Antworten): boolean {
  return antworten[seite] !== undefined;
}

/** Jede Frage des Wegs hat eine Antwort - der Abschluss kann schreiben. */
export function vollstaendig(kontext: Kontext, antworten: Antworten): boolean {
  return seitenfolge(kontext, antworten).every(
    (seite) => seite === 'abschluss' || beantwortet(seite, antworten),
  );
}

/**
 * Die Seite nach `seite`. Beim Ändern aus dem Abschluss die erste, die noch
 * fehlt - eine andere Rolle kann eine Frage neu aufwerfen (die Einladung);
 * sonst die folgende: Wer mit „← Zurück“ eine Antwort ändert, sieht danach
 * die nächste Seite wieder, mit der Antwort, die dort schon steht.
 */
export function naechste(
  kontext: Kontext,
  antworten: Antworten,
  seite: Seite,
  imAendern = false,
): Seite {
  const folge = seitenfolge(kontext, antworten);
  const danach = folge.slice(folge.indexOf(seite) + 1);
  if (imAendern) {
    const offen = (eintrag: Seite) => eintrag !== 'abschluss' && !beantwortet(eintrag, antworten);
    return danach.find(offen) ?? folge.find(offen) ?? 'abschluss';
  }
  return danach[0] ?? 'abschluss';
}

/**
 * „← Zurück“ dorthin, woher man kam - über Seiten hinweg, die eine geänderte
 * Rolle inzwischen weggenommen hat. `null` auf der ersten Seite.
 */
export function zurueckIm(
  kontext: Kontext,
  antworten: Antworten,
  abfolge: Abfolge<Seite>,
): Abfolge<Seite> | null {
  let vorher = zurueck(abfolge);
  while (vorher && !erscheint(vorher.seite, kontext, antworten)) vorher = zurueck(vorher);
  return vorher;
}

/** Der wievielte Schritt die Seite im Weg ist, und wie viele es sind. */
export function schritt(
  kontext: Kontext,
  antworten: Antworten,
  seite: Seite,
): { nummer: number; von: number } {
  const folge = seitenfolge(kontext, antworten);
  return { nummer: folge.indexOf(seite) + 1, von: folge.length };
}

// -----------------------------------------------------------------------------
// Was „… einrichten“ schreibt
// -----------------------------------------------------------------------------

export interface Einrichtung {
  person: Personangaben;
  /** Den Wochenplan dieser Vorlage setzen - die Person dafür in den Kalender nehmen. */
  vorlage: VorlageKey | null;
  /** Den Schlüssel dieses Rads auf die Person eintragen. */
  radId: string | null;
  /** Den Zugang einladen. */
  einladung: { email: string; rollen: readonly RoleKey[] } | null;
}

/**
 * Was der Knopf des Abschlusses schreibt, der Reihe nach: anlegen, Wochenplan,
 * Schlüssel, Einladung. Nur Antworten von Seiten, die noch im Weg stehen -
 * nach einer anderen Rolle schreibt eine verwaiste Antwort nichts. `null`,
 * solange eine Frage fehlt.
 */
export function einrichtung(kontext: Kontext, antworten: Antworten): Einrichtung | null {
  const { person, rolle, arbeitszeit, rad, einladung } = antworten;
  if (!person || !vollstaendig(kontext, antworten)) return null;
  const im = (seite: Seite) => erscheint(seite, kontext, antworten);
  return {
    person,
    vorlage: im('arbeitszeit') && arbeitszeit && arbeitszeit !== 'spaeter' ? arbeitszeit : null,
    radId: im('rad') && typeof rad === 'object' ? rad.radId : null,
    einladung:
      im('einladung') && typeof einladung === 'object' && rolle && rolle !== 'spaeter'
        ? { email: einladung.email, rollen: rolle }
        : null,
  };
}

/** Wie die Schritte nach dem Anlegen ausgingen; ohne Eintrag: nicht versucht. */
export interface Ausgaenge {
  arbeitszeit?: { ok: true } | { ok: false; fehler: string; amKalender: boolean };
  schluessel?: { ok: true } | { ok: false; fehler: string };
  einladung?: { ok: true; zustellung: Zustellung } | { ok: false; fehler: string };
}

export type Stand = 'erledigt' | 'fehlt' | 'offen' | 'spaeter';
export type Ergebnisart = 'arbeitszeit' | 'schluessel' | 'stammrad' | 'zugang';

export interface Ergebnisschritt {
  art: Ergebnisart;
  stand: Stand;
}

/**
 * Je Schritt, wie er steht (Spec Überholung 6, Kriterium 7: nichts wird still
 * übersprungen). Was gewählt war, ist erledigt - nur mit der Bestätigung des
 * Servers - oder fehlt; was nur anderswo geht, ist offen (das Stammrad am Rad,
 * ohne owner Zugang und Wochenplan, die nicht zugestellte Anmeldemail); was auf
 * „Später“ steht, steht als später da. „Kein Rad“ ist kein Schritt.
 *
 * Ohne `ausgaenge` (vor dem Schreiben) stehen gewählte Schritte als erledigt -
 * der Abschluss zeigt damit, was offen bleiben wird.
 */
export function ergebnisschritte(
  kontext: Kontext,
  antworten: Antworten,
  ausgaenge?: Ausgaenge,
): Ergebnisschritt[] {
  const plan = einrichtung(kontext, antworten);
  if (!plan) return [];
  const gelungen = (ausgang: { ok: boolean } | undefined) =>
    ausgaenge === undefined || ausgang?.ok === true;
  const schritte: Ergebnisschritt[] = [];

  if (erscheint('arbeitszeit', kontext, antworten)) {
    schritte.push({
      art: 'arbeitszeit',
      stand: plan.vorlage ? (gelungen(ausgaenge?.arbeitszeit) ? 'erledigt' : 'fehlt') : 'spaeter',
    });
  } else if (behandelt(antworten)) {
    schritte.push({ art: 'arbeitszeit', stand: 'offen' });
  }

  if (erscheint('rad', kontext, antworten)) {
    if (plan.radId) {
      schritte.push({
        art: 'schluessel',
        stand: gelungen(ausgaenge?.schluessel) ? 'erledigt' : 'fehlt',
      });
      // Das Stammrad teilt nur owner am Rad zu (`save_fleet_bike`) - nicht hier.
      schritte.push({ art: 'stammrad', stand: 'offen' });
    } else if (antworten.rad === 'spaeter') {
      schritte.push({ art: 'schluessel', stand: 'spaeter' });
    }
  }

  if (!kontext.zugang) {
    schritte.push({ art: 'zugang', stand: 'offen' });
  } else if (plan.einladung) {
    const einladung = ausgaenge?.einladung;
    schritte.push({
      art: 'zugang',
      stand:
        ausgaenge === undefined
          ? 'erledigt'
          : einladung?.ok !== true
            ? 'fehlt'
            : einladung.zustellung === 'gesendet'
              ? 'erledigt'
              : 'offen',
    });
  } else {
    schritte.push({ art: 'zugang', stand: 'spaeter' });
  }
  return schritte;
}

/**
 * Bleibt es bei der Ergebnisseite? Ja, wenn etwas anders ausging als gewählt:
 * Ein Schritt fehlt, oder die Anmeldemail ging nicht hinaus - ihr Stand steht
 * sonst nirgends. Was der Abschluss schon als offen nannte, hält nicht auf;
 * dann geht es zur Seite der Person.
 */
export function mitErgebnisseite(
  kontext: Kontext,
  antworten: Antworten,
  ausgaenge: Ausgaenge,
): boolean {
  const eingeladen = einrichtung(kontext, antworten)?.einladung != null;
  return ergebnisschritte(kontext, antworten, ausgaenge).some(
    (schritt) =>
      schritt.stand === 'fehlt' ||
      (schritt.art === 'zugang' && eingeladen && schritt.stand === 'offen'),
  );
}
