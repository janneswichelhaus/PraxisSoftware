/**
 * Synthetische Daten des Vorschaugerüsts.
 *
 * Ausschließlich erfundene Personen, Orte und Vorgänge
 * (PROJECT_PRINCIPLES.md 3.1). Die Daten liegen bewusst realistisch gefüllt
 * vor: eine Liste aus vier Einträgen prüft die Orientierung unter Arbeitslast
 * nicht. Enthalten sind deshalb unter anderem zwei sehr ähnliche Namen, ein
 * Rad am falschen Standort, ein gesperrtes Rad, ein offener Urlaubsantrag im
 * laufenden Zeitraum und eine vollständige Besuchsfolge.
 *
 * Die Daten werden relativ zum übergebenen Stichtag erzeugt, damit die
 * Vorschau nicht mit der Zeit veraltet.
 */

import type {
  Depot,
  ErbrachteLeistung,
  Erstattung,
  Kanal,
  Katalogleistung,
  Mitarbeitende,
  Nachricht,
  Rad,
  Rechnung,
  Tour,
  Urlaubsantrag,
  Zahlung,
  Zeitbuchung,
} from './types';

// -----------------------------------------------------------------------------
// Datumshilfen - reine Kalenderrechnung über UTC, keine Ortszeit im Spiel
// -----------------------------------------------------------------------------

export function tagesschluessel(datum: Date): string {
  return datum.toISOString().slice(0, 10);
}

export function plusTage(tag: string, tage: number): string {
  const datum = new Date(`${tag}T00:00:00Z`);
  datum.setUTCDate(datum.getUTCDate() + tage);
  return tagesschluessel(datum);
}

/** Montag der Woche, in der `tag` liegt. */
export function montagDerWoche(tag: string): string {
  const datum = new Date(`${tag}T00:00:00Z`);
  const wochentag = (datum.getUTCDay() + 6) % 7;
  return plusTage(tag, -wochentag);
}

function zeitpunkt(tag: string, uhrzeit: string): string {
  return `${tag}T${uhrzeit}:00.000Z`;
}

// -----------------------------------------------------------------------------
// Stammdaten
// -----------------------------------------------------------------------------

export const demoDepots: Depot[] = [
  { id: 'd1', name: 'Raddepot Nord', hinweis: 'Betrieblicher Abstellort, kein Behandlungsraum.' },
  { id: 'd2', name: 'Raddepot Süd', hinweis: 'Betrieblicher Abstellort, kein Behandlungsraum.' },
  { id: 'd3', name: 'Sonderstandort', hinweis: 'Abweichender Ort, im Rad selbst benannt.' },
];

export const demoMitarbeitende: Mitarbeitende[] = [
  {
    id: 'm1',
    name: 'Miriam Falk',
    rolle: 'Praxisinhaberin',
    kategorie: 'Leitung',
    stufe: '',
    telefon: '0170 0000001',
    email: 'miriam.falk@praxis.invalid',
    geburtstag: '1984-03-12',
    imTeamSeit: '2021-01-01',
    urlaubsanspruch: 30,
    resturlaubVorjahr: 2,
    notfallkontaktName: 'K. Falk',
    notfallkontaktTelefon: '0170 0000101',
    notiz: 'Führt die Praxis; entscheidet Anträge der Teamleitung.',
  },
  {
    id: 'm2',
    name: 'Nadja Wolf',
    rolle: 'Teamleitung Therapie',
    kategorie: 'Leitung',
    stufe: 'Senior',
    telefon: '0170 0000002',
    email: 'nadja.wolf@praxis.invalid',
    geburtstag: '1989-07-04',
    imTeamSeit: '2021-04-01',
    urlaubsanspruch: 30,
    resturlaubVorjahr: 0,
    notfallkontaktName: 'T. Wolf',
    notfallkontaktTelefon: '0170 0000102',
    notiz: 'Entscheidet Urlaubsanträge des Therapieteams.',
  },
  {
    id: 'm3',
    name: 'Lena Hartmann',
    rolle: 'Physiotherapeutin',
    kategorie: 'Physiotherapie',
    stufe: 'Senior',
    telefon: '0170 0000003',
    email: 'lena.hartmann@praxis.invalid',
    geburtstag: '1992-11-23',
    imTeamSeit: '2022-02-15',
    urlaubsanspruch: 28,
    resturlaubVorjahr: 3,
    notfallkontaktName: 'B. Hartmann',
    notfallkontaktTelefon: '0170 0000103',
    notiz: '',
  },
  {
    id: 'm4',
    name: 'Lena Hartung',
    rolle: 'Physiotherapeutin',
    kategorie: 'Physiotherapie',
    stufe: 'Junior',
    telefon: '0170 0000004',
    email: 'lena.hartung@praxis.invalid',
    geburtstag: '1998-05-09',
    imTeamSeit: '2025-09-01',
    urlaubsanspruch: 28,
    resturlaubVorjahr: 0,
    notfallkontaktName: 'S. Hartung',
    notfallkontaktTelefon: '0170 0000104',
    notiz: 'Namensgleichheit mit Lena Hartmann - bei Zuordnungen prüfen.',
  },
  {
    id: 'm5',
    name: 'Tobias Krenz',
    rolle: 'Physiotherapeut',
    kategorie: 'Physiotherapie',
    stufe: 'Senior',
    telefon: '0170 0000005',
    email: 'tobias.krenz@praxis.invalid',
    geburtstag: '1987-01-30',
    imTeamSeit: '2021-06-01',
    urlaubsanspruch: 28,
    resturlaubVorjahr: 1,
    notfallkontaktName: 'M. Krenz',
    notfallkontaktTelefon: '0170 0000105',
    notiz: '',
  },
  {
    id: 'm6',
    name: 'Aylin Özdemir',
    rolle: 'Physiotherapeutin',
    kategorie: 'Physiotherapie',
    stufe: 'Junior',
    telefon: '0170 0000006',
    email: 'aylin.oezdemir@praxis.invalid',
    geburtstag: '2000-09-17',
    imTeamSeit: '2026-03-01',
    urlaubsanspruch: 28,
    resturlaubVorjahr: 0,
    notfallkontaktName: 'E. Özdemir',
    notfallkontaktTelefon: '0170 0000106',
    notiz: '',
  },
  {
    id: 'm7',
    name: 'Robert Sailer',
    rolle: 'Praxismanagement',
    kategorie: 'Office',
    stufe: '',
    telefon: '0170 0000007',
    email: 'robert.sailer@praxis.invalid',
    geburtstag: '1979-12-02',
    imTeamSeit: '2021-01-15',
    urlaubsanspruch: 30,
    resturlaubVorjahr: 4,
    notfallkontaktName: 'H. Sailer',
    notfallkontaktTelefon: '0170 0000107',
    notiz: 'Terminorganisation, Rechnungen, Belege.',
  },
];

export const demoCheckupfragen = [
  'Reifen und Luftdruck',
  'Bremsen',
  'Kette und Antrieb',
  'Licht vorne',
  'Licht hinten',
  'Akku-Zustand',
  'Schrauben und Sattel fest',
  'Klingel',
  'Schutzbleche',
];

// -----------------------------------------------------------------------------
// Erzeugung
// -----------------------------------------------------------------------------

const leererPlan = {
  mo: 'frei',
  di: 'frei',
  mi: 'frei',
  do: 'frei',
  fr: 'frei',
  sa: 'frei',
  so: 'frei',
} as const;

function plan(belegt: ('mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so')[]): Rad['wochenplan'] {
  const ergebnis = { ...leererPlan } as Rad['wochenplan'];
  for (const tag of belegt) ergebnis[tag] = 'belegt';
  return ergebnis;
}

export function demoRaeder(heute: string): Rad[] {
  return [
    {
      id: 'r1',
      name: 'Lastenrad 1',
      stammdepotId: 'd1',
      depotId: 'd1',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: 'm3',
      status: 'einsatz',
      aktuellerNutzerId: null,
      akku: 'Akku Typ A',
      schluesselcode: 'SC-0001',
      wochenplan: plan(['mo', 'di', 'do', 'fr']),
      notiz: '',
      schluesselInhaber: 'Lena Hartmann',
      schluesselSeit: zeitpunkt(heute, '07:40'),
      schluesselverlauf: [
        {
          id: 'sv1',
          inhaber: 'Lena Hartmann',
          entnommen: zeitpunkt(plusTage(heute, -3), '07:35'),
          zurueckgelegt: zeitpunkt(plusTage(heute, -3), '17:10'),
        },
      ],
      pannenverlauf: [],
      checkups: [
        {
          id: 'cu1',
          zeitpunkt: zeitpunkt(plusTage(heute, -7), '17:20'),
          geprueftVon: 'Lena Hartmann',
          befunde: demoCheckupfragen.map((frage) => ({
            frage,
            bewertung: frage === 'Klingel' ? 'beobachten' : 'ok',
            notiz: frage === 'Klingel' ? 'klemmt gelegentlich' : '',
          })),
          notiz: '',
          fotos: 0,
          unterschrift: true,
        },
      ],
    },
    {
      id: 'r2',
      name: 'Lastenrad 2',
      stammdepotId: 'd1',
      depotId: 'd1',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: 'm4',
      status: 'einsatz',
      aktuellerNutzerId: null,
      akku: 'Akku Typ A',
      schluesselcode: 'SC-0002',
      wochenplan: plan(['mo', 'mi', 'do']),
      notiz: '',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
    {
      id: 'r3',
      name: 'Lastenrad 3',
      stammdepotId: 'd1',
      depotId: 'd3',
      sonderstandort: 'Privatgarage Teamleitung',
      ersatzrad: false,
      stammnutzerId: 'm5',
      status: 'verfuegbar',
      aktuellerNutzerId: null,
      akku: 'Akku Typ B',
      schluesselcode: 'SC-0003',
      wochenplan: plan(['di', 'mi', 'fr']),
      notiz: 'Steht vorübergehend am Sonderstandort.',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
    {
      id: 'r4',
      name: 'Lastenrad 4',
      stammdepotId: 'd1',
      depotId: 'd1',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: 'm6',
      status: 'reparatur',
      aktuellerNutzerId: null,
      akku: 'Akku Typ B',
      schluesselcode: 'SC-0004',
      wochenplan: plan(['mo', 'di', 'mi', 'do', 'fr']),
      notiz: 'Wartet auf Rückmeldung der Werkstatt.',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [
        {
          id: 'pv1',
          zeitpunkt: zeitpunkt(plusTage(heute, -1), '14:05'),
          text: 'Kettenriss unterwegs. Rad bei der Werkstatt abgegeben, Ersatzrad übernommen.',
          gesperrt: true,
        },
      ],
      checkups: [],
    },
    {
      id: 'r5',
      name: 'Lastenrad 5 (Ersatz)',
      stammdepotId: 'd1',
      depotId: 'd1',
      sonderstandort: '',
      ersatzrad: true,
      stammnutzerId: null,
      status: 'einsatz',
      aktuellerNutzerId: 'm6',
      akku: 'Akku Typ A',
      schluesselcode: 'SC-0005',
      wochenplan: plan(['mo', 'di', 'mi', 'do', 'fr']),
      notiz: '',
      schluesselInhaber: 'Aylin Özdemir',
      schluesselSeit: zeitpunkt(heute, '07:25'),
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
    {
      id: 'r6',
      name: 'Lastenrad 6',
      stammdepotId: 'd2',
      depotId: 'd2',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: 'm2',
      status: 'verfuegbar',
      aktuellerNutzerId: null,
      akku: 'Akku Typ A',
      schluesselcode: 'SC-0006',
      wochenplan: plan(['mo', 'do']),
      notiz: '',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
    {
      id: 'r7',
      name: 'Lastenrad 7',
      stammdepotId: 'd2',
      depotId: 'd2',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: null,
      status: 'verfuegbar',
      aktuellerNutzerId: null,
      akku: 'Akku Typ B',
      schluesselcode: 'SC-0007',
      wochenplan: plan([]),
      notiz: 'Noch keinem Stammnutzer zugeordnet.',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
    {
      id: 'r8',
      name: 'Lastenrad 8',
      stammdepotId: 'd2',
      depotId: 'd2',
      sonderstandort: '',
      ersatzrad: false,
      stammnutzerId: 'm7',
      status: 'verfuegbar',
      aktuellerNutzerId: null,
      akku: 'Akku Typ A',
      schluesselcode: 'SC-0008',
      wochenplan: plan(['di', 'fr']),
      notiz: '',
      schluesselInhaber: null,
      schluesselSeit: null,
      schluesselverlauf: [],
      pannenverlauf: [],
      checkups: [],
    },
  ];
}

export function demoUrlaub(heute: string): Urlaubsantrag[] {
  return [
    {
      id: 'u1',
      mitarbeiterId: 'm5',
      von: plusTage(heute, 2),
      bis: plusTage(heute, 6),
      tage: 5,
      grund: 'Familienurlaub',
      status: 'beantragt',
      eingereichtAm: plusTage(heute, -4),
      entschiedenVon: '',
      entschiedenAm: '',
      ablehnungsgrund: '',
      unterschrift: false,
    },
    {
      id: 'u2',
      mitarbeiterId: 'm3',
      von: plusTage(heute, 21),
      bis: plusTage(heute, 32),
      tage: 10,
      grund: '',
      status: 'genehmigt',
      eingereichtAm: plusTage(heute, -30),
      entschiedenVon: 'Nadja Wolf',
      entschiedenAm: plusTage(heute, -28),
      ablehnungsgrund: '',
      unterschrift: true,
    },
    {
      // Liegt bewusst im selben Zeitraum wie u1: Wer u1 entscheidet, muss
      // sehen, dass dann zwei behandelnde Personen gleichzeitig fehlen.
      id: 'u6',
      mitarbeiterId: 'm4',
      von: plusTage(heute, 2),
      bis: plusTage(heute, 6),
      tage: 3,
      grund: '',
      status: 'genehmigt',
      eingereichtAm: plusTage(heute, -14),
      entschiedenVon: 'Nadja Wolf',
      entschiedenAm: plusTage(heute, -13),
      ablehnungsgrund: '',
      unterschrift: true,
    },
    {
      id: 'u3',
      mitarbeiterId: 'm6',
      von: plusTage(heute, 9),
      bis: plusTage(heute, 10),
      tage: 2,
      grund: 'Umzug',
      status: 'beantragt',
      eingereichtAm: plusTage(heute, -1),
      entschiedenVon: '',
      entschiedenAm: '',
      ablehnungsgrund: '',
      unterschrift: false,
    },
    {
      id: 'u4',
      mitarbeiterId: 'm4',
      von: plusTage(heute, -20),
      bis: plusTage(heute, -16),
      tage: 5,
      grund: '',
      status: 'abgelehnt',
      eingereichtAm: plusTage(heute, -40),
      entschiedenVon: 'Nadja Wolf',
      entschiedenAm: plusTage(heute, -38),
      ablehnungsgrund: 'Zeitraum bereits durch zwei Abwesenheiten belegt.',
      unterschrift: false,
    },
    {
      id: 'u5',
      mitarbeiterId: 'm7',
      von: plusTage(heute, 45),
      bis: plusTage(heute, 52),
      tage: 6,
      grund: '',
      status: 'genehmigt',
      eingereichtAm: plusTage(heute, -10),
      entschiedenVon: 'Miriam Falk',
      entschiedenAm: plusTage(heute, -9),
      ablehnungsgrund: '',
      unterschrift: true,
    },
  ];
}

export function demoZeitbuchungen(heute: string): Zeitbuchung[] {
  return [
    {
      id: 'z1',
      mitarbeiterId: 'm3',
      art: 'geleistet',
      datum: plusTage(heute, -12),
      stunden: 2.5,
      grund: 'Vertretung Hausbesuche',
    },
    {
      id: 'z2',
      mitarbeiterId: 'm3',
      art: 'abgebaut',
      datum: plusTage(heute, -5),
      stunden: 4,
      grund: '',
    },
    {
      id: 'z3',
      mitarbeiterId: 'm4',
      art: 'geleistet',
      datum: plusTage(heute, -8),
      stunden: 1.5,
      grund: 'Später Hausbesuch',
    },
    {
      id: 'z4',
      mitarbeiterId: 'm5',
      art: 'geleistet',
      datum: plusTage(heute, -3),
      stunden: 3,
      grund: 'Teamabend',
    },
    {
      id: 'z5',
      mitarbeiterId: 'm5',
      art: 'geleistet',
      datum: plusTage(heute, -1),
      stunden: 1,
      grund: '',
    },
    {
      id: 'z6',
      mitarbeiterId: 'm7',
      art: 'abgebaut',
      datum: plusTage(heute, -2),
      stunden: 8,
      grund: 'Brückentag',
    },
    {
      id: 'z7',
      mitarbeiterId: 'm6',
      art: 'geleistet',
      datum: plusTage(heute, -6),
      stunden: 0.75,
      grund: 'Übergabe',
    },
  ];
}

export function demoErstattungen(heute: string): Erstattung[] {
  const monat = heute.slice(0, 7);
  const vormonat = plusTage(`${monat}-01`, -1).slice(0, 7);
  return [
    {
      id: 'e1',
      mitarbeiterId: 'm3',
      art: 'strom',
      iban: 'DE02 1001 0010 0000 0000 01',
      zeitraumVon: vormonat,
      zeitraumBis: vormonat,
      arbeitstage: 18,
      positionen: [],
      belege: 0,
      notiz: '',
      unterschrift: true,
      stand: 'genehmigt',
      eingereichtAm: plusTage(heute, -12),
      entschiedenVon: 'Miriam Falk',
      entschiedenAm: plusTage(heute, -9),
      ausgezahltAm: '',
      ablehnungsgrund: '',
    },
    {
      id: 'e2',
      mitarbeiterId: 'm5',
      art: 'einkauf',
      iban: 'DE02 1001 0010 0000 0000 05',
      zeitraumVon: '',
      zeitraumBis: '',
      arbeitstage: 0,
      positionen: [
        { id: 'p1', bezeichnung: 'Handdesinfektion 2x', betragCent: 1798 },
        { id: 'p2', bezeichnung: 'Massageöl', betragCent: 1249 },
      ],
      belege: 1,
      notiz: 'Beleg der Apotheke.',
      unterschrift: false,
      stand: 'eingereicht',
      eingereichtAm: plusTage(heute, -2),
      entschiedenVon: '',
      entschiedenAm: '',
      ausgezahltAm: '',
      ablehnungsgrund: '',
    },
    {
      id: 'e3',
      mitarbeiterId: 'm4',
      art: 'strom',
      iban: 'DE02 1001 0010 0000 0000 04',
      zeitraumVon: plusTage(`${vormonat}-01`, -1).slice(0, 7),
      zeitraumBis: vormonat,
      arbeitstage: 34,
      positionen: [],
      belege: 0,
      notiz: 'Zwei Monate zusammen eingereicht.',
      unterschrift: true,
      stand: 'ausgezahlt',
      eingereichtAm: plusTage(heute, -35),
      entschiedenVon: 'Miriam Falk',
      entschiedenAm: plusTage(heute, -32),
      ausgezahltAm: plusTage(heute, -28),
      ablehnungsgrund: '',
    },
    {
      id: 'e4',
      mitarbeiterId: 'm6',
      art: 'einkauf',
      iban: 'DE02 1001 0010 0000 0000 06',
      zeitraumVon: '',
      zeitraumBis: '',
      arbeitstage: 0,
      positionen: [{ id: 'p3', bezeichnung: 'Fahrradschloss', betragCent: 3990 }],
      belege: 0,
      notiz: '',
      unterschrift: false,
      stand: 'abgelehnt',
      eingereichtAm: plusTage(heute, -20),
      entschiedenVon: 'Miriam Falk',
      entschiedenAm: plusTage(heute, -18),
      ausgezahltAm: '',
      ablehnungsgrund: 'Beleg fehlt. Bitte mit lesbarem Beleg erneut einreichen.',
    },
  ];
}

export const demoKanaele: Kanal[] = [
  {
    id: 'k1',
    name: 'Allgemein',
    beschreibung: 'Organisatorisches für das ganze Team. Keine klinischen Inhalte.',
    art: 'kanal',
    mitgliedIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
  },
  {
    id: 'k2',
    name: 'Flotte',
    beschreibung: 'Räder, Schlüssel, Pannen und Wartung.',
    art: 'kanal',
    mitgliedIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
  },
  {
    id: 'k3',
    name: 'Vertretungen',
    beschreibung: 'Kurzfristige Einsatzänderungen. Keine Diagnosen, keine Freitexte aus der Akte.',
    art: 'kanal',
    mitgliedIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
  },
  {
    id: 'k4',
    name: 'Nadja Wolf',
    beschreibung: 'Direktnachricht',
    art: 'direkt',
    mitgliedIds: ['m2'],
  },
];

export function demoNachrichten(heute: string): Nachricht[] {
  return [
    {
      id: 'n1',
      kanalId: 'k2',
      autorId: 'm6',
      zeitpunkt: zeitpunkt(plusTage(heute, -1), '14:12'),
      text: 'Lastenrad 4 hat unterwegs die Kette verloren. Meldung ist im Pannenassistenten erfasst.',
      threadVon: null,
      erwaehnungen: [],
      bezug: { art: 'panne', label: 'Panne Lastenrad 4' },
      gelesen: true,
    },
    {
      id: 'n2',
      kanalId: 'k2',
      autorId: 'm2',
      zeitpunkt: zeitpunkt(plusTage(heute, -1), '14:31'),
      text: 'Danke. Ersatzrad ist dir zugeordnet, das gesperrte Rad bleibt bis zur Freigabe raus.',
      threadVon: 'n1',
      erwaehnungen: ['m6'],
      bezug: null,
      gelesen: true,
    },
    {
      id: 'n3',
      kanalId: 'k3',
      autorId: 'm7',
      zeitpunkt: zeitpunkt(heute, '08:05'),
      text: 'Für den Nachmittag suche ich noch eine Vertretung für zwei Hausbesuche.',
      threadVon: null,
      erwaehnungen: [],
      bezug: { art: 'tour', label: 'Tour Nachmittag' },
      gelesen: false,
    },
    {
      id: 'n4',
      kanalId: 'k1',
      autorId: 'm1',
      zeitpunkt: zeitpunkt(plusTage(heute, -2), '17:40'),
      text: 'Die Belege für den Monat bitte bis Freitag einreichen.',
      threadVon: null,
      erwaehnungen: [],
      bezug: null,
      gelesen: true,
    },
    {
      id: 'n5',
      kanalId: 'k4',
      autorId: 'm2',
      zeitpunkt: zeitpunkt(heute, '09:15'),
      text: 'Kannst du morgen den ersten Besuch übernehmen? Ich melde mich gleich zur Übergabe.',
      threadVon: null,
      erwaehnungen: [],
      bezug: { art: 'termin', label: 'Besuch morgen 08:30' },
      gelesen: false,
    },
  ];
}

export function demoTouren(heute: string): Tour[] {
  return [
    {
      id: 't1',
      mitarbeiterId: 'm3',
      datum: heute,
      stopps: [
        {
          id: 's1',
          art: 'start',
          beginn: '07:45',
          dauerMinuten: 15,
          titel: 'Start am Raddepot Nord',
          ort: 'Raddepot Nord',
          wegMinuten: null,
          wegHerkunft: 'offen',
        },
        {
          id: 's2',
          art: 'besuch',
          beginn: '08:30',
          dauerMinuten: 45,
          titel: 'Hausbesuch A. Musterfrau',
          ort: 'Nordstadt',
          wegMinuten: 18,
          wegHerkunft: 'geschaetzt',
        },
        {
          id: 's3',
          art: 'besuch',
          beginn: '09:45',
          dauerMinuten: 45,
          titel: 'Hausbesuch B. Beispiel',
          ort: 'Weststadt',
          wegMinuten: 22,
          wegHerkunft: 'geschaetzt',
        },
        {
          id: 's4',
          art: 'pause',
          beginn: '10:45',
          dauerMinuten: 30,
          titel: 'Pause',
          ort: '–',
          wegMinuten: 8,
          wegHerkunft: 'geschaetzt',
        },
        {
          id: 's5',
          art: 'besuch',
          beginn: '11:30',
          dauerMinuten: 45,
          titel: 'Hausbesuch C. Probst',
          ort: 'Südstadt',
          wegMinuten: 25,
          wegHerkunft: 'offen',
        },
        {
          id: 's6',
          art: 'ende',
          beginn: '12:45',
          dauerMinuten: 0,
          titel: 'Rückweg zum Raddepot Nord',
          ort: 'Raddepot Nord',
          wegMinuten: 20,
          wegHerkunft: 'geschaetzt',
        },
      ],
    },
  ];
}

export const demoKatalog: Katalogleistung[] = [
  {
    id: 'l1',
    bezeichnung: 'Krankengymnastik Hausbesuch (45 min)',
    version: 3,
    gueltigAb: '2026-01-01',
    preisCent: 8500,
    dauerMinuten: 45,
    steuerhinweis: 'Umsatzsteuerfrei nach § 4 Nr. 14a UStG – je Leistungsversion zu prüfen.',
  },
  {
    id: 'l2',
    bezeichnung: 'Manuelle Therapie Hausbesuch (45 min)',
    version: 3,
    gueltigAb: '2026-01-01',
    preisCent: 9500,
    dauerMinuten: 45,
    steuerhinweis: 'Umsatzsteuerfrei nach § 4 Nr. 14a UStG – je Leistungsversion zu prüfen.',
  },
  {
    id: 'l3',
    bezeichnung: 'Wegepauschale Hausbesuch',
    version: 2,
    gueltigAb: '2026-01-01',
    preisCent: 1200,
    dauerMinuten: 0,
    steuerhinweis: 'Steuerliche Einordnung offen – vor Produktivstart klären.',
  },
  {
    id: 'l4',
    bezeichnung: 'Erstbefund (60 min)',
    version: 1,
    gueltigAb: '2025-07-01',
    preisCent: 11000,
    dauerMinuten: 60,
    steuerhinweis: 'Umsatzsteuerfrei nach § 4 Nr. 14a UStG – je Leistungsversion zu prüfen.',
  },
];

export function demoLeistungen(heute: string): ErbrachteLeistung[] {
  return [
    {
      id: 'el1',
      datum: plusTage(heute, -7),
      patient: 'A. Musterfrau',
      leistungId: 'l1',
      mitarbeiterId: 'm3',
      stand: 'abgerechnet',
      dokumentationFinalisiert: true,
    },
    {
      id: 'el2',
      datum: plusTage(heute, -7),
      patient: 'A. Musterfrau',
      leistungId: 'l3',
      mitarbeiterId: 'm3',
      stand: 'abgerechnet',
      dokumentationFinalisiert: true,
    },
    {
      id: 'el3',
      datum: plusTage(heute, -3),
      patient: 'B. Beispiel',
      leistungId: 'l2',
      mitarbeiterId: 'm4',
      stand: 'abrechenbar',
      dokumentationFinalisiert: true,
    },
    {
      id: 'el4',
      datum: plusTage(heute, -3),
      patient: 'B. Beispiel',
      leistungId: 'l3',
      mitarbeiterId: 'm4',
      stand: 'abrechenbar',
      dokumentationFinalisiert: true,
    },
    {
      id: 'el5',
      datum: plusTage(heute, -1),
      patient: 'C. Probst',
      leistungId: 'l4',
      mitarbeiterId: 'm5',
      stand: 'offen',
      dokumentationFinalisiert: false,
    },
    {
      id: 'el6',
      datum: heute,
      patient: 'D. Wendt',
      leistungId: 'l1',
      mitarbeiterId: 'm3',
      stand: 'offen',
      dokumentationFinalisiert: false,
    },
  ];
}

export function demoRechnungen(heute: string): Rechnung[] {
  return [
    {
      id: 'rg1',
      nummer: '2026-0148',
      empfaenger: 'A. Musterfrau',
      patient: 'A. Musterfrau',
      datum: plusTage(heute, -5),
      betragCent: 9700,
      offenCent: 0,
      stand: 'bezahlt',
      leistungIds: ['el1', 'el2'],
    },
    {
      id: 'rg2',
      nummer: '2026-0149',
      empfaenger: 'Krankenkasse Beihilfe (Beispiel)',
      patient: 'E. Kunert',
      datum: plusTage(heute, -4),
      betragCent: 21400,
      offenCent: 10700,
      stand: 'ausgestellt',
      leistungIds: [],
    },
    {
      id: 'rg3',
      nummer: null,
      empfaenger: 'B. Beispiel',
      patient: 'B. Beispiel',
      datum: heute,
      betragCent: 10700,
      offenCent: 10700,
      stand: 'entwurf',
      leistungIds: ['el3', 'el4'],
    },
  ];
}

export function demoZahlungen(heute: string): Zahlung[] {
  return [
    {
      id: 'za1',
      rechnungId: 'rg1',
      datum: plusTage(heute, -2),
      betragCent: 9700,
      art: 'Überweisung',
    },
    {
      id: 'za2',
      rechnungId: 'rg2',
      datum: plusTage(heute, -1),
      betragCent: 10700,
      art: 'Überweisung',
    },
  ];
}
