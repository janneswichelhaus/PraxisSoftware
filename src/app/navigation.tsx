import type { ReactNode } from 'react';
import type { SubNavEintrag } from '@/components/ui/SubNav';
import {
  canManageAppointments,
  canReadPatientDirectory,
  canWriteTreatmentNote,
  isOwner,
  isStaff,
  type CurrentUser,
  type RoleKey,
} from '@/features/session/types';

/**
 * Die Arbeitsbereiche der Plattform.
 *
 * Sechs Bereiche, jeder mit einer eigenen Leitfrage. Sie sind die einzige
 * globale Navigationsebene; alles Weitere sitzt als lokales Untermenü beim
 * Arbeitsgegenstand.
 *
 *   Übersicht         Was muss ich als Nächstes tun?
 *   Kalender          Wer behandelt wen, wann und mit welchen Wegen?
 *   Patient:innen     Was gehört zur Versorgung dieser Person?
 *   Kommunikation     Mit wem muss ich etwas klären?
 *   Organisatorisches Welche Voraussetzungen und Anträge sind zu bearbeiten?
 *   Abrechnung        Welche Leistungen sind abzurechnen oder zu bezahlen?
 *
 * Die Beschriftungen stammen von Jannes (2026-09-12) und lösen „Mein Tag",
 * „Touren & Termine", „Team" und „Betrieb" ab. Die fachlichen Kennungen der
 * Bereiche bleiben davon unberührt: `heute`, `termine`, `team` und `betrieb`
 * stehen in Routenzuordnung und Tests und sind keine Beschriftung.
 *
 * Die Rollenprüfungen hier steuern ausschließlich die Darstellung. Die
 * verbindliche Autorisierung liegt in den RLS-Policies (ADR-004); ein
 * ausgeblendeter Menüpunkt ist keine Zugriffskontrolle. Für die Vorschau-
 * bereiche gibt es ohnehin keine echten Daten, die zu schützen wären.
 */

export interface Arbeitsbereich {
  id: string;
  /** Vollständige Bezeichnung, seitliche Navigation und Bereichsübersicht. */
  label: string;
  /**
   * Kurzform für die Tableiste auf schmalen Geräten.
   *
   * Bei 375 px teilen sich fünf Ziele die Breite: 75 px je Ziel, abzüglich
   * Innenabstand 67 px für die Beschriftung. „Kommunikation" (76 px) und
   * „Organisatorisches" (89 px) passen dort nicht und würden die Seite
   * waagerecht scrollen lassen — sie stehen hier als „Nachrichten" und
   * „Organisation". Die übrigen vier passen und tragen deshalb ihre
   * vollständige Bezeichnung.
   */
  kurz: string;
  leitfrage: string;
  /** Einstiegsroute des Bereichs. */
  to: string;
  /** Pfadanfänge, die zu diesem Bereich gehören. */
  pfade: string[];
  icon: ReactNode;
  unterpunkte: SubNavEintrag[];
}

// -----------------------------------------------------------------------------
// Symbole
//
// Bewusst schlichte Strichzeichnungen inline statt einer Icon-Bibliothek: eine
// weitere Abhaengigkeit waere fuer sechs Symbole nicht zu rechtfertigen.
// Sie sind rein dekorativ - die Beschriftung traegt die Bedeutung.
//
// Fuenf davon hat Jannes am 2026-09-12 zusammen mit den neuen Beschriftungen
// vorgegeben (Uebersicht, Kalender, Patient:innen, Kommunikation,
// Organisatorisches); die Geometrie ist unveraendert uebernommen. Abrechnung
// und "Mehr" blieben ausdruecklich, wie sie waren. Gemeinsames Mass: viewBox
// 20, Strichstaerke 1.5, runde Enden, `currentColor`.
// -----------------------------------------------------------------------------

function symbol(children: ReactNode): ReactNode {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const symbole = {
  // Vier Kacheln - der Tag als Ganzes, nicht die Uhrzeit.
  uebersicht: symbol(
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="9.5" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="14.5" width="6" height="2.5" rx="1.25" />
    </>,
  ),
  termine: symbol(
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M6.5 3v3M13.5 3v3" />
      {/* Gefuellte Punkte: belegte Tage. Deshalb hier `fill` statt `stroke`. */}
      <circle cx="6.9" cy="11.6" r=".85" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.6" r=".85" fill="currentColor" stroke="none" />
      <circle cx="13.1" cy="11.6" r=".85" fill="currentColor" stroke="none" />
      <circle cx="6.9" cy="14.4" r=".85" fill="currentColor" stroke="none" />
      <circle cx="10" cy="14.4" r=".85" fill="currentColor" stroke="none" />
    </>,
  ),
  patienten: symbol(
    <>
      <circle cx="8" cy="7" r="2.8" />
      <path d="M2.8 16.5c0-2.9 2.3-4.6 5.2-4.6s5.2 1.7 5.2 4.6" />
      <path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.9" />
      <path d="M14.6 12.3c1.7.5 2.8 1.8 2.8 3.6" />
    </>,
  ),
  team: symbol(
    <>
      <path d="M3 12.6V5.6A1.6 1.6 0 0 1 4.6 4h6.8A1.6 1.6 0 0 1 13 5.6v2.9A1.6 1.6 0 0 1 11.4 10.1H6.4Z" />
      <path d="M17 17.2V12.4A1.6 1.6 0 0 0 15.4 10.8H9.2A1.6 1.6 0 0 0 7.6 12.4v1.6A1.6 1.6 0 0 0 9.2 15.6h4.2Z" />
    </>,
  ),
  betrieb: symbol(
    <>
      <path d="M7.6 3.8H5.5A1.5 1.5 0 0 0 4 5.3v10.2A1.5 1.5 0 0 0 5.5 17h9A1.5 1.5 0 0 0 16 15.5V5.3a1.5 1.5 0 0 0-1.5-1.5h-2.1" />
      <rect x="7.6" y="2.4" width="4.8" height="2.8" rx="1.1" />
      <path d="m7.2 9.8 1.5 1.5 3.1-3.1" />
      <path d="M7.2 14h5.6" />
    </>,
  ),
  abrechnung: symbol(
    <>
      <path d="M5 3.5h10v13l-2.5-1.5L10 16.5 7.5 15 5 16.5Z" />
      <path d="M8 7.5h4M8 10.5h4" />
    </>,
  ),
  mehr: symbol(
    <>
      <circle cx="4.5" cy="10" r="1.25" />
      <circle cx="10" cy="10" r="1.25" />
      <circle cx="15.5" cy="10" r="1.25" />
    </>,
  ),
} as const;

// -----------------------------------------------------------------------------
// Bereiche
// -----------------------------------------------------------------------------

function betriebUnterpunkte(roles: readonly RoleKey[]): SubNavEintrag[] {
  // Die angebundenen Punkte stehen vorn, die gekennzeichneten Vorschauen
  // dahinter. Wer hier etwas erledigen will, trifft zuerst auf das, was
  // tatsaechlich wirkt.
  //
  // Die Mitarbeiterverwaltung ist fuer alle Praxisrollen lesbar; Anlegen und
  // Aendern prueft die Seite selbst und - verbindlich - der Server (STAFF-001).
  // Eine zweite, vorgetaeuschte Personalakte daneben gibt es bewusst nicht.
  const eintraege: SubNavEintrag[] = [
    { to: '/praxis/team', label: 'Mitarbeitende', end: false },
    { to: '/praxis/planung', label: 'Arbeitszeiten' },
  ];
  // Textbausteine sind ein Werkzeug der Dokumentation, gepflegt wird es aber
  // wie eine Praxiseinstellung - deshalb hier und nicht bei den Patient:innen
  // (UX-008). Wer nicht dokumentiert, braucht den Punkt nicht.
  if (canWriteTreatmentNote(roles)) {
    eintraege.push({ to: '/praxis/textbausteine', label: 'Textbausteine' });
  }
  if (isOwner(roles)) {
    eintraege.push({ to: '/praxis/sicherheit/audit', label: 'Sicherheit' });
    // Aufbewahrung und Loeschung gehoeren zur Praxisleitung wie das Auditlog:
    // beides sind Nachweise, keine Arbeitsvorraete (LOE-002b, ADR-008).
    eintraege.push({ to: '/praxis/sicherheit/aufbewahrung', label: 'Aufbewahrung' });
  }
  eintraege.push(
    { to: '/betrieb/flotte', label: 'Radflotte', vorschau: true, end: false },
    { to: '/betrieb/urlaub', label: 'Urlaub', vorschau: true },
    { to: '/betrieb/zeitkonto', label: 'Zeitkonto', vorschau: true },
    { to: '/betrieb/erstattungen', label: 'Erstattungen', vorschau: true },
  );
  return eintraege;
}

/** Rollen, die Abrechnungsdaten sehen (PROJECT_PRINCIPLES.md 4.1, 4.3). */
export function canSeeBilling(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role === 'owner' || role === 'office');
}

export function arbeitsbereiche(user: CurrentUser): Arbeitsbereich[] {
  const { roles } = user;
  const bereiche: Arbeitsbereich[] = [
    {
      id: 'heute',
      label: 'Übersicht',
      kurz: 'Übersicht',
      leitfrage: 'Was muss ich als Nächstes tun?',
      to: '/',
      pfade: ['/'],
      icon: symbole.uebersicht,
      unterpunkte: [],
    },
  ];

  if (canManageAppointments(roles)) {
    bereiche.push({
      id: 'termine',
      label: 'Kalender',
      kurz: 'Kalender',
      leitfrage: 'Wer behandelt wen, wann und mit welchen Wegen?',
      to: '/kalender',
      pfade: ['/kalender', '/touren', '/termine'],
      icon: symbole.termine,
      unterpunkte: [
        { to: '/kalender', label: 'Kalender' },
        { to: '/touren', label: 'Touren', vorschau: true },
      ],
    });
  }

  if (canReadPatientDirectory(roles)) {
    bereiche.push({
      id: 'patienten',
      label: 'Patient:innen',
      kurz: 'Patienten',
      leitfrage: 'Was gehört zur Versorgung dieser Person?',
      to: '/patienten',
      pfade: ['/patienten', '/verordner'],
      icon: symbole.patienten,
      unterpunkte: [
        { to: '/patienten', label: 'Patient:innen', end: false },
        { to: '/verordner', label: 'Verordner:innen' },
      ],
    });
  }

  if (isStaff(roles)) {
    bereiche.push({
      id: 'team',
      label: 'Kommunikation',
      kurz: 'Nachrichten',
      leitfrage: 'Mit wem muss ich etwas klären?',
      to: '/team',
      pfade: ['/team'],
      icon: symbole.team,
      // Kein Unterpunkt „Verzeichnis": wer im Team ist und wie man die Person
      // erreicht, steht in der echten Mitarbeiterverwaltung unter
      // Organisatorisches
      // (STAFF-001). Ein zweites, synthetisches Verzeichnis daneben waere eine
      // vorgetaeuschte Funktion.
      unterpunkte: [],
    });

    bereiche.push({
      id: 'betrieb',
      label: 'Organisatorisches',
      kurz: 'Organisation',
      leitfrage: 'Welche Voraussetzungen und Anträge sind zu bearbeiten?',
      to: '/betrieb/flotte',
      pfade: ['/betrieb', '/praxis'],
      icon: symbole.betrieb,
      unterpunkte: betriebUnterpunkte(roles),
    });
  }

  if (canSeeBilling(roles)) {
    bereiche.push({
      id: 'abrechnung',
      label: 'Abrechnung',
      kurz: 'Abrechnung',
      leitfrage: 'Welche Leistungen sind abzurechnen oder zu bezahlen?',
      to: '/abrechnung',
      pfade: ['/abrechnung'],
      icon: symbole.abrechnung,
      unterpunkte: [
        { to: '/abrechnung', label: 'Rechnungen' },
        { to: '/abrechnung/leistungen', label: 'Leistungen' },
        { to: '/abrechnung/katalog', label: 'Katalog' },
        { to: '/abrechnung/stammdaten', label: 'Praxisstammdaten' },
        { to: '/abrechnung/zahlungen', label: 'Zahlungen' },
        { to: '/abrechnung/auswertung', label: 'Auswertung' },
      ],
    });
  }

  return bereiche;
}

export const mehrSymbol = symbole.mehr;

/**
 * Der Bereich, zu dem ein Pfad gehört.
 *
 * Längster passender Pfadanfang gewinnt, damit `/praxis/planung` unter
 * Organisatorisches
 * landet und nicht in einem allgemeineren Bereich.
 */
export function aktiverBereich(
  bereiche: Arbeitsbereich[],
  pathname: string,
): Arbeitsbereich | undefined {
  let treffer: Arbeitsbereich | undefined;
  let laenge = -1;
  for (const bereich of bereiche) {
    for (const pfad of bereich.pfade) {
      const passt =
        pfad === '/' ? pathname === '/' : pathname === pfad || pathname.startsWith(`${pfad}/`);
      if (passt && pfad.length > laenge) {
        treffer = bereich;
        laenge = pfad.length;
      }
    }
  }
  return treffer;
}

/**
 * Aufteilung für die Tableiste auf schmalen Geräten.
 *
 * Mehr als fünf Ziele sind mit dem Daumen nicht mehr sicher zu treffen. Passen
 * die Bereiche nicht, rücken die restlichen hinter „Mehr".
 */
export function tableiste(bereiche: Arbeitsbereich[]): {
  sichtbar: Arbeitsbereich[];
  weitere: Arbeitsbereich[];
} {
  if (bereiche.length <= 5) return { sichtbar: bereiche, weitere: [] };
  return { sichtbar: bereiche.slice(0, 4), weitere: bereiche.slice(4) };
}
