// -----------------------------------------------------------------------------
// Die Routen der Bildstrecke (scripts/bildstrecke.mjs): jede Seite hinter der
// Anmeldung mit einer konkreten Adresse aus den synthetischen Daten.
//
// `muster` ist die Route, wie sie in src/routes/AuthenticatedRoutes.tsx
// beziehungsweise src/features/platform/PlattformApp.tsx steht (bei
// verschachtelten Routen mit dem Pfad des Rahmens davor). `pfad` ist die
// Adresse, die aufgenommen wird. scripts/bildstrecke/routen.test.mjs haelt
// fest, dass jede Route dort hier vorkommt oder in AUSGENOMMEN mit Grund steht
// - eine neue Seite ohne Bild faellt so im Unit-Test auf.
//
// Die Kennungen stammen aus supabase/seed.sql (fest vergeben) und gelten nach
// `./scripts/cloud-stack.sh reset --reich` wie nach `supabase db reset`. Die
// Termine der Praxiswoche (supabase/testumgebung/praxiswoche.sql) haben vom
// Datum abhaengige Kennungen und kommen deshalb nicht vor. Wo der Seed keine
// Zeile hat (Behandlungsnotiz, Bericht, Rechnung, Wartelisteneintrag), steht
// eine Kennung ohne Zeile: Das Bild zeigt dann den Zustand „nicht gefunden",
// und `ohneDaten` sagt, warum das erwartet ist.
//
// Platzhalter im Pfad: `{heute}` wird zur Laufzeit das heutige Datum in
// Europe/Berlin (JJJJ-MM-TT).
// -----------------------------------------------------------------------------

/** Feste Kennungen aus supabase/seed.sql - rein synthetisch. */
export const IDS = Object.freeze({
  /** Max Mustermann: die meisten Termine, Begleitung Paula auf der Plattform. */
  max: '66666666-6666-4666-8666-000000000001',
  /** Erika Beispiel: drei Verordnungen, ein Übungsplan, Plattformkonto. */
  erika: '66666666-6666-4666-8666-000000000002',
  /** Erikas Folgeverordnung, noch ohne Termin - Serie und Bearbeiten. */
  grundlageErika: '88888888-8888-4888-8888-000000000004',
  verordner: '77777777-7777-4777-8777-000000000001',
  /** Anna Beispiel (therapist) - Mitarbeiterin und Person im Kalender. */
  anna: '55555555-5555-4555-8555-000000000002',
  /** Hausbesuch heute 9:00 bei Max, Anna, bestätigt. */
  terminMax: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  /** Hausbesuch heute 10:30 bei Erika, Anna, abgeschlossen. */
  terminErika: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  /** Teambesprechung heute (Ereignis des Praxisbetriebs). */
  ereignis: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  /** Trainingstermin heute bei Tom Trainingsbetreuung. */
  trainingstermin: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007',
  /** Trainingsbeziehung von Tina (Plattformkonto tina.plattform). */
  trainingTina: 'eeeeeeee-eeee-4eee-8eee-000000000001',
  planErika: 'aeaeaeae-aeae-4eae-8eae-000000000001',
  planTraining: 'aeaeaeae-aeae-4eae-8eae-000000000002',
  /**
   * Mini-Kniebeuge mit Halt (KN-07) aus dem mitgelieferten Katalog - mit Bild.
   * Feste Kennung des Seeds: md5('<Praxis>:uebung:KN-07') (ANN-380).
   */
  uebung: '5a72622b-f921-f78e-d1a1-ce4f3d0f9269',
  /** Rückfrage aus der Behandlung (Erika) und aus dem Training (Tina). */
  rueckfrage: 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001',
  rueckfrageTraining: 'd1d1d1d1-d1d1-4d1d-8d1d-000000000004',
  /** Lastenrad 3: nach einer Panne gesperrt, drei offene Stellen (FLT-EPIC-001). */
  rad: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000013',
  /** Lastenrad 1: Annas Stammrad, Schlüssel bei ihr. */
  radAnna: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000011',
  /** Panne an Lastenrad 3 (gestern, Tim) - eine Meldung für den Arbeitgeber. */
  panne: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000031',
  /**
   * Eine wohlgeformte Kennung ohne Zeile - für Seiten, zu denen der Seed
   * nichts hat. Bewusst kein Null-UUID: Die Seiten prüfen das Format.
   */
  ohne: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
  /** TEAM-001: Kanal Allgemein mit Thread (reicher Seed, praxiswoche.sql). */
  kanalAllgemein: '7e7e7e7e-7e7e-4e7e-8e7e-000000000001',
  /** Die Bitte um Belege als Ausgangsnachricht mit einer Antwort. */
  threadBelege: '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
  /** ANN-613: die Panne an Rad 3 im Gespräch der Radflotte, mit einer Antwort. */
  threadPanne: '7e7e7e7e-7e7e-4e7e-8e7e-000000000201',
  /** Direktnachricht Jannes – Anna. */
  direktAnna: '7e7e7e7e-7e7e-4e7e-8e7e-000000000004',
});

/** Reihenfolge der Bereiche im Kontaktbogen - grob nach den Design-Batches. */
export const BEREICHE = Object.freeze([
  'Übersicht und Rahmen',
  'Akte',
  'Termine und Kalender',
  'Tour und Planung',
  'Doku und Befund',
  'Übungen und Training',
  'Eingang',
  'Abrechnung',
  'Organisation',
  'Plattform',
  'Anmeldung',
]);

const { max, erika, ohne } = IDS;
const akte = (id) => `/patienten/${id}`;

/**
 * Eine Route der Bildstrecke.
 * - `konten`: Schlüssel aus scripts/testkonten.mjs (KONTEN); `ohne` = nicht angemeldet.
 * - `ziel`: erwarteter Pfad nach einer Weiterleitung der Anwendung (ohne Suchteil).
 * - `ohneDaten`: Der Seed hat keine Zeile dazu; ein Fehlerzustand ist erwartet.
 * - `einsicht`: die Einsicht der Praxis in die Plattform einer Person (E-001,
 *   DSN-001 D7) - ein Plattformmuster, aufgenommen mit dem Praxiskonto der
 *   Inhaber:in statt mit einem Plattformkonto.
 */
export const ROUTEN = Object.freeze([
  // --- Übersicht und Rahmen ------------------------------------------------
  {
    muster: '/',
    pfad: '/',
    bereich: 'Übersicht und Rahmen',
    etikett: 'Übersicht (Mein Tag)',
    konten: ['owner', 'therapist', 'office', 'trainer'],
  },
  {
    muster: '/bereiche',
    pfad: '/bereiche',
    bereich: 'Übersicht und Rahmen',
    etikett: 'Bereiche (Menü)',
    konten: ['owner', 'therapist', 'office', 'trainer'],
  },
  {
    muster: '/mein-konto',
    pfad: '/mein-konto',
    bereich: 'Übersicht und Rahmen',
    etikett: 'Mein Konto',
    konten: ['owner', 'therapist'],
  },

  // --- Akte ----------------------------------------------------------------
  {
    muster: '/patienten',
    pfad: '/patienten',
    bereich: 'Akte',
    etikett: 'Patientenliste',
    konten: ['owner', 'therapist', 'office'],
  },
  {
    muster: '/patienten/neu',
    pfad: '/patienten/neu',
    bereich: 'Akte',
    etikett: 'Patient:in anlegen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId',
    pfad: akte(max),
    bereich: 'Akte',
    etikett: 'Akte – Einstieg (leitet zum ersten Bereich)',
    konten: ['owner'],
    ziel: `${akte(max)}/termine`,
  },
  {
    muster: '/patienten/:patientId/termine',
    pfad: `${akte(max)}/termine`,
    bereich: 'Akte',
    etikett: 'Akte – Termine',
    konten: ['owner', 'therapist', 'office'],
  },
  {
    muster: '/patienten/:patientId/verordnungen',
    pfad: `${akte(erika)}/verordnungen`,
    bereich: 'Akte',
    etikett: 'Akte – Verordnungen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/doku',
    pfad: `${akte(erika)}/doku`,
    bereich: 'Akte',
    etikett: 'Akte – Doku',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/doku/befund',
    pfad: `${akte(erika)}/doku/befund`,
    bereich: 'Akte',
    etikett: 'Akte – Befund',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/stammdaten',
    pfad: `${akte(erika)}/stammdaten`,
    bereich: 'Akte',
    etikett: 'Akte – Stammdaten',
    konten: ['owner', 'office'],
  },
  // ERN-001: die Ernährungsberatung, nur owner (ADR-027 Punkt 4).
  {
    muster: '/patienten/:patientId/ernaehrung',
    pfad: `${akte(erika)}/ernaehrung`,
    bereich: 'Akte',
    etikett: 'Akte – Ernährung',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/ernaehrung/neu',
    pfad: `${akte(max)}/ernaehrung/neu`,
    bereich: 'Akte',
    etikett: 'Ernährungsberatung anlegen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/ernaehrung/bearbeiten',
    pfad: `${akte(erika)}/ernaehrung/bearbeiten`,
    bereich: 'Akte',
    etikett: 'Ernährungsprofil ändern',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/ernaehrung/zielwerte',
    pfad: `${akte(erika)}/ernaehrung/zielwerte`,
    bereich: 'Akte',
    etikett: 'Zielwerte anpassen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/verlauf',
    pfad: `${akte(erika)}/verlauf`,
    bereich: 'Akte',
    etikett: 'Alte Adresse Verlauf (leitet weiter)',
    konten: ['owner'],
    ziel: `${akte(erika)}/doku`,
  },
  {
    muster: '/patienten/:patientId/befund',
    pfad: `${akte(erika)}/befund`,
    bereich: 'Akte',
    etikett: 'Alte Adresse Befund (leitet weiter)',
    konten: ['owner'],
    ziel: `${akte(erika)}/doku/befund`,
  },
  {
    muster: '/patienten/:patientId/datenschutz',
    pfad: `${akte(erika)}/datenschutz`,
    bereich: 'Akte',
    etikett: 'Alte Adresse Datenschutz (leitet weiter)',
    konten: ['owner'],
    ziel: `${akte(erika)}/stammdaten`,
  },
  {
    muster: '/patienten/:patientId/dateien',
    pfad: `${akte(erika)}/dateien`,
    bereich: 'Akte',
    etikett: 'Alte Adresse Dateien (leitet weiter)',
    konten: ['owner'],
    ziel: `${akte(erika)}/stammdaten`,
  },
  {
    muster: '/patienten/:patientId/bearbeiten',
    pfad: `${akte(erika)}/bearbeiten`,
    bereich: 'Akte',
    etikett: 'Stammdaten bearbeiten',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/aufnahmeblaetter',
    pfad: `${akte(erika)}/aufnahmeblaetter`,
    bereich: 'Akte',
    etikett: 'Aufnahmeblätter (Druck)',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/auskunft',
    pfad: `${akte(erika)}/auskunft`,
    bereich: 'Akte',
    etikett: 'Auskunft und Löschverlangen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/dublette',
    pfad: `${akte(erika)}/dublette`,
    bereich: 'Akte',
    etikett: 'Dublette übernehmen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/erstaufnahme',
    pfad: `${akte(max)}/erstaufnahme`,
    bereich: 'Akte',
    etikett: 'Erstaufnahme, geführt (K10)',
    konten: ['therapist', 'office'],
  },
  {
    muster: '/verordner',
    pfad: '/verordner',
    bereich: 'Akte',
    etikett: 'Verordnerkartei',
    konten: ['owner'],
  },
  {
    muster: '/verordner/neu',
    pfad: '/verordner/neu',
    bereich: 'Akte',
    etikett: 'Verordner:in anlegen',
    konten: ['owner'],
  },
  {
    muster: '/verordner/:prescriberId/bearbeiten',
    pfad: `/verordner/${IDS.verordner}/bearbeiten`,
    bereich: 'Akte',
    etikett: 'Verordner:in bearbeiten',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/verordnungen/neu',
    pfad: `${akte(erika)}/verordnungen/neu`,
    bereich: 'Akte',
    etikett: 'Verordnung anlegen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/verordnungen/:grundlageId/bearbeiten',
    pfad: `${akte(erika)}/verordnungen/${IDS.grundlageErika}/bearbeiten`,
    bereich: 'Akte',
    etikett: 'Verordnung bearbeiten',
    konten: ['owner'],
  },

  // --- Termine und Kalender ------------------------------------------------
  {
    muster: '/kalender',
    pfad: '/kalender',
    bereich: 'Termine und Kalender',
    etikett: 'Kalender',
    konten: ['owner', 'therapist', 'office', 'trainer'],
  },
  {
    muster: '/kalender/tag-umplanen',
    pfad: `/kalender/tag-umplanen?person=${IDS.anna}&datum={heute}`,
    bereich: 'Termine und Kalender',
    etikett: 'Tag umplanen (Anna, heute)',
    konten: ['owner', 'office'],
  },
  {
    muster: '/warteliste',
    pfad: '/warteliste',
    bereich: 'Termine und Kalender',
    etikett: 'Warteliste',
    konten: ['owner', 'office'],
  },
  {
    muster: '/warteliste/neu',
    pfad: '/warteliste/neu',
    bereich: 'Termine und Kalender',
    etikett: 'Wartelisteneintrag anlegen',
    konten: ['owner'],
  },
  {
    muster: '/warteliste/:entryId/bearbeiten',
    pfad: `/warteliste/${ohne}/bearbeiten`,
    bereich: 'Termine und Kalender',
    etikett: 'Wartelisteneintrag bearbeiten',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keinen Wartelisteneintrag.',
  },
  {
    muster: '/patienten/:patientId/plaetze',
    pfad: `${akte(max)}/plaetze`,
    bereich: 'Termine und Kalender',
    etikett: 'Terminsuche (freie Plätze)',
    konten: ['owner'],
  },
  {
    muster: '/termine/neu',
    pfad: '/termine/neu',
    bereich: 'Termine und Kalender',
    etikett: 'Termin anlegen (Person wählen)',
    konten: ['owner', 'office'],
  },
  {
    muster: '/termine/dauertermin',
    pfad: '/termine/dauertermin',
    bereich: 'Termine und Kalender',
    etikett: 'Dauertermin anlegen',
    konten: ['owner'],
  },
  {
    muster: '/termine/ereignis',
    pfad: '/termine/ereignis',
    bereich: 'Termine und Kalender',
    etikett: 'Ereignis anlegen',
    konten: ['owner'],
  },
  {
    muster: '/termine/dauerfehlzeit',
    pfad: '/termine/dauerfehlzeit',
    bereich: 'Termine und Kalender',
    etikett: 'Dauerfehlzeit anlegen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/termine/neu',
    pfad: `${akte(max)}/termine/neu`,
    bereich: 'Termine und Kalender',
    etikett: 'Termin anlegen aus der Akte',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/termine/:appointmentId',
    pfad: `/termine/${IDS.terminMax}`,
    bereich: 'Termine und Kalender',
    etikett: 'Alte Terminadresse (leitet in den Kalender)',
    konten: ['owner'],
    ziel: '/kalender',
  },
  {
    muster: '/termine/:appointmentId/ereignis-bearbeiten',
    pfad: `/termine/${IDS.ereignis}/ereignis-bearbeiten`,
    bereich: 'Termine und Kalender',
    etikett: 'Ereignis bearbeiten',
    konten: ['owner'],
  },
  {
    muster: '/termine/:appointmentId/bearbeiten',
    pfad: `/termine/${IDS.terminMax}/bearbeiten`,
    bereich: 'Termine und Kalender',
    etikett: 'Termin bearbeiten',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/verordnungen/:grundlageId/serie',
    pfad: `${akte(erika)}/verordnungen/${IDS.grundlageErika}/serie`,
    bereich: 'Termine und Kalender',
    etikett: 'Terminserie aus Verordnung',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/termine-uebertragen',
    pfad: `${akte(erika)}/termine-uebertragen`,
    bereich: 'Termine und Kalender',
    etikett: 'Termine übertragen',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/terminzettel',
    pfad: `${akte(max)}/terminzettel`,
    bereich: 'Termine und Kalender',
    etikett: 'Terminzettel (Druck)',
    konten: ['owner'],
  },

  // --- Tour und Planung ----------------------------------------------------
  {
    muster: '/touren',
    pfad: '/touren',
    bereich: 'Tour und Planung',
    etikett: 'Tour (Tagesroute)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/praxis/gebiete',
    pfad: '/praxis/gebiete',
    bereich: 'Tour und Planung',
    etikett: 'Gebietstage',
    konten: ['owner'],
  },

  // --- Doku und Befund -----------------------------------------------------
  {
    muster: '/termine/:appointmentId/abschluss',
    pfad: `/termine/${IDS.terminMax}/abschluss`,
    bereich: 'Doku und Befund',
    etikett: 'Schreibseite (Behandlung abschließen)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/termine/:appointmentId/dokumentation',
    pfad: `/termine/${IDS.terminMax}/dokumentation`,
    bereich: 'Doku und Befund',
    etikett: 'Alte Doku-Adresse (leitet zur Schreibseite)',
    konten: ['owner'],
    ziel: `/termine/${IDS.terminMax}/abschluss`,
  },
  {
    muster: '/termine/:appointmentId/dokumentation/:noteId/bearbeiten',
    pfad: `/termine/${IDS.terminErika}/dokumentation/${ohne}/bearbeiten`,
    bereich: 'Doku und Befund',
    etikett: 'Nachtrag-Entwurf bearbeiten',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Behandlungsnotiz.',
  },
  {
    muster: '/termine/:appointmentId/dokumentation/:noteId/korrektur',
    pfad: `/termine/${IDS.terminErika}/dokumentation/${ohne}/korrektur`,
    bereich: 'Doku und Befund',
    etikett: 'Korrektur einer Notiz',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Behandlungsnotiz.',
  },
  {
    muster: '/termine/:appointmentId/dokumentation/:noteId/nachtrag',
    pfad: `/termine/${IDS.terminErika}/dokumentation/${ohne}/nachtrag`,
    bereich: 'Doku und Befund',
    etikett: 'Nachtrag zu einer Notiz',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Behandlungsnotiz.',
  },
  {
    muster: '/termine/:appointmentId/dokumentation/:noteId/verlauf',
    pfad: `/termine/${IDS.terminErika}/dokumentation/${ohne}/verlauf`,
    bereich: 'Doku und Befund',
    etikett: 'Änderungsverlauf einer Notiz',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Behandlungsnotiz.',
  },
  {
    muster: '/patienten/:patientId/befund/erheben',
    pfad: `${akte(erika)}/befund/erheben?instrument=anamnese_v8`,
    bereich: 'Doku und Befund',
    etikett: 'Fragebogen erheben (Anamnese)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/berichte/:berichtId',
    pfad: `${akte(erika)}/berichte/${ohne}`,
    bereich: 'Doku und Befund',
    etikett: 'Therapiebericht schreiben',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keinen Therapiebericht.',
  },
  {
    muster: '/patienten/:patientId/berichte/:berichtId/druck',
    pfad: `${akte(erika)}/berichte/${ohne}/druck`,
    bereich: 'Doku und Befund',
    etikett: 'Therapiebericht (Druck)',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keinen Therapiebericht.',
  },
  {
    muster: '/praxis/textbausteine',
    pfad: '/praxis/textbausteine',
    bereich: 'Doku und Befund',
    etikett: 'Textbausteine',
    konten: ['owner'],
  },
  {
    muster: '/praxis/instrumente',
    pfad: '/praxis/instrumente',
    bereich: 'Doku und Befund',
    etikett: 'Instrumente (Tests und Skalen)',
    konten: ['owner'],
  },
  {
    muster: '/auf-dem-geraet',
    pfad: '/auf-dem-geraet',
    bereich: 'Doku und Befund',
    etikett: 'Auf dem Gerät (Tagesplan, Entwürfe)',
    konten: ['owner', 'therapist'],
  },

  // --- Übungen und Training ------------------------------------------------
  {
    muster: '/uebungen',
    pfad: '/uebungen',
    bereich: 'Übungen und Training',
    etikett: 'Übungsbibliothek',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/uebungen/vorlagen',
    pfad: '/uebungen/vorlagen',
    bereich: 'Übungen und Training',
    etikett: 'Vorlagen der Praxis',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/uebungen/durchsicht',
    pfad: '/uebungen/durchsicht',
    bereich: 'Übungen und Training',
    etikett: 'Durchsicht des Katalogs',
    konten: ['owner'],
  },
  {
    muster: '/uebungen/:uebungId',
    pfad: `/uebungen/${IDS.uebung}`,
    bereich: 'Übungen und Training',
    etikett: 'Übung aus dem Katalog',
    konten: ['owner'],
  },
  {
    muster: '/patienten/:patientId/plaene/:planId',
    pfad: `${akte(erika)}/plaene/${IDS.planErika}`,
    bereich: 'Übungen und Training',
    etikett: 'Übungsplan der Akte',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/patienten/:patientId/plaene/:planId/blatt',
    pfad: `${akte(erika)}/plaene/${IDS.planErika}/blatt`,
    bereich: 'Übungen und Training',
    etikett: 'Übungsplan (Blatt)',
    konten: ['owner'],
  },
  {
    muster: '/training',
    pfad: '/training',
    bereich: 'Übungen und Training',
    etikett: 'Trainingskund:innen',
    konten: ['owner', 'trainer', 'office'],
  },
  {
    muster: '/training/neu',
    pfad: '/training/neu',
    bereich: 'Übungen und Training',
    etikett: 'Trainingskund:in anlegen',
    konten: ['owner'],
  },
  {
    muster: '/training/:relationshipId',
    pfad: `/training/${IDS.trainingTina}`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingskund:in (Tina)',
    konten: ['owner', 'trainer'],
  },
  // ERN-001: die Formulare der Ernährungsberatung im Training (Tina hat keine).
  {
    muster: '/training/:relationshipId/ernaehrung/neu',
    pfad: `/training/${IDS.trainingTina}/ernaehrung/neu`,
    bereich: 'Übungen und Training',
    etikett: 'Ernährungsberatung anlegen (Training)',
    konten: ['owner'],
  },
  {
    muster: '/training/:relationshipId/ernaehrung/bearbeiten',
    pfad: `/training/${IDS.trainingTina}/ernaehrung/bearbeiten`,
    bereich: 'Übungen und Training',
    etikett: 'Ernährungsprofil ändern (Training)',
    konten: ['owner'],
    ohneDaten: 'Tina hat im Seed keine Ernährungsberatung.',
  },
  {
    muster: '/training/:relationshipId/ernaehrung/zielwerte',
    pfad: `/training/${IDS.trainingTina}/ernaehrung/zielwerte`,
    bereich: 'Übungen und Training',
    etikett: 'Zielwerte anpassen (Training)',
    konten: ['owner'],
    ohneDaten: 'Tina hat im Seed keine Ernährungsberatung.',
  },
  {
    muster: '/training/:relationshipId/plaene/:planId',
    pfad: `/training/${IDS.trainingTina}/plaene/${IDS.planTraining}`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingsplan',
    konten: ['owner', 'trainer'],
  },
  {
    muster: '/training/:relationshipId/plaene/:planId/blatt',
    pfad: `/training/${IDS.trainingTina}/plaene/${IDS.planTraining}/blatt`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingsplan (Blatt)',
    konten: ['owner'],
  },
  {
    muster: '/training/termine/neu',
    pfad: `/training/termine/neu?kunde=${IDS.trainingTina}`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingstermin anlegen',
    konten: ['owner'],
  },
  {
    muster: '/training/termine/:appointmentId',
    pfad: `/training/termine/${IDS.trainingstermin}`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingstermin',
    konten: ['owner', 'trainer'],
  },
  {
    muster: '/training/termine/:appointmentId/bearbeiten',
    pfad: `/training/termine/${IDS.trainingstermin}/bearbeiten`,
    bereich: 'Übungen und Training',
    etikett: 'Trainingstermin bearbeiten',
    konten: ['owner'],
  },
  {
    muster: '/training/rueckfragen/:messageId',
    pfad: `/training/rueckfragen/${IDS.rueckfrageTraining}`,
    bereich: 'Übungen und Training',
    etikett: 'Rückfrage aus dem Training',
    konten: ['owner', 'trainer'],
  },

  // --- Eingang -------------------------------------------------------------
  {
    muster: '/offen',
    pfad: '/offen',
    bereich: 'Eingang',
    etikett: 'Offene Punkte',
    konten: ['owner', 'therapist', 'office'],
  },
  {
    muster: '/offen/anrufe',
    pfad: '/offen/anrufe',
    bereich: 'Eingang',
    etikett: 'Anrufliste',
    konten: ['owner', 'office'],
  },
  {
    muster: '/rueckfragen',
    pfad: '/rueckfragen',
    bereich: 'Eingang',
    etikett: 'Rückfragen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/rueckfragen/:messageId',
    pfad: `/rueckfragen/${IDS.rueckfrage}`,
    bereich: 'Eingang',
    etikett: 'Rückfrage (Erika)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/team',
    pfad: '/team',
    bereich: 'Eingang',
    etikett: 'Teamchat',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/team/threads',
    pfad: '/team/threads',
    bereich: 'Eingang',
    etikett: 'Teamchat: Threads',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/fuer-dich',
    pfad: '/fuer-dich',
    bereich: 'Eingang',
    etikett: 'Nachrichten: Für dich',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/team/neu',
    pfad: '/team/neu',
    bereich: 'Eingang',
    etikett: 'Teamchat: neue Nachricht',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/team/:kanalId',
    pfad: `/team/${IDS.kanalAllgemein}`,
    bereich: 'Eingang',
    etikett: 'Teamchat: Kanal Allgemein',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/team/:kanalId/:threadId',
    pfad: `/team/${IDS.kanalAllgemein}/${IDS.threadBelege}`,
    bereich: 'Eingang',
    etikett: 'Teamchat: Antworten zu den Belegen',
    konten: ['owner', 'therapist'],
  },

  // --- Abrechnung ----------------------------------------------------------
  {
    muster: '/abrechnung',
    pfad: '/abrechnung',
    bereich: 'Abrechnung',
    etikett: 'Rechnungen',
    konten: ['owner', 'office'],
  },
  {
    muster: '/abrechnung/rechnungen/:invoiceId',
    pfad: `/abrechnung/rechnungen/${ohne}`,
    bereich: 'Abrechnung',
    etikett: 'Rechnung',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Rechnung.',
  },
  {
    muster: '/abrechnung/rechnungen/:invoiceId/druck',
    pfad: `/abrechnung/rechnungen/${ohne}/druck`,
    bereich: 'Abrechnung',
    etikett: 'Rechnungsblatt (Druck)',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Rechnung.',
  },
  {
    muster: '/abrechnung/druck',
    pfad: `/abrechnung/druck?rechnungen=${ohne}`,
    bereich: 'Abrechnung',
    etikett: 'Sammeldruck nach dem Lauf',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Rechnung.',
  },
  {
    muster: '/abrechnung/rechnungen/:invoiceId/storno',
    pfad: `/abrechnung/rechnungen/${ohne}/storno`,
    bereich: 'Abrechnung',
    etikett: 'Stornoblatt (Druck)',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Rechnung.',
  },
  {
    muster: '/abrechnung/erinnerungen/:reminderId',
    pfad: `/abrechnung/erinnerungen/${ohne}`,
    bereich: 'Abrechnung',
    etikett: 'Zahlungserinnerung (Druck)',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keine Zahlungserinnerung.',
  },
  {
    muster: '/abrechnung/leistungen',
    pfad: '/abrechnung/leistungen',
    bereich: 'Abrechnung',
    etikett: 'Leistungen',
    konten: ['owner'],
  },
  {
    muster: '/abrechnung/katalog',
    pfad: '/abrechnung/katalog',
    bereich: 'Abrechnung',
    etikett: 'Leistungskatalog',
    konten: ['owner'],
  },
  {
    muster: '/abrechnung/stammdaten',
    pfad: '/abrechnung/stammdaten',
    bereich: 'Abrechnung',
    etikett: 'Praxisstammdaten',
    konten: ['owner'],
  },
  {
    muster: '/abrechnung/zahlungen',
    pfad: '/abrechnung/zahlungen',
    bereich: 'Abrechnung',
    etikett: 'Zahlungen',
    konten: ['owner'],
  },
  {
    muster: '/abrechnung/auswertung',
    pfad: '/abrechnung/auswertung',
    bereich: 'Abrechnung',
    etikett: 'Einnahmen je Leistungsart',
    konten: ['owner'],
  },
  {
    muster: '/statistiken',
    pfad: '/statistiken',
    bereich: 'Abrechnung',
    etikett: 'Statistiken',
    konten: ['owner'],
  },

  // --- Organisation --------------------------------------------------------
  {
    muster: '/praxis/team',
    pfad: '/praxis/team',
    bereich: 'Organisation',
    etikett: 'Mitarbeitende',
    konten: ['owner', 'office'],
  },
  {
    muster: '/praxis/team/neu',
    pfad: '/praxis/team/neu',
    bereich: 'Organisation',
    etikett: 'Mitarbeiter:in anlegen',
    konten: ['owner'],
  },
  {
    muster: '/praxis/team/:staffMemberId',
    pfad: `/praxis/team/${IDS.anna}`,
    bereich: 'Organisation',
    etikett: 'Mitarbeiterin (Anna)',
    konten: ['owner'],
  },
  {
    muster: '/praxis/team/:staffMemberId/bearbeiten',
    pfad: `/praxis/team/${IDS.anna}/bearbeiten`,
    bereich: 'Organisation',
    etikett: 'Mitarbeiterin bearbeiten',
    konten: ['owner'],
  },
  {
    muster: '/betrieb/flotte',
    pfad: '/betrieb/flotte',
    bereich: 'Organisation',
    etikett: 'Radflotte',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/nachrichten',
    pfad: '/betrieb/flotte/nachrichten',
    bereich: 'Organisation',
    etikett: 'Radflotte: Nachrichten',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/nachrichten/:threadId',
    pfad: `/betrieb/flotte/nachrichten/${IDS.threadPanne}`,
    bereich: 'Organisation',
    etikett: 'Radflotte: Antworten zur Panne',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/rad/neu',
    pfad: '/betrieb/flotte/rad/neu',
    bereich: 'Organisation',
    etikett: 'Rad hinzufügen',
    konten: ['owner'],
  },
  {
    muster: '/betrieb/flotte/rad/:radId',
    pfad: `/betrieb/flotte/rad/${IDS.rad}`,
    bereich: 'Organisation',
    etikett: 'Rad: Stellen am Rad (gesperrt)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/rad/:radId/werkstatt',
    pfad: `/betrieb/flotte/rad/${IDS.rad}/werkstatt`,
    bereich: 'Organisation',
    etikett: 'Unterlage für die Werkstatt',
    konten: ['owner'],
  },
  {
    muster: '/betrieb/flotte/depots',
    pfad: '/betrieb/flotte/depots',
    bereich: 'Organisation',
    etikett: 'Depots',
    konten: ['owner'],
  },
  {
    muster: '/betrieb/flotte/schluessel',
    pfad: '/betrieb/flotte/schluessel',
    bereich: 'Organisation',
    etikett: 'Schlüssel übergeben: Welches Rad?',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/checkup',
    pfad: `/betrieb/flotte/checkup?rad=${IDS.radAnna}`,
    bereich: 'Organisation',
    etikett: 'Fahrrad-Check-Up',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/panne',
    pfad: `/betrieb/flotte/panne?rad=${IDS.radAnna}`,
    bereich: 'Organisation',
    etikett: 'Panne melden: Wo ist der Schaden?',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/flotte/meldungen',
    pfad: '/betrieb/flotte/meldungen',
    bereich: 'Organisation',
    etikett: 'Meldungen der Radflotte',
    konten: ['owner'],
  },
  {
    muster: '/betrieb/flotte/meldungen/:art/:meldungId',
    pfad: `/betrieb/flotte/meldungen/panne/${IDS.panne}`,
    bereich: 'Organisation',
    etikett: 'Meldung: Panne',
    konten: ['owner'],
  },
  // URL-001: Urlaub ist echt angebunden - die Seite je Rolle, Beantragen
  // ORG-001/-004: Eingang von Organisation und die Wahl eines neuen Antrags.
  {
    muster: '/betrieb',
    pfad: '/betrieb',
    bereich: 'Organisation',
    etikett: 'Eingang',
    konten: ['owner', 'office', 'therapist', 'trainer'],
  },
  {
    muster: '/betrieb/neu',
    pfad: '/betrieb/neu',
    bereich: 'Organisation',
    etikett: 'Neuer Antrag',
    konten: ['owner', 'trainer'],
  },
  // ORG-006: Barometer (Beschäftigte: der Ablauf, owner: die Praxissumme) und
  // Rückmeldung an die Praxisleitung (Beschäftigte: schreiben, owner: Liste).
  {
    muster: '/betrieb/barometer',
    pfad: '/betrieb/barometer',
    bereich: 'Organisation',
    etikett: 'Barometer',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/rueckmeldung',
    pfad: '/betrieb/rueckmeldung',
    bereich: 'Organisation',
    etikett: 'Rückmeldung an die Praxisleitung',
    konten: ['owner', 'therapist'],
  },
  // ORG-002: die Einstellungen der Praxis, nur owner.
  {
    muster: '/praxis/einstellungen',
    pfad: '/praxis/einstellungen',
    bereich: 'Organisation',
    etikett: 'Einstellungen der Praxis',
    konten: ['owner'],
  },
  // (G7), Entscheiden (G7b) und der Anspruch je Person.
  {
    muster: '/betrieb/urlaub',
    pfad: '/betrieb/urlaub',
    bereich: 'Organisation',
    etikett: 'Urlaub',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/betrieb/urlaub/beantragen',
    pfad: '/betrieb/urlaub/beantragen',
    bereich: 'Organisation',
    etikett: 'Urlaub beantragen (Kalender)',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/urlaub/entscheiden/:antragId',
    pfad: '/betrieb/urlaub/entscheiden/abababab-abab-4bab-8bab-000000000001',
    bereich: 'Organisation',
    etikett: 'Urlaubsantrag entscheiden',
    konten: ['owner'],
    ohneDaten:
      'Der Seed hat keinen Urlaubsantrag; der Ablauf steht in authenticated/urlaub.spec.ts.',
  },
  {
    muster: '/betrieb/urlaub/anspruch/:staffMemberId',
    pfad: `/betrieb/urlaub/anspruch/${IDS.anna}`,
    bereich: 'Organisation',
    etikett: 'Urlaubsanspruch (Anna)',
    konten: ['owner'],
  },
  // AZ-001: Arbeitszeit - die Seite je Rolle, Beantragen (G8) und
  // Entscheiden (G8b).
  {
    muster: '/betrieb/arbeitszeit',
    pfad: '/betrieb/arbeitszeit',
    bereich: 'Organisation',
    etikett: 'Arbeitszeit',
    konten: ['owner', 'therapist', 'trainer'],
  },
  {
    muster: '/betrieb/arbeitszeit/beantragen',
    pfad: '/betrieb/arbeitszeit/beantragen',
    bereich: 'Organisation',
    etikett: 'Arbeitszeitänderung beantragen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/arbeitszeit/entscheiden/:requestId',
    pfad: '/betrieb/arbeitszeit/entscheiden/abababab-abab-4bab-8bab-000000000001',
    bereich: 'Organisation',
    etikett: 'Arbeitszeitänderung entscheiden',
    konten: ['owner'],
    ohneDaten: 'Der Seed hat keinen Antrag; der Ablauf steht in authenticated/arbeitszeit.spec.ts.',
  },
  // ZK-001: Zeitkonto - die Seite je Rolle (das Büro bucht für andere),
  // Eintragen (G9) und Zurückweisen (G9b).
  {
    muster: '/betrieb/urlaub/termine',
    pfad: `/betrieb/urlaub/termine?person=${IDS.anna}&von=2026-12-14&bis=2026-12-18`,
    bereich: 'Organisation',
    etikett: 'Termine im Urlaub (Anna)',
    konten: ['owner'],
    ohneDaten:
      'Der Seed hat keinen genehmigten Urlaub mit Terminen; die Liste prüfen UrlaubTerminePage.test.tsx und urlaub.spec.ts.',
  },
  {
    muster: '/betrieb/zeitkonto',
    pfad: '/betrieb/zeitkonto',
    bereich: 'Organisation',
    etikett: 'Zeitkonto',
    konten: ['owner', 'therapist', 'office', 'trainer'],
  },
  {
    muster: '/betrieb/zeitkonto/eintragen',
    pfad: '/betrieb/zeitkonto/eintragen',
    bereich: 'Organisation',
    etikett: 'Ins Zeitkonto eintragen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/zeitkonto/zurueckweisen/:entryId',
    pfad: '/betrieb/zeitkonto/zurueckweisen/abababab-abab-4bab-8bab-000000000001',
    bereich: 'Organisation',
    etikett: 'Zeitkonto: Eintrag zurückweisen',
    konten: ['owner'],
    ohneDaten:
      'Der Seed hat keinen Eintrag im Zeitkonto; der Ablauf steht in authenticated/zeitkonto.spec.ts.',
  },
  // ERS-001: Erstattungen - die Seite je Rolle (owner und Büro sehen alle),
  // Beantragen (G10), Entscheiden und Auszahlen (G10b), die IBAN.
  {
    muster: '/betrieb/erstattungen',
    pfad: '/betrieb/erstattungen',
    bereich: 'Organisation',
    etikett: 'Erstattungen',
    konten: ['owner', 'therapist', 'office'],
  },
  {
    muster: '/betrieb/erstattungen/beantragen',
    pfad: '/betrieb/erstattungen/beantragen',
    bereich: 'Organisation',
    etikett: 'Erstattung beantragen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/betrieb/erstattungen/entscheiden/:reimbursementId',
    pfad: '/betrieb/erstattungen/entscheiden/abababab-abab-4bab-8bab-000000000001',
    bereich: 'Organisation',
    etikett: 'Erstattung entscheiden',
    konten: ['owner'],
    ohneDaten:
      'Der Seed hat keine Erstattung; der Ablauf steht in authenticated/erstattungen.spec.ts.',
  },
  {
    muster: '/betrieb/erstattungen/auszahlen/:reimbursementId',
    pfad: '/betrieb/erstattungen/auszahlen/abababab-abab-4bab-8bab-000000000001',
    bereich: 'Organisation',
    etikett: 'Erstattung auszahlen',
    konten: ['owner'],
    ohneDaten:
      'Der Seed hat keine Erstattung; der Ablauf steht in authenticated/erstattungen.spec.ts.',
  },
  {
    muster: '/betrieb/erstattungen/konto',
    pfad: '/betrieb/erstattungen/konto',
    bereich: 'Organisation',
    etikett: 'IBAN für Erstattungen',
    konten: ['owner', 'therapist'],
  },
  {
    muster: '/praxis/sicherheit/audit',
    pfad: '/praxis/sicherheit/audit',
    bereich: 'Organisation',
    etikett: 'Protokoll (Audit)',
    konten: ['owner'],
  },
  {
    muster: '/praxis/sicherheit/aufbewahrung',
    pfad: '/praxis/sicherheit/aufbewahrung',
    bereich: 'Organisation',
    etikett: 'Aufbewahrung und Löschung',
    konten: ['owner'],
  },
  {
    muster: '/vorschau/protokoll',
    pfad: '/vorschau/protokoll',
    bereich: 'Organisation',
    etikett: 'Protokoll (Vorschau)',
    konten: ['owner'],
  },

  // --- Patientenplattform (src/features/platform/PlattformApp.tsx) --------
  {
    muster: '/p',
    pfad: '/p?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Übersicht Behandlung (Erika)',
    konten: ['plattform', 'plattform-training', 'begleitung'],
  },
  {
    muster: '/p/termine',
    pfad: '/p/termine?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Termine',
    konten: ['plattform', 'begleitung'],
  },
  {
    muster: '/p/termine/wunsch',
    pfad: '/p/termine/wunsch?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Terminwunsch',
    konten: ['plattform'],
  },
  {
    muster: '/p/termine/:terminId',
    pfad: `/p/termine/${IDS.terminErika}?bereich=treatment`,
    bereich: 'Plattform',
    etikett: 'Plattform – ein Termin',
    konten: ['plattform'],
  },
  {
    muster: '/p/nachrichten',
    pfad: '/p/nachrichten?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Nachrichten',
    konten: ['plattform'],
  },
  {
    muster: '/p/nachrichten/neu',
    pfad: '/p/nachrichten/neu?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Nachricht schreiben',
    konten: ['plattform'],
  },
  {
    muster: '/p/nachrichten/:nachrichtId',
    pfad: `/p/nachrichten/${IDS.rueckfrage}?bereich=treatment`,
    bereich: 'Plattform',
    etikett: 'Plattform – eine Nachricht',
    konten: ['plattform'],
  },
  {
    muster: '/p/uebungen',
    pfad: '/p/uebungen?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Übungen',
    konten: ['plattform', 'plattform-training'],
  },
  {
    muster: '/p/uebungen/einheit/:planId',
    pfad: `/p/uebungen/einheit/${IDS.planErika}?bereich=treatment`,
    bereich: 'Plattform',
    etikett: 'Plattform – Übungseinheit',
    konten: ['plattform'],
  },
  {
    muster: '/p/uebungen/blatt/:planId',
    pfad: `/p/uebungen/blatt/${IDS.planErika}?bereich=treatment`,
    bereich: 'Plattform',
    etikett: 'Plattform – Übungsblatt',
    konten: ['plattform'],
  },
  {
    muster: '/p/checkin',
    pfad: '/p/checkin?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Check-in',
    konten: ['plattform'],
  },
  {
    muster: '/p/gewohnheiten',
    pfad: '/p/gewohnheiten?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Gewohnheiten',
    konten: ['plattform'],
  },
  // ERN-002: die eigene Ernährungsberatung (Seed: Erikas Akte); die Begleitung sieht nichts.
  {
    muster: '/p/ernaehrung',
    pfad: '/p/ernaehrung?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Ernährung',
    konten: ['plattform'],
  },
  {
    muster: '/p/angaben',
    pfad: '/p/angaben?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Angaben',
    konten: ['plattform'],
  },
  {
    muster: '/p/befundbogen',
    pfad: '/p/befundbogen?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Befundbogen',
    konten: ['plattform'],
  },
  {
    muster: '/p/rechnungen',
    pfad: '/p/rechnungen?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Rechnungen',
    konten: ['plattform'],
  },
  {
    muster: '/p/rechnungen/:rechnungId',
    pfad: `/p/rechnungen/${ohne}?bereich=treatment`,
    bereich: 'Plattform',
    etikett: 'Plattform – eine Rechnung',
    konten: ['plattform'],
    ohneDaten: 'Der Seed hat keine Rechnung.',
  },
  {
    muster: '/p/dokumente',
    pfad: '/p/dokumente?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Dokumente',
    konten: ['plattform'],
  },
  {
    muster: '/p/einwilligungen',
    pfad: '/p/einwilligungen',
    bereich: 'Plattform',
    etikett: 'Plattform – Einwilligungen',
    konten: ['plattform'],
  },
  {
    muster: '/p/daten',
    pfad: '/p/daten',
    bereich: 'Plattform',
    etikett: 'Plattform – Datenexport',
    konten: ['plattform'],
  },
  {
    muster: '/p/abo',
    pfad: '/p/abo?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Nachsorge-Abo',
    konten: ['plattform'],
  },
  {
    muster: '/p/angebot',
    pfad: '/p/angebot?bereich=treatment',
    bereich: 'Plattform',
    etikett: 'Plattform – Trainingsangebot',
    konten: ['plattform'],
  },
  {
    muster: '/p/vertrag',
    pfad: '/p/vertrag?bereich=training',
    bereich: 'Plattform',
    etikett: 'Plattform – Trainingsvertrag',
    konten: ['plattform-training'],
  },
  {
    muster: '/p/paket',
    pfad: '/p/paket?bereich=training',
    bereich: 'Plattform',
    etikett: 'Plattform – Trainingspaket',
    konten: ['plattform-training'],
  },
  {
    muster: '/p/einstellungen',
    pfad: '/p/einstellungen',
    bereich: 'Plattform',
    etikett: 'Plattform – Einstellungen',
    konten: ['plattform'],
  },
  {
    muster: '/p/ich',
    pfad: '/p/ich',
    bereich: 'Plattform',
    etikett: 'Plattform – Ich',
    konten: ['plattform', 'begleitung'],
  },
  // E-001: Erikas eigener Zugang zur Behandlung (supabase/seed.sql), gesehen
  // von der Praxisinhaber:in - nur lesend.
  {
    muster: '/p',
    pfad: '/p?zugang=cafecafe-cafe-4afe-8afe-000000000002',
    bereich: 'Plattform',
    etikett: 'Einsicht der Praxis – So sieht Erika die Plattform',
    konten: ['owner'],
    einsicht: true,
  },

  // --- Ohne Anmeldung (src/app/App.tsx, OeffentlicheRouten) --------------
  {
    muster: '/anmeldung',
    pfad: '/',
    bereich: 'Anmeldung',
    etikett: 'Anmeldemaske',
    konten: ['ohne'],
    oeffentlich: true,
  },
  {
    muster: '/zugang',
    pfad: '/zugang',
    bereich: 'Anmeldung',
    etikett: 'Zugangslink ohne Kennung',
    konten: ['ohne'],
    oeffentlich: true,
    ohneDaten: 'Ohne Kennung im Link ist der Fehlerzustand die erwartete Seite.',
  },
  {
    muster: '/einladung',
    pfad: '/einladung',
    bereich: 'Anmeldung',
    etikett: 'Einladung ohne Kennung',
    konten: ['ohne'],
    oeffentlich: true,
    ohneDaten: 'Ohne Kennung im Link ist der Fehlerzustand die erwartete Seite.',
  },
]);

/** Routen, die bewusst kein Bild bekommen - mit Grund. */
export const AUSGENOMMEN = Object.freeze([
  {
    muster: '/praxis/planung',
    grund: 'Alte Adresse der Planung: leitet seit ORG-003 auf /betrieb/arbeitszeit um.',
  },
  {
    muster: '*',
    grund: 'Auffangroute: leitet auf die Startseite um (Praxis „/“, Plattform „/p“).',
  },
]);
