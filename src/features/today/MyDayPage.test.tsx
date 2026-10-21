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
import type * as LeistungenModule from '@/features/appointments/leistungenAmTermin';
import type * as NochOffenModule from './NochOffen';
import type * as TimeAccountApiModule from '@/features/timeaccount/api';
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
/**
 * „Ausfall“ an Zeile und Karte (B12): sichtbar das Wort, für Vorlesesoftware
 * dahinter Name und Uhrzeit (UEB-10). Gesucht wird nach dem Anfang - so
 * trifft auch eine Abwesenheitsprüfung jeden dieser Knöpfe.
 */
const AUSFALL = /^Ausfall für /;

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

/**
 * Das Druckblatt (BEF-052) ist am Bildschirm `hidden` - jsdom lädt kein CSS
 * und sähe jede Anschrift doppelt. Hier steht deshalb nur, was die Seite ihm
 * übergibt; das Blatt selbst prüft `TagesplanDruck.test.tsx`, das Druckbild
 * `tests/e2e/uebersicht.spec.ts`.
 */
const druckblatt = vi.fn();
vi.mock('./TagesplanDruck', () => ({
  TagesplanDruck: (props: { termine: readonly unknown[]; standVon: number | null }) => {
    druckblatt(props);
    return null;
  },
}));

/**
 * „Nachzuholen" (Auftrag C1) liest die sieben Tage davor über dieselbe
 * Tagesliste. Hier steht nur, wann die Seite es zeigt; den Inhalt prüft
 * `NochOffen.test.tsx` - sonst stünde der Plan jedes Tests siebenmal mehr im
 * Dokument.
 */
const nachzuholen = vi.fn();
vi.mock('./NochOffen', async (importOriginal) => ({
  ...(await importOriginal<typeof NochOffenModule>()),
  Nachzuholen: (props: { heute: string }) => {
    nachzuholen(props);
    return null;
  },
}));

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
const reopenAppointment = vi.fn();
const recordNoShow = vi.fn();

// BEF-179: zurückgewiesene Freizeitausgleiche; ohne Angabe keine.
const fetchRejectedTimeOff = vi.fn(() =>
  Promise.resolve([] as TimeAccountApiModule.RejectedTimeOff[]),
);
vi.mock('@/features/timeaccount/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TimeAccountApiModule>()),
  fetchRejectedTimeOff: () => fetchRejectedTimeOff(),
}));

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
    reopenAppointment: (id: string, stand: string) => reopenAppointment(id, stand) as Promise<void>,
    recordNoShow: (id: string, stand: string, protokoll: boolean) =>
      recordNoShow(id, stand, protokoll) as Promise<void>,
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
// Auftrag C1: der Stand der Heilmittel am dokumentierten Termin (`NochOffen`).
const fetchLeistungenAmTermin = vi.fn();
vi.mock('@/features/appointments/leistungenAmTermin', async (importOriginal) => ({
  ...(await importOriginal<typeof LeistungenModule>()),
  fetchLeistungenAmTermin: (id: string) =>
    fetchLeistungenAmTermin(id) as Promise<LeistungenModule.LeistungenAmTermin | null>,
}));

// UBK-010: Fahrzeitfaktor 1,0 - die Zahlen des Kartendienstes bleiben
// stehen; der Faktor selbst ist in `fahrzeitfaktor.test.tsx` geprüft.
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
 * Die Überschrift des eigenen Strahls: „Tagesablauf", oder sichtbar „Heute ·
 * …", wenn die Morgen-Vorschau darüber steht. Deren Strahl heißt „Termine
 * morgen" und zählt hier nicht.
 */
const STRAHL = /^(Tagesablauf|Heute · )/;

/**
 * Der Zeitstrahl des eigenen Tages. Dieselben Namen stehen auch im Tagesplan
 * des Teams daneben - gesucht wird deshalb im Strahl.
 */
function imStrahl() {
  return within(screen.getByRole('heading', { name: STRAHL }).closest('section')!);
}

/** Eine Zeile im Strahl, sobald sie da ist. */
async function imStrahlFinden(name: RegExp): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: STRAHL });
  return await waitFor(() => zeileImStrahl(name));
}

/**
 * Eine Besuchszeile im Strahl: Sie klappt seit Auftrag C1 in der Übersicht
 * auf (`data-zeile`), statt als Link in den Kalender zu springen.
 */
function zeileImStrahl(name: RegExp): HTMLElement {
  const zeile = imStrahl()
    .getAllByRole('button', { name })
    .find((knopf) => knopf.hasAttribute('data-zeile'));
  if (!zeile) throw new Error(`Keine Zeile ${String(name)} im Strahl`);
  return zeile;
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
    fetchLeistungenAmTermin.mockReset();
    fetchLeistungenAmTermin.mockResolvedValue(null);
    nachzuholen.mockClear();
    fetchRejectedTimeOff.mockClear();
  });

  it('zeigt „Nachzuholen" heute für die, die schreiben - nicht an anderen Tagen (ANN-478)', async () => {
    const { unmount } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await findeKarte();
    expect(nachzuholen).toHaveBeenCalledWith(
      expect.objectContaining({ heute: todayInTimeZone(ZONE), staffMemberId: EIGENE_STAFF_ID }),
    );
    unmount();

    nachzuholen.mockClear();
    renderMitVorschau(
      <MyDayPage user={testUser(['therapist'])} />,
      `/?tag=${tagePlus(todayInTimeZone(ZONE), 1)}`,
    );
    await screen.findAllByRole('article');
    expect(nachzuholen).not.toHaveBeenCalled();
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
    // Die Pille sagt, dass etwas fehlt, und führt in die geführte
    // Erstaufnahme zu diesem Termin (K10); was fehlt, hört Vorlesesoftware
    // gleich mit.
    const pille = await screen.findByRole('link', {
      name: 'Erstaufnahme offen: Verordnungsfoto · Anmeldebogen',
    });
    expect(pille.getAttribute('href')).toMatch(
      /^\/patienten\/p1\/erstaufnahme\?termin=[^&]+&zurueck=%2F$/,
    );
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
    // Dazwischen seit Auftrag C1 der Anruf - ein Symbol, keine Nummer im Bild.
    const haken = within(karte).getByRole('button', { name: 'Behandlung abschließen' });
    expect(haken).toHaveAttribute('title', 'Behandlung abschließen');
    expect(haken.className).not.toContain('bg-accent ');
    expect(haken).toHaveClass('size-11');
    const reihe = haken.parentElement!;
    // 12 px zwischen den Knöpfen (Praxis-Review R2, P1).
    expect(reihe).toHaveClass('flex', 'gap-3');
    expect(reihe).toContainElement(doku);
    const anruf = within(reihe).getByRole('link', { name: 'Anrufen: Erika Beispiel' });
    expect(anruf).toHaveAttribute('href', 'tel:+491600000006');
    expect(anruf).toHaveClass('size-11');
    expect(anruf).not.toHaveTextContent(/\d/);
    expect(doku.compareDocumentPosition(anruf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(anruf.compareDocumentPosition(haken) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('nimmt den Haken mit „Rückgängig" zurück - über „Termin wieder öffnen" (R2, P1)', async () => {
    fetchAppointment
      .mockResolvedValueOnce({ id: 't1', status: 'confirmed', updated_at: '2026-10-01T06:00:00Z' })
      .mockResolvedValueOnce({ id: 't1', status: 'completed', updated_at: '2026-10-01T06:05:00Z' });
    completeAppointment.mockResolvedValue(undefined);
    reopenAppointment.mockReset();
    reopenAppointment.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    await user.click(within(karte).getByRole('button', { name: 'Behandlung abschließen' }));
    const zurueck = await screen.findByRole('button', {
      name: 'Rückgängig: Haken bei Erika Beispiel',
    });
    // Neben der Meldung, nicht in ihr: Die Meldung bleibt ein Satz.
    expect(screen.getByRole('status')).not.toContainElement(zurueck);
    await user.click(zurueck);

    // Derselbe Weg wie im Terminfenster, mit dem Stand unmittelbar vorher.
    await waitFor(() =>
      expect(reopenAppointment).toHaveBeenCalledWith('t1', '2026-10-01T06:05:00Z'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Erika Beispiel wieder offen.');
    expect(screen.queryByRole('button', { name: /^Rückgängig/ })).toBeNull();
  });

  it('öffnet nicht wieder, was inzwischen anders steht (Zweitreview, Befund 3)', async () => {
    fetchAppointment
      .mockResolvedValueOnce({ id: 't1', status: 'confirmed', updated_at: '2026-10-01T06:00:00Z' })
      .mockResolvedValueOnce({ id: 't1', status: 'no_show', updated_at: '2026-10-01T06:07:00Z' });
    completeAppointment.mockResolvedValue(undefined);
    reopenAppointment.mockReset();
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    await user.click(within(karte).getByRole('button', { name: 'Behandlung abschließen' }));
    await user.click(await screen.findByRole('button', { name: /^Rückgängig/ }));
    expect(
      await screen.findByText('Der Termin wurde inzwischen geändert. Bitte im Kalender ansehen.'),
    ).toBeInTheDocument();
    expect(reopenAppointment).not.toHaveBeenCalled();
  });

  it('sagt, wenn „Rückgängig" abgewiesen wird', async () => {
    fetchAppointment.mockResolvedValue({
      id: 't1',
      status: 'completed',
      updated_at: '2026-10-01T06:00:00Z',
    });
    completeAppointment.mockResolvedValue(undefined);
    reopenAppointment.mockReset();
    reopenAppointment.mockRejectedValue(
      new Error('Der Termin konnte nicht wieder geöffnet werden.'),
    );
    const user = userEvent.setup();
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const karte = await findeKarte();

    await user.click(within(karte).getByRole('button', { name: 'Behandlung abschließen' }));
    await user.click(await screen.findByRole('button', { name: /^Rückgängig/ }));
    expect(
      await screen.findByText('Der Termin konnte nicht wieder geöffnet werden.'),
    ).toBeInTheDocument();
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

    const tagesablauf = await screen.findByRole('heading', { name: STRAHL });
    const teamplan = screen.getByRole('heading', { name: 'Tagesplan des Teams' });
    expect(
      tagesablauf.compareDocumentPosition(teamplan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('zaehlt im Kopf, was erledigt ist, und laesst Erledigtes an seiner Stelle stehen', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    // Ein offener Besuch, ein abgeschlossener mit finalisierter Dokumentation.
    expect(await screen.findByText(/^1 von 2 abgehakt · /)).toBeInTheDocument();
    // Der Zeitstrahl ersetzt „Offen heute" und „Erledigt heute".
    expect(screen.queryByText(/^Offen heute/)).toBeNull();
    expect(screen.queryByText(/^Erledigt heute/)).toBeNull();
    const erledigt = zeileImStrahl(/Petra Platzhalter/);
    expect(within(erledigt).getByText('Abgeschlossen')).toBeInTheDocument();
    // Am Telefon unter „Erledigt (1)" zusammengefasst, im Dokument an seiner Stelle.
    expect(erledigt.closest('li')).toHaveClass('max-sm:hidden');
    expect(imStrahl().getByRole('button', { name: /^Erledigt \(1\)/ })).toHaveAttribute(
      'aria-expanded',
      'false',
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
    await user.click(within(karte).getByRole('button', { name: 'Vor der Tür' }));
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
   * BEF-140 (Jannes, 2026-10-10): Der Aufklapper „Organisatorisches und
   * Kommunikation" am Ende der Übersicht ist weggefallen. Er trug nur
   * Vorschaudaten; „Panne melden" bleibt im Fuhrpark erreichbar
   * (`BreakdownPage.test.tsx`).
   */
  it.each([['therapist'], ['team_lead'], ['office']] as const)(
    'zeigt %s keinen Aufklapper „Organisatorisches und Kommunikation" mehr (BEF-140)',
    async (rolle) => {
      renderMitVorschau(<MyDayPage user={testUser([rolle])} />);
      await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
      expect(
        screen.queryByRole('heading', { name: 'Organisatorisches und Kommunikation' }),
      ).toBeNull();
      expect(screen.queryByRole('link', { name: 'Panne melden' })).toBeNull();
      expect(screen.queryByText('Zu entscheiden')).toBeNull();
    },
  );

  it('zeigt keine geschaetzten Wegzeiten mehr - die Wege sind seit MAP-006 echt', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
    expect(screen.queryByText(/Wegzeiten sind geschätzt/)).toBeNull();
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
      expect(screen.getByRole('button', { name: 'Vor der Tür' })).toBeInTheDocument();
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
      // Ohne Stand kein Zeitstrahl.
      expect(screen.queryByRole('heading', { name: STRAHL })).toBeNull();

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

    // BEF-052: Das Druckblatt bekommt jeden Termin des Tages, nicht nur die Karte.
    it('gibt dem Druckblatt den ganzen Tag', async () => {
      druckblatt.mockClear();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Testweg 7, 72072 Tuebingen');
      const props = druckblatt.mock.lastCall?.[0] as {
        termine: readonly unknown[];
        standVon: number | null;
      };
      expect(props.termine).toHaveLength(tagesplan().length);
      expect(props.standVon).toBeNull();
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

      const kachel = (await screen.findByText('Liege heute')).parentElement!;
      // Die Antwort als Wort mit der Uhrzeit darunter; das Häkchen ist Schmuck.
      expect(within(kachel).getByText('Ja')).toBeInTheDocument();
      expect(
        within(kachel).getByText(`ab 2. Besuch, ${uhr(plan[1]!.starts_at)}`),
      ).toBeInTheDocument();
      expect(kachel.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
      expect(kachel).toHaveClass('bg-accent-soft', 'rounded-card');
    });

    it('sagt „Nein", wenn heute niemand die Liege braucht - die eine Tagesfrage bleibt', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const kachel = (await screen.findByText('Liege heute')).parentElement!;
      expect(within(kachel).getByText('Nein')).toBeInTheDocument();
      expect(kachel.querySelector('[aria-hidden="true"]')).toBeNull();
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

      // Der zweite Besuch ist eine Zeile, die als Ganzes aufklappt (Auftrag
      // C1) - „Danach" und „Weitere offene heute" gibt es nicht mehr.
      const zeile = zeileImStrahl(/Max Mustermann/);
      expect(zeile).toHaveAttribute('aria-expanded', 'false');
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

    it('macht ohne Navigationsziel „Doku" zum einen Hauptknopf, der Haken bleibt 48 px (R2, U2)', async () => {
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
      expect(haken.className).not.toContain('bg-accent ');
      expect(haken).toHaveClass('size-12', 'border-line-strong');
      const doku = screen.getByRole('link', { name: 'Doku zu diesem Termin' });
      expect(doku.className).toContain('bg-accent ');
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
      // Ein Hauptknopf je Ansicht (DESIGN.md Regel 4): genau ein gefüllter
      // Knopf in der Karte - und kein zweiter, kleiner Haken daneben.
      const karte = screen.getByRole('article');
      const gefuellt = [...karte.querySelectorAll('a, button')].filter((ziel) =>
        ziel.classList.contains('bg-accent'),
      );
      expect(gefuellt).toEqual([doku]);
      expect(screen.getAllByRole('button', { name: /^Termin abschließen/ })).toHaveLength(1);
      // Der Haken am Ende der Reihe, 12 px neben dem Anruf (P1).
      expect(doku.compareDocumentPosition(haken) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(haken.parentElement).toHaveClass('gap-3');
    });

    it('traegt nach dem Abschliessen an jedem Behandlungstermin einen eigenen Doku-Knopf (L3)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'documented', documentation_status: 'final' }),
        zweiterBesuch({ status: 'completed', documentation_status: 'final' }),
        tagesEintrag({
          id: 't3',
          patient_id: 'p3',
          patient_given_name: 'Petra',
          patient_family_name: 'Platzhalter',
          starts_at: inMinuten(240),
          ends_at: inMinuten(300),
          status: 'cancelled',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByRole('heading', { name: STRAHL });

      const dokus = screen.getAllByRole('link', { name: /^Doku zum Termin um / });
      expect(dokus.map((l) => l.getAttribute('href'))).toEqual([
        `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`,
        `/patienten/p2/doku?termin=t2&zurueck=${encodeURIComponent('/')}`,
      ]);
      // Das sichtbare Wort ist „Doku" (WCAG 2.5.3); die Uhrzeit unterscheidet
      // die Zeilen, ohne den Namen ein weiteres Mal zu nennen. Zum abgesagten
      // Termin gibt es keinen Knopf: Es entsteht keine Dokumentation (ADR-018).
      expect(dokus[0]).toHaveAccessibleName(/^Doku zum Termin um \d{2}:\d{2} Uhr$/);
      expect(dokus).toHaveLength(2);
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
      const fortschritt = await screen.findByText(/^1 von 2 abgehakt · /);

      const kopf = screen.getByRole('heading', { level: 1 }).closest('header')!;
      expect(kopf).toContainElement(fortschritt);
      // „Donnerstag, 1. Oktober 2026" statt „01.10.2026" - ab 640 px.
      expect(
        within(kopf).getByText(
          /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. \S+ \d{4}$/,
        ),
      ).toHaveClass('max-sm:hidden');
      // Am Telefon über der Wochenleiste nur Monat und Jahr: Wochentag und Tag
      // stehen in der Leiste (Design-Review R2, U3; Jannes 13.10.2026).
      expect(within(kopf).getByText(/^[A-ZÄÖÜ][a-zäöü]+ \d{4}$/)).toHaveClass('sm:hidden');
      expect(
        within(kopf).queryByText(
          /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. [^\s\d]+$/,
        ),
      ).toBeNull();
      // Status = Zeichen + Wort (R2, U1): Neben den Punkten steht am Telefon
      // die Kurzform; der ganze Satz bleibt für Vorlesesoftware.
      expect(within(kopf).getByText('1 von 2')).toHaveClass('sm:hidden');
      expect(within(kopf).getByText('1 von 2')).toHaveAttribute('aria-hidden', 'true');
      expect(fortschritt).toHaveClass('max-sm:sr-only');
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
      // „Doku" ist der eine Hauptknopf, der Haken steht 48 px mit Rahmen
      // daneben (Design-Review R2, U2).
      const haken = within(karte).getByRole('button', { name: /^Termin abschließen/ });
      expect(haken.className).not.toContain('bg-accent ');
      expect(haken).toHaveClass('size-12');
      // Ab dem Beginn führt „Doku" direkt auf die Schreibseite (Auftrag C1).
      const doku = within(karte).getByRole('link', { name: 'Doku zu diesem Termin' });
      expect(doku).toHaveAttribute(
        'href',
        `/termine/t1/abschluss?zurueck=${encodeURIComponent('/')}`,
      );
      expect(doku.className).toContain('bg-accent ');
      // Daneben der Anruf, 48 px wie der Haken.
      expect(within(karte).getByRole('link', { name: 'Anrufen: Erika Beispiel' })).toHaveClass(
        'size-12',
      );
      // Am Hausbesuch „Ausfall" an der Karte (Auftrag C1; seit B12 derselbe
      // Name wie an jeder Zeile).
      expect(within(karte).getByRole('button', { name: AUSFALL })).toBeInTheDocument();
      expect(within(karte).queryByRole('button', { name: 'Niemand öffnet?' })).toBeNull();
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

      // Kein Weg mehr: Oben steht, was heute noch offen ist (Auftrag C1).
      const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).closest(
        'section',
      )!;
      expect(offen).toHaveTextContent('Nicht abgeschlossen');
      expect(within(offen).getByRole('link', { name: /^Doku/ })).toHaveAttribute(
        'href',
        `/termine/t1/abschluss?zurueck=${encodeURIComponent('/')}`,
      );
      // Im Strahl trägt die Zeile den Haken; aufgeklappt sagt sie, seit wann.
      expect(imStrahl().getByRole('button', { name: /^Termin abschließen/ })).toBeInTheDocument();
      await userEvent.setup().click(zeileImStrahl(/Erika Beispiel/));
      const karte = await findeKarte();
      expect(
        within(karte).getByRole('heading', { name: `Seit ${uhr(vorbei.ends_at)} offen` }),
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

    it('zeigt am Tagesende keine Abschlusskarte - Morgen und der Strahl stehen gleich da (ANN-546)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'documented', documentation_status: 'final' }),
        zweiterBesuch({ status: 'completed', documentation_status: 'final' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const vorschau = (await screen.findByRole('heading', { name: /^Morgen · / })).closest(
        'section',
      )!;
      expect(within(vorschau).getByRole('link', { name: 'Zum Tag' })).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(todayInTimeZone(ZONE), 1)}`,
      );
      // Die Karte in Tiefgrün sagte nur, was Punkte im Kopf und Strahl schon sagen.
      expect(screen.queryByText('Alle Besuche erledigt')).toBeNull();
      expect(screen.queryByText('Kein Weg mehr offen')).toBeNull();
      expect(document.querySelector('.bg-surface-inverse')).toBeNull();
      expect(screen.getByText(/^2 von 2 abgehakt · /)).toBeInTheDocument();

      expect(screen.queryByText('Liege heute')).toBeNull();
      expect(screen.queryByRole('article')).toBeNull();
      expect(imStrahl().getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
      // Ein Rhythmus: Morgen und der Strahl sind Geschwister mit demselben
      // Abstand, ohne eigenen Außenabstand (Jannes, 2026-10-15).
      const strahl = screen.getByRole('heading', { name: STRAHL }).closest('section')!;
      expect(strahl.parentElement).toBe(vorschau.parentElement);
      expect(vorschau.parentElement).toHaveClass('flex', 'flex-col', 'gap-8');
      for (const abschnitt of [vorschau, strahl]) {
        expect(abschnitt.className).not.toMatch(/(^|\s)(sm:)?m[ty]-/);
      }
    });

    it('teilt die Punkte in Haken und Doku und laesst beim letzten Haken einmal das Rad rollen (ANN-547)', async () => {
      // Vorbei und festgeschrieben, aber noch nicht abgehakt; der zweite ist fertig.
      const vorher = tagesEintrag({
        id: 't1',
        starts_at: inMinuten(-120),
        ends_at: inMinuten(-75),
        documentation_status: 'final',
      });
      let stand: TodayApiModule.DayPlanEntry[] = [
        vorher,
        zweiterBesuch({
          starts_at: inMinuten(-60),
          ends_at: inMinuten(-15),
          status: 'completed',
          documentation_status: 'final',
        }),
      ];
      fetchDayPlan.mockImplementation((tag: string) =>
        Promise.resolve(tag === todayInTimeZone(ZONE) ? stand : []),
      );
      fetchAppointment.mockResolvedValue({ id: 't1', updated_at: '2026-10-01T06:00:00Z' });
      completeAppointment.mockImplementation(() => {
        stand = stand.map((t) => (t.id === 't1' ? { ...t, status: 'completed' } : t));
        return Promise.resolve(undefined);
      });
      const user = userEvent.setup();
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const satz = await screen.findByText('1 von 2 abgehakt · 2 dokumentiert');
      const kopf = satz.closest('div')!;
      // Links der Haken, rechts die Doku: der erste halb, der zweite voll mit ✓.
      const [erster, zweiter] = [...kopf.querySelectorAll('[data-punkt]')];
      expect(erster).toHaveAttribute('data-doku', 'ja');
      expect(erster!.querySelector('[data-haelfte="haken"]')).not.toHaveClass('bg-accent');
      expect(erster!.querySelector('[data-haelfte="doku"]')).toHaveClass('bg-accent');
      expect(zweiter).toHaveAttribute('data-punkt', 'erledigt');
      expect(zweiter!.querySelector('[data-zeichen="haken"]')).not.toBeNull();
      // Geöffnet ohne fertigen Tag: kein Rad.
      expect(container.querySelector('[data-rad]')).toBeNull();

      await user.click(
        imStrahl().getByRole('button', { name: /^Termin abschließen.*Erika Beispiel/ }),
      );

      expect(await screen.findByText('2 von 2 abgehakt · 2 dokumentiert')).toBeInTheDocument();
      const rad = await waitFor(() => {
        const gefunden = container.querySelector('[data-rad]');
        expect(gefunden).not.toBeNull();
        return gefunden!;
      });
      expect(rad).toHaveAttribute('aria-hidden', 'true');
      expect(rad).toHaveClass('fortschritt-rad', 'motion-reduce:hidden');
    });

    it('feiert nicht, wenn der Tag schon fertig geoeffnet wird, und zeigt dem Buero keine Haelften', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
      ]);
      const { container, unmount } = renderMitVorschau(
        <MyDayPage user={testUser(['therapist'])} />,
      );
      await screen.findByText('1 von 1 abgehakt · 1 dokumentiert');
      expect(container.querySelector('[data-rad]')).toBeNull();
      unmount();

      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1', status: 'completed' })]);
      const buero = renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
      expect(await screen.findByText('1 von 1 Besuch erledigt')).toBeInTheDocument();
      expect(buero.container.querySelector('[data-haelfte]')).toBeNull();
      expect(buero.container.querySelector('[data-doku]')).toBeNull();
    });

    it('fuehrt auf der Uebersicht nicht mehr zu den Trainingskund:innen', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' })]);
      renderMitVorschau(<MyDayPage user={testUser(['owner'])} />);
      await screen.findByRole('heading', { name: STRAHL });
      // Der Weg in den Bereich steht in der Navigation.
      expect(screen.queryByRole('link', { name: /Trainingskund/ })).toBeNull();
      expect(document.querySelector('a[href="/training"]')).toBeNull();
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

      // Die Kachel „Abfahrt": späteste Abfahrt und Fahrt. 60 Minuten bis zum
      // Beginn, 12 davon Fahrt - der Puffer reicht und steht deshalb nicht da.
      const kachel = (await screen.findByText('Abfahrt', { exact: true })).parentElement!;
      expect(within(kachel).getByText('≈ 12 min Rad')).toBeInTheDocument();
      expect(kachel).toHaveTextContent(/spätestens \d\d:\d\d/);
      expect(kachel).not.toHaveTextContent(/Puffer/);

      // Die Karte nennt die Anfahrt im Kicker, die Zeile danach im Ort - und
      // darüber liegt der schmale Übergang.
      expect(
        within(await findeKarte()).getByRole('heading', { name: 'Erster Weg · ≈ 12 min' }),
      ).toBeInTheDocument();
      const zeile = zeileImStrahl(/Max Mustermann/);
      expect(zeile).toHaveTextContent('Beispielstrasse 12 · Anfahrt ≈ 9 min');
      // 75 Minuten zwischen Ende und Beginn, 9 Fahrt.
      expect(screen.getByText('≈ 9 min Rad · 66 min Puffer')).toBeInTheDocument();
      expect(screen.queryByText(/Nachbildung/)).toBeNull();

      // Genau ein Aufruf, und hinaus gehen nur Punkte und das Fahrprofil:
      // kein Name, keine Kennung, keine Uhrzeit. Der letzte Punkt ist das Ende
      // des Tages - dieselbe Route wie in Tour und Kalender (UBK-015).
      expect(rufeFunktionAuf).toHaveBeenCalledTimes(1);
      expect(rufeFunktionAuf).toHaveBeenCalledWith('route', {
        waypoints: [
          { lat: 48.52, lon: 9.05 },
          { lat: 48.521, lon: 9.057 },
          { lat: 48.526, lon: 9.064 },
          { lat: 48.52, lon: 9.05 },
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

    it('zeigt den Wegbalken auch an der Karte des naechsten Wegs nach einem abgehakten Besuch (B6)', async () => {
      // Alle Besuche am selben Tag (BEF-120): nur die Uhr steht fest.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T07:00:00Z'));
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const davor = tagesEintrag({
        id: 't3',
        patient_id: 'p3',
        starts_at: inMinuten(-100),
        ends_at: inMinuten(-40),
        status: 'documented',
        documentation_status: 'final',
        patient_given_name: 'Petra',
        patient_family_name: 'Platzhalter',
      });
      const plan = [davor, tagesEintrag({ id: 't1' }), zweiterBesuch()];
      fetchDayPlan.mockResolvedValue(plan);
      fetchDayRoute.mockResolvedValue([
        routenpunkt(plan[0]!, 48.53, 9.05),
        routenpunkt(plan[1]!, 48.521, 9.057),
        routenpunkt(plan[2]!, 48.526, 9.064),
      ]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      rufeFunktionAuf.mockResolvedValue(route('anbieter', 10, 12, 9));
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Die Karte: der Kicker ohne Minuten, darunter der Balken wie über den
      // Zeilen. Das Ende des abgehakten Besuchs ist vorbei: Er beginnt jetzt,
      // wie die Kachel (ANN-196) - 60 Minuten, 12 davon Fahrt.
      const karte = await findeKarte();
      const zahlen = await within(karte).findByText('≈ 12 min Rad · 48 min Puffer');
      expect(within(karte).getByRole('heading', { name: 'Nächster Weg' })).toBeInTheDocument();
      // Die Kachel „Abfahrt" nennt denselben Weg: Am Telefon weichen die Zahlen.
      expect(zahlen).toHaveClass('max-sm:sr-only');
      expect(await screen.findByText('Abfahrt', { exact: true })).toBeInTheDocument();
      // Die Zeile danach behält ihren Balken über sich: 75 Minuten, 9 Fahrt.
      expect(screen.getByText('≈ 9 min Rad · 66 min Puffer')).not.toHaveClass('max-sm:sr-only');

      // Aufgeklappt trägt die spätere Zeile den Balken in der Karte, mit Zahlen.
      await user.click(zeileImStrahl(/Max Mustermann/));
      const spaeter = screen.getAllByRole('article')[1]!;
      expect(within(spaeter).getByRole('heading', { name: 'Später' })).toBeInTheDocument();
      expect(within(spaeter).getByText('≈ 9 min Rad · 66 min Puffer')).not.toHaveClass(
        'max-sm:sr-only',
      );
      expect(screen.getAllByText('≈ 9 min Rad · 66 min Puffer')).toHaveLength(1);
    });

    it('sagt dazu, wenn die Fahrzeiten eine Nachbildung ohne Kartendienst sind', async () => {
      const plan = [tagesEintrag({ id: 't1' })];
      fetchDayPlan.mockResolvedValue(plan);
      fetchDayRoute.mockResolvedValue([routenpunkt(plan[0]!, 48.521, 9.057)]);
      fetchStandorte.mockResolvedValue([STANDORT]);
      rufeFunktionAuf.mockResolvedValue(route('nachbildung', 12));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      await screen.findByText('Abfahrt', { exact: true });
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
      await screen.findByRole('heading', { name: 'Heute noch offen (1)' });
      await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
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
      expect(screen.queryByRole('heading', { name: STRAHL })).toBeNull();
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
      expect(await screen.findByText(/^0 von 1 abgehakt · /)).toBeInTheDocument();
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
      expect(screen.queryByText('Liege heute')).toBeNull();
      expect(imStrahl().getByRole('link', { name: /Teambesprechung/ })).toBeInTheDocument();
    });

    it('sagt ohne jeden Termin, dass keine Besuche zugeordnet sind - ohne leeren Strahl', async () => {
      fetchDayPlan.mockResolvedValue([]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: STRAHL })).toBeNull();
    });

    it('nennt einen erledigten Tag mit Besuch nicht leer', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText(/^1 von 1 abgehakt · /)).toBeInTheDocument();
      expect(imStrahl().getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
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
      const besucht = zeileImStrahl(/Erika Beispiel/);
      expect(besucht).toHaveTextContent('Doku im Entwurf');
      expect(await screen.findByText(/^1 von 2 abgehakt · /)).toBeInTheDocument();
    });

    it('listet ohne ausstehenden Besuch die offene Doku vor allem anderen (Auftrag C1, UEB-04)', async () => {
      // Nur heute und danach: Die Tage davor stünden sonst alle unter „Nachzuholen".
      const heute = todayInTimeZone(ZONE);
      const plan = [
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
      ];
      fetchDayPlan.mockImplementation((tag: string) => Promise.resolve(tag < heute ? [] : plan));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Zuerst „Heute noch offen" - vor der Vorschau auf morgen.
      const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (2)' })).closest(
        'section',
      )!;
      const vorschau = await screen.findByText(/^Morgen · /);
      expect(
        offen.compareDocumentPosition(vorschau) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const zeilen = within(offen).getAllByRole('listitem');
      expect(zeilen[0]).toHaveTextContent('Erika Beispiel');
      expect(zeilen[0]).toHaveTextContent('Doku im Entwurf');
      expect(zeilen[1]).toHaveTextContent('Max Mustermann');
      expect(zeilen[1]).toHaveTextContent('Doku offen');
      // Ein Tipp führt direkt auf die Schreibseite, nicht über die Akte.
      expect(within(zeilen[0]!).getByRole('link', { name: /^Doku/ })).toHaveAttribute(
        'href',
        `/termine/t1/abschluss?zurueck=${encodeURIComponent('/')}`,
      );
      // Keine zweite Karte dafür, kein Haken mehr, keine Navigation.
      expect(screen.queryByRole('article')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Termin abschließen/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
    });

    // B4 (BEF-154): Festschreiben hakt nicht ab. Am Tagesende steht der Besuch
    // mit festgeschriebener Doku, aber ohne Haken, als „Haken fehlt“ - mit dem
    // Haken als Aktion. Heilmittel bestätigt seit B7 niemand mehr.
    it('nennt am Tagesende einen festgeschriebenen Besuch ohne Haken (B4, B7)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          status: 'documented',
          documentation_status: 'final',
          checked_at: '2026-10-01T07:00:00Z',
        }),
        // Vorbei, festgeschrieben, nicht abgehakt.
        zweiterBesuch({
          status: 'documented',
          documentation_status: 'final',
          checked_at: null,
          starts_at: inMinuten(-120),
          ends_at: inMinuten(-75),
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).closest(
        'section',
      )!;
      expect(offen).toHaveTextContent('Max Mustermann');
      expect(offen).toHaveTextContent('Haken fehlt');
      expect(
        within(offen).getByRole('button', { name: 'Termin abschließen: Max Mustermann' }),
      ).toBeInTheDocument();
      expect(offen).not.toHaveTextContent('Heilmittel');
      expect(fetchLeistungenAmTermin).not.toHaveBeenCalled();
    });

    // K5: Wer während des Besuchs festschreibt, hakt gleich an der Zeile ab -
    // nicht erst nach dem Ende (B4).
    it('bietet den Haken an der Zeile, sobald die Doku festgeschrieben ist - auch vor dem Ende (B4, K5)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          status: 'documented',
          documentation_status: 'final',
          checked_at: null,
          starts_at: inMinuten(-20),
          ends_at: inMinuten(40),
        }),
        zweiterBesuch(),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByRole('button', { name: 'Termin abschließen: Erika Beispiel' }),
      ).toBeInTheDocument();
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
      await screen.findByRole('heading', { name: 'Tagesplan des Teams' });

      const koepfe = [...container.querySelectorAll('summary')];
      // Teamplan und Tagesroute - „Weitere offene" und „Erledigt" hat der
      // Zeitstrahl ersetzt, „Organisatorisches" ist mit BEF-140 entfallen.
      // „Nachzuholen" (Auftrag C1) prüft `NochOffen.test.tsx`.
      expect(koepfe).toHaveLength(2);
      for (const kopf of koepfe) {
        expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
        expect(kopf).toHaveClass('min-h-11');
      }
      // Ein Stil für alle Aufklapper der Übersicht (Design-Review R2, U5): als
      // Karte, der Titel eine Überschrift in 600, ohne Versalien - wie
      // „Nachzuholen". Bis dahin standen drei Stile auf einer Seite.
      for (const kopf of koepfe) {
        expect(kopf).toHaveClass('font-semibold');
        expect(kopf).not.toHaveClass('uppercase');
        expect(kopf.closest('details')).toHaveClass('rounded-card', 'border');
        expect(kopf.querySelector('h2')).not.toBeNull();
      }
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
      // Ein Name, ein Ziel: In der Zeile ist die ganze Zeile das Ziel - sie
      // klappt auf (Auftrag C1); an der Karte führt „Termin →" in der
      // Kopfzeile in den Termin (Praxis-Review R2, P1).
      const user = userEvent.setup();
      await user.click(zeileImStrahl(/Max Mustermann/));
      const karten = screen.getAllByRole('article');
      expect(karten).toHaveLength(2);
      expect(within(karten[1]!).getByRole('link', { name: 'Termin öffnen' })).toHaveAttribute(
        'href',
        `/kalender?termin=t2&zurueck=${encodeURIComponent('/')}`,
      );
    });

    it('klappt eine spätere Zeile mit Navigation, Anruf und Doku auf und wieder zu (Auftrag C1)', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' }), zweiterBesuch()]);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();

      // Zugeklappt: Doku und Anruf an der Zeile, kein Haken - einen späteren
      // Besuch hakt niemand vorab ab.
      const zeile = zeileImStrahl(/Max Mustermann/);
      const li = zeile.closest('li')!;
      expect(within(li).getByRole('link', { name: 'Anrufen: Max Mustermann' })).toHaveAttribute(
        'href',
        'tel:+491600000006',
      );
      expect(within(li).queryByRole('button', { name: /^Termin abschließen/ })).toBeNull();

      await user.click(zeile);
      const karte = within(li).getByRole('article');
      expect(within(karte).getByRole('heading', { name: /^Später/ })).toBeInTheDocument();
      expect(within(karte).getByText('Beispielstrasse 12, 72070 Tuebingen')).toBeInTheDocument();
      // Die Navigation ohne Hauptfarbe: Der eine Hauptknopf bleibt am nächsten Weg.
      const navigation = within(karte).getByRole('button', { name: 'Navigation starten' });
      expect(navigation.className).not.toContain('bg-accent ');
      expect(within(karte).getByRole('link', { name: 'Doku zu diesem Termin' })).toHaveAttribute(
        'href',
        `/patienten/p2/doku?termin=t2&zurueck=${encodeURIComponent('/')}`,
      );
      expect(
        within(karte).getByRole('link', { name: 'Anrufen: Max Mustermann' }),
      ).toBeInTheDocument();
      const zu = within(karte).getByRole('button', { name: 'Zuklappen: Max Mustermann' });
      expect(zu).toHaveFocus();

      await user.click(zu);
      expect(within(li).queryByRole('article')).toBeNull();
      expect(zeileImStrahl(/Max Mustermann/)).toHaveFocus();
    });

    // B4 (BEF-154): Der Haken lässt sich jederzeit zurücknehmen - auch nach
    // dem Festschreiben, an der aufgeklappten Zeile des Besuchs.
    it('nimmt den Haken an einer abgehakten, dokumentierten Zeile zurück (B4)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          status: 'documented',
          documentation_status: 'final',
          checked_at: '2026-10-01T07:00:00Z',
          starts_at: inMinuten(-120),
          ends_at: inMinuten(-75),
        }),
        zweiterBesuch(),
      ]);
      fetchAppointment.mockResolvedValue({
        id: 't1',
        status: 'documented',
        completed_at: '2026-10-01T07:00:00Z',
        updated_at: '2026-10-01T07:00:00Z',
      });
      reopenAppointment.mockReset();
      reopenAppointment.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();

      const zeile = zeileImStrahl(/Erika Beispiel/);
      const li = zeile.closest('li')!;
      await user.click(zeile);
      const karte = within(li).getByRole('article');
      await user.click(
        within(karte).getByRole('button', { name: 'Haken zurücknehmen: Haken bei Erika Beispiel' }),
      );

      await waitFor(() =>
        expect(reopenAppointment).toHaveBeenCalledWith('t1', '2026-10-01T07:00:00Z'),
      );
      expect(
        await screen.findByText('Haken bei Erika Beispiel zurückgenommen.'),
      ).toBeInTheDocument();
    });

    it('bietet an einer nicht abgehakten Zeile kein Zurücknehmen an', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' }), zweiterBesuch()]);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();

      const zeile = zeileImStrahl(/Max Mustermann/);
      const li = zeile.closest('li')!;
      await user.click(zeile);
      expect(within(li).getByRole('article')).toBeInTheDocument();
      expect(within(li).queryByRole('button', { name: /^Haken zurücknehmen/ })).toBeNull();
    });

    it('kündigt eine Verspätung als SMS aus dem eigenen Telefon an (ANN-476)', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' })]);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const karte = await findeKarte();

      const spaeter = within(karte).getByRole('button', { name: 'Später da?' });
      expect(spaeter).toHaveAttribute('aria-expanded', 'false');
      await user.click(spaeter);
      const gruppe = within(karte).getByRole('group', { name: 'Verspätung per SMS ankündigen' });
      const zehn = within(gruppe).getByRole('link', { name: /10 min/ });
      const ziel = zehn.getAttribute('href')!;
      expect(ziel).toMatch(/^sms:\+491600000006\?&body=/);
      const text = decodeURIComponent(ziel.split('body=')[1]!);
      expect(text).toContain('etwa 10 Minuten später');
      // Kein Name, kein Grund: nur Praxis und Minuten.
      expect(text).not.toMatch(/Erika|Beispiel|Behandlung/);
      expect(within(gruppe).getAllByRole('link')).toHaveLength(3);
    });

    it('meldet eine Panne vom Weg zum Hausbesuch aus (BEF-176)', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' })]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const karte = await findeKarte();
      expect(within(karte).getByRole('link', { name: 'Panne melden' })).toHaveAttribute(
        'href',
        '/betrieb/flotte/panne?zurueck=%2F',
      );
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
      const zeile = zeileImStrahl(/Erika Beispiel/);
      expect(zeile).toHaveTextContent('Nicht abgeschlossen');
      expect(
        imStrahl().getByRole('button', { name: /^Termin abschließen.*Erika Beispiel/ }),
      ).toBeInTheDocument();
      // Erledigt ist nur, was abgehakt ist.
      expect(screen.getByText(/^0 von 2 abgehakt · /)).toBeInTheDocument();
    });

    it('nennt nach dem letzten Besuch, was noch offen ist, solange ein Haken fehlt', async () => {
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

      expect(await screen.findByText(/^1 von 2 abgehakt · /)).toBeInTheDocument();
      // Der liegengebliebene steht unter „Heute noch offen" - zum Abschließen
      // über die Schreibseite, im Strahl mit dem Haken.
      const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).closest(
        'section',
      )!;
      expect(offen).toHaveTextContent('Max Mustermann');
      expect(offen).toHaveTextContent('Nicht abgeschlossen');
      expect(
        imStrahl().getByRole('button', { name: /^Termin abschließen.*Max Mustermann/ }),
      ).toBeInTheDocument();
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

      const tagesablauf = await screen.findByRole('heading', { name: STRAHL });
      const teamplan = screen.getByRole('heading', { name: 'Tagesplan des Teams' });
      expect(
        teamplan.compareDocumentPosition(tagesablauf) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe('UBK-003: Tageswechsel (ANN-234)', () => {
    const heute = () => todayInTimeZone(ZONE);

    it('zeigt die Woche ab heute mit einem Punkt je Termin (Jannes, 2026-10-11)', async () => {
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' }), zweiterBesuch()]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const nav = await screen.findByRole('navigation', { name: 'Tag wählen' });
      const tage = within(nav).getAllByRole('listitem');
      expect(tage).toHaveLength(7);
      const heuteLink = within(tage[0]!).getByRole('link');
      expect(heuteLink).toHaveAttribute('href', '/');
      expect(heuteLink).toHaveAttribute('aria-current', 'date');
      await waitFor(() => expect(heuteLink).toHaveAccessibleName(/, heute: 2 Termine$/));
      expect(heuteLink.querySelectorAll('[data-punkte] > span')).toHaveLength(2);
      // Reihen zu drei: Die Punkte bleiben in ihrer Tageszelle (Jannes, 13.10.2026).
      expect(heuteLink.querySelector('[data-punkte]')).toHaveClass('grid-cols-[repeat(3,4px)]');
      expect(within(tage[1]!).getByRole('link')).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(heute(), 1)}`,
      );
      expect(within(nav).getByRole('link', { name: 'Vorige Woche' })).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(heute(), -7)}`,
      );
      expect(within(nav).getByRole('link', { name: 'Nächste Woche' })).toHaveAttribute(
        'href',
        `/?tag=${tagePlus(heute(), 7)}`,
      );
      // Jeder Tag der Leiste fragt seine Liste einmal ab - derselbe Lesepfad.
      for (let abstand = 0; abstand < 7; abstand += 1) {
        expect(fetchDayPlan).toHaveBeenCalledWith(tagePlus(heute(), abstand), EIGENE_STAFF_ID);
      }
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
      expect(screen.getByText('Liege morgen').parentElement).toHaveTextContent(/Jaab 2\. Besuch, /);
      expect(within(karte).getByRole('heading', { name: 'Erster Weg' })).toBeInTheDocument();
      expect(screen.queryByText(/^Jetzt, /)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Termin abschließen/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Behandlung abschließen/ })).toBeNull();
      // Eine Verspätung gibt es nur heute (Auftrag C1).
      expect(screen.queryByRole('button', { name: 'Später da?' })).toBeNull();
      // Der Teamplan fragt denselben Tag ab.
      const query = fetchAppointments.mock.calls.at(-1)?.[0] as AppointmentsApiModule.CalendarQuery;
      expect(query.von).toBe(morgen);

      // Die Leiste bleibt bei der Woche ab heute; morgen ist gewählt.
      const nav = screen.getByRole('navigation', { name: 'Tag wählen' });
      const tage = within(nav).getAllByRole('listitem');
      expect(within(tage[0]!).getByRole('link')).toHaveAttribute('href', '/');
      expect(within(tage[1]!).getByRole('link')).toHaveAttribute('aria-current', 'date');
    });

    it('zeigt gestern, was liegen blieb', async () => {
      const gestern = tagePlus(heute(), -1);
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
        zweiterBesuch(),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />, `/?tag=${gestern}`);

      const offen = (
        await screen.findByRole('heading', { name: 'Gestern noch offen (1)' })
      ).closest('section')!;
      expect(offen).toHaveTextContent('Max Mustermann');
      expect(imStrahl().getByRole('button', { name: /^Termin abschließen/ })).toBeInTheDocument();
    });

    it('zeigt an einem Tag ohne Besuch, was morgen kommt (Jannes, 2026-10-11)', async () => {
      const morgen = tagePlus(heute(), 1);
      fetchDayPlan.mockImplementation((datum: string) =>
        Promise.resolve(
          datum === morgen
            ? [tagesEintrag({ id: 't1' }), zweiterBesuch({ treatment_table_required: true })]
            : [],
        ),
      );
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet'),
      ).toBeInTheDocument();
      const vorschau = (await screen.findByRole('heading', { name: /^Morgen · / })).closest(
        'section',
      )!;
      expect(within(vorschau).getByRole('link', { name: 'Zum Tag' })).toHaveAttribute(
        'href',
        `/?tag=${morgen}`,
      );
      expect(within(vorschau).getByText('Liege morgen').parentElement).toHaveTextContent(
        /Jaab 2\. Besuch, /,
      );
      expect(within(vorschau).getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
      // Ohne Karte und ohne Knöpfe: Morgen wird nichts abgehakt.
      expect(within(vorschau).queryByRole('article')).toBeNull();
      expect(within(vorschau).queryByRole('button')).toBeNull();
    });

    it('stellt ohne eigenen Besuch heute vor morgen, den Leerzustand in einer Karte (R2, U4)', async () => {
      // Das Büro: heute nur eine Fehlzeit, morgen nichts.
      fetchDayPlan.mockImplementation((datum: string) =>
        Promise.resolve(
          datum === heute()
            ? [
                tagesEintrag({
                  id: 'f1',
                  kind: 'internal',
                  patient_id: null,
                  title: 'Teambesprechung',
                  documentation_status: null,
                }),
              ]
            : [],
        ),
      );
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const leer = await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet');
      expect(leer.parentElement).toHaveClass('rounded-card', 'border', 'bg-surface');
      const heuteTitel = await screen.findByRole('heading', { name: /^Heute · / });
      const morgenTitel = await screen.findByRole('heading', { name: /^Morgen · / });
      const folgt = (a: Node, b: Node) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(folgt(leer, heuteTitel)).toBe(true);
      expect(folgt(heuteTitel, morgenTitel)).toBe(true);
      // Der Leerzustand von morgen ist gebaut wie der von heute (R3, U4).
      const morgenLeer = within(morgenTitel.closest('section')!).getByText(
        'Morgen sind Ihnen keine Termine zugeordnet',
      );
      expect(morgenLeer.parentElement).toHaveClass('rounded-card', 'border', 'bg-surface');
      expect(
        within(heuteTitel.closest('section')!).getByText('Teambesprechung'),
      ).toBeInTheDocument();
    });

    it('zeigt keine Morgen-Vorschau, solange heute ein Weg aussteht', async () => {
      // Morgens, damit der Besuch noch aussteht (BEF-120).
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T05:00:00Z'));
      onTestFinished(() => {
        vi.useRealTimers();
      });
      fetchDayPlan.mockResolvedValue([tagesEintrag({ id: 't1' })]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await findeKarte();
      expect(screen.queryByRole('heading', { name: /^Morgen · / })).toBeNull();
    });

    it('faellt bei einem unsinnigen Tag still auf heute zurueck', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />, '/?tag=2026-02-30');
      await screen.findByRole('navigation', { name: 'Tag wählen' });
      expect(fetchDayPlan).toHaveBeenCalledWith(heute(), EIGENE_STAFF_ID);
    });
  });

  describe('B12: „Ausfall" an jeder Zeile (ANN-533)', () => {
    /** Ein Besuch, der vorbei ist - weder abgehakt noch dokumentiert. */
    function vorbei(teil: Partial<TodayApiModule.DayPlanEntry>): TodayApiModule.DayPlanEntry {
      return tagesEintrag({ starts_at: inMinuten(-180), ends_at: inMinuten(-135), ...teil });
    }

    const anna = vorbei({
      id: 'a',
      patient_id: 'pa',
      patient_given_name: 'Anna',
      patient_family_name: 'Ausfall',
    });
    const bernd = vorbei({
      id: 'b',
      patient_id: 'pb',
      starts_at: inMinuten(-130),
      ends_at: inMinuten(-100),
      appointment_type: 'practice',
      location_name: 'Hauptstandort',
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
      patient_given_name: 'Bernd',
      patient_family_name: 'Praxis',
    });

    /** Der Eintrag (`li`) einer Zeile im Strahl. */
    async function eintragVon(name: RegExp): Promise<HTMLElement> {
      return (await imStrahlFinden(name)).closest('li')!;
    }

    beforeEach(() => {
      fetchAppointment.mockReset();
      fetchAppointment.mockImplementation((id: string) =>
        Promise.resolve({ id, status: 'confirmed', updated_at: '2026-10-01T06:00:00Z' }),
      );
      recordNoShow.mockReset();
      recordNoShow.mockResolvedValue(undefined);
    });

    /** Begonnen ohne Doku (Anna, Bernd), mit Entwurf, abgehakt und noch nicht begonnen. */
    function tagMitAllenFaellen(): TodayApiModule.DayPlanEntry[] {
      return [
        anna,
        bernd,
        vorbei({
          id: 'c',
          patient_id: 'pc',
          starts_at: inMinuten(-90),
          ends_at: inMinuten(-60),
          documentation_status: 'draft',
          patient_given_name: 'Clara',
          patient_family_name: 'Entwurf',
        }),
        vorbei({
          id: 'd',
          patient_id: 'pd',
          starts_at: inMinuten(-50),
          ends_at: inMinuten(-20),
          status: 'completed',
          patient_given_name: 'Dora',
          patient_family_name: 'Abgehakt',
        }),
        tagesEintrag({ id: 't1' }),
        zweiterBesuch(),
      ];
    }

    it('steht an jeder begonnenen Behandlung ohne Doku - am Hausbesuch wie in der Praxis', async () => {
      fetchDayPlan.mockResolvedValue(tagMitAllenFaellen());
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Am Hausbesuch und in der Praxis, leise und 44 px hoch.
      const eintrag = await eintragVon(/Anna Ausfall/);
      const ausfall = within(eintrag).getByRole('button', { name: AUSFALL });
      expect(ausfall).toHaveClass('min-h-11', 'text-accent');
      expect(ausfall.className).not.toContain('border-line-strong');
      // Für Vorlesesoftware unterscheidbar: das Wort zuerst, dann wessen Termin (UEB-10).
      expect(ausfall).toHaveAccessibleName(
        `Ausfall für Anna Ausfall um ${uhr(anna.starts_at)} Uhr`,
      );
      expect(
        within(await eintragVon(/Bernd Praxis/)).getByRole('button', { name: AUSFALL }),
      ).toHaveAccessibleName(`Ausfall für Bernd Praxis um ${uhr(bernd.starts_at)} Uhr`);

      // Vor „Doku" und dem Haken, 12 px auseinander; am Telefon rücken die
      // Knöpfe unter Name und Ort, rechtsbündig.
      const doku = within(eintrag).getByRole('link', { name: /^Doku/ });
      const haken = within(eintrag).getByRole('button', { name: /^Termin abschließen/ });
      expect(ausfall.compareDocumentPosition(doku) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(doku.compareDocumentPosition(haken) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const zeile = zeileImStrahl(/Anna Ausfall/);
      expect(zeile).toHaveClass('max-sm:basis-full');
      expect(zeile.parentElement).toHaveClass('flex-wrap', 'justify-end', 'gap-3');
      expect(zeile.parentElement).toContainElement(ausfall);
    });

    it('steht nicht vor dem Beginn, nicht mit Doku-Entwurf und nicht nach dem Haken', async () => {
      fetchDayPlan.mockResolvedValue(tagMitAllenFaellen());
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Mit Entwurf, abgehakt, vor dem Beginn: kein Ausfall, die Zeile bleibt, wie sie war.
      for (const name of [/Clara Entwurf/, /Dora Abgehakt/, /Max Mustermann/]) {
        expect(within(await eintragVon(name)).queryByRole('button', { name: AUSFALL })).toBeNull();
        expect(zeileImStrahl(name)).not.toHaveClass('max-sm:basis-full');
        expect(zeileImStrahl(name).parentElement).not.toHaveClass('flex-wrap');
      }
      // Der nächste Weg hat noch nicht begonnen.
      expect(within(await findeKarte()).queryByRole('button', { name: AUSFALL })).toBeNull();
    });

    it('steht nur für die Rollen der Terminverwaltung - auch für das Büro', async () => {
      fetchDayPlan.mockResolvedValue([anna]);
      const { unmount } = renderMitVorschau(<MyDayPage user={testUser(['trainer'])} />);
      await imStrahlFinden(/Anna Ausfall/);
      expect(screen.queryByRole('button', { name: AUSFALL })).toBeNull();
      unmount();

      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
      expect(
        within(await eintragVon(/Anna Ausfall/)).getByRole('button', { name: AUSFALL }),
      ).toBeInTheDocument();
    });

    it('führt am Hausbesuch durch das Protokoll - die Gebühr erst nach allen drei Schritten', async () => {
      fetchDayPlan.mockResolvedValue([anna, tagesEintrag({ id: 't1' })]);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const eintrag = await eintragVon(/Anna Ausfall/);

      // Seit Überholung 6 ein Fenster mit einer Frage je Seite (ANN-573).
      await user.click(within(eintrag).getByRole('button', { name: AUSFALL }));
      const erste = screen.getByRole('dialog', { name: 'An der Tür geklingelt?' });
      // Die anderen Fälle führen aus der Übersicht, nicht auf Knöpfe des Terminfensters.
      expect(
        within(erste).getByRole('link', { name: 'Ohne Behandlung festhalten' }),
      ).toHaveAttribute(
        'href',
        expect.stringMatching(/^\/termine\/a\/abschluss\?ohne-behandlung=1/),
      );

      await user.click(within(erste).getByRole('button', { name: 'Ja, geklingelt' }));
      await user.click(await screen.findByRole('button', { name: 'Angerufen, niemand erreicht' }));
      const vermerken = await screen.findByRole('button', { name: /nicht angetroffen/ });
      // Die Uhr läuft; vor der Viertelstunde wird nichts vermerkt.
      expect(screen.getByRole('timer')).toBeInTheDocument();
      expect(vermerken).toBeDisabled();
      await user.click(vermerken);
      expect(recordNoShow).not.toHaveBeenCalled();

      await user.click(screen.getByRole('checkbox', { name: 'Schon vorher 15 Minuten gewartet' }));
      await user.click(vermerken);
      // Den Stand liest der Ablauf unmittelbar vorher - die Tagesliste kennt ihn nicht.
      await waitFor(() =>
        expect(recordNoShow).toHaveBeenCalledWith('a', '2026-10-01T06:00:00Z', true),
      );
      expect(fetchAppointment).toHaveBeenCalledWith('a');
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.',
      );
    });

    it('bestätigt am Praxistermin ohne Gebühr und ohne Protokoll', async () => {
      fetchDayPlan.mockResolvedValue([bernd, tagesEintrag({ id: 't1' })]);
      const user = userEvent.setup();
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const eintrag = await eintragVon(/Bernd Praxis/);

      await user.click(within(eintrag).getByRole('button', { name: AUSFALL }));
      // Dieselbe Rückfrage wie im Terminfenster (`NichtAngetroffenAktion`):
      // Fläche mit Linie links, unter „Doku“ und dem Haken der Zeile.
      const feld = within(eintrag).getByRole('group', {
        name: `Ausfall für Bernd Praxis um ${uhr(bernd.starts_at)} Uhr`,
      });
      expect(feld).toHaveClass('border-l-4', 'order-last', 'w-full');
      expect(feld).not.toHaveClass('rounded-card');
      expect(feld.parentElement).toBe(zeileImStrahl(/Bernd Praxis/).parentElement);
      expect(within(feld).queryByRole('checkbox')).toBeNull();
      expect(feld).toHaveTextContent(/für Bernd Praxis wird als „nicht angetroffen“ geführt/);
      expect(feld).not.toHaveTextContent(/Ausfallhonorar/);
      const ja = within(feld).getByRole('button', { name: 'Ja, niemand angetroffen' });
      expect(ja).toHaveFocus();

      // „Abbrechen" schließt und gibt den Fokus zurück.
      await user.click(within(feld).getByRole('button', { name: 'Abbrechen' }));
      expect(within(eintrag).queryByRole('group', { name: AUSFALL })).toBeNull();
      await waitFor(() =>
        expect(within(eintrag).getByRole('button', { name: AUSFALL })).toHaveFocus(),
      );

      await user.click(within(eintrag).getByRole('button', { name: AUSFALL }));
      await user.click(within(eintrag).getByRole('button', { name: 'Ja, niemand angetroffen' }));
      await waitFor(() =>
        expect(recordNoShow).toHaveBeenCalledWith('b', '2026-10-01T06:00:00Z', false),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Als „nicht angetroffen“ vermerkt.',
      );
      expect(screen.getByRole('status')).not.toHaveTextContent(/Ausfallhonorar/);
    });

    it('steht auch in der aufgeklappten Zeile und an der Karte des nächsten Wegs ab dem Beginn', async () => {
      fetchDayPlan.mockResolvedValue([
        anna,
        tagesEintrag({ id: 't1', starts_at: inMinuten(-10), ends_at: inMinuten(35) }),
      ]);
      const user = userEvent.setup();
      const { unmount } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // An der Tür: derselbe Name, mit Rahmen; er öffnet das Fenster.
      const karte = await findeKarte();
      const tuer = within(karte).getByRole('button', { name: AUSFALL });
      expect(tuer.className).toContain('border-line-strong');
      await user.click(tuer);
      const fenster = screen.getByRole('dialog', { name: 'An der Tür geklingelt?' });
      await user.click(within(fenster).getByRole('button', { name: 'Abbrechen' }));

      // Aufgeklappt: in der Karte, mit Rahmen.
      await user.click(zeileImStrahl(/Anna Ausfall/));
      const karten = screen.getAllByRole('article');
      const annasKarte = karten.find((k) => within(k).queryByText('Anna Ausfall'))!;
      const knopf = within(annasKarte).getByRole('button', { name: AUSFALL });
      expect(knopf.className).toContain('border-line-strong');
      await user.click(knopf);
      expect(screen.getByRole('dialog', { name: 'An der Tür geklingelt?' })).toBeInTheDocument();
      unmount();

      // Mit einem Entwurf steht an der Tür kein Ausfall: Der Server wiese ihn ab.
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          id: 't1',
          starts_at: inMinuten(-10),
          ends_at: inMinuten(35),
          documentation_status: 'draft',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      expect(within(await findeKarte()).queryByRole('button', { name: AUSFALL })).toBeNull();
    });

    it('bietet ihn an der Karte des nächsten Wegs auch am laufenden Praxistermin an', async () => {
      fetchDayPlan.mockResolvedValue([
        { ...bernd, id: 't1', starts_at: inMinuten(-10), ends_at: inMinuten(35) },
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const karte = await findeKarte();
      expect(within(karte).getByRole('button', { name: AUSFALL })).toBeInTheDocument();
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

// BEF-179 (ANN-675): Ein zurückgewiesener Freizeitausgleich steht unter „noch
// offen“, bis sein Tag vorbei ist - die Zeilen selbst prüft `NochOffen.test.tsx`.
describe('Übersicht: zurückgewiesener Freizeitausgleich (BEF-179)', () => {
  const ZURUECKGEWIESEN: TimeAccountApiModule.RejectedTimeOff = {
    id: 'z1',
    on_date: tagePlus(todayInTimeZone(ZONE), 1),
    starts_at: '08:00',
    ends_at: '10:00',
  };

  beforeEach(() => {
    fetchDayPlan.mockReset();
    fetchAppointments.mockReset();
    fetchAppointments.mockResolvedValue([]);
    fetchAbrechnungslage.mockReset();
    fetchAbrechnungslage.mockResolvedValue(null);
    fetchDayRoute.mockReset();
    fetchDayRoute.mockResolvedValue([]);
    fetchStandorte.mockReset();
    fetchStandorte.mockResolvedValue([]);
    fetchLeistungenAmTermin.mockReset();
    fetchLeistungenAmTermin.mockResolvedValue(null);
    fetchRejectedTimeOff.mockReset();
    fetchRejectedTimeOff.mockResolvedValue([ZURUECKGEWIESEN]);
  });

  it('steht unter dem Strahl, solange ein Besuch aussteht - der nächste Weg bleibt oben', async () => {
    fetchDayPlan.mockResolvedValue(tagesplan());
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).closest(
      'section',
    )!;
    expect(offen).toHaveTextContent('Freizeitausgleich zurückgewiesen');
    expect(offen).toHaveTextContent('Freizeitausgleich zurückgewiesen');
    expect(offen).toHaveTextContent('08:00–10:00 wieder Arbeitszeit');
    // Nur die Zurückweisung: Die Besuche stehen weiter im Strahl.
    expect(within(offen).getAllByRole('listitem')).toHaveLength(1);
    const karte = await findeKarte();
    const strahl = screen.getByRole('heading', { name: STRAHL }).closest('section')!;
    for (const davor of [karte, strahl]) {
      expect(davor.compareDocumentPosition(offen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('steht am Tagesende unter den Besuchen im selben Abschnitt', async () => {
    const heute = todayInTimeZone(ZONE);
    const plan = [
      tagesEintrag({
        id: 't1',
        starts_at: inMinuten(-240),
        ends_at: inMinuten(-195),
        status: 'completed',
        documentation_status: 'none',
      }),
    ];
    fetchDayPlan.mockImplementation((tag: string) => Promise.resolve(tag < heute ? [] : plan));
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const offen = (await screen.findByRole('heading', { name: 'Heute noch offen (2)' })).closest(
      'section',
    )!;
    const zeilen = within(offen).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('Erika Beispiel');
    expect(zeilen[1]).toHaveTextContent('Freizeitausgleich zurückgewiesen');
    expect(screen.getAllByRole('heading', { name: /noch offen/ })).toHaveLength(1);
  });

  it('fragt an einem anderen Tag nicht und zeigt nichts', async () => {
    fetchDayPlan.mockResolvedValue([]);
    renderMitVorschau(
      <MyDayPage user={testUser(['therapist'])} />,
      `/?tag=${tagePlus(todayInTimeZone(ZONE), 1)}`,
    );
    await screen.findByText(/^Morgen sind Ihnen keine Besuche zugeordnet/);
    expect(fetchRejectedTimeOff).not.toHaveBeenCalled();
    expect(screen.queryByText('Freizeitausgleich zurückgewiesen')).toBeNull();
  });
});
