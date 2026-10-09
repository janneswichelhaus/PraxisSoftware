import type { ReactNode } from 'react';
import type { SubNavEintrag } from '@/components/ui/SubNav';
import { BEGRIFFE, BEREICHE } from '@/lib/begriffe';
import {
  canManageAppointments,
  canReadExerciseLibrary,
  canReadPatientDirectory,
  canReadTrainingClients,
  canSeeCalendar,
  canWriteTreatmentNote,
  isOwner,
  isStaff,
  isTherapyStaff,
  type CurrentUser,
  type RoleKey,
} from '@/features/session/types';

/**
 * Die Arbeitsbereiche der Plattform.
 *
 * Sechs Bereiche, jeder mit einer eigenen Leitfrage. Sie sind die einzige
 * globale Navigationsebene; alles Weitere sitzt als lokales Untermenü beim
 * Arbeitsgegenstand. Bezeichnung, Kurzform und Leitfrage stehen in
 * `src/lib/begriffe.ts` — dort und nur dort werden sie geändert (UX-002f).
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
  unterpunkte: Unterpunkt[];
  /**
   * Der ganze Bereich ist Vorschau - bedienbar, aber ohne Hintergrundfunktion
   * (`docs/development/ARBEITSBEREICHE.md`). Die Tableiste am Telefon stellt
   * solche Bereiche hinter „Mehr" (BEF-049, Option 2, RAH-004); Seitenleiste
   * und `/bereiche` zeigen sie weiter an ihrem Platz.
   */
  vorschau?: boolean;
}

/**
 * Ein Punkt des Untermenüs, dazu die Wörter, unter denen die Kopfsuche ihn
 * findet (ORG-07).
 *
 * Die Seiten hinter „Arbeitszeiten" und „Auditlog" tragen mehr als ihren
 * Namen - Praxisraster, Frist, Zugriffe. Wer danach sucht, fand bis UXR-002
 * nichts. Die Stichworte stehen hier und nicht im Katalog der Suche, damit
 * Menüpunkt und Suchtreffer aus einer Quelle kommen; die SubNav liest sie
 * nicht.
 */
export interface Unterpunkt extends SubNavEintrag {
  stichworte?: readonly string[];
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
  // Drei Balken auf einer Grundlinie - Zahlen im Vergleich (STA-EPIC-001).
  statistik: symbol(
    <>
      <path d="M3 16.5h14" />
      <rect x="4.5" y="10" width="2.8" height="6.5" rx="0.8" />
      <rect x="8.6" y="6" width="2.8" height="10.5" rx="0.8" />
      <rect x="12.7" y="3.5" width="2.8" height="13" rx="0.8" />
    </>,
  ),
  // Eine Hantel - Personal Training (TRN-EPIC-001).
  training: symbol(
    <>
      <path d="M6.5 10h7" />
      <rect x="3.5" y="6.5" width="3" height="7" rx="0.8" />
      <rect x="13.5" y="6.5" width="3" height="7" rx="0.8" />
      <path d="M2 8.5v3M18 8.5v3" />
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

function betriebUnterpunkte(roles: readonly RoleKey[]): Unterpunkt[] {
  // Die angebundenen Punkte stehen vorn, die gekennzeichneten Vorschauen
  // dahinter. Wer hier etwas erledigen will, trifft zuerst auf das, was
  // tatsaechlich wirkt.
  //
  // Die Mitarbeiterverwaltung ist fuer alle Praxisrollen lesbar; Anlegen und
  // Aendern prueft die Seite selbst und - verbindlich - der Server (STAFF-001).
  // Eine zweite, vorgetaeuschte Personalakte daneben gibt es bewusst nicht.
  const eintraege: Unterpunkt[] = [
    { to: '/praxis/team', label: BEGRIFFE.mitarbeitende, end: false },
  ];
  // Arbeitszeiten gehoeren zur Terminverwaltung; ihre Route steht unter
  // derselben Bedingung. trainer landete sonst ohne Aufruf wieder auf `/`
  // (BEF-034).
  if (canManageAppointments(roles)) {
    eintraege.push({
      to: '/praxis/planung',
      label: BEGRIFFE.arbeitszeiten,
      // Praxisraster, Frist und Startort stehen auf derselben Seite, aber nur
      // für owner (ORG-07). Anderen Rollen führte die Suche sonst zu
      // Einstellungen, die sie dort nicht finden.
      stichworte: isOwner(roles)
        ? ['Planung', 'Praxisraster', 'Dokumentationsfrist', 'Startort']
        : ['Planung'],
    });
    // Gebietstage (PRX-002): eine Praxisregel für Hausbesuche, gepflegt wie
    // die Arbeitszeiten.
    eintraege.push({
      to: '/praxis/gebiete',
      label: 'Gebietstage',
      stichworte: ['Gebiet', 'Postleitzahl', 'Stadtteil', 'Tour'],
    });
  }
  // Textbausteine sind ein Werkzeug der Dokumentation, gepflegt wird es aber
  // wie eine Praxiseinstellung - deshalb hier und nicht bei den Patient:innen
  // (UX-008). Wer nicht dokumentiert, braucht den Punkt nicht.
  if (canWriteTreatmentNote(roles)) {
    eintraege.push({ to: '/praxis/textbausteine', label: 'Textbausteine' });
    // Die Instrumentenbibliothek zum Nachlesen (FRB-010): Produktinhalt ohne
    // Personenbezug, gebraucht von denen, die messen und dokumentieren.
    eintraege.push({ to: '/praxis/instrumente', label: 'Instrumente' });
  }
  // Die Übungsbibliothek (UEB-EPIC-001): Fachwissen der Praxis ohne
  // Personenbezug, gebraucht von denen, die Übungen anleiten - nicht vom Büro
  // (ANN-293). Eine Trainingsbetreuung ohne Behandlungsrolle findet sie im
  // Training.
  if (canReadExerciseLibrary(roles)) {
    eintraege.push({
      to: '/uebungen',
      label: BEGRIFFE.uebungen,
      end: false,
      stichworte: ['Übungsbibliothek', BEGRIFFE.varianten, 'Heimübung', 'Übung'],
    });
  }
  if (isOwner(roles)) {
    // Protokoll und Aufbewahrung sind **ein** Punkt (Handoff Rahmen vom
    // 2026-10-05, RAH-005): Beides sind Nachweise der Praxisleitung, keine
    // Arbeitsvorräte (LOE-002b, ADR-008), und zwei Punkte dafür machten das
    // Untermenü am Telefon um einen Bildschirm länger. Der Punkt öffnet das
    // Protokoll; die Aufbewahrung ist dort der zweite Reiter
    // (`SicherheitReiter`), die Routen bleiben. `pfade`: aktiv auf beiden
    // Seiten. Die alten Wörter - Audit, Protokoll, Löschung - findet die
    // Suche weiter (ORG-07).
    eintraege.push({
      to: '/praxis/sicherheit/audit',
      label: 'Sicherheit und Aufbewahrung',
      pfade: ['/praxis/sicherheit'],
      stichworte: ['Audit', 'Zugriffe', 'Sicherheit', 'Protokoll', 'Löschung', 'Löschsperre'],
    });
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
      ...BEREICHE.heute,
      to: '/',
      pfade: ['/', '/offen'],
      icon: symbole.uebersicht,
      // Die Büroliste (PRX-EPIC-003) gehört zur Frage der Übersicht - was ist
      // zu tun -, nicht zu einem Fachbereich. Bewusst ohne Untermenü: Die
      // Leiste kostete am Handy den ersten Weg auf dem ersten Bildschirm
      // (UX-EPIC-003). Der Weg führt über die Zeile „Offene Punkte" in der
      // Übersicht, den Link an ihrem Ende und die Funktionssuche.
      unterpunkte: [],
    },
  ];

  // Seit TRN-006 auch für die Trainingsbetreuung: Sie sieht im Kalender ihre
  // Trainingstermine, sonst nichts (ADR-022 Punkt 11).
  if (canSeeCalendar(roles)) {
    bereiche.push({
      id: 'termine',
      ...BEREICHE.termine,
      to: '/kalender',
      pfade: ['/kalender', '/touren', '/termine', '/warteliste'],
      icon: symbole.termine,
      // Kein Untermenü (BEF-044, ANN-113): Dass man im Kalender ist, zeigen
      // Seitenleiste und Tableiste; die Tour ist eine Ansicht des Kalenders
      // neben Tag und Woche. `/touren` gehört weiter zu diesem Bereich.
      unterpunkte: [],
    });
  }

  if (canReadPatientDirectory(roles)) {
    bereiche.push({
      id: 'patienten',
      ...BEREICHE.patienten,
      to: '/patienten',
      pfade: ['/patienten', '/verordner'],
      icon: symbole.patienten,
      unterpunkte: [
        { to: '/patienten', label: BEGRIFFE.patientInnen, end: false },
        // `end: false` wie bei den Patient:innen: Auf dem Formular einer
        // Verordner:in war sonst kein Punkt markiert (VER-B01, NAV-15).
        { to: '/verordner', label: BEGRIFFE.verordnerInnen, end: false },
      ],
    });
  }

  // Training (TRN-EPIC-001): owner, Trainingsbetreuung und Büro. therapist
  // und team_lead nicht - der offene Zugriff auf alle Akten gilt innerhalb der
  // Behandlung (ADR-021 Punkt 6). Der Server liefert ihnen ohnehin nichts.
  if (canReadTrainingClients(roles)) {
    // Die Übungsbibliothek gehört zu Organisatorisches; wer dort keinen Zugang
    // hat - die Trainingsbetreuung ohne Behandlungsrolle -, findet sie hier
    // (UEB-EPIC-001). Ein Pfad gehört immer zu genau einem Bereich.
    const uebungenHier = canReadExerciseLibrary(roles) && !isTherapyStaff(roles);
    bereiche.push({
      id: 'training',
      ...BEREICHE.training,
      to: '/training',
      pfade: uebungenHier ? ['/training', '/uebungen'] : ['/training'],
      icon: symbole.training,
      unterpunkte: uebungenHier
        ? [
            { to: '/training', label: BEGRIFFE.trainingskundInnen, end: false },
            {
              to: '/uebungen',
              label: BEGRIFFE.uebungen,
              end: false,
              stichworte: ['Übungsbibliothek', BEGRIFFE.varianten, 'Übung'],
            },
          ]
        : [],
    });
  }

  // Kommunikation und Organisatorisches zeigen Daten, die der Server nur den
  // Rollen der Behandlungsseite gibt (`app.is_staff()`). Ein reines
  // Trainingskonto sieht Übersicht, Kalender und Training (TRN-003, TRN-006).
  if (isTherapyStaff(roles)) {
    bereiche.push({
      id: 'team',
      ...BEREICHE.team,
      // KOM-002 (ANN-314): Der Bereich oeffnet auf den Rueckfragen, dem
      // ersten Punkt, der wirklich wirkt. Seitdem ist er nicht mehr ganz
      // Vorschau und steht am Telefon wieder in der Leiste; der Teamchat
      // speichert weiter nichts (ANN-112) und bleibt als Vorschau gekennzeichnet.
      to: '/rueckfragen',
      pfade: ['/rueckfragen', '/team'],
      icon: symbole.team,
      // Kein Unterpunkt „Verzeichnis": wer im Team ist und wie man die Person
      // erreicht, steht in der echten Mitarbeiterverwaltung unter
      // Organisatorisches
      // (STAFF-001). Ein zweites, synthetisches Verzeichnis daneben waere eine
      // vorgetaeuschte Funktion.
      unterpunkte: [
        {
          to: '/rueckfragen',
          label: 'Rückfragen',
          end: false,
          stichworte: ['Nachrichten', 'Fragen von Patient:innen', 'Plattform'],
        },
        { to: '/team', label: 'Teamchat', vorschau: true },
      ],
    });

    bereiche.push({
      id: 'betrieb',
      ...BEREICHE.betrieb,
      // Der Bereich oeffnet auf dem ersten Punkt, der wirklich wirkt, nicht
      // auf einer Vorschau (ANN-112, Bedienprinzipien).
      to: '/praxis/team',
      pfade: canReadExerciseLibrary(roles)
        ? ['/betrieb', '/praxis', '/uebungen']
        : ['/betrieb', '/praxis'],
      icon: symbole.betrieb,
      unterpunkte: betriebUnterpunkte(roles),
    });
  }

  if (canSeeBilling(roles)) {
    bereiche.push({
      id: 'abrechnung',
      ...BEREICHE.abrechnung,
      to: '/abrechnung',
      pfade: ['/abrechnung'],
      icon: symbole.abrechnung,
      unterpunkte: [
        // Die Rechnung selbst, ihr Blatt, das Storno und die Erinnerung liegen
        // nicht unter `/abrechnung/…` des Eintrags, sondern daneben. Mit
        // `end: false` leuchtete „Rechnungen" im ganzen Bereich; die Pfade
        // nennen genau die Seiten, die dazugehören (NAV-15, ABR-29).
        {
          to: '/abrechnung',
          label: 'Rechnungen',
          pfade: ['/abrechnung/rechnungen', '/abrechnung/erinnerungen'],
        },
        { to: '/abrechnung/leistungen', label: 'Leistungen' },
        // Menüpunkt = Seitentitel (ABR-26).
        { to: '/abrechnung/katalog', label: 'Leistungskatalog' },
        { to: '/abrechnung/stammdaten', label: 'Praxisstammdaten' },
        { to: '/abrechnung/zahlungen', label: 'Zahlungen' },
        { to: '/abrechnung/auswertung', label: 'Auswertung' },
      ],
    });
  }

  // Statistiken (STA-EPIC-001): owner mit allen Zahlen; eine Person mit
  // Umsatzbeteiligung mit ihrem eigenen Umsatz (STA-006, ANN-156). Der Server
  // liefert jeder anderen Rolle keine Zeile - das hier ist nur Darstellung.
  if (isOwner(roles) || (isStaff(roles) && user.revenueShare)) {
    bereiche.push({
      id: 'statistik',
      ...BEREICHE.statistik,
      to: '/statistiken',
      pfade: ['/statistiken'],
      icon: symbole.statistik,
      unterpunkte: [],
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
/**
 * Seiten, die die ganze Fläche neben der Seitenleiste nutzen (BEF-043, ANN-114).
 *
 * Die Kappung auf 1200 px (DS-001) ist für Listen und Fließtext gedacht, damit
 * eine Zeile nicht auseinanderläuft. Ein Raster hat diese Sorge nicht: Jeder
 * Pixel mehr ist eine breitere Spalte. Hier stehen deshalb nur Flächen-Ansichten,
 * keine Listen.
 */
const RANDLOSE_SEITEN = ['/kalender'] as const;

export function istRandlos(pathname: string): boolean {
  return (RANDLOSE_SEITEN as readonly string[]).includes(pathname);
}

/**
 * Seiten ohne Unterleiste des Bereichs (Akte entschlacken, 2026-10-03).
 *
 * In einer Akte steht „Patient:innen | Verordner:innen" über der Tableiste der
 * Akte - zwei Navigationsreihen übereinander, von denen die obere an dieser
 * Stelle nichts zu wählen hat. Ausgenommen ist das Anlageformular `/patienten/neu`.
 */
const AKTE_PFAD = /^\/patienten\/(?!neu(?:\/|$))[^/]+(?:\/|$)/;

export function zeigtUnterleiste(pathname: string): boolean {
  return !AKTE_PFAD.test(pathname);
}

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
 *
 * **Reife vor Reihenfolge** (BEF-049, Option 2, Handoff Rahmen vom
 * 2026-10-05, ANN-244): Ein Bereich, der ganz Vorschau ist (`vorschau`; bis KOM-002
 * die Kommunikation, ANN-314), bekommt keinen der vier Plätze - bis dahin stand bei
 * therapist und team_lead „Nachrichten" in der Leiste, und der Weg zu
 * Mitarbeitenden und Arbeitszeiten lag hinter „Mehr". Sichtbar sind die ersten
 * vier übrigen Bereiche in Seitenleisten-Reihenfolge; hinter „Mehr" stehen
 * alle anderen, die Vorschau eingeschlossen, in derselben Reihenfolge. Nur
 * wenn alles ohne „Mehr" passt und nichts Vorschau ist, bleibt die Leiste,
 * wie sie ist (ein Patienten- oder Trainingskonto).
 */
export function tableiste(bereiche: Arbeitsbereich[]): {
  sichtbar: Arbeitsbereich[];
  weitere: Arbeitsbereich[];
} {
  const reife = bereiche.filter((bereich) => !bereich.vorschau);
  if (reife.length === bereiche.length && bereiche.length <= 5) {
    return { sichtbar: bereiche, weitere: [] };
  }
  const sichtbar = reife.slice(0, 4);
  return { sichtbar, weitere: bereiche.filter((bereich) => !sichtbar.includes(bereich)) };
}
