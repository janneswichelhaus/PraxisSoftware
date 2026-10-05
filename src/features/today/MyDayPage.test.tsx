import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type * as AppointmentsApiModule from '@/features/appointments/api';
import type * as AbrechnungslageModule from '@/features/appointments/abrechnungslage-api';
import type * as TodayApiModule from '@/features/today/api';
import type * as TagesrouteModule from '@/features/tours/tagesroute';
import type * as StartortModule from '@/features/tours/startort';
import type * as FunktionModule from '@/lib/location/funktion';
import { renderMitVorschau, testUser } from '@/test-utils';
import { todayInTimeZone } from '@/features/appointments/api';
import { tagePlus } from '@/features/appointments/calendar';
import { MyDayPage } from './MyDayPage';

/**
 * Die Übersicht mischt bewusst zwei Dinge: echte Termine aus dem Kalender und
 * Hinweise aus Bereichen, die noch keine Anbindung haben. Geprüft wird, dass
 * beides unterscheidbar bleibt, dass die eigenen Besuche nicht über den
 * Anzeigenamen, sondern über die Beschäftigtenkennung gefunden werden, und
 * seit UX-001, dass die Tagesliste die Angaben trägt, an denen ein Hausbesuch
 * sonst scheitert.
 *
 * Seit dem Design-Handoff vom 2026-10-01 steht der eigene Tag als Zeitstrahl
 * da. Die Zeiten der Testdaten sind deshalb **relativ zu jetzt**: Ob eine
 * Karte „Navigation starten" oder Haken und „Doku" trägt, hängt
 * daran, ob der Besuch schon begonnen hat.
 */

// Dieselbe Kennung, die `testUser` einer Praxisrolle gibt.
const EIGENE_STAFF_ID = '55555555-5555-4555-8555-000000000002';
const FREMDE_STAFF_ID = 'staff-fremde';
const HEUTE = '2026-08-31';
const ZONE = 'Europe/Berlin';

/** Ein Zeitpunkt relativ zu jetzt. */
function inMinuten(minuten: number): string {
  return new Date(Date.now() + minuten * 60 * 1000).toISOString();
}

/** Die Uhrzeit eines Zeitpunkts in der Zeit der Praxis, wie die Seite sie zeigt. */
function uhr(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  }).format(new Date(iso));
}

function termin(teil: Partial<AppointmentsApiModule.CalendarEntry>) {
  return {
    id: 'termin-1',
    patient_id: 'p1',
    staff_member_id: EIGENE_STAFF_ID,
    location_id: null,
    appointment_type: 'home_visit' as const,
    kind: 'therapy' as const,
    title: null,
    status: 'confirmed' as const,
    starts_at: `${HEUTE}T08:00:00.000Z`,
    ends_at: `${HEUTE}T08:45:00.000Z`,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    ...teil,
  };
}

const termine = [
  termin({ id: 't1' }),
  termin({
    id: 't2',
    staff_member_id: FREMDE_STAFF_ID,
    starts_at: `${HEUTE}T10:00:00.000Z`,
    ends_at: `${HEUTE}T10:45:00.000Z`,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Olivia',
    staff_family_name: 'Office',
  }),
];

/** Ein Besuch, der in einer Stunde beginnt - er „wartet". */
function tagesEintrag(teil: Partial<TodayApiModule.DayPlanEntry>): TodayApiModule.DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: EIGENE_STAFF_ID,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: inMinuten(60),
    ends_at: inMinuten(105),
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: '+49 7071 0000006',
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: 'Erdgeschoss, Klingel "Beispiel".',
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: ZONE,
    ...teil,
  };
}

/** Der zweite Besuch des Tages, zwei Stunden nach dem ersten. */
function zweiterBesuch(
  teil: Partial<TodayApiModule.DayPlanEntry> = {},
): TodayApiModule.DayPlanEntry {
  return tagesEintrag({
    id: 't2',
    patient_id: 'p2',
    starts_at: inMinuten(180),
    ends_at: inMinuten(225),
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    home_visit_access_note: null,
    ...teil,
  });
}

/** Ein offener Besuch in einer Stunde, davor ein erledigter mit festgeschriebener Doku. */
function tagesplan(): TodayApiModule.DayPlanEntry[] {
  return [
    tagesEintrag({ id: 't1' }),
    tagesEintrag({
      id: 't3',
      patient_id: 'p3',
      starts_at: inMinuten(-180),
      ends_at: inMinuten(-135),
      status: 'completed',
      documentation_status: 'final',
      patient_given_name: 'Petra',
      patient_family_name: 'Platzhalter',
      visit_street: 'Fiktivgasse',
      visit_house_number: '9',
      visit_postal_code: '72074',
      home_visit_access_note: null,
    }),
  ];
}

const fetchDayPlan = vi.fn();

vi.mock('@/features/today/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TodayApiModule>();
  return {
    ...actual,
    fetchDayPlan: (tag: string, person: string) =>
      fetchDayPlan(tag, person) as Promise<TodayApiModule.DayPlanEntry[]>,
  };
});

/**
 * Haelt den abgefragten Zeitbereich fest.
 *
 * Der Bereich war lange falsch (`von` und `bis` derselbe Tag) und ist es
 * niemandem aufgefallen, weil dieser Ersatz die Argumente gar nicht ansah.
 */
const fetchAppointments = vi.fn();
const fetchAppointment = vi.fn();
const completeAppointment = vi.fn();

// PRX-013: offene Erstaufnahmen; ohne Angabe keine.
const fetchOpenIntakes = vi.fn(() => Promise.resolve([] as unknown[]));
vi.mock('@/features/open-points/intake-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOpenIntakes: () => fetchOpenIntakes(),
}));

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApiModule>();
  return {
    ...actual,
    fetchAppointments: (query: AppointmentsApiModule.CalendarQuery) =>
      fetchAppointments(query) as Promise<AppointmentsApiModule.CalendarEntry[]>,
    fetchAppointment: (id: string) => fetchAppointment(id) as Promise<unknown>,
    completeAppointment: (id: string, stand: string) =>
      completeAppointment(id, stand) as Promise<void>,
  };
});

// PRX-008: „Termin n von m" an der ausgeklappten Karte; ohne Angabe keiner.
const fetchAbrechnungslage = vi.fn();
vi.mock('@/features/appointments/abrechnungslage-api', async (importOriginal) => ({
  ...(await importOriginal<typeof AbrechnungslageModule>()),
  fetchAbrechnungslage: (id: string) =>
    fetchAbrechnungslage(id) as Promise<AbrechnungslageModule.Abrechnungslage | null>,
}));

// Fahrzeiten (ANN-194): Tagesroute, Startort und die Route über die eigene
// Function. Ohne Angabe gibt es keine Punkte - und damit keine Route.
const fetchDayRoute = vi.fn();
vi.mock('@/features/tours/tagesroute', async (importOriginal) => ({
  ...(await importOriginal<typeof TagesrouteModule>()),
  fetchDayRoute: (datum: string, person: string) =>
    fetchDayRoute(datum, person) as Promise<TagesrouteModule.Tagesstopp[]>,
}));
const fetchStandorte = vi.fn();
vi.mock('@/features/tours/startort', async (importOriginal) => ({
  ...(await importOriginal<typeof StartortModule>()),
  fetchStandorte: () => fetchStandorte() as Promise<StartortModule.Standort[]>,
}));
const rufeFunktionAuf = vi.fn();
vi.mock('@/lib/location/funktion', async (importOriginal) => ({
  ...(await importOriginal<typeof FunktionModule>()),
  rufeFunktionAuf: (aufgabe: string, koerper: unknown) =>
    rufeFunktionAuf(aufgabe, koerper) as Promise<unknown>,
}));
// UBK-010: Fahrzeitfaktor 1,0 - die Zahlen des Kartendienstes bleiben
// stehen; der Faktor selbst ist in `fahrzeitfaktor.test.ts` geprüft.
vi.mock('@/features/tours/fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => Promise.resolve(1),
  saveFahrzeitfaktor: () => Promise.resolve(),
}));

/** Ein Punkt der Tagesroute zu einem Eintrag der Tagesliste. */
function routenpunkt(
  eintrag: TodayApiModule.DayPlanEntry,
  lat: number,
  lon: number,
): TagesrouteModule.Tagesstopp {
  return {
    id: eintrag.id,
    kind: eintrag.kind,
    appointment_type: 'home_visit',
    status: eintrag.status,
    starts_at: eintrag.starts_at,
    ends_at: eintrag.ends_at,
    lat,
    lon,
    geocode_precision: 'address',
    position_source: 'visit',
  };
}

const STANDORT: StartortModule.Standort = {
  id: 'l1',
  name: 'Hauptstandort',
  street: 'Praxisweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
  lat: 48.52,
  lon: 9.05,
  geocode_precision: 'address',
};

/** Die Antwort der Function: eine Route mit Abschnitten in Minuten. */
function route(quelle: 'anbieter' | 'nachbildung', ...minuten: number[]) {
  return {
    ok: true,
    quelle,
    value: {
      distanceMeters: 5000,
      durationSeconds: minuten.reduce((summe, m) => summe + m * 60, 0),
      legs: minuten.map((m) => ({ distanceMeters: m * 200, durationSeconds: m * 60 })),
      geometry: [],
    },
  };
}

/**
 * Eigener Aufbau mit festgehaltenem QueryClient.
 *
 * `renderMitVorschau` legt je Aufruf einen neuen an; fuer den Tagesplan-Cache
 * (UX-011) wird aber genau der gemeinsame Speicher gebraucht, ueber den ein
 * zweiter, gescheiterter Abruf laeuft.
 */
function rendernMitCache(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VorschauProvider>
          <MyDayPage user={testUser(['therapist'])} />
        </VorschauProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Der Zeitstrahl des eigenen Tages. Dieselben Namen stehen auch im Tagesplan
 * des Teams daneben - gesucht wird deshalb im Strahl.
 */
function imStrahl() {
  return within(screen.getByRole('heading', { name: 'Tagesablauf' }).closest('section')!);
}

/** Eine Zeile im Strahl, sobald sie da ist. */
async function imStrahlFinden(name: RegExp): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: 'Tagesablauf' });
  return await waitFor(() => imStrahl().getByRole('link', { name }));
}

/** Die ausgeklappte Karte des Zeitstrahls. */
async function findeKarte(): Promise<HTMLElement> {
  return await screen.findByRole('article');
}

describe('Übersicht', () => {
  beforeEach(() => {
    fetchDayPlan.mockReset();
    fetchDayPlan.mockResolvedValue(tagesplan());
    fetchAppointments.mockReset();
    fetchAppointments.mockResolvedValue(termine);
    fetchAbrechnungslage.mockReset();
    fetchAbrechnungslage.mockResolvedValue(null);
    fetchDayRoute.mockReset();
    fetchDayRoute.mockResolvedValue([]);
    fetchStandorte.mockReset();
    fetchStandorte.mockResolvedValue([]);
    rufeFunktionAuf.mockReset();
    fetchOpenIntakes.mockClear();
  });

  it('fragt den Tagesplan des Teams als halboffenen Bereich ab', async () => {
    // `list_appointments` weist `p_to <= p_from` mit "to must be after from"
    // zurueck. Genau das stand hier: derselbe Tag zweimal - der Abschnitt
    // zeigte dauerhaft "Die Termine konnten nicht geladen werden".
    renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });

    const query = fetchAppointments.mock.calls[0]?.[0] as
      AppointmentsApiModule.CalendarQuery | undefined;
    expect(query).toBeDefined();
    expect(query!.bis > query!.von).toBe(true);
    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.queryByText('Der Tagesplan des Teams konnte nicht geladen werden.')).toBeNull();
  });

  it('sagt an der Karte, dass zur Erstaufnahme noch etwas fehlt (PRX-013)', async () => {
    fetchOpenIntakes.mockResolvedValueOnce([
      {
        patient_id: 'p1',
        patient_given_name: 'Erika',
        patient_family_name: 'Beispiel',
        open_items: ['prescription_photo', 'registration_form'],
      },
    ]);
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    // Die Pille sagt, dass etwas fehlt, und führt in die Akte; was fehlt,
    // hört Vorlesesoftware gleich mit.
    const pille = await screen.findByRole('link', {
      name: 'Erstaufnahme offen: Verordnungsfoto · Anmeldebogen',
    });
    expect(pille).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
    expect(within(await findeKarte()).getByRole('link', { name: /Erstaufnahme offen/ })).toBe(
      pille,
    );
  });

  it('trennt Doku und Abschluss: ein Doku-Knopf, der Haken schließt ab (Handoff 6a, AKTE-008)', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    // Genau ein Doku-Knopf (Jannes 2026-10-03): Er führt in die Doku der
    // Akte, mit diesem Termin oben. Der Name beginnt mit dem sichtbaren Wort,
    // damit die Sprachsteuerung „Doku" trifft (UEB-10, WCAG 2.5.3).
    expect(within(karte).getAllByRole('link', { name: /^Doku/ })).toHaveLength(1);
    expect(within(karte).queryByRole('link', { name: /Bisherige/ })).toBeNull();
    const doku = within(karte).getByRole('link', { name: 'Doku zu diesem Termin' });
    // Mit Rueckweg auf die Uebersicht (UX-012).
    expect(doku).toHaveAttribute(
      'href',
      `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`,
    );
    expect(doku).not.toHaveAttribute('aria-label');
    // Sichtbar bleibt es kurz: Der Rest steht nur für Vorlesesoftware da.
    expect(doku.firstChild?.textContent?.trim()).toBe('Doku');
    expect(doku.querySelector('.sr-only')).toHaveTextContent('zu diesem Termin');
    // Sekundär und kompakt, 44 px hoch.
    expect(doku.className).not.toContain('bg-accent ');

    // Vor dem Beginn steht der Haken als Symbolknopf neben „Doku", unter der
    // Navigation: ein Knopf, kein Weg - er schließt ab, ohne zu dokumentieren.
    const haken = within(karte).getByRole('button', { name: 'Behandlung abschließen' });
    expect(haken).toHaveAttribute('title', 'Behandlung abschließen');
    expect(haken.className).not.toContain('bg-accent ');
    expect(haken).toHaveClass('size-11');
    const reihe = haken.parentElement!;
    expect(reihe).toHaveClass('grid', 'grid-cols-[minmax(0,1fr)_44px]', 'gap-2');
    expect(reihe).toContainElement(doku);
    const navigation = within(karte).getByRole('button', { name: 'Navigation starten' });
    expect(
      navigation.compareDocumentPosition(reihe) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('schließt mit dem Haken ab, ohne zu dokumentieren, und meldet „Doku offen"', async () => {
    fetchAppointment.mockResolvedValue({ id: 't1', updated_at: '2026-10-01T06:00:00Z' });
    completeAppointment.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    await user.click(within(karte).getByRole('button', { name: 'Behandlung abschließen' }));

    // Der Stand wird unmittelbar vorher gelesen - die Tagesliste kennt ihn nicht.
    await waitFor(() =>
      expect(completeAppointment).toHaveBeenCalledWith('t1', '2026-10-01T06:00:00Z'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/abgeschlossen. Doku offen./);
  });

  it('zeigt einen abgewiesenen Abschluss als Fehler', async () => {
    fetchAppointment.mockResolvedValue({ id: 't1', updated_at: '2026-10-01T06:00:00Z' });
    completeAppointment.mockRejectedValue(new Error('Der Termin wurde inzwischen geändert.'));
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    await user.click(within(karte).getByRole('button', { name: 'Behandlung abschließen' }));

    expect(await screen.findByText('Der Termin wurde inzwischen geändert.')).toBeInTheDocument();
  });

  it('stellt den eigenen Tag vor den Tagesplan des Teams', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const tagesablauf = await screen.findByRole('heading', { name: 'Tagesablauf' });
    const teamplan = screen.getByRole('heading', { name: 'Tagesplan des Teams' });
    expect(
      tagesablauf.compareDocumentPosition(teamplan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('zaehlt im Kopf, was erledigt ist, und laesst Erledigtes an seiner Stelle stehen', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    // Ein offener Besuch, ein abgeschlossener mit finalisierter Dokumentation.
    expect(await screen.findByText('1 von 2 Besuchen erledigt')).toBeInTheDocument();
    // Der Zeitstrahl ersetzt „Offen heute" und „Erledigt heute".
    expect(screen.queryByText(/^Offen heute/)).toBeNull();
    expect(screen.queryByText(/^Erledigt heute/)).toBeNull();
    const erledigt = imStrahl().getByRole('link', { name: /Petra Platzhalter/ });
    expect(within(erledigt).getByText('Abgeschlossen')).toBeInTheDocument();
    expect(erledigt).toHaveAttribute(
      'href',
      `/kalender?termin=t3&zurueck=${encodeURIComponent('/')}`,
    );
  });

  it('traegt Anschrift und Rufnummer als Waehlziel, den Zugangshinweis einen Tipp entfernt', async () => {
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    expect(within(karte).getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    // Etage, Zugang und Nummer stehen nicht offen da (AKTE-008) - keine
    // Etagen-Pille, ein Tipp auf (i) zeigt alles.
    expect(within(karte).queryByText('Erdgeschoss')).toBeNull();
    expect(within(karte).queryByText('Klingel "Beispiel".')).toBeNull();
    await user.click(within(karte).getByRole('button', { name: 'Etage, Zugang und Kontakt' }));
    expect(within(karte).getByText('Erdgeschoss')).toBeInTheDocument();
    expect(within(karte).getByText('Klingel "Beispiel".')).toBeInTheDocument();

    // Kontakt ist Aktion, nicht Text: die Nummer waehlt, statt nur dazustehen.
    const mobil = within(karte).getByRole('link', { name: '+49 160 0000006' });
    expect(mobil).toHaveAttribute('href', 'tel:+491600000006');
  });

  it('zeigt den Tagesplan des Teams weiterhin ohne Anschrift', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

    const teamplan = (await screen.findByRole('heading', { name: 'Tagesplan des Teams' })).closest(
      'section',
    )!;
    expect(await within(teamplan).findByText('Max Mustermann')).toBeInTheDocument();
    expect(within(teamplan).queryByText(/Testweg 7/)).toBeNull();
  });

  it('ist kein Begruessungsbildschirm mit Patientenzaehler', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
    expect(screen.queryByText(/Personen in laufender Versorgung/)).toBeNull();
  });

  /**
   * Die Kennzeichnung „Vorschau" am Aufklapper ist am 2026-09-22 gefallen. Was
   * bleibt, ist die Reihenfolge aus UX-001: Der echte Teil des Tages steht
   * davor, der Rest zugeklappt dahinter — das war nie eine Kennzeichnung,
   * sondern die Rangfolge auf dem Bildschirm.
   */
  it('haelt den noch nicht angebundenen Teil zusammengefaltet', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const ueberschrift = await screen.findByRole('heading', {
      name: 'Organisatorisches und Kommunikation',
    });
    expect(ueberschrift).toBeInTheDocument();
    expect(ueberschrift.closest('details')).not.toHaveAttribute('open');
    // Hinter dem eigenen Tag und dem Plan des Teams.
    expect(
      screen
        .getByRole('heading', { name: 'Tagesplan des Teams' })
        .compareDocumentPosition(ueberschrift) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('benennt die Demoperson, der die Vorschaudaten gehoeren', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.getByText(/zur Rolle passend gewählt/)).toBeInTheDocument();
  });

  it('zeigt keine geschaetzten Wegzeiten mehr - die Wege sind seit MAP-006 echt', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.queryByText(/Wegzeiten sind geschätzt/)).toBeNull();
  });

  it('bietet den schnellen Weg zur Pannenmeldung', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    expect(await screen.findByRole('link', { name: 'Panne melden' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/panne',
    );
  });

  it('zeigt Leitungsrollen ihre Freigabeaufgaben', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['team_lead'])} />);
    expect(await screen.findByText('Zu entscheiden')).toBeInTheDocument();
  });

  it('zeigt einer behandelnden Rolle keine Freigabeaufgaben', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.queryByText('Zu entscheiden')).toBeNull();
  });

  it('zeigt einem Patientenkonto weder Termine noch Betriebsbereiche', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
    expect(await screen.findByRole('heading', { name: 'Ihr Zugang' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tagesplan des Teams' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Organisatorisches und Kommunikation' }),
    ).toBeNull();
    // Und es fragt dafür auch nichts ab.
    expect(fetchDayPlan).not.toHaveBeenCalled();
    expect(fetchAppointments).not.toHaveBeenCalled();
    expect(fetchDayRoute).not.toHaveBeenCalled();
  });

  describe('UX-011: Tagesplan bleibt lesbar', () => {
    it('zeigt den zuletzt geladenen Stand weiter, wenn die Abfrage scheitert', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rendernMitCache(queryClient);
      expect(await screen.findByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();

      // Das Funkloch im Treppenhaus: der naechste Abruf scheitert.
      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ['day-plan'] });
      });

      const meldung = await screen.findByText(/Angezeigt wird der Stand von/);
      // Auf der Warnfläche, damit sie über dem Tag nicht untergeht.
      expect(meldung.parentElement).toHaveClass('bg-warnung-soft', 'rounded-card');
      // Entscheidend: die Anschrift steht noch da - und der Weg zum Hinweis.
      expect(screen.getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' })).toBeInTheDocument();
    });

    it('aktualisiert den alten Stand ueber die Abfrage, nicht ueber ein Neuladen (UEB-05)', async () => {
      const user = userEvent.setup();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rendernMitCache(queryClient);
      await screen.findByText('Testweg 7, 72072 Tuebingen');

      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ['day-plan'] });
      });
      const meldung = await screen.findByText(/Angezeigt wird der Stand von/);
      // Kein Satz, der nichts sagt, und kein Rat, die Seite neu zu laden
      // (UEB-11, ANN-021).
      expect(meldung).not.toHaveTextContent(/Geschrieben wird|neu laden/);

      fetchDayPlan.mockResolvedValue(tagesplan());
      await user.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));

      await waitFor(() => expect(screen.queryByText(/Angezeigt wird der Stand von/)).toBeNull());
      expect(screen.getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    });

    it('zeigt ohne jeden Stand die Fehlermeldung statt einer leeren Liste', async () => {
      const user = userEvent.setup();
      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const fehler = (
        await screen.findByText('Die Tagesliste konnte nicht geladen werden.')
      ).closest('[role="alert"]')!;
      // Was zu tun ist, ohne Ratefrage (WRT-01) - und ein Weg hinaus, der die
      // Seite stehen lässt (ZST-04).
      expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
      expect(fehler).not.toHaveTextContent(/angemeldet/);
      // Ohne Stand weder Zeitstrahl noch Tagesabschluss.
      expect(screen.queryByRole('heading', { name: 'Tagesablauf' })).toBeNull();
      expect(screen.queryByText('Alle Besuche erledigt')).toBeNull();

      fetchDayPlan.mockResolvedValue(tagesplan());
      await user.click(
        within(fehler as HTMLElement).getByRole('button', { name: 'Erneut versuchen' }),
      );
      expect(await screen.findByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    });

    it('behauptet bei frischem Stand nichts ueber sein Alter', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Testweg 7, 72072 Tuebingen');
      expect(screen.queryByText(/Angezeigt wird der Stand von/)).toBeNull();
    });

    it('haelt beim Laden den Platz von Liege-Zeile und Wegbalken frei', async () => {
      let liefern: (wert: TodayApiModule.DayPlanEntry[]) => void = () => undefined;
      fetchDayPlan.mockReturnValue(
        new Promise<TodayApiModule.DayPlanEntry[]>((resolve) => {
          liefern = resolve;
        }),
      );
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText('Tagesliste wird geladen …')).toHaveAttribute(
        'role',
        'status',
      );
      // Zwei leere Flächen in Zielgröße, für Vorlesesoftware ausgeblendet.
      const geruest = container.querySelector('[aria-hidden="true"] > .h-13')!.parentElement!;
      expect(geruest.children).toHaveLength(2);
      expect(geruest.children[1]).toHaveClass('h-30', 'bg-surface', 'border-line');
      // Solange nichts geladen ist, behauptet der Kopf keinen Fortschritt.
      expect(screen.queryByText(/Besuch(en)? erledigt/)).toBeNull();

      await act(async () => {
        liefern(tagesplan());
        await Promise.resolve();
      });
      expect(await screen.findByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
      expect(screen.queryByText('Tagesliste wird geladen …')).toBeNull();
    });
  });

  describe('UX-EPIC-003: Der Tag beginnt am Rad', () => {
    const zweiBesuche = () => [
      tagesEintrag({ id: 't1' }),
      zweiterBesuch({ treatment_table_required: true }),
    ];

    it('sagt beim Tagesstart, ab welchem Besuch die Liege mit muss', async () => {
      const plan = zweiBesuche();
      fetchDayPlan.mockResolvedValue(plan);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const zeile = (await screen.findByText('Liege heute')).closest('dl')!;
      // Die Antwort als Wort mit der Uhrzeit dabei; das Häkchen ist Schmuck.
      expect(zeile).toHaveTextContent(`Ja · ab 2. Besuch ${uhr(plan[1]!.starts_at)}`);
      expect(zeile.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
      expect(zeile).toHaveClass('bg-accent-soft', 'min-h-13');
    });

    it('sagt „Nein", wenn heute niemand die Liege braucht - die eine Tagesfrage bleibt', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const zeile = (await screen.findByText('Liege heute')).closest('dl')!;
      expect(within(zeile).getByText('Nein')).toBeInTheDocument();
      expect(zeile.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it('zaehlt in der Uebersicht nicht mehr zusammen, was mit muss (Entscheidung Jannes, 2026-10-01)', async () => {
      // PRX-007: Mitnehmen bleibt an der Person und im Kurzblick am Termin;
      // die einzige Tagesfrage der Übersicht ist die Liege.
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', take_along_items: ['Theraband'] }),
        zweiterBesuch({ take_along_items: ['Theraband', 'Kinesiotape'] }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      expect(screen.queryByText(/mitnehmen/i)).toBeNull();
      expect(screen.queryByText(/Theraband|Kinesiotape/)).toBeNull();
    });

    it('zeigt den ersten Weg als Karte mit Navigation als Hauptknopf, den naechsten als Zeile', async () => {
      fetchDayPlan.mockResolvedValue(zweiBesuche());
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(within(karte).getByRole('heading', { name: 'Erster Weg' })).toBeInTheDocument();
      expect(within(karte).getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
      // Die eine Navigation ist die des ersten Wegs - in der Hauptfarbe und
      // in voller Breite.
      const navigation = screen.getByRole('button', { name: 'Navigation starten' });
      expect(karte).toContainElement(navigation);
      expect(navigation.className).toContain('bg-accent ');
      expect(navigation).toHaveClass('w-full', 'h-12');
      // In einer Stunde: Die Karte sagt, wie lange noch.
      expect(within(karte).getByText(/^in (59|60) Minuten$/)).toBeInTheDocument();

      // Der zweite Besuch ist eine Zeile, die als Ganzes in den Termin führt -
      // „Danach" und „Weitere offene heute" gibt es nicht mehr.
      const zeile = imStrahl().getByRole('link', { name: /Max Mustermann/ });
      expect(zeile).toHaveAttribute(
        'href',
        `/kalender?termin=t2&zurueck=${encodeURIComponent('/')}`,
      );
      expect(zeile).toHaveTextContent('Beispielstrasse 12');
      expect(karte).not.toContainElement(zeile);
      expect(screen.queryByText('Danach')).toBeNull();
      expect(screen.queryByText(/^Weitere offene heute/)).toBeNull();
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });

    it('nennt „Navigation: ganzer Tag" nicht mehr in der Uebersicht (Entscheidung Jannes, 2026-10-01)', async () => {
      fetchDayPlan.mockResolvedValue(zweiBesuche());
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      // Sie bleibt in der Tour-Ansicht.
      expect(screen.queryByRole('button', { name: /ganzer Tag/i })).toBeNull();
    });

    it('macht ohne Navigationsziel den Abschluss zum Hauptknopf', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          visit_street: null,
          visit_house_number: null,
          visit_postal_code: null,
          visit_city: null,
          home_visit_access_note: null,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const haken = await screen.findByRole('button', { name: /^Termin abschließen/ });
      expect(haken.className).toContain('bg-accent ');
      expect(haken).toHaveClass('size-12');
      expect(screen.getByRole('link', { name: 'Doku zu diesem Termin' }).className).toContain(
        'bg-accent ',
      );
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
      // Ein Hauptknopf je Ansicht: kein zweiter, kleiner Haken daneben.
      expect(screen.getAllByRole('button', { name: /^Termin abschließen/ })).toHaveLength(1);
    });

    it('fuehrt mit einem Tipp zur Doku des Termins, mit Rueckweg - auch das Buero', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Doku zu diesem Termin' })).toHaveAttribute(
        'href',
        `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`,
      );
    });

    it('bietet die Doku nur Rollen an, die den Verlauf lesen', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
      await screen.findByRole('heading', { name: 'Ihr Zugang' });
      expect(screen.queryByRole('link', { name: /^Doku/ })).toBeNull();
    });

    it('klappt den Plan des Teams fuer Behandelnde zu, fuer das Buero nicht', async () => {
      const { unmount } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const zu = await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
      expect(zu.closest('details')).not.toHaveAttribute('open');
      unmount();

      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
      const offen = await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
      expect(offen.closest('details')).toHaveAttribute('open');
    });
  });

  describe('Design-Handoff 2026-10-01: Zeitstrahl', () => {
    it('nennt das Datum lang und zeigt den Tagesfortschritt im Kopf', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const fortschritt = await screen.findByText('1 von 2 Besuchen erledigt');

      const kopf = screen.getByRole('heading', { level: 1 }).closest('header')!;
      expect(kopf).toContainElement(fortschritt);
      // „Donnerstag, 1. Oktober 2026" statt „01.10.2026".
      expect(
        within(kopf).getByText(
          /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. \S+ \d{4}$/,
        ),
      ).toBeInTheDocument();
      // Ein Punkt je Behandlungsbesuch: erledigt, dann der nächste.
      const punkte = [...kopf.querySelectorAll('[data-punkt]')].map((punkt) =>
        punkt.getAttribute('data-punkt'),
      );
      expect(punkte).toEqual(['erledigt', 'naechster']);
    });

    it('zaehlt im Kopf nur Behandlungen und laesst ihn ohne Besuch leer', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 'f1',
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
          documentation_status: null,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet');
      expect(screen.queryByText(/Besuch(en)? erledigt/)).toBeNull();
    });

    it('wird ab dem Beginn zur Arbeitskarte: Abschluss statt Navigation', async () => {
      const laufend = tagesEintrag({ id: 't1', starts_at: inMinuten(-10), ends_at: inMinuten(35) });
      fetchDayPlan.mockResolvedValue([laufend, zweiterBesuch()]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(
        within(karte).getByRole('heading', { name: `Jetzt · bis ${uhr(laufend.ends_at)}` }),
      ).toBeInTheDocument();
      // Haken 48 und „Doku" teilen sich den Hauptknopf (Handoff 6a).
      const haken = within(karte).getByRole('button', { name: /^Termin abschließen/ });
      expect(haken.className).toContain('bg-accent ');
      expect(haken).toHaveClass('size-12');
      const doku = within(karte).getByRole('link', { name: 'Doku zu diesem Termin' });
      expect(doku).toHaveAttribute(
        'href',
        `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`,
      );
      expect(doku.className).toContain('bg-accent ');
      // Die Navigation entfällt.
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
      // Ein Doku-Knopf, auch hier (AKTE-008).
      expect(within(karte).getAllByRole('link', { name: /^Doku/ })).toHaveLength(1);
      // Ein laufender Besuch beginnt nicht mehr „in … Minuten".
      expect(within(karte).queryByText(/^in \d+ Minuten?$/)).toBeNull();
    });

    it('sagt an einem Besuch, der vorbei, aber nicht abgeschlossen ist, seit wann er offen steht', async () => {
      const vorbei = tagesEintrag({ id: 't1', starts_at: inMinuten(-90), ends_at: inMinuten(-45) });
      fetchDayPlan.mockResolvedValue([vorbei]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(
        within(karte).getByRole('heading', { name: `Seit ${uhr(vorbei.ends_at)} offen` }),
      ).toBeInTheDocument();
      expect(
        within(karte).getByRole('button', { name: /^Termin abschließen/ }),
      ).toBeInTheDocument();
      expect(
        within(karte).getByRole('link', { name: 'Doku zu diesem Termin' }),
      ).toBeInTheDocument();
    });

    it('bietet einer Rolle ohne Schreibrecht an der Doku keinen Abschluss an', async () => {
      // Das Büro mit eigener Tagesliste: Es sieht den Tag, schließt aber
      // keine Behandlung ab. Verbindlich prüft das der Server; hier steht
      // nur, was nicht angeboten wird.
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', starts_at: inMinuten(-10), ends_at: inMinuten(35) }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const karte = await findeKarte();
      expect(within(karte).queryByRole('link', { name: /abschließen/i })).toBeNull();
      // Lesen darf es: „Doku" führt in die Doku der Akte (AKTE-008), als
      // einziger Knopf - geschrieben wird dort nicht.
      expect(within(karte).getAllByRole('link', { name: /^Doku/ })).toHaveLength(1);
      expect(within(karte).getByRole('link', { name: 'Termin öffnen' })).toBeInTheDocument();
    });

    it('tritt am Tagesende in Tiefgruen an die Stelle von Liege und Weg', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'documented', documentation_status: 'final' }),
        zweiterBesuch({ status: 'completed', documentation_status: 'final' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const abschluss = (
        await screen.findByRole('heading', { level: 2, name: 'Alle Besuche erledigt' })
      ).closest('section')!;
      expect(abschluss).toHaveClass('bg-surface-inverse', 'rounded-card');
      expect(within(abschluss).getByText('Heute')).toHaveClass('text-salbei', 'font-semibold');
      expect(
        within(abschluss).getByText('2 von 2 Besuchen erledigt · 2 Dokus festgeschrieben'),
      ).toBeInTheDocument();
      const morgen = within(abschluss).getByRole('link', { name: 'Morgen im Kalender' });
      expect(morgen.getAttribute('href')).toMatch(
        /^\/kalender\?ansicht=tag&datum=\d{4}-\d{2}-\d{2}$/,
      );
      // Auf Tiefgrün ist der Fokusrahmen Papier.
      expect(morgen).toHaveClass('focus-visible:outline-surface', 'min-h-11');

      expect(screen.queryByText('Liege heute')).toBeNull();
      expect(screen.queryByRole('article')).toBeNull();
      // Genau einmal - und der Tag steht darunter weiter im Strahl.
      expect(screen.getAllByText('Alle Besuche erledigt')).toHaveLength(1);
      expect(imStrahl().getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
    });

    it('fragt beim Oeffnen die Route des Tages ab und schickt nur Koordinaten und Profil (ANN-194, ADR-019 Punkt 12)', async () => {
      // Beide Besuche muessen am selben Tag liegen; am spaeten Abend faellt der
      // zweite sonst ueber Mitternacht (BEF-120). Nur die Uhr steht fest, die
      // Timer bleiben echt.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T07:00:00Z'));
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const plan = [tagesEintrag({ id: 't1' }), zweiterBesuch()];
      fetchDayPlan.mockResolvedValue(plan);
      fetchDayRoute.mockResolvedValue([
        routenpunkt(plan[0]!, 48.521, 9.057),
        routenpunkt(plan[1]!, 48.526, 9.064),
      ]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      rufeFunktionAuf.mockResolvedValue(route('anbieter', 12, 9));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const balken = await screen.findByRole('region', { name: 'Erster Weg' });
      expect(within(balken).getByText('≈ 12 min Rad')).toBeInTheDocument();
      expect(within(balken).getByText('Jetzt, Start am Rad')).toBeInTheDocument();
      expect(within(balken).getByText('Erika Beispiel')).toBeInTheDocument();
      // 60 Minuten bis zum Beginn, 12 davon Fahrt (je nach Sekunde 59).
      expect(within(balken).getByText(/^(47|48) min Puffer$/)).toBeInTheDocument();

      // Die Karte nennt die Anfahrt im Kicker, die Zeile danach im Ort - und
      // darüber liegt der schmale Übergang.
      expect(
        within(await findeKarte()).getByRole('heading', { name: 'Erster Weg · ≈ 12 min' }),
      ).toBeInTheDocument();
      const zeile = imStrahl().getByRole('link', { name: /Max Mustermann/ });
      expect(zeile).toHaveTextContent('Beispielstrasse 12 · Anfahrt ≈ 9 min');
      // 75 Minuten zwischen Ende und Beginn, 9 Fahrt.
      expect(screen.getByText('≈ 9 min Rad · 66 min Puffer')).toBeInTheDocument();
      expect(screen.queryByText(/Nachbildung/)).toBeNull();

      // Genau ein Aufruf, und hinaus gehen nur Punkte und das Fahrprofil:
      // kein Name, keine Kennung, keine Uhrzeit.
      expect(rufeFunktionAuf).toHaveBeenCalledTimes(1);
      expect(rufeFunktionAuf).toHaveBeenCalledWith('route', {
        waypoints: [
          { lat: 48.52, lon: 9.05 },
          { lat: 48.521, lon: 9.057 },
          { lat: 48.526, lon: 9.064 },
        ],
        profile: 'cargo_bicycle',
      });
      const hinaus = JSON.stringify(rufeFunktionAuf.mock.calls);
      expect(hinaus).not.toMatch(/Erika|Beispiel|Mustermann|Testweg|t1|p1|T\d\d:\d\d/);
      expect(fetchDayRoute).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        EIGENE_STAFF_ID,
      );
    });

    it('sagt dazu, wenn die Fahrzeiten eine Nachbildung ohne Kartendienst sind', async () => {
      const plan = [tagesEintrag({ id: 't1' })];
      fetchDayPlan.mockResolvedValue(plan);
      fetchDayRoute.mockResolvedValue([routenpunkt(plan[0]!, 48.521, 9.057)]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      rufeFunktionAuf.mockResolvedValue(route('nachbildung', 12));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      await screen.findByRole('region', { name: 'Erster Weg' });
      expect(
        screen.getByText(/Nachbildung ohne Kartendienst: Die Fahrzeiten sind über die Luftlinie/),
      ).toHaveAttribute('role', 'status');
    });

    it('bleibt ohne Route ohne Wegbalken und behauptet keine Fahrzeit', async () => {
      const plan = [tagesEintrag({ id: 't1' }), zweiterBesuch()];
      fetchDayPlan.mockResolvedValue(plan);
      fetchDayRoute.mockResolvedValue([
        routenpunkt(plan[0]!, 48.521, 9.057),
        routenpunkt(plan[1]!, 48.526, 9.064),
      ]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      // Die Function antwortet nicht - etwa ohne Freigabe der Umgebung.
      rufeFunktionAuf.mockResolvedValue({
        ok: false,
        error: { code: 'not_configured', message: 'kein Anbieter' },
      });
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      await waitFor(() => expect(rufeFunktionAuf).toHaveBeenCalled());
      expect(within(karte).getByRole('heading', { name: 'Erster Weg' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /Weg/ })).toBeNull();
      expect(screen.queryByText(/min Rad|Anfahrt/)).toBeNull();
      // Kein Fehlerkasten: Die Übersicht hat nichts versprochen, was fehlt.
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('fragt keine Route ab, wenn kein Besuch mehr aussteht', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'draft' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
      expect(fetchDayRoute).not.toHaveBeenCalled();
      expect(fetchStandorte).not.toHaveBeenCalled();
      expect(rufeFunktionAuf).not.toHaveBeenCalled();
    });

    it('nennt „Termin n von m" an der Karte, wenn die Grundlage es hergibt (PRX-008)', async () => {
      fetchAbrechnungslage.mockResolvedValue({
        appointment_id: 't1',
        treatment_basis_id: 'g1',
        treatment_basis_kind: null,
        treatment_basis_issued_on: null,
        basis_position: 2,
        basis_appointment_count: 6,
        billing_visible: false,
        recipient_kind: null,
        open_invoice_count: null,
        open_outstanding_cents: null,
        open_overdue: null,
      });
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(await within(karte).findByText(/· Termin 2 von 6$/)).toBeInTheDocument();
      // Nur für den ausgeklappten Termin - nicht für jede Zeile des Tages.
      expect(fetchAbrechnungslage).toHaveBeenCalledTimes(1);
      expect(fetchAbrechnungslage).toHaveBeenCalledWith('t1');
    });

    it('stellt den eigenen Tag und den Plan des Teams ab 900 px Inhaltsbreite nebeneinander', async () => {
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();

      const behaelter = container.querySelector('.\\@container')!;
      const raster = behaelter.firstElementChild!;
      expect(raster.className).toContain('@zweispaltig:grid-cols-');
      // Die Kontextspalte: der Plan des Teams und die Tagesroute.
      const spalte = raster.querySelector('aside')!;
      expect(
        within(spalte).getByRole('heading', { name: 'Tagesplan des Teams' }),
      ).toBeInTheDocument();
      expect(within(spalte).getByText('Tagesroute auf der Karte')).toBeInTheDocument();
      expect(within(spalte).queryByRole('article')).toBeNull();
    });

    it('bleibt ohne eigenen Tag einspaltig - fuer das Buero ist der Plan des Teams die Hauptsache', async () => {
      const buero = { ...testUser(['office']), staffMemberId: null };
      const { container } = renderMitVorschau(<MyDayPage user={buero} />);
      await screen.findByRole('heading', { name: 'Tagesplan des Teams' });

      expect(container.querySelector('aside')).toBeNull();
      expect(container.innerHTML).not.toContain('@zweispaltig:grid-cols-');
      expect(fetchDayPlan).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Tagesablauf' })).toBeNull();
    });
  });

  describe('UXR-003: Befunde aus dem UX-Review', () => {
    function fehlzeit(
      id: string,
      titel: string,
      von: number,
      bis: number,
    ): TodayApiModule.DayPlanEntry {
      return tagesEintrag({
        id,
        kind: 'internal',
        patient_id: null,
        title: titel,
        appointment_type: 'practice',
        location_name: 'Hauptstandort',
        starts_at: inMinuten(von),
        ends_at: inMinuten(bis),
        patient_given_name: null,
        patient_family_name: null,
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
        patient_phone: null,
        patient_phone_mobile: null,
        home_visit_access_note: null,
        documentation_status: null,
      });
    }

    it('stellt eine Fehlzeit an ihre Uhrzeit im Zeitstrahl, ohne sie als Besuch zu zaehlen (UEB-02)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1' }),
        fehlzeit('f-spaeter', 'Teambesprechung', 120, 180),
        fehlzeit('f-vorbei', 'Frühbesprechung', -180, -120),
      ]);
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Gezählt wird weiter nur der Besuch (ANN-117).
      expect(await screen.findByText('0 von 1 Besuch erledigt')).toBeInTheDocument();
      const spaeter = imStrahl().getByRole('link', { name: /Teambesprechung/ });
      expect(spaeter).toHaveAttribute(
        'href',
        `/kalender?termin=f-spaeter&zurueck=${encodeURIComponent('/')}`,
      );
      expect(spaeter).toHaveTextContent('Fehlzeit · Praxis · Hauptstandort');

      // Die vergangene steht vor dem Besuch, die kommende danach - und nur
      // die vergangene hat man hinter sich.
      const folge = [...container.querySelectorAll('[data-termin]')].map((eintrag) =>
        eintrag.getAttribute('data-termin'),
      );
      expect(folge).toEqual(['f-vorbei', 't1', 'f-spaeter']);
      const punkt = (id: string) =>
        container.querySelector(`[data-termin="${id}"] [data-punkt]`)?.getAttribute('data-punkt');
      expect(punkt('f-vorbei')).toBe('erledigt');
      expect(punkt('f-spaeter')).toBe('spaeter');
      // Die eigene Zeile „Heute außerdem" gibt es nicht mehr.
      expect(screen.queryByText(/Heute außerdem/)).toBeNull();
    });

    it('sagt ohne Besuche nicht, alles sei erledigt - und nennt die Fehlzeit (UEB-02, UEB-11)', async () => {
      fetchDayPlan.mockResolvedValue([fehlzeit('f-spaeter', 'Teambesprechung', 60, 120)]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Alle Besuche erledigt')).toBeNull();
      expect(screen.queryByText('Liege heute')).toBeNull();
      expect(imStrahl().getByRole('link', { name: /Teambesprechung/ })).toBeInTheDocument();
    });

    it('sagt ohne jeden Termin, dass keine Besuche zugeordnet sind - ohne leeren Strahl', async () => {
      fetchDayPlan.mockResolvedValue([]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Tagesablauf' })).toBeNull();
      expect(screen.queryByText('Alle Besuche erledigt')).toBeNull();
    });

    it('sagt „Alle Besuche erledigt" nur, wenn es Besuche gab', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText('Alle Besuche erledigt')).toBeInTheDocument();
      expect(
        screen.getByText('1 von 1 Besuch erledigt · 1 Doku festgeschrieben'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Heute sind Ihnen keine Besuche zugeordnet')).toBeNull();
    });

    it('navigiert nur noch zu Besuchen, die ausstehen (UEB-04)', async () => {
      fetchDayPlan.mockResolvedValue([
        // Besucht, die Doku ist noch Entwurf: offen, aber kein Weg mehr.
        tagesEintrag({
          id: 't1',
          starts_at: inMinuten(-120),
          ends_at: inMinuten(-75),
          status: 'completed',
          documentation_status: 'draft',
        }),
        zweiterBesuch(),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      // Ausgeklappt ist der ausstehende Besuch - und nur er trägt die Navigation.
      expect(within(karte).getByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(within(karte).getByRole('heading', { name: 'Nächster Weg' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Navigation starten' })).toHaveLength(1);
      // Der besuchte steht als Zeile da und sagt, was an ihm noch offen ist.
      const besucht = imStrahl().getByRole('link', { name: /Erika Beispiel/ });
      expect(besucht).toHaveTextContent('Doku im Entwurf');
      expect(await screen.findByText('1 von 2 Besuchen erledigt')).toBeInTheDocument();
    });

    it('klappt ohne ausstehenden Besuch die erste offene Dokumentation aus - mit dem einen Hauptknopf (UEB-04)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          starts_at: inMinuten(-240),
          ends_at: inMinuten(-195),
          status: 'completed',
          documentation_status: 'draft',
        }),
        zweiterBesuch({
          starts_at: inMinuten(-120),
          ends_at: inMinuten(-75),
          status: 'completed',
          documentation_status: 'none',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(within(karte).getByRole('heading', { name: 'Doku offen' })).toBeInTheDocument();
      expect(within(karte).getByRole('link', { name: 'Erika Beispiel' })).toBeInTheDocument();
      // Abgeschlossen: kein Haken mehr, nur „Doku".
      expect(within(karte).queryByRole('button', { name: /^Termin abschließen/ })).toBeNull();
      const abschluesse = within(karte).getAllByRole('link', { name: 'Doku zu diesem Termin' });
      expect(abschluesse).toHaveLength(1);
      expect(abschluesse[0]!.className).toContain('bg-accent ');
      expect(abschluesse[0]).toHaveAttribute(
        'href',
        `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`,
      );
      // Die zweite offene Dokumentation steht als Zeile da und führt in ihren Termin.
      const zweite = imStrahl().getByRole('link', { name: /Max Mustermann/ });
      expect(zweite).toHaveTextContent('Doku offen');
      expect(zweite).toHaveAttribute(
        'href',
        `/kalender?termin=t2&zurueck=${encodeURIComponent('/')}`,
      );
      // Kein Besuch steht aus: keine Navigation, und oben der Tagesabschluss.
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
      expect(screen.getByText('Alle Besuche erledigt')).toBeInTheDocument();
    });

    it('stellt Laden und Fehler des Teamplans in seinen Abschnitt, mit Erneut (UEB-05, ZST-18)', async () => {
      const user = userEvent.setup();
      fetchAppointments.mockRejectedValue(new Error('Serverfehler'));
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const teamplan = (
        await screen.findByRole('heading', { name: 'Tagesplan des Teams' })
      ).closest('section')!;
      const fehler = await within(teamplan).findByText(
        'Der Tagesplan des Teams konnte nicht geladen werden.',
      );
      expect(fehler.closest('[role="alert"]')).toHaveTextContent(
        'Bitte die Verbindung prüfen und erneut versuchen.',
      );
      // Ohne Daten keine leere Liste und kein Zähler.
      expect(within(teamplan).queryByRole('list')).toBeNull();
      expect(teamplan.querySelector('summary')).toHaveTextContent(/^Tagesplan des Teams$/);

      fetchAppointments.mockResolvedValue(termine);
      await user.click(within(teamplan).getByRole('button', { name: 'Erneut versuchen' }));
      expect(await within(teamplan).findByText('Max Mustermann')).toBeInTheDocument();
      expect(teamplan.querySelector('summary')).toHaveTextContent('Tagesplan des Teams (2)');
    });

    it('nennt im Teamplan zuerst die Person, die Terminart einmal (UEB-06)', async () => {
      fetchAppointments.mockResolvedValue([
        ...termine,
        termin({
          id: 't9',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          staff_given_name: 'Jannes',
          staff_family_name: 'Test',
          starts_at: `${HEUTE}T14:00:00.000Z`,
          ends_at: `${HEUTE}T14:45:00.000Z`,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const teamplan = (
        await screen.findByRole('heading', { name: 'Tagesplan des Teams' })
      ).closest('section')!;
      // Der Hausbesuch ist der Regelfall und trägt kein Wort (ANN-192).
      expect(await within(teamplan).findAllByText('Anna Beispiel')).not.toHaveLength(0);
      expect(within(teamplan).getByText('Jannes Test · Praxis Hauptstandort')).toBeInTheDocument();
      expect(within(teamplan).queryByText(/Hausbesuch/)).toBeNull();
      // Die Erklärung unter der Überschrift wiederholte sie (UX-005h).
      expect(
        within(teamplan).queryByText('Alle Termine und Fehlzeiten des Teams heute.'),
      ).toBeNull();
      expect(within(teamplan).getByRole('link', { name: /Zum Kalender/ })).toBeInTheDocument();
    });

    it('zeigt den Teamplan als Karte mit dichten Zeilen und Statuszeichen (Design-Handoff 2026-10-01)', async () => {
      fetchAppointments.mockResolvedValue([
        termin({ id: 't1', status: 'documented' }),
        termin({ id: 't2', status: 'cancelled', patient_family_name: 'Abgesagt' }),
        termin({ id: 't3', patient_family_name: 'Offen' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const teamplan = (
        await screen.findByRole('heading', { name: 'Tagesplan des Teams' })
      ).closest('section')!;
      expect(teamplan.querySelector('details')).toHaveClass('rounded-card', 'bg-surface', 'border');
      const zeilen = await within(teamplan).findAllByRole('listitem');
      expect(zeilen).toHaveLength(3);
      // Die ganze Zeile führt in den Termin, mit dem Rückweg in die Übersicht.
      const erste = within(zeilen[0]!).getByRole('link');
      expect(erste).toHaveAttribute(
        'href',
        `/kalender?termin=t1&zurueck=${encodeURIComponent('/')}`,
      );
      expect(erste).toHaveClass('min-h-12');
      // Zeichen und Wort ohne Pille; der bestätigte Termin trägt nichts.
      const dokumentiert = within(erste).getByText('Dokumentiert');
      expect(dokumentiert.textContent).toBe('✓Dokumentiert');
      expect(dokumentiert.className).not.toMatch(/\bbg-|rounded/);
      expect(
        within(zeilen[1]!).getByText('Abgesagt', { selector: '.text-danger' }).textContent,
      ).toBe('×Abgesagt');
      expect(zeilen[2]!.querySelector('.text-positiv, .text-danger, .text-warnung')).toBeNull();
    });

    it('sagt einer Patientin, wozu der Zugang dient, und fuehrt zum Konto (UEB-08)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);

      await screen.findByRole('heading', { name: 'Ihr Zugang' });
      expect(screen.getByText(/verwalten Sie derzeit Ihr Konto/)).toBeInTheDocument();
      expect(screen.queryByText(/Patientenportal/)).toBeNull();
      expect(screen.getByRole('link', { name: 'Mein Konto' })).toHaveAttribute(
        'href',
        '/mein-konto',
      );
      // Beim „Sie" ohne Vornamen.
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Max');
    });

    it('zeigt an jedem Aufklapper der Übersicht ein Aufklappzeichen (UEB-03, UIK-07)', async () => {
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });

      const koepfe = [...container.querySelectorAll('summary')];
      // Teamplan, Tagesroute, Organisatorisches - „Weitere offene" und
      // „Erledigt" hat der Zeitstrahl ersetzt.
      expect(koepfe).toHaveLength(3);
      for (const kopf of koepfe) {
        expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
        expect(kopf).toHaveClass('min-h-11');
      }
      // Beide Aufklapp-Überschriften im Label-Stil wie ein Abschnitt (UEB-17):
      // beim Teamplan trägt ihn der Kopf, die Überschrift darin erbt ihn.
      expect(
        screen.getByRole('heading', { name: 'Tagesplan des Teams' }).closest('summary'),
      ).toHaveClass('tracking-label', 'uppercase');
      expect(
        screen.getByRole('heading', { name: 'Organisatorisches und Kommunikation' }),
      ).toHaveClass('tracking-label', 'uppercase');
    });

    it('erklaert die Uebergabe an Google Maps nicht mehr unter der Karte (Entscheidung Jannes, 2026-10-01)', async () => {
      // Der Satz stand seit UEB-11 unter dem ersten Weg. Der Design-Handoff
      // streicht ihn dort; die Bedingungen des Handoffs (ADR-019 Punkt 23:
      // Endgeräteregel, Datenschutzinformation, nur auf Aktion) hängen nicht
      // an ihm. Am Termin steht er weiter an der Anschrift.
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      expect(screen.getByRole('button', { name: 'Navigation starten' })).toBeInTheDocument();
      expect(screen.queryByText(/Google Maps/)).toBeNull();
    });

    it('fuehrt ueber den Namen der Karte in die Akte und ueber die Zeile in den Termin (UEB-13)', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' }), zweiterBesuch()]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Erika Beispiel' })).toHaveAttribute(
        'href',
        `/patienten/p1?zurueck=${encodeURIComponent('/')}`,
      );
      // Ein Name, ein Ziel: In der Zeile ist die ganze Zeile das Ziel.
      expect(imStrahl().getByRole('link', { name: /Max Mustermann/ })).toHaveAttribute(
        'href',
        `/kalender?termin=t2&zurueck=${encodeURIComponent('/')}`,
      );
    });

    it('gibt den Karten der Vorschau Textlinks mit Tippziel und richtigen Zielen (UEB-18)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['team_lead'])} />);
      await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });

      const panne = screen.getByRole('link', { name: 'Panne melden' });
      expect(panne).toHaveClass('text-accent', 'min-h-11');
      expect(panne.className).not.toContain('text-danger');
      for (const name of ['Zur Radflotte', 'Zum Urlaub', 'Zur Kommunikation']) {
        expect(screen.getByRole('link', { name })).toHaveClass('min-h-11');
      }
      // Erstattungen haben einen eigenen Weg - bisher führte alles zum Urlaub.
      for (const link of screen.getAllByRole('link', { name: /Erstattungen$/ })) {
        expect(link).toHaveAttribute('href', '/betrieb/erstattungen');
      }
      // Mehrzahl richtig gebildet (UEB-11, WRT-19).
      expect(screen.queryByText(/Vorgange/)).toBeNull();
      expect(screen.getByText(/^\d+ Vorg(ang|änge)$/)).toBeInTheDocument();
      expect(screen.queryByText(/^\d+ offene?$/)).toBeNull();
    });
  });

  describe('UBK-EPIC-001: die Uhr statt des Hakens, die Liege am Hausbesuch', () => {
    it('macht nach dem Ende eines nicht abgehakten Besuchs den naechsten zum Weg (ANN-117 Fassung 2)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', starts_at: inMinuten(-90), ends_at: inMinuten(-45) }),
        zweiterBesuch(),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(within(karte).getByRole('heading', { name: 'Nächster Weg' })).toBeInTheDocument();
      // Der liegengebliebene steht als Zeile da, mit Wort und Haken.
      const zeile = imStrahl().getByRole('link', { name: /Erika Beispiel/ });
      expect(zeile).toHaveTextContent('Nicht abgeschlossen');
      expect(
        imStrahl().getByRole('button', { name: /^Termin abschließen.*Erika Beispiel/ }),
      ).toBeInTheDocument();
      // Erledigt ist nur, was abgehakt ist.
      expect(screen.getByText('0 von 2 Besuchen erledigt')).toBeInTheDocument();
    });

    it('sagt nach dem letzten Besuch „Kein Weg mehr offen", solange ein Haken fehlt', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          starts_at: inMinuten(-200),
          ends_at: inMinuten(-155),
          status: 'completed',
          documentation_status: 'final',
        }),
        zweiterBesuch({ starts_at: inMinuten(-90), ends_at: inMinuten(-45) }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Kein Weg mehr offen' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Alle Besuche erledigt')).toBeNull();
      // Der liegengebliebene ist die Karte - zum Abschließen.
      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
    });

    it('zeigt keine Liege-Zeile an einem Tag nur mit Praxisterminen (BEF-051)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          treatment_table_required: true,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const karte = await findeKarte();
      expect(screen.queryByText('Liege heute')).toBeNull();
      // Auch die Pille steht nur am Hausbesuch.
      expect(within(karte).queryByText('Liege')).toBeNull();
      expect(screen.queryByText('Tagesroute auf der Karte')).toBeNull();
    });

    it('stellt fuer das Buero den Plan des Teams vor die eigene Liste (BEF-051)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const tagesablauf = await screen.findByRole('heading', { name: 'Tagesablauf' });
      const teamplan = screen.getByRole('heading', { name: 'Tagesplan des Teams' });
      expect(
        teamplan.compareDocumentPosition(tagesablauf) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe('UBK-003: Tageswechsel (ANN-234)', () => {
    const heute = () => todayInTimeZone(ZONE);

    it('fuehrt heute auf Vortag und Folgetag, ohne „Heute" anzubieten', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const nav = await screen.findByRole('navigation', { name: 'Tag wechseln' });
      expect(within(nav).getByRole('link', { name: 'Vortag' })).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(heute(), -1)}`,
      );
      expect(within(nav).getByRole('link', { name: 'Folgetag' })).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(heute(), 1)}`,
      );
      expect(within(nav).queryByRole('link', { name: 'Heute' })).toBeNull();
      expect(fetchDayPlan).toHaveBeenCalledWith(heute(), EIGENE_STAFF_ID);
    });

    it('zeigt morgen den Plan von morgen: Liege morgen, erster Weg, kein Jetzt und kein Haken', async () => {
      const morgen = tagePlus(heute(), 1);
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1' }),
        zweiterBesuch({ treatment_table_required: true }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />, `/?tag=${morgen}`);

      const karte = await findeKarte();
      expect(fetchDayPlan).toHaveBeenCalledWith(morgen, EIGENE_STAFF_ID);
      expect(screen.getByText('Liege morgen').closest('dl')).toHaveTextContent(
        /Ja · ab 2\. Besuch/,
      );
      expect(within(karte).getByRole('heading', { name: 'Erster Weg' })).toBeInTheDocument();
      expect(screen.queryByText(/^Jetzt, /)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Termin abschließen/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Behandlung abschließen/ })).toBeNull();
      // Der Teamplan fragt denselben Tag ab.
      const query = fetchAppointments.mock.calls.at(-1)?.[0] as AppointmentsApiModule.CalendarQuery;
      expect(query.von).toBe(morgen);

      const nav = screen.getByRole('navigation', { name: 'Tag wechseln' });
      expect(within(nav).getByRole('link', { name: 'Heute' })).toHaveAttribute('href', '/');
      expect(within(nav).getByRole('link', { name: 'Vortag' })).toHaveAttribute('href', '/');
      expect(within(nav).getByText('Morgen')).toBeInTheDocument();
    });

    it('zeigt gestern, was liegen blieb, und schliesst den Tag ab', async () => {
      const gestern = tagePlus(heute(), -1);
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
        zweiterBesuch(),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />, `/?tag=${gestern}`);

      const abschluss = (
        await screen.findByRole('heading', { level: 2, name: 'Kein Weg mehr offen' })
      ).closest('section')!;
      expect(within(abschluss).getByText('Gestern')).toBeInTheDocument();
      expect(
        within(abschluss).getByRole('link', { name: 'Diesen Tag im Kalender' }),
      ).toHaveAttribute('href', `/kalender?ansicht=tag&datum=${gestern}`);
      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(
        within(karte).getByRole('button', { name: /^Termin abschließen/ }),
      ).toBeInTheDocument();
    });

    it('faellt bei einem unsinnigen Tag still auf heute zurueck', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />, '/?tag=2026-02-30');
      await screen.findByRole('navigation', { name: 'Tag wechseln' });
      expect(fetchDayPlan).toHaveBeenCalledWith(heute(), EIGENE_STAFF_ID);
    });
  });

  describe('UBK-007: veraltete Anschrift am Termin (ANN-236)', () => {
    it('zeigt statt einer Fahrzeit, dass die Adresse am Termin veraltet ist', async () => {
      const erster = tagesEintrag({ id: 't1' });
      const zweiter = zweiterBesuch();
      fetchDayPlan.mockResolvedValue([erster, zweiter]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      fetchDayRoute.mockResolvedValue([
        routenpunkt(erster, 48.53, 9.06),
        { ...routenpunkt(zweiter, 0, 0), lat: null, lon: null, address_outdated: true },
      ]);
      rufeFunktionAuf.mockResolvedValue(route('anbieter', 12));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const zeile = await imStrahlFinden(/Max Mustermann/);
      expect(zeile).toHaveTextContent('Fahrzeit nicht verfügbar – Adresse am Termin veraltet');
      expect(zeile).not.toHaveTextContent('Anfahrt ≈');
    });
  });
});
