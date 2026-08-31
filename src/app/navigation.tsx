import type { ReactNode } from 'react';
import type { SubNavEintrag } from '@/components/ui/SubNav';
import {
  canManageAppointments,
  canReadPatientDirectory,
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
 *   Mein Tag         Was muss ich als Nächstes tun?
 *   Touren & Termine Wer behandelt wen, wann und mit welchen Wegen?
 *   Patient:innen    Was gehört zur Versorgung dieser Person?
 *   Team             Mit wem muss ich etwas klären?
 *   Betrieb          Welche Voraussetzungen und Anträge sind zu bearbeiten?
 *   Abrechnung       Welche Leistungen sind abzurechnen oder zu bezahlen?
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
  /** Kurzform für die Tableiste auf schmalen Geräten. */
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
  tag: symbol(
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </>,
  ),
  termine: symbol(
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>,
  ),
  patienten: symbol(
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" />
    </>,
  ),
  team: symbol(
    <>
      <path d="M16.5 12.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 3V5a1.5 1.5 0 0 1 1.5-1.5h9.5A1.5 1.5 0 0 1 16.5 5Z" />
    </>,
  ),
  betrieb: symbol(
    <>
      <circle cx="5.5" cy="13.5" r="3" />
      <circle cx="14.5" cy="13.5" r="3" />
      <path d="M5.5 13.5 9 6h3l2.5 7.5M8 6h3.5" />
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
  const eintraege: SubNavEintrag[] = [
    { to: '/betrieb/flotte', label: 'Radflotte', vorschau: true, end: false },
  ];
  // Geschuetzte Personalangaben sind eine andere Sicht als das Teamverzeichnis
  // (PROJECT_PRINCIPLES.md 4.1/4.5) - deshalb nur fuer Leitungsrollen im Menue.
  if (isOwner(roles) || roles.includes('team_lead')) {
    eintraege.push({ to: '/betrieb/personal', label: 'Personal', vorschau: true, end: false });
  }
  eintraege.push(
    { to: '/betrieb/urlaub', label: 'Urlaub', vorschau: true },
    { to: '/betrieb/zeitkonto', label: 'Zeitkonto', vorschau: true },
    { to: '/betrieb/erstattungen', label: 'Erstattungen', vorschau: true },
    { to: '/praxis/planung', label: 'Arbeitszeiten' },
  );
  if (isOwner(roles)) {
    eintraege.push({ to: '/praxis/sicherheit/audit', label: 'Sicherheit' });
  }
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
      label: 'Mein Tag',
      kurz: 'Heute',
      leitfrage: 'Was muss ich als Nächstes tun?',
      to: '/',
      pfade: ['/'],
      icon: symbole.tag,
      unterpunkte: [],
    },
  ];

  if (canManageAppointments(roles)) {
    bereiche.push({
      id: 'termine',
      label: 'Touren & Termine',
      kurz: 'Termine',
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
      pfade: ['/patienten'],
      icon: symbole.patienten,
      unterpunkte: [],
    });
  }

  if (isStaff(roles)) {
    bereiche.push({
      id: 'team',
      label: 'Team',
      kurz: 'Team',
      leitfrage: 'Mit wem muss ich etwas klären?',
      to: '/team',
      pfade: ['/team'],
      icon: symbole.team,
      unterpunkte: [
        { to: '/team', label: 'Kanäle', vorschau: true },
        { to: '/team/verzeichnis', label: 'Verzeichnis', vorschau: true },
      ],
    });

    bereiche.push({
      id: 'betrieb',
      label: 'Betrieb',
      kurz: 'Betrieb',
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
        { to: '/abrechnung', label: 'Rechnungen', vorschau: true },
        { to: '/abrechnung/leistungen', label: 'Leistungen', vorschau: true },
        { to: '/abrechnung/katalog', label: 'Katalog', vorschau: true },
        { to: '/abrechnung/zahlungen', label: 'Zahlungen', vorschau: true },
      ],
    });
  }

  return bereiche;
}

export const mehrSymbol = symbole.mehr;

/**
 * Der Bereich, zu dem ein Pfad gehört.
 *
 * Längster passender Pfadanfang gewinnt, damit `/praxis/planung` im Betrieb
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
