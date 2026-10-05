import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vergissKalenderstaende } from './kalenderstand';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as AppointmentsApi from './api';
import type * as SchedulingApi from '@/features/scheduling/api';
import type * as RouterModul from 'react-router-dom';
import type * as TagesrouteModul from '@/features/tours/tagesroute';
import type * as StartortModul from '@/features/tours/startort';
import type * as FunktionModul from '@/lib/location/funktion';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import { ZOOM_STANDARD } from './calendar';

/**
 * Eine Stunde nach unten, in Pixeln der voreingestellten Zoomstufe (CAL-011).
 *
 * Abgeleitet statt fest verdrahtet: das Gitter ist seit CAL-011 zoombar, und
 * eine Zahl wie "56 px sind eine Stunde" waere beim naechsten Wechsel der
 * Voreinstellung still falsch geworden.
 */
const EINE_STUNDE = ZOOM_STANDARD;

const navigate = vi.fn();

// Nur useNavigate wird ersetzt: useSearchParams traegt die Kalenderparameter
// und muss echt bleiben.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TIM = '55555555-5555-4555-8555-000000000004';
const ORT = '33333333-3333-4333-8333-000000000001';
const PATIENT = '66666666-6666-4666-8666-000000000001';

/** 12.05.2027 ist ein Mittwoch; die Woche laeuft vom 10. bis zum 16.05. */
const HEUTE = '2027-05-12';

function eintrag(
  ueberschreibung: Partial<AppointmentsApi.CalendarEntry> = {},
): AppointmentsApi.CalendarEntry {
  return {
    id: '77777777-7777-4777-8777-000000000001',
    patient_id: PATIENT,
    kind: 'therapy',
    title: null,
    staff_member_id: STAFF_ANNA,
    location_id: ORT,
    appointment_type: 'practice',
    status: 'confirmed',
    // 07:00 UTC = 09:00 Ortszeit Europe/Berlin (Sommerzeit).
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: 'Hauptstandort Tuebingen',
    ...ueberschreibung,
  };
}

const fetchAppointments = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchAssignableTrainers = vi.fn();
const fetchLocations = vi.fn();
const fetchAppointment = vi.fn();
const updateAppointment = vi.fn();
const fetchWorkingHours = vi.fn();
const fetchWorkingHourExceptions = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointments: (query: unknown) =>
      fetchAppointments(query) as Promise<AppointmentsApi.CalendarEntry[]>,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchAssignableTrainers: () =>
      fetchAssignableTrainers() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    updateAppointment: (
      id: string,
      stand: string,
      werte: unknown,
      bestaetigt?: boolean,
      vergangenheit?: boolean,
    ) => updateAppointment(id, stand, werte, bestaetigt, vergangenheit) as Promise<void>,
    // Der heutige Tag wird festgehalten, damit die Tests nicht mit der Uhr laufen.
    todayInTimeZone: () => HEUTE,
  };
});

vi.mock('@/features/scheduling/api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    fetchWorkingHours: () => fetchWorkingHours() as Promise<SchedulingApi.WorkingHour[]>,
    fetchWorkingHourExceptions: (von: string, bis: string) =>
      fetchWorkingHourExceptions(von, bis) as Promise<SchedulingApi.WorkingHourException[]>,
  };
});

/** Stand, den der Kalender unmittelbar vor dem Verschieben nachliest. */
const bestand = {
  id: '77777777-7777-4777-8777-000000000001',
  patient_id: PATIENT,
  staff_member_id: STAFF_ANNA,
  location_id: ORT,
  appointment_type: 'practice' as const,
  status: 'confirmed' as const,
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-01T10:00:00.000000+00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  completed_at: null,
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

// Fahrwege (UBK-005): Punkte des Tages, Startort und die Route über die
// eigene Function. Ohne Angabe gibt es keine Punkte - und damit keine Blöcke.
const fetchDayRoute = vi.fn();
vi.mock('@/features/tours/tagesroute', async (importOriginal) => ({
  ...(await importOriginal<typeof TagesrouteModul>()),
  fetchDayRoute: (datum: string, person: string) =>
    fetchDayRoute(datum, person) as Promise<TagesrouteModul.Tagesstopp[]>,
}));
const fetchStandorte = vi.fn();
vi.mock('@/features/tours/startort', async (importOriginal) => ({
  ...(await importOriginal<typeof StartortModul>()),
  fetchStandorte: () => fetchStandorte() as Promise<StartortModul.Standort[]>,
}));
const rufeFunktionAuf = vi.fn();
vi.mock('@/lib/location/funktion', async (importOriginal) => ({
  ...(await importOriginal<typeof FunktionModul>()),
  rufeFunktionAuf: (aufgabe: string, koerper: unknown) =>
    rufeFunktionAuf(aufgabe, koerper) as Promise<unknown>,
}));
// UBK-010: Der Fahrzeitfaktor der Praxis. 1,0 lässt die Zahlen des
// Kartendienstes stehen; der eigene Fall unten setzt ihn.
const fahrzeitfaktor = { wert: 1 };
vi.mock('@/features/tours/fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => Promise.resolve(fahrzeitfaktor.wert),
  saveFahrzeitfaktor: () => Promise.resolve(),
}));

const { CalendarPage } = await import('./CalendarPage');
const { AusserhalbArbeitszeitError, VergangenheitError } = await import('./api');

function rendern(pfad = '/kalender') {
  return renderWithProviders(<CalendarPage user={testUser(['office'], 'Olivia Office')} />, pfad);
}

/**
 * Klappt „Ansicht und Filter" in der Ecke des Rasters auf (BEF-039): Tag und
 * Woche, Zoom, Standort, Status und die Anlegen-Schaltflaechen stehen dort.
 */
async function optionenOeffnen(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /^Ansicht und Filter/ }));
}

/**
 * Das Raster: ein benannter Bereich in der Tages- oder Wochenansicht (KAL-16,
 * UIK-17). Bis dahin trug es die Rolle `grid` - ohne Zeilen, also falsch.
 */
function raster(): HTMLElement {
  return screen.getByRole('region', { name: /^(Tages|Wochen)ansicht/ });
}

/** Die Spalten des Rasters: je Person oder Tag eine benannte Gruppe. */
function spalten(): HTMLElement[] {
  return Array.from(raster().children).filter(
    (kind): kind is HTMLElement => kind.getAttribute('role') === 'group',
  );
}

/** Argumente des jeweils letzten Abrufs. */
function letzteAbfrage() {
  return fetchAppointments.mock.calls.at(-1)?.[0] as AppointmentsApi.CalendarQuery;
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vergissKalenderstaende();
    fetchAppointments.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchAssignableTrainers.mockReset();
    fetchAssignableTrainers.mockResolvedValue([]);
    fetchLocations.mockReset();
    fetchAppointment.mockReset();
    updateAppointment.mockReset();
    fetchWorkingHours.mockReset();
    fetchWorkingHourExceptions.mockReset();
    navigate.mockReset();

    fetchWorkingHours.mockResolvedValue([]);
    fetchWorkingHourExceptions.mockResolvedValue([]);
    fetchAppointment.mockResolvedValue(bestand);
    updateAppointment.mockResolvedValue(undefined);
    fetchAppointments.mockResolvedValue([eintrag()]);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: STAFF_TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
    fetchDayRoute.mockReset();
    fetchDayRoute.mockResolvedValue([]);
    fetchStandorte.mockReset();
    fetchStandorte.mockResolvedValue([]);
    rufeFunktionAuf.mockReset();
  });

  describe('Zeitbereiche', () => {
    it('fragt ohne Parameter die laufende Woche ab', async () => {
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ von: '2027-05-10', bis: '2027-05-17' });
    });

    it('öffnet ohne Parameter dort, wo man heute zuletzt war (BEF-073)', async () => {
      const erster = rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      erster.unmount();
      fetchAppointments.mockClear();

      // Später, über die Tableiste: ohne Ansicht und Tag in der Adresse.
      rendern('/kalender');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ von: '2027-05-12', bis: '2027-05-13' });
    });

    it('fragt in der Tagesansicht genau einen Tag ab', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ von: '2027-05-12', bis: '2027-05-13' });
    });

    it('blaettert in der Wochenansicht um sieben Tage', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }));
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ von: '2027-05-17' }));

      await user.click(screen.getByRole('button', { name: 'Vorheriger Zeitraum' }));
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ von: '2027-05-10' }));
    });

    it('blaettert in der Tagesansicht um einen Tag', async () => {
      const user = userEvent.setup();
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }));
      await waitFor(() =>
        expect(letzteAbfrage()).toMatchObject({ von: '2027-05-13', bis: '2027-05-14' }),
      );
    });

    it('kehrt mit "Heute" zum laufenden Zeitraum zurueck (BEF-039, Handoff 7a)', async () => {
      const user = userEvent.setup();
      rendern('/kalender?ansicht=tag&datum=2027-08-01');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: 'Heute' }));
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ von: HEUTE }));
    });

    it('wechselt zwischen Tages- und Wochenansicht', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      // Der Umschalter steht im Kopf (Design-Handoff 2026-10-01, Abschnitt 7a).
      const ansicht = screen.getByRole('group', { name: 'Ansicht' });
      await user.click(within(ansicht).getByRole('button', { name: 'Team' }));
      await waitFor(() =>
        expect(letzteAbfrage()).toMatchObject({ von: HEUTE, bis: '2027-05-13', person: null }),
      );
      expect(within(ansicht).getByRole('button', { name: 'Team' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await user.click(within(ansicht).getByRole('button', { name: 'Woche' }));
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ von: '2027-05-10' }));
    });
  });

  describe('Adresszeile', () => {
    it('uebernimmt Ansicht, Datum und Filter aus der Adresszeile', async () => {
      rendern(
        `/kalender?ansicht=tag&datum=2027-06-01&person=${STAFF_TIM}&standort=${ORT}&status=all`,
      );
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      expect(letzteAbfrage()).toEqual({
        von: '2027-06-01',
        bis: '2027-06-02',
        person: STAFF_TIM,
        standort: ORT,
        status: 'all',
      });
    });

    it.each([['ansicht=monat'], ['datum=2027-02-30'], ['person=nicht-uuid'], ['status=deleted']])(
      'faellt bei ungueltigem Parameter (%s) sicher auf den Standard zurueck',
      async (query) => {
        rendern(`/kalender?${query}`);
        await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

        expect(letzteAbfrage()).toEqual({
          von: '2027-05-10',
          bis: '2027-05-17',
          person: null,
          standort: null,
          status: 'active',
        });
      },
    );

    it('spiegelt eine Filteraenderung in die Adresszeile', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await screen.findByRole('option', { name: 'Tim Teamleitung' });
      await user.selectOptions(screen.getByLabelText('Behandelnde Person'), STAFF_TIM);

      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ person: STAFF_TIM }));
      // Der Zustand liegt in den Suchparametern und wirkt auf die Auswahl zurueck.
      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(STAFF_TIM);
    });
  });

  describe('Filter', () => {
    it('filtert nach Standort', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      await optionenOeffnen();

      await screen.findByRole('option', { name: 'Hauptstandort Tuebingen' });
      await user.selectOptions(screen.getByLabelText('Standort'), ORT);
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ standort: ORT }));
    });

    it('zeigt standardmaessig alles ausser abgesagten Terminen', async () => {
      // Nicht 'confirmed': ein abgeschlossener oder nicht angetroffener Termin
      // belegt den Tag weiter - er darf nicht aus der Ansicht verschwinden.
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ status: 'active' });
    });

    it('kann gezielt auf erledigte Termine filtern', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      await optionenOeffnen();

      await user.selectOptions(screen.getByLabelText('Status'), 'done');
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ status: 'done' }));
    });

    it('kann gezielt auf nicht angetroffene Termine filtern', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      await optionenOeffnen();

      await user.selectOptions(screen.getByLabelText('Status'), 'no_show');
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ status: 'no_show' }));
    });

    it('kann abgesagte Termine einblenden', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      await optionenOeffnen();

      await user.selectOptions(screen.getByLabelText('Status'), 'all');
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ status: 'all' }));
    });

    it('kennzeichnet einen abgesagten Termin', async () => {
      fetchAppointments.mockResolvedValue([eintrag({ status: 'cancelled' })]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

      const eintragLink = await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(eintragLink).toHaveTextContent('Abgesagt');
    });

    it('zeigt einen abgeschlossenen Termin unveraendert im Tag', async () => {
      // Der Termin hat stattgefunden: er bleibt sichtbar, behaelt seine Zeit
      // und wird gekennzeichnet - im Standardfilter, ohne Zutun (CAL-004).
      fetchAppointments.mockResolvedValue([eintrag({ status: 'completed' })]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const eintragLink = await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(eintragLink).toHaveTextContent('Abgeschlossen');
      expect(eintragLink).toHaveTextContent('09:00–10:00');
      expect(letzteAbfrage()).toMatchObject({ status: 'active' });
    });
  });

  describe('Darstellung', () => {
    it('zeigt in der Tagesansicht Patient, Zeit und Ort in der Kachel', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const link = await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(link).toHaveTextContent('Max Mustermann');
      // 07:00 UTC ist 09:00 Ortszeit - der Kalender zeigt die Praxiszeit.
      expect(link).toHaveTextContent('09:00–10:00');
      expect(link).toHaveTextContent('Hauptstandort Tuebingen');
    });

    it('nennt die behandelnde Person im Spaltenkopf statt in jeder Kachel', async () => {
      // Eine Spalte je Person: der Name gehoert einmal an den Kopf, nicht in
      // jede einzelne Kachel (CAL-006).
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const gitter = screen.getByRole('region', { name: 'Tagesansicht nach behandelnder Person' });
      expect(within(gitter).getByText('Anna Beispiel')).toBeInTheDocument();
      expect(within(gitter).getByText('Tim Teamleitung')).toBeInTheDocument();
    });

    it('ordnet einen Termin der Spalte seiner behandelnden Person zu', async () => {
      fetchAppointments.mockResolvedValue([
        eintrag(),
        eintrag({
          id: '77777777-7777-4777-8777-000000000002',
          staff_member_id: STAFF_TIM,
          staff_given_name: 'Tim',
          staff_family_name: 'Teamleitung',
          patient_given_name: 'Erika',
          patient_family_name: 'Beispiel',
        }),
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const annaSpalte = await screen.findByRole('group', { name: 'Anna Beispiel' });
      const timSpalte = screen.getByRole('group', { name: 'Tim Teamleitung' });
      expect(
        within(annaSpalte).getByRole('button', { name: /Max Mustermann/ }),
      ).toBeInTheDocument();
      expect(within(timSpalte).getByRole('button', { name: /Erika Beispiel/ })).toBeInTheDocument();
    });

    it('öffnet nach einem Tipp das Terminpanel und daraus das Fenster „Aktionen“', async () => {
      fetchAppointment.mockResolvedValue(
        testAppointment({ id: '77777777-7777-4777-8777-000000000001', patient_id: PATIENT }),
      );
      const user = userEvent.setup();
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(kachel).toHaveAttribute('aria-pressed', 'false');
      await user.click(kachel);
      expect(kachel).toHaveAttribute('aria-pressed', 'true');
      const panel = screen.getByRole('region', { name: /Max Mustermann/ });
      // Der Termin hat keine eigene Seite mehr (Akte entschlacken, 2026-10-03).
      expect(within(panel).queryByRole('link', { name: /Termin →/ })).toBeNull();
      await user.click(within(panel).getByRole('button', { name: 'Aktionen …' }));
      const fenster = await screen.findByRole('dialog');
      expect(await within(fenster).findByRole('button', { name: 'Termin absagen' })).toBeVisible();
      await user.click(within(fenster).getByRole('button', { name: 'Schließen' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('nimmt Ansicht, Datum und Filter als Rueckweg mit', async () => {
      fetchAppointment.mockResolvedValue(
        testAppointment({ id: '77777777-7777-4777-8777-000000000001', patient_id: PATIENT }),
      );
      const user = userEvent.setup();
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');
      await user.click(await screen.findByRole('button', { name: /Max Mustermann/ }));
      await user.click(screen.getByRole('button', { name: 'Aktionen …' }));
      const link = await within(await screen.findByRole('dialog')).findByRole('link', {
        name: 'Bearbeiten',
      });

      const zurueck = new URL(link.getAttribute('href')!, 'http://x').searchParams.get('zurueck');
      const parameter = new URLSearchParams(zurueck!.split('?')[1]);
      expect(parameter.get('ansicht')).toBe('tag');
      expect(parameter.get('datum')).toBe('2027-05-12');
      expect(parameter.get('status')).toBe('all');
    });

    // Ein Link von Tagesliste, Tour oder Formular (`?termin=`) öffnet den Tag
    // des Termins mit gewähltem Termin (Akte entschlacken, 2026-10-03).
    it('springt über ?termin= zum Tag des Termins und wählt ihn aus', async () => {
      fetchAppointment.mockResolvedValue(
        testAppointment({ id: '77777777-7777-4777-8777-000000000001', patient_id: PATIENT }),
      );
      rendern('/kalender?termin=77777777-7777-4777-8777-000000000001');
      expect(await screen.findByRole('region', { name: /Max Mustermann/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Max Mustermann/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('zeigt in der Wochenansicht Montag bis Sonntag durchgehend (ANN-202 Fassung 2)', async () => {
      // Auch ohne Termin am Wochenende stehen Samstag und Sonntag da.
      fetchAppointments.mockResolvedValue([]);
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      for (const tag of ['10.05.', '11.05.', '12.05.', '13.05.', '14.05.', '15.05.', '16.05.']) {
        expect(await screen.findByText(tag)).toBeInTheDocument();
      }
    });

    it('ordnet einen Termin dem Kalendertag der Praxis zu', async () => {
      // 22:30 UTC am 12.05. ist in Berlin bereits der 13.05.
      fetchAppointments.mockResolvedValue([
        eintrag({ starts_at: '2027-05-12T22:30:00.000Z', ends_at: '2027-05-12T23:00:00.000Z' }),
      ]);
      rendern();

      // Die Wochenspalten heissen nach ihrem Wochentag; der 13.05.2027 ist ein
      // Donnerstag.
      const donnerstag = await screen.findByRole('group', { name: 'Do 13.05.' });
      expect(
        within(donnerstag).getByRole('button', { name: /Max Mustermann/ }),
      ).toBeInTheDocument();
    });

    it('zeigt in der Wochenansicht genau eine behandelnde Person', async () => {
      // Die Woche mehrerer Personen gleichzeitig waere in keiner Breite lesbar;
      // deshalb steht dort genau eine Person im Gitter (CAL-006).
      fetchAppointments.mockResolvedValue([
        eintrag(),
        eintrag({
          id: '77777777-7777-4777-8777-000000000002',
          staff_member_id: STAFF_TIM,
          staff_given_name: 'Tim',
          staff_family_name: 'Teamleitung',
          patient_given_name: 'Erika',
          patient_family_name: 'Beispiel',
          starts_at: '2027-05-12T07:30:00.000Z',
          ends_at: '2027-05-12T08:30:00.000Z',
        }),
      ]);
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);

      expect(await screen.findByRole('button', { name: /Max Mustermann/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Erika Beispiel/ })).not.toBeInTheDocument();
    });

    it('wechselt die Person der Wochenansicht im Kalender selbst', async () => {
      const user = userEvent.setup();
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      await screen.findByRole('option', { name: 'Tim Teamleitung' });

      await user.selectOptions(screen.getByLabelText('Behandelnde Person'), STAFF_TIM);
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ person: STAFF_TIM }));
    });

    it('bietet in der Wochenansicht kein "Alle" an', async () => {
      rendern('/kalender?ansicht=woche&datum=2027-05-12');
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      const auswahl = await screen.findByLabelText('Behandelnde Person');
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual(['Anna Beispiel', 'Tim Teamleitung']);
    });

    it('meldet einen leeren Tag verstaendlich', async () => {
      fetchAppointments.mockResolvedValue([]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      expect(
        await screen.findByText('Für diesen Tag sind keine Termine geplant.'),
      ).toBeInTheDocument();
    });

    it('zeigt keine klinischen Angaben', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      for (const begriff of [/diagnose/i, /befund/i, /therapie/i, /anamnese/i]) {
        expect(screen.queryByText(begriff)).not.toBeInTheDocument();
      }
    });

    it('zeigt weder Geburtsdatum noch Kontaktdaten', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const link = await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(link.textContent).not.toMatch(/@/);
      expect(link.textContent).not.toMatch(/\d{2}\.\d{2}\.\d{4}/);
    });
  });

  describe('Fehlende Praxiszeitzone', () => {
    it('laedt keine Termine und erklaert den Grund', async () => {
      const ohneZone = { ...testUser(['office']), organizationTimeZone: null };
      renderWithProviders(<CalendarPage user={ohneZone} />, '/kalender');

      expect(await screen.findByText('Kalender nicht verfügbar')).toBeInTheDocument();
      expect(fetchAppointments).not.toHaveBeenCalled();
    });
  });

  describe('CAL-012: Wechsel der Ansicht ueber den Spaltenkopf', () => {
    it('fuehrt vom Namen in der Tagesansicht auf den Wochenplan der Person', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const kopf = screen.getByRole('link', { name: 'Wochenplan von Anna Beispiel' });
      const ziel = new URLSearchParams(kopf.getAttribute('href')!.split('?')[1]);
      expect(ziel.get('ansicht')).toBe('woche');
      expect(ziel.get('person')).toBe(STAFF_ANNA);
      // Der Tag bleibt stehen: die Woche, in der man gerade war.
      expect(ziel.get('datum')).toBe('2027-05-12');
    });

    it('fuehrt vom Datum in der Wochenansicht auf den Tag aller Personen', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      // Sieben Koepfe, einer je Wochentag - gesucht ist der Mittwoch.
      const kopf = screen
        .getAllByRole('link', { name: /Tagesansicht aller behandelnden Personen/ })
        .find((k) => k.getAttribute('href')?.includes('datum=2027-05-12'));
      expect(kopf).toBeDefined();

      const ziel = new URLSearchParams(kopf!.getAttribute('href')!.split('?')[1]);
      expect(ziel.get('ansicht')).toBe('tag');
      // Ohne Person - der Tag gehoert allen.
      expect(ziel.get('person')).toBeNull();
    });

    it('nimmt die Zoomstufe in die andere Ansicht mit', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=208');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const kopf = screen.getByRole('link', { name: 'Wochenplan von Anna Beispiel' });
      expect(kopf.getAttribute('href')).toContain('zoom=208');
    });

    it('fuehrt jeden Wochentag auf seinen eigenen Tag', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const koepfe = screen.getAllByRole('link', {
        name: /Tagesansicht aller behandelnden Personen/,
      });
      expect(koepfe).toHaveLength(7);
      const tage = koepfe.map((k) =>
        new URLSearchParams(k.getAttribute('href')!.split('?')[1]).get('datum'),
      );
      // Montag bis Sonntag der Woche, in der der 12.05.2027 liegt (ANN-202 Fassung 2).
      expect(tage).toEqual([
        '2027-05-10',
        '2027-05-11',
        '2027-05-12',
        '2027-05-13',
        '2027-05-14',
        '2027-05-15',
        '2027-05-16',
      ]);
    });
  });

  describe('CAL-011: Zoomstufen und sichtbares Praxisraster', () => {
    it('zeigt in der Voreinstellung das Fuenf-Minuten-Raster an', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('5-Minuten-Raster')).toBeInTheDocument();
    });

    it('nimmt die Zoomstufe aus der Adresszeile', async () => {
      // 40 px je Stunde tragen die Viertelstunde, nicht die fuenf Minuten.
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=40');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('15-Minuten-Raster')).toBeInTheDocument();
    });

    it('faellt bei einer erfundenen Zoomstufe auf die Voreinstellung zurueck', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=9999');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('5-Minuten-Raster')).toBeInTheDocument();
    });

    it('vergroebert das Gitter ueber die Bedienung', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();

      await userEvent.click(screen.getByRole('button', { name: 'Raster gröber' }));

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('15-Minuten-Raster')).toBeInTheDocument();
    });
  });

  describe('BEF-038: Zoomen mit zwei Fingern im Raster', () => {
    function finger(...punkte: [number, number][]) {
      return punkte.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
    }

    it('vergroessert mit zwei Fingern auseinander und verkleinert zusammen', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      const gitter = () => raster().parentElement!;
      // Die Hoehe einer Spalte ist Stunden mal Zoomstufe.
      const hoehe = () =>
        parseFloat(screen.getByRole('group', { name: 'Anna Beispiel' }).style.height);
      const vorher = hoehe();

      fireEvent.touchStart(gitter(), { touches: finger([100, 100], [100, 200]) });
      // Die Geste gehoert dem Raster: Der Browser scrollt und zoomt nicht mit.
      expect(fireEvent.touchMove(gitter(), { touches: finger([100, 60], [100, 240]) })).toBe(false);
      fireEvent.touchEnd(gitter(), { touches: [] });
      // 96 -> 144 px je Stunde.
      await waitFor(() => expect(hoehe()).toBe((vorher / 96) * 144));

      fireEvent.touchStart(gitter(), { touches: finger([100, 60], [100, 240]) });
      fireEvent.touchMove(gitter(), { touches: finger([100, 120], [100, 180]) });
      fireEvent.touchEnd(gitter(), { touches: [] });
      // Ein grosser Schritt zusammen ist trotzdem nur eine Stufe: 144 -> 96.
      await waitFor(() => expect(hoehe()).toBe(vorher));
    });

    it('verkleinert bis auf das Viertelstundenraster', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=64');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();
      const gitter = raster().parentElement!;

      fireEvent.touchStart(gitter, { touches: finger([100, 60], [100, 240]) });
      fireEvent.touchMove(gitter, { touches: finger([100, 120], [100, 180]) });

      const zoom = within(screen.getByRole('group', { name: 'Zoom' }));
      await waitFor(() => expect(zoom.getByText('15-Minuten-Raster')).toBeInTheDocument());
    });

    it('laesst einen einzelnen Finger scrollen und oeffnet nach dem Zoomen kein Menue', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      const gitter = raster().parentElement!;

      // Ein Finger: nichts wird verhindert - der Browser scrollt.
      const einFinger = fireEvent.touchMove(gitter, { touches: finger([100, 100]) });
      expect(einFinger).toBe(true);

      fireEvent.touchStart(gitter, { touches: finger([100, 100], [100, 110]) });
      fireEvent.touchEnd(gitter, { touches: [] });
      // Der Klick, den ein Browser nach der Geste noch schickt, ist keine Auswahl.
      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      expect(
        screen.queryByRole('group', { name: 'Was soll hier entstehen?' }),
      ).not.toBeInTheDocument();

      // Der naechste Tipp ist wieder einer.
      fireEvent.touchStart(gitter, { touches: finger([100, 100]) });
      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      expect(screen.getByRole('group', { name: 'Was soll hier entstehen?' })).toBeInTheDocument();
    });
  });

  describe('CAL-006: Verschieben per Zeigegerät', () => {
    /**
     * jsdom kennt kein Layout: `getBoundingClientRect` liefert überall Nullen.
     * Die Spalten bekommen deshalb künstliche Kästen, damit die Zuordnung
     * "welche Spalte liegt unter dem Zeiger" überhaupt eine Aussage hat.
     */
    function spaltenVermessen(): void {
      const zellen = spalten();
      zellen.forEach((zelle, index) => {
        zelle.getBoundingClientRect = () => ({
          left: 100 + index * 200,
          right: 300 + index * 200,
          top: 0,
          bottom: 800,
          width: 200,
          height: 800,
          x: 100 + index * 200,
          y: 0,
          toJSON: () => ({}),
        });
      });
    }

    /** Zieht eine Kachel um dy Pixel und auf die waagerechte Position x. */
    function ziehen(kachel: HTMLElement, opts: { dy: number; x?: number; startX?: number }) {
      const startX = opts.startX ?? 150;
      const startY = 200;
      fireEvent.pointerDown(kachel, { clientX: startX, clientY: startY, button: 0 });
      fireEvent.pointerMove(window, {
        clientX: opts.x ?? startX,
        clientY: startY + opts.dy,
        button: 0,
      });
      fireEvent.pointerUp(window, { clientX: opts.x ?? startX, clientY: startY + opts.dy });
    }

    /** Argumente des jeweils letzten Schreibvorgangs, typisiert. */
    function letzterSchreibvorgang(): {
      id: string;
      stand: string;
      werte: AppointmentsApi.AppointmentFormValues;
      bestaetigt: boolean | undefined;
      vergangenheit: boolean | undefined;
    } {
      const aufruf = updateAppointment.mock.calls.at(-1) as
        | [
            string,
            string,
            AppointmentsApi.AppointmentFormValues,
            boolean | undefined,
            boolean | undefined,
          ]
        | undefined;
      if (!aufruf) throw new Error('Es wurde nichts geschrieben.');
      return {
        id: aufruf[0],
        stand: aufruf[1],
        werte: aufruf[2],
        bestaetigt: aufruf[3],
        vergangenheit: aufruf[4],
      };
    }

    /**
     * Beide Personen arbeiten an jedem Wochentag von 07:00 bis 18:00. Ohne
     * hinterlegte Arbeitszeit laege jede Zielzeit ausserhalb - so rechnet auch
     * der Server -, und jede Rueckfrage truege den Hinweis (CAL-023).
     */
    beforeEach(() => {
      fetchWorkingHours.mockResolvedValue(
        [STAFF_ANNA, STAFF_TIM].flatMap((person) =>
          [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            id: `w-${person}-${weekday}`,
            staff_member_id: person,
            weekday,
            starts_at: '07:00',
            ends_at: '18:00',
          })),
        ),
      );
    });

    /** Die Rueckfrage nach dem Loslassen (CAL-023). */
    function rueckfrage(): Promise<HTMLElement> {
      return screen.findByRole('group', { name: 'Termin verschieben?' });
    }

    /** Bestaetigt die Rueckfrage - erst das schreibt. */
    async function bestaetigen(name = 'Verschieben'): Promise<void> {
      const kasten = await rueckfrage();
      fireEvent.click(within(kasten).getByRole('button', { name }));
    }

    async function tagesansicht() {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();
      return kachel;
    }

    it('verschiebt einen Termin auf eine andere Uhrzeit', async () => {
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });
      await bestaetigen();

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte, bestaetigt } = letzterSchreibvorgang();
      expect(werte).toMatchObject({
        staff_member_id: STAFF_ANNA,
        date: '2027-05-12',
        start_time: '10:00',
        // Die Dauer bleibt beim Verschieben unveraendert.
        end_time: '11:00',
      });
      expect(bestaetigt).toBe(false);
    });

    it('rechnet die gezogene Strecke auf der gewaehlten Zoomstufe (CAL-011)', async () => {
      // Auf der groessten Stufe ist eine Stunde 208 px hoch. Wuerde das
      // Ziehen weiter mit der Voreinstellung rechnen, waeren dieselben 208 px
      // gut zwei Stunden - der Termin landete bei 11:10 statt bei 10:00.
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=208');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      ziehen(kachel, { dy: 208 });
      await bestaetigen();

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      expect(letzterSchreibvorgang().werte).toMatchObject({
        start_time: '10:00',
        end_time: '11:00',
      });
    });

    it('rastet den Beginn auf dem Praxisraster ein', async () => {
      const kachel = await tagesansicht();

      // 32 Minuten nach unten; auf einem 5er-Raster wird daraus 09:30.
      ziehen(kachel, { dy: (32 / 60) * ZOOM_STANDARD });
      await bestaetigen();

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte } = letzterSchreibvorgang();
      expect(werte.start_time).toMatch(/:\d[05]$/);
      expect(werte).toMatchObject({ start_time: '09:30' });
    });

    it('verschiebt in der Tagesansicht auf eine andere behandelnde Person', async () => {
      const kachel = await tagesansicht();

      // Zweite Spalte: x zwischen 300 und 500.
      ziehen(kachel, { dy: EINE_STUNDE, x: 400 });
      await bestaetigen();

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte } = letzterSchreibvorgang();
      expect(werte).toMatchObject({ staff_member_id: STAFF_TIM, date: '2027-05-12' });
    });

    it('verschiebt in der Wochenansicht auf einen anderen Tag', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      // Der Termin liegt am Mittwoch, also in der dritten Spalte (500-700).
      // Gezogen wird in die erste Spalte: Montag, der 10.05. - zwei Tage vor
      // dem heutigen Praxistag: Die Rueckfrage nennt die Vergangenheit im
      // selben Kasten, die Bestaetigung schickt das Kennzeichen mit (FIX-019).
      ziehen(kachel, { dy: 0, startX: 550, x: 150 });
      expect(await rueckfrage()).toHaveTextContent(/liegt in der Vergangenheit/);
      await bestaetigen('Trotzdem verschieben');

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte, bestaetigt, vergangenheit } = letzterSchreibvorgang();
      expect(werte).toMatchObject({ date: '2027-05-10', staff_member_id: STAFF_ANNA });
      expect(bestaetigt).toBe(false);
      expect(vergangenheit).toBe(true);
    });

    it('bestaetigt die Vergangenheit nicht, wenn der neue Tag nicht davor liegt (FIX-019)', async () => {
      const kachel = await tagesansicht();
      ziehen(kachel, { dy: EINE_STUNDE });
      expect(await rueckfrage()).not.toHaveTextContent(/Vergangenheit/);
      await bestaetigen();
      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      expect(letzterSchreibvorgang().vergangenheit).toBe(false);
    });

    it('kommt mit dem Vergangenheits-Hinweis wieder, wenn erst der Server ihn erkennt', async () => {
      updateAppointment.mockRejectedValueOnce(new VergangenheitError());
      updateAppointment.mockResolvedValue(undefined);
      const kachel = await tagesansicht();
      ziehen(kachel, { dy: EINE_STUNDE });
      await bestaetigen();

      expect(await rueckfrage()).toHaveTextContent(/liegt in der Vergangenheit/);
      await bestaetigen('Trotzdem verschieben');
      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(2));
      expect(letzterSchreibvorgang().vergangenheit).toBe(true);
    });

    it('schreibt nichts, wenn sich nichts aendert', async () => {
      const kachel = await tagesansicht();

      // Ueber die Schwelle bewegt, aber wieder auf denselben Rasterpunkt.
      ziehen(kachel, { dy: 1 });

      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(updateAppointment).not.toHaveBeenCalled();
      expect(screen.queryByRole('group', { name: 'Termin verschieben?' })).toBeNull();
    });

    it('schreibt nichts bei einem blossen Klick', async () => {
      const kachel = await tagesansicht();
      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 200 });

      expect(updateAppointment).not.toHaveBeenCalled();
    });

    it('bricht mit Escape ab', async () => {
      const kachel = await tagesansicht();
      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 400 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 400 });

      expect(updateAppointment).not.toHaveBeenCalled();
    });

    it('liest den aktuellen Stand vor dem Schreiben nach', async () => {
      // Ohne den erwarteten updated_at-Wert griffe der Schutz gegen ein
      // verlorenes Update nicht (CAL-003).
      const kachel = await tagesansicht();
      ziehen(kachel, { dy: EINE_STUNDE });
      await bestaetigen();

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      expect(fetchAppointment).toHaveBeenCalledWith('77777777-7777-4777-8777-000000000001');
      expect(letzterSchreibvorgang().stand).toBe('2027-05-01T10:00:00.000000+00');
    });

    it.each([['completed'], ['cancelled']] as const)(
      'zieht einen %s Termin nicht',
      async (status) => {
        fetchAppointments.mockResolvedValue([eintrag({ status })]);
        const kachel = await tagesansicht();

        ziehen(kachel, { dy: EINE_STUNDE });
        expect(updateAppointment).not.toHaveBeenCalled();
      },
    );

    it('zieht ohne Aenderungsrecht nicht', async () => {
      renderWithProviders(
        <CalendarPage user={testUser(['patient'])} />,
        '/kalender?ansicht=tag&datum=2027-05-12',
      );
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      ziehen(kachel, { dy: EINE_STUNDE });
      expect(updateAppointment).not.toHaveBeenCalled();
    });

    describe('CAL-023: Rueckfrage beim Verschieben', () => {
      it('schreibt beim Loslassen nicht, sondern fragt mit alter und neuer Zeit', async () => {
        const kachel = await tagesansicht();

        ziehen(kachel, { dy: EINE_STUNDE });

        const kasten = await rueckfrage();
        expect(kasten).toHaveTextContent('09:00–10:00');
        expect(kasten).toHaveTextContent('10:00–11:00');
        expect(kasten).toHaveTextContent(/noch nicht verschoben/);
        // Die Zielzeit ist frei und liegt in der Arbeitszeit - gefragt wird trotzdem.
        expect(kasten).not.toHaveTextContent(/außerhalb/);
        expect(updateAppointment).not.toHaveBeenCalled();
        expect(fetchAppointment).not.toHaveBeenCalled();
      });

      it('zeichnet den alten Platz als Umriss und den neuen als Kachel im Gitter (FIX-017)', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });
        await rueckfrage();

        // Der alte Platz: gestrichelt, beschriftet, noch da.
        expect(kachel.className).toContain('border-dashed');
        expect(kachel).toHaveTextContent(/Bisher/);
        expect(kachel).toHaveAttribute('title', expect.stringMatching(/^Bisher/));
        // Der neue Platz: eine Kachel mit der neuen Zeit, im Gitter.
        const neu = screen.getByTestId('vorschlag-kachel');
        expect(neu).toHaveTextContent('10:00–11:00');
        expect(screen.getByRole('group', { name: 'Anna Beispiel' })).toContainElement(neu);
        // Der Kasten steht im Gitter, nicht darueber.
        expect(raster()).toContainElement(await rueckfrage());
      });

      it('sperrt die uebrigen Kacheln nicht, solange die Rueckfrage offen ist (BEF-015)', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });
        expect(await rueckfrage()).toHaveTextContent('10:00–11:00');

        // Noch einmal ziehen, weiter: die neue Geste ersetzt den Vorschlag.
        ziehen(kachel, { dy: 2 * EINE_STUNDE });
        expect(await rueckfrage()).toHaveTextContent('11:00–12:00');
        expect(screen.getAllByRole('group', { name: 'Termin verschieben?' })).toHaveLength(1);
        expect(updateAppointment).not.toHaveBeenCalled();
      });

      it('nennt am Tooltip, warum eine Kachel nicht zieht', async () => {
        fetchAppointments.mockResolvedValue([eintrag({ status: 'completed' })]);
        const kachel = await tagesansicht();
        expect(kachel).toHaveAttribute(
          'title',
          expect.stringContaining('Nicht verschiebbar: Abgeschlossen'),
        );
      });

      it('nennt als Bisher den Tag des Termins, nicht den gezeigten Ausschnitt (FIX-018)', async () => {
        // Tagesansicht auf dem Folgetag: Der Termin vom 12.05. steht (im Test
        // ohne Datumsfilter) trotzdem im Gitter. Sein Ursprung muss vom Termin
        // kommen - nach dem Blaettern waehrend der Geste zeigt der Ausschnitt
        // einen anderen Tag als den, an dem der Termin war.
        rendern('/kalender?ansicht=tag&datum=2027-05-13');
        const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
        spaltenVermessen();

        ziehen(kachel, { dy: EINE_STUNDE });

        const kasten = await rueckfrage();
        expect(kasten).toHaveTextContent('Mi 12.05., 09:00–10:00');
        expect(kasten).toHaveTextContent('Do 13.05., 10:00–11:00');
      });

      it('setzt den Fokus auf die bestaetigende Schaltflaeche', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });

        const kasten = await rueckfrage();
        expect(within(kasten).getByRole('button', { name: 'Verschieben' })).toHaveFocus();
      });

      it('laesst beim Abbrechen alles stehen', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });

        const kasten = await rueckfrage();
        fireEvent.click(within(kasten).getByRole('button', { name: 'Abbrechen' }));

        expect(screen.queryByRole('group', { name: 'Termin verschieben?' })).toBeNull();
        expect(updateAppointment).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
      });

      it('bricht auch mit Escape ab', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });

        fireEvent.keyDown(await rueckfrage(), { key: 'Escape' });

        expect(screen.queryByRole('group', { name: 'Termin verschieben?' })).toBeNull();
        expect(updateAppointment).not.toHaveBeenCalled();
      });

      it('nennt die behandelnde Person nur, wenn sie wechselt', async () => {
        const kachel = await tagesansicht();

        ziehen(kachel, { dy: EINE_STUNDE });
        expect(await rueckfrage()).not.toHaveTextContent('Behandelnde Person');
        fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

        ziehen(kachel, { dy: EINE_STUNDE, x: 400 });
        const kasten = await rueckfrage();
        expect(kasten).toHaveTextContent('Behandelnde Person');
        expect(kasten).toHaveTextContent(/Anna .*→.*Tim /);
      });

      it('zeigt nach dem Bestaetigen die Rueckgaengig-Leiste', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });
        await bestaetigen();

        expect(await screen.findByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Termin verschieben?' })).toBeNull();
      });

      it('sagt in DERSELBEN Rueckfrage, dass die Zielzeit ausserhalb der Arbeitszeit liegt', async () => {
        const kachel = await tagesansicht();

        // 09:00 -> 18:00: eine Stunde hinter dem Ende der Arbeitszeit.
        ziehen(kachel, { dy: 9 * EINE_STUNDE });

        const kasten = await rueckfrage();
        expect(kasten).toHaveTextContent('18:00–19:00');
        expect(kasten).toHaveTextContent(/außerhalb der hinterlegten Arbeitszeit/);
        expect(screen.getAllByRole('group', { name: /verschieben|Arbeitszeit/i })).toHaveLength(1);

        await bestaetigen('Trotzdem verschieben');

        // Ein Schreibvorgang, mit Kennzeichen - keine zweite Frage dahinter.
        await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
        expect(letzterSchreibvorgang().bestaetigt).toBe(true);
        expect(screen.queryByRole('group', { name: 'Termin verschieben?' })).toBeNull();
      });

      it('bestaetigt die Arbeitszeit nicht, wenn die Rueckfrage sie nicht genannt hat', async () => {
        const kachel = await tagesansicht();
        ziehen(kachel, { dy: EINE_STUNDE });
        await bestaetigen();

        await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
        expect(letzterSchreibvorgang().bestaetigt).toBe(false);
      });

      it('kommt mit dem Hinweis wieder, wenn erst der Server die Randzeit erkennt', async () => {
        // Die geladenen Arbeitszeiten koennen veraltet sein; verbindlich
        // entscheidet der Server (CAL-005). Auch dann: dieselbe Rueckfrage.
        updateAppointment.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
        updateAppointment.mockResolvedValue(undefined);
        const kachel = await tagesansicht();

        ziehen(kachel, { dy: EINE_STUNDE });
        await bestaetigen();

        const kasten = await screen.findByText(/außerhalb der hinterlegten Arbeitszeit/);
        expect(kasten).toBeInTheDocument();
        expect(await rueckfrage()).toHaveTextContent('10:00–11:00');

        await bestaetigen('Trotzdem verschieben');

        await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(2));
        const { werte, bestaetigt } = letzterSchreibvorgang();
        expect(werte).toMatchObject({ start_time: '10:00' });
        expect(bestaetigt).toBe(true);
      });

      // KAL-26: Die Bedienhilfe stand als Dauertext unter dem Raster; jetzt
      // steht sie eingeklappt unter „Ansicht und Filter".
      it('sagt in der Bedienhilfe, dass Ziehen nachfragt', async () => {
        await tagesansicht();
        expect(screen.queryByText(/fragt der Kalender mit alter und neuer Zeit nach/)).toBeNull();

        await optionenOeffnen();
        expect(screen.getByText('So bedienen Sie den Kalender')).toBeInTheDocument();
        expect(
          screen.getByText(/fragt der Kalender mit alter und neuer Zeit nach/),
        ).toBeInTheDocument();
      });
    });

    // KAL-01: Der Fehler steht in derselben Rückfrage neben der Kachel -
    // bis dahin schloss sie, und die Meldung stand über dem Raster, außer Sicht.
    it('meldet eine Ueberschneidung in der offenen Rueckfrage, ohne nachzufragen', async () => {
      updateAppointment.mockRejectedValue(
        new Error('In diesem Zeitraum hat die behandelnde Person bereits einen Termin.'),
      );
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });
      await bestaetigen();

      const kasten = await rueckfrage();
      await waitFor(() =>
        expect(within(kasten).getByRole('alert')).toHaveTextContent(/bereits einen Termin/),
      );
      // Nichts zu bestätigen: kein Hinweis auf Arbeitszeit oder Vergangenheit.
      expect(kasten).not.toHaveTextContent(/außerhalb/);
      expect(updateAppointment).toHaveBeenCalledTimes(1);

      // Abbrechen erledigt den Fehler mit dem Versuch.
      fireEvent.click(within(kasten).getByRole('button', { name: 'Abbrechen' }));
      expect(screen.queryByText(/bereits einen Termin/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
    });

    it('nennt das Bearbeiten als gleichwertigen Weg', async () => {
      // Ziehen darf niemals der einzige Weg zum Verschieben sein.
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();
      expect(screen.getByText(/über „Bearbeiten“ in der Detailansicht/)).toBeInTheDocument();
    });
  });

  describe('CAL-006: Arbeitszeit als Hintergrund', () => {
    it('holt Wochenplan und Abweichungen des sichtbaren Bereichs', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await waitFor(() => expect(fetchWorkingHours).toHaveBeenCalled());
      expect(fetchWorkingHourExceptions).toHaveBeenCalledWith('2027-05-12', '2027-05-13');
    });

    it('erweitert das Zeitfenster auf eine frueh beginnende Arbeitszeit', async () => {
      fetchWorkingHours.mockResolvedValue([
        { id: 'w1', staff_member_id: STAFF_ANNA, weekday: 3, starts_at: '06:00', ends_at: '12:00' },
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      // Ohne die Erweiterung begaenne die Achse erst um 07:00.
      expect(screen.getByText('06:00')).toBeInTheDocument();
    });

    /**
     * UX-005c: Grau ist, wo jemand nicht arbeitet. Bis dahin lag die
     * Arbeitszeit selbst als graues Band im Gitter - und las sich als „hier
     * nicht". Jannes: „Im Kalender muss die jeweilige Arbeitszeit des
     * Mitarbeiters ersichtlich sein, zum Beispiel durch Ausgrauen des Rasters
     * zu Zeiten, in denen er nicht arbeitet."
     */
    it('schraffiert die Zeit ausserhalb der Arbeitszeit, nicht die Arbeitszeit selbst (UX-005c)', async () => {
      fetchWorkingHours.mockResolvedValue([
        { id: 'w1', staff_member_id: STAFF_ANNA, weekday: 3, starts_at: '08:00', ends_at: '16:00' },
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      // Anna: vor 08:00 und nach 16:00 - das Fenster laeuft von 07:00 bis 20:00.
      const anna = screen.getByRole('group', { name: /^Anna Beispiel/ });
      const ausserhalb = within(anna).getAllByTestId('ausserhalb-arbeitszeit');
      expect(ausserhalb).toHaveLength(2);
      expect(ausserhalb[0]).toHaveStyle({ top: '0px', height: `${EINE_STUNDE}px` });
      expect(ausserhalb[1]).toHaveStyle({
        top: `${9 * EINE_STUNDE}px`,
        height: `${4 * EINE_STUNDE}px`,
      });
      for (const flaeche of ausserhalb) expect(flaeche).toHaveClass('schraffur');

      // Tim ohne hinterlegte Arbeitszeit: der ganze Tag.
      const tim = screen.getByRole('group', { name: /^Tim Teamleitung/ });
      const timAusserhalb = within(tim).getAllByTestId('ausserhalb-arbeitszeit');
      expect(timAusserhalb).toHaveLength(1);
      expect(timAusserhalb[0]).toHaveStyle({ top: '0px', height: `${13 * EINE_STUNDE}px` });

      await optionenOeffnen();
      expect(screen.getByText(/Grau schraffiert: außerhalb der Arbeitszeit/)).toBeInTheDocument();
      expect(screen.queryByText(/Grau hinterlegt: die Arbeitszeit/)).not.toBeInTheDocument();
    });

    it('behauptet nichts, solange der Wochenplan nicht geladen ist', async () => {
      fetchWorkingHours.mockImplementation(() => new Promise(() => undefined));
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(screen.queryAllByTestId('ausserhalb-arbeitszeit')).toHaveLength(0);
    });
  });

  describe('CAL-015b: Ereignisse im Gitter', () => {
    it('zeigt ein Ereignis mit seiner Bezeichnung statt eines Namens', async () => {
      fetchAppointments.mockResolvedValue([
        eintrag({
          id: '77777777-7777-4777-8777-00000000000e',
          kind: 'internal',
          title: 'Teambesprechung',
          patient_id: null,
          patient_given_name: null,
          patient_family_name: null,
        }),
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      expect(await screen.findByRole('button', { name: /Teambesprechung/ })).toBeInTheDocument();
      expect(screen.queryByText(/Max Mustermann/)).not.toBeInTheDocument();
    });
  });

  describe('UX-005 und CAL-019: Auswahl auf freier Zeit', () => {
    /**
     * Seit CAL-019 fuehrt der Tap nicht mehr unmittelbar in die Terminanlage,
     * sondern oeffnet das Anlegen-Menue an der Auswahl. Der Weg dahin ist
     * derselbe geblieben - er hat nur einen Schritt mehr.
     */
    function menueWaehlen(name: string): void {
      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      // Die Beschriftung genau, nicht als Teiltext: „Fehlzeit" trifft sonst
      // auch „Dauerfehlzeit".
      const eintrag = within(menue)
        .getAllByRole('button')
        .find((b) => b.firstElementChild?.textContent === name);
      if (!eintrag) throw new Error(`Menueeintrag "${name}" nicht gefunden.`);
      fireEvent.click(eintrag);
    }

    it('fuehrt aus der Tagesansicht mit Person, Tag und Uhrzeit in die Terminanlage', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Neuer Termin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe('/termine/neu');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
      expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
      expect(ziel.searchParams.get('art')).toBe('home_visit');
      // Vorbelegtes Zeitfenster von 60 Minuten (PROJECT_PRINCIPLES.md 8.1).
      expect(ziel.searchParams.get('beginn')).toBe('07:00');
      expect(ziel.searchParams.get('ende')).toBe('08:00');
      // FIX-016: der Kalenderstand reist als Rueckweg mit, damit das Anlegen
      // wieder hier landet.
      expect(ziel.searchParams.get('zurueck')).toBe('/kalender?ansicht=tag&datum=2027-05-12');
    });

    it('gibt `neu` nicht in den naechsten Rueckweg weiter', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&neu=77777777-7777-4777-8777-000000000001');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      await optionenOeffnen();

      const anlegen = screen.getByRole('link', { name: 'Termin anlegen' });
      const ziel = new URL(String(anlegen.getAttribute('href')), 'http://test');
      expect(ziel.searchParams.get('zurueck')).toBe('/kalender?ansicht=tag&datum=2027-05-12');
    });

    it('hebt den gerade angelegten Termin hervor und nennt ihn (FIX-016)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&neu=77777777-7777-4777-8777-000000000001');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(kachel.className).toContain('border-accent');
      const meldung = screen.getByRole('status');
      expect(meldung).toHaveTextContent(/Termin angelegt/);
      // Eine Erfolgsmeldung mit Zeichen (UIK-21), der Weg im Satz unterstrichen
      // (TOK-12). Er wählt den Termin im Panel - eine Terminseite gibt es nicht mehr.
      expect(meldung).toHaveTextContent('✓');
      const oeffnen = screen.getByRole('button', { name: 'Termin öffnen' });
      expect(oeffnen).toHaveClass('underline');
      fireEvent.click(oeffnen);
      expect(screen.getByRole('region', { name: /Max Mustermann/ })).toBeInTheDocument();
    });

    it('fuehrt aus der Wochenansicht mit dem Tag der Spalte in die Terminanlage', async () => {
      rendern('/kalender?ansicht=woche&datum=2027-05-12&person=' + STAFF_ANNA);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      // Spalten sind hier Wochentage; die Beschriftung ist der Kurzname.
      fireEvent.click(spalten()[0]!);
      menueWaehlen('Neuer Termin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-10');
      expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
    });

    /**
     * CAL-015c: Ist der Kalender auf eine Person gefiltert, ist die Frage
     * „für wen?" längst beantwortet - die freie Stelle führt direkt in ihr
     * Formular, und die Verordnung reist mit.
     */
    it('fuehrt mit Patientenfilter direkt in das Formular dieser Person', async () => {
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);
      await screen.findByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Neuer Termin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe(`/patienten/${PATIENT}/termine/neu`);
      expect(ziel.searchParams.get('beginn')).toBe('07:00');
      // Der Rückweg ist der Kalenderstand - „Abbrechen" landet wieder hier.
      expect(ziel.searchParams.get('zurueck')).toContain('/kalender');
    });

    it('reicht die Verordnung aus dem Kalenderstand in das Formular durch', async () => {
      const verordnung = '99999999-9999-4999-8999-000000000001';
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}&verordnung=${verordnung}`);
      await screen.findByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Neuer Termin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe(`/patienten/${PATIENT}/termine/neu`);
      expect(ziel.searchParams.get('verordnung')).toBe(verordnung);
    });

    it('loest nichts aus, wenn auf einen bestehenden Termin getippt wird', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(kachel);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('bietet denselben Weg als Schaltflaeche an - ohne Uhrzeit', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await optionenOeffnen();
      const link = await screen.findByRole('link', { name: 'Termin anlegen' });

      const ziel = new URL(link.getAttribute('href')!, 'http://test');
      expect(ziel.pathname).toBe('/termine/neu');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
      expect(ziel.searchParams.has('beginn')).toBe(false);
    });

    it('bietet einem Patientenkonto weder Tap noch Schaltflaeche', async () => {
      renderWithProviders(
        <CalendarPage user={testUser(['patient'], 'Max Mustermann')} />,
        '/kalender?ansicht=tag&datum=2027-05-12',
      );
      // Auch aufgeklappt: Die Schaltflaechen fehlen, nicht nur der Tap.
      await optionenOeffnen();
      expect(screen.getByRole('group', { name: 'Ansicht und Filter' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).toBeNull();
      fireEvent.click(spalten()[0]!);
      expect(screen.queryByRole('group', { name: 'Was soll hier entstehen?' })).toBeNull();
    });

    /**
     * CAL-019: Vier Eintraege, und der Tap schreibt nichts mehr - er fragt.
     */
    it('oeffnet das Anlegen-Menue mit vier Eintraegen statt sofort zu navigieren', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));

      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      expect(within(menue).getByRole('button', { name: /^Neuer Termin/ })).toBeInTheDocument();
      expect(within(menue).getByRole('button', { name: /^Dauertermin/ })).toBeInTheDocument();
      expect(within(menue).getByRole('button', { name: /^Fehlzeit/ })).toBeInTheDocument();
      expect(within(menue).getByRole('button', { name: /^Dauerfehlzeit/ })).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('fuehrt aus dem Menue in die Fehlzeit und in die Dauerfehlzeit', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Fehlzeit');

      const fehlzeit = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(fehlzeit.pathname).toBe('/termine/ereignis');
      expect(fehlzeit.searchParams.get('beginn')).toBe('07:00');
      // Ein angetippter Rasterpunkt hat keine Laenge - ein Ereignis auch
      // nicht, das Formular fragt danach (CAL-019).
      expect(fehlzeit.searchParams.has('ende')).toBe(false);
      expect(fehlzeit.searchParams.get('person')).toBe(STAFF_ANNA);

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Dauerfehlzeit');
      expect(String(navigate.mock.calls.at(-1)?.[0])).toContain('/termine/dauerfehlzeit');
    });

    it('fragt beim Dauertermin ohne Patient:in erst nach der Person (BEF-042)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      expect(screen.getByRole('button', { name: /^Dauertermin/ })).toBeEnabled();
      menueWaehlen('Dauertermin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe('/termine/dauertermin');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
      expect(ziel.searchParams.get('beginn')).toBe('07:00');
      expect(ziel.searchParams.has('patient')).toBe(false);
      // Die Person der Spalte reist mit (KAL-05) - wie bei Termin und Fehlzeit.
      expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
    });

    it('nimmt beim Dauertermin die gefilterte Patient:in mit, die Grundlage fragt die Seite', async () => {
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);
      await screen.findByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Dauertermin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe('/termine/dauertermin');
      expect(ziel.searchParams.get('patient')).toBe(PATIENT);
    });

    it('fuehrt den Dauertermin mit Verordnung in die Serienanlage', async () => {
      const verordnung = '99999999-9999-4999-8999-000000000001';
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}&verordnung=${verordnung}`);
      await screen.findByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      menueWaehlen('Dauertermin');

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe(`/patienten/${PATIENT}/verordnungen/${verordnung}/serie`);
      expect(ziel.searchParams.get('beginn')).toBe('07:00');
    });

    it('schliesst das Menue mit Abbrechen', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(
        screen.queryByRole('group', { name: 'Was soll hier entstehen?' }),
      ).not.toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('bietet die Dauerfehlzeit auch als Schaltflaeche unter Ansicht und Filter an', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await optionenOeffnen();
      const link = await screen.findByRole('link', { name: 'Dauerfehlzeit eintragen' });

      const ziel = new URL(link.getAttribute('href')!, 'http://test');
      expect(ziel.pathname).toBe('/termine/dauerfehlzeit');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
    });
  });

  describe('BEF-039: Ueber dem Raster nur Monat, Person, Woche und Jetzt', () => {
    it('zeigt oben nur die vier Dinge und klappt alles Uebrige ein', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(screen.getByRole('button', { name: /Mai 2027/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue('');
      expect(screen.getByText('KW 19 · Mi 12.05.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Heute' })).toBeInTheDocument();

      // Eingeklappt: Ansicht, Zoom, Filter und die Anlegen-Schaltflaechen.
      expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull();
      expect(screen.queryByLabelText('Standort')).toBeNull();
      expect(screen.queryByLabelText('Status')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).toBeNull();

      // Der Knopf dazu steht in der Ecke des Rasters.
      const knopf = screen.getByRole('button', { name: 'Ansicht und Filter' });
      expect(raster().contains(knopf)).toBe(true);
      fireEvent.click(knopf);
      expect(knopf).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('group', { name: 'Zoom' })).toBeInTheDocument();
      expect(screen.getByLabelText('Standort')).toBeInTheDocument();
    });

    it('nennt die Woche als Spanne in der Wochenansicht', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(screen.getByText('KW 19 · 10.05.–16.05.')).toBeInTheDocument();
      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(STAFF_ANNA);
    });

    it('sagt am Knopf, wenn ein Filter wirkt', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(
        screen.getByRole('button', { name: 'Ansicht und Filter, Filter aktiv' }),
      ).toBeInTheDocument();
    });

    it('springt ueber den Monatskalender auf einen Tag', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('button', { name: /Mai 2027/ }));
      const blatt = screen.getByRole('group', { name: 'Monatskalender' });
      // Heute ist markiert, der gezeigte Tag gewaehlt.
      // Auch gewählt bleibt heute erkennbar: Rahmen und Punkt, im Namen „heute" (BEF-074).
      const heute = within(blatt).getByRole('button', { name: 'Mittwoch, 12. Mai 2027, heute' });
      expect(heute).toHaveAttribute('aria-current', 'date');
      expect(heute).toHaveAttribute('aria-pressed', 'true');
      expect(heute).toHaveClass('border-2');

      fireEvent.click(within(blatt).getByRole('button', { name: 'Nächster Monat' }));
      fireEvent.click(within(blatt).getByRole('button', { name: 'Donnerstag, 3. Juni 2027' }));

      await waitFor(() =>
        expect(letzteAbfrage()).toMatchObject({ von: '2027-06-03', bis: '2027-06-04' }),
      );
      expect(screen.queryByRole('group', { name: 'Monatskalender' })).toBeNull();
    });

    it('zeigt die aktuelle Uhrzeit als Linie und springt mit "Jetzt" dorthin', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      // 07:30 UTC = 09:30 in Tuebingen, mitten im Termin von 09 bis 10 Uhr.
      vi.setSystemTime(new Date('2027-05-12T07:30:00Z'));
      const springen = vi.fn();
      Element.prototype.scrollIntoView = springen;
      try {
        rendern('/kalender?ansicht=tag&datum=2027-05-12');
        await screen.findByRole('button', { name: /Max Mustermann/ });

        // Eine Linie je Spalte, beide Personen arbeiten heute.
        expect(screen.getAllByTestId('jetzt-linie')).toHaveLength(2);
        expect(springen).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Heute' }));
        await waitFor(() => expect(springen).toHaveBeenCalledTimes(1));
      } finally {
        vi.useRealTimers();
        // jsdom kennt die Methode nicht - sie wird wieder entfernt.
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });

    it('zeigt an einem anderen Tag keine Linie', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-13');
      await screen.findByRole('group', { name: 'Anna Beispiel' });
      expect(screen.queryByTestId('jetzt-linie')).toBeNull();
    });
  });

  describe('BEF-037: Die Uhrzeit sitzt im Rahmen der Auswahl', () => {
    it('macht die Auswahl eines einzelnen Feldes so hoch wie ihren Inhalt', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }));

      // 2 px Rahmen, 4 px Innenabstand und 16 px Zeile, oben und unten.
      const flaeche = screen.getByTestId('auswahl-flaeche');
      expect(flaeche).toHaveTextContent('07:00');
      expect(flaeche.style.height).toBe('28px');
      expect(flaeche.className).toContain('leading-4');
    });
  });

  describe('BEF-035 und BEF-036: zweiter Tipp und Leiste unter dem Gitter', () => {
    async function tagAnna() {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      return screen.getByRole('group', { name: 'Anna Beispiel' });
    }

    it('zieht mit einem zweiten Tipp in derselben Spalte die Spanne dazwischen auf', async () => {
      const zelle = await tagAnna();
      fireEvent.click(zelle, { clientY: 0 });
      // 40 Minuten weiter: 07:00 bis 07:40.
      fireEvent.click(zelle, { clientY: (EINE_STUNDE * 40) / 60 });

      expect(screen.getByTestId('auswahl-flaeche')).toHaveTextContent('07:00–07:40');
      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      expect(menue).toHaveTextContent('07:00–07:40 Uhr');
      // Die Spanne hat ihre Laenge - der Termin bekommt sie statt des Fensters.
      expect(within(menue).getByRole('button', { name: /^Neuer Termin/ })).toHaveTextContent(
        '07:00–07:40 Uhr',
      );
      // Und die wahre Hoehe im Gitter, nicht die Mindesthoehe (BEF-037).
      expect(screen.getByTestId('auswahl-flaeche').style.height).toBe(
        `${(EINE_STUNDE * 40) / 60}px`,
      );
    });

    it('hebt die Auswahl mit einem zweiten Tipp auf dasselbe Feld auf', async () => {
      const zelle = await tagAnna();
      fireEvent.click(zelle, { clientY: 0 });
      fireEvent.click(zelle, { clientY: 0 });

      expect(screen.queryByTestId('auswahl-flaeche')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Was soll hier entstehen?' }),
      ).not.toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('beginnt in einer anderen Spalte eine neue Auswahl', async () => {
      await tagAnna();
      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }), { clientY: 0 });
      fireEvent.click(screen.getByRole('group', { name: 'Tim Teamleitung' }), {
        clientY: EINE_STUNDE,
      });

      const flaeche = screen.getByTestId('auswahl-flaeche');
      expect(flaeche).toHaveTextContent('08:00');
      expect(
        within(screen.getByRole('group', { name: 'Tim Teamleitung' })).getByTestId(
          'auswahl-flaeche',
        ),
      ).toBe(flaeche);
    });

    it('stellt das Menue unter das Gitter und nicht in die Spalte', async () => {
      const zelle = await tagAnna();
      fireEvent.click(zelle, { clientY: 0 });

      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      expect(within(zelle).queryByRole('group')).toBeNull();
      expect(raster().contains(menue)).toBe(false);
      // Klebt am unteren Fensterrand, ueber der Tableiste des Telefons.
      expect(menue.className).toContain('sticky');
      expect(menue).toHaveTextContent(/Zweites Feld antippen/);
    });
  });

  describe('UX-010: Langer Druck am Finger und Rueckgaengig', () => {
    /** Wie in CAL-006: jsdom kennt kein Layout. */
    function spaltenVermessen(): void {
      const zellen = spalten();
      zellen.forEach((zelle, index) => {
        zelle.getBoundingClientRect = () => ({
          left: 100 + index * 200,
          right: 300 + index * 200,
          top: 0,
          bottom: 800,
          width: 200,
          height: 800,
          x: 100 + index * 200,
          y: 0,
          toJSON: () => ({}),
        });
      });
    }

    it('verschiebt am Finger NICHT ohne langen Druck - das ist Scrollen', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        rendern('/kalender?ansicht=tag&datum=2027-05-12');
        const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
        spaltenVermessen();

        fireEvent.pointerDown(kachel, {
          clientX: 150,
          clientY: 200,
          button: 0,
          pointerType: 'touch',
        });
        // Sofortige Bewegung: der Finger scrollt.
        fireEvent.pointerMove(window, { clientX: 150, clientY: 260, button: 0 });
        fireEvent.pointerUp(window, { clientX: 150, clientY: 260 });

        expect(updateAppointment).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('verschiebt am Finger nach dem langen Druck', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        rendern('/kalender?ansicht=tag&datum=2027-05-12');
        const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
        spaltenVermessen();

        fireEvent.pointerDown(kachel, {
          clientX: 150,
          clientY: 200,
          button: 0,
          pointerType: 'touch',
        });
        // Finger bleibt liegen: der lange Druck laeuft ab.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
        fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
        fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });

        // Am Finger wie an der Maus: Das Loslassen fragt, die Bestaetigung
        // schreibt (CAL-023).
        expect(updateAppointment).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }));

        await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
      } finally {
        vi.useRealTimers();
      }
    });

    it('bricht den langen Druck ab, wenn ein zweiter Finger zum Zoomen dazukommt (BEF-038)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        rendern('/kalender?ansicht=tag&datum=2027-05-12');
        const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
        spaltenVermessen();

        fireEvent.pointerDown(kachel, {
          clientX: 150,
          clientY: 200,
          button: 0,
          pointerType: 'touch',
        });
        fireEvent.touchStart(raster().parentElement!, {
          touches: [
            { identifier: 0, clientX: 150, clientY: 200 },
            { identifier: 1, clientX: 150, clientY: 300 },
          ],
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
        fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
        fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });

        // Kein Verschieben und keine Rueckfrage: Die Geste gehoerte dem Zoom.
        expect(screen.queryByRole('button', { name: /^(Trotzdem v|V)erschieben$/ })).toBeNull();
        expect(updateAppointment).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('zieht am Zeigegeraet weiterhin sofort - dort gibt es nichts zu warten', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, {
        clientX: 150,
        clientY: 200,
        button: 0,
        pointerType: 'mouse',
      });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });
      fireEvent.click(await screen.findByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }));

      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
    });

    it('bietet nach dem Verschieben den alten Platz zum Zurueckholen an', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });
      fireEvent.click(await screen.findByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }));

      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));

      // Die Leiste nennt den alten Platz - 09:00-10:00 Ortszeit.
      const leiste = await screen.findByText(/Termin verschoben\. Vorher:/);
      expect(leiste).toHaveTextContent(/09:00–10:00/);

      await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(2));
      const zurueck = updateAppointment.mock.calls.at(-1) as [
        string,
        string,
        AppointmentsApi.AppointmentFormValues,
        boolean | undefined,
      ];
      expect(zurueck[2]).toMatchObject({
        date: '2027-05-12',
        start_time: '09:00',
        end_time: '10:00',
      });
      // Der alte Platz war bereits in Gebrauch - keine zweite Arbeitszeitfrage.
      expect(zurueck[3]).toBe(true);
    });

    it('laesst die Leiste verschwinden, wenn der Ausschnitt wechselt', async () => {
      const user = userEvent.setup();
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });
      fireEvent.click(await screen.findByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }));
      await screen.findByText(/Termin verschoben\. Vorher:/);

      await user.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }));
      await waitFor(() => expect(screen.queryByText(/Termin verschoben\. Vorher:/)).toBeNull());
    });

    it('zeigt ohne Verschiebung keine Leiste', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
    });
  });
  // ---------------------------------------------------------------------------
  // AKTE-003: Der Patientenfilter kommt aus der Akte mit.
  //
  // Er wirkt in der Darstellung und nicht im Lesepfad: Der Kalender liest den
  // Ausschnitt ohnehin vollstaendig, und eine eigene Serverabfrage je
  // Patient:in waere ein zweiter Weg zu denselben Daten.
  // ---------------------------------------------------------------------------
  describe('AKTE-003: Patientenfilter aus der Akte', () => {
    const ANDERE = '66666666-6666-4666-8666-000000000002';

    it('zeigt nur die Termine der uebergebenen Patient:in', async () => {
      fetchAppointments.mockResolvedValue([
        eintrag(),
        eintrag({
          id: '77777777-7777-4777-8777-000000000009',
          patient_id: ANDERE,
          patient_given_name: 'Erika',
          patient_family_name: 'Beispiel',
          starts_at: '2027-05-12T09:00:00.000Z',
          ends_at: '2027-05-12T10:00:00.000Z',
        }),
      ]);
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);

      expect(await screen.findByRole('button', { name: /Max Mustermann/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Erika Beispiel/ })).toBeNull();
    });

    it('nennt den Filter und den Namen aus den geladenen Terminen', async () => {
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);

      const hinweis = await screen.findByRole('status');
      expect(hinweis).toHaveTextContent('Nur die Termine von Max Mustermann');
      expect(within(hinweis).getByRole('link', { name: 'Zur Akte' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT}/termine`,
      );
    });

    it('hebt den Filter wieder auf', async () => {
      const user = userEvent.setup();
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);

      await user.click(await screen.findByRole('button', { name: 'Filter aufheben' }));

      await waitFor(() => expect(screen.queryByText(/Nur die Termine von/)).toBeNull());
    });

    it('erklaert eine leere Ansicht mit dem Filter statt mit dem Tag', async () => {
      fetchAppointments.mockResolvedValue([]);
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${ANDERE}`);

      expect(
        await screen.findByText('Für diese Patient:in steht an diesem Tag kein Termin an.'),
      ).toBeInTheDocument();
    });

    it('fragt den Server unveraendert - der Filter ist keine zweite Abfrage', async () => {
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&patient=${PATIENT}`);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(letzteAbfrage()).toEqual({
        von: '2027-05-12',
        bis: '2027-05-13',
        person: null,
        standort: null,
        status: 'active',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UX-Review 2026-09, Bereich Kalender (UXR-004)
  // ---------------------------------------------------------------------------
  describe('UXR-004: Kalender aus dem UX-Review', () => {
    /** Wie in CAL-006: jsdom kennt kein Layout. */
    function spaltenVermessen(): void {
      spalten().forEach((zelle, index) => {
        zelle.getBoundingClientRect = () => ({
          left: 100 + index * 200,
          right: 300 + index * 200,
          top: 0,
          bottom: 800,
          width: 200,
          height: 800,
          x: 100 + index * 200,
          y: 0,
          toJSON: () => ({}),
        });
      });
    }

    /** Zieht die Kachel eine Stunde nach unten und laesst los. */
    function eineStundeZiehen(kachel: HTMLElement): void {
      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 200 + EINE_STUNDE, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 200 + EINE_STUNDE });
    }

    it('stellt die Rueckgaengig-Leiste fest an den unteren Bildrand und setzt den Fokus darauf (KAL-01, BEF-075)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      eineStundeZiehen(kachel);
      fireEvent.click(await screen.findByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }));

      const rueckgaengig = await screen.findByRole('button', { name: 'Rückgängig' });
      await waitFor(() => expect(rueckgaengig).toHaveFocus());
      const leiste = rueckgaengig.closest('[role="status"]')!;
      // Fest am Bildrand, nicht klebend am Ende des Rasters (BEF-075).
      expect(leiste.className).toContain('fixed');
      // Im Dokument unter dem Raster - die Tastaturreihenfolge bleibt.
      expect(raster().compareDocumentPosition(leiste) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('oeffnet die Woche der eigenen Person, nicht die der ersten (KAL-03)', async () => {
      renderWithProviders(
        <CalendarPage user={testUser(['therapist', 'team_lead'], 'Tim Teamleitung')} />,
        '/kalender',
      );
      await waitFor(() =>
        expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(STAFF_TIM),
      );
    });

    it('kennzeichnet die eigene Spalte der Tagesansicht mit einem Wort (KAL-03, KAL-B01)', async () => {
      renderWithProviders(
        <CalendarPage user={testUser(['therapist'], 'Tim Teamleitung')} />,
        '/kalender?ansicht=tag&datum=2027-05-12',
      );
      expect(
        await screen.findByRole('group', { name: 'Tim Teamleitung, ich' }),
      ).toBeInTheDocument();
      const kopf = screen.getByRole('link', { name: 'Wochenplan von Tim Teamleitung (ich)' });
      expect(kopf).toHaveTextContent('ich');
      expect(screen.getByRole('group', { name: 'Anna Beispiel' })).toBeInTheDocument();
    });

    it('meldet eine gescheiterte Personenliste als Fehler statt als leere Praxis (KAL-07)', async () => {
      fetchAssignableTherapists.mockRejectedValue(new Error('Netz'));
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const titel = await screen.findByText(
        'Die behandelnden Personen konnten nicht geladen werden.',
      );
      expect(titel.closest('[role="alert"]')).toHaveTextContent(
        'Bitte die Verbindung prüfen und erneut versuchen.',
      );
      expect(screen.queryByText(/keine behandelnde Person hinterlegt/)).toBeNull();

      fetchAssignableTherapists.mockResolvedValue([
        { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByRole('group', { name: 'Anna Beispiel' })).toBeInTheDocument();
    });

    it('zeigt in der Woche ohne geladene Person kein leeres Raster (KAL-07)', async () => {
      fetchAssignableTherapists.mockRejectedValue(new Error('Netz'));
      rendern('/kalender?ansicht=woche&datum=2027-05-12');

      await screen.findByText('Die behandelnden Personen konnten nicht geladen werden.');
      expect(screen.queryByRole('region', { name: /Wochenansicht/ })).toBeNull();
      expect(screen.queryByText(/keine Termine geplant/)).toBeNull();
      // Ansicht und Filter bleiben erreichbar.
      expect(screen.getByRole('button', { name: /^Ansicht und Filter/ })).toBeInTheDocument();
    });

    it('nennt beim Ladefehler der Termine den naechsten Schritt (KAL-07, WRT-01)', async () => {
      fetchAppointments.mockRejectedValue(new Error('Netz'));
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const titel = await screen.findByText('Die Termine konnten nicht geladen werden.');
      const kasten = titel.closest<HTMLElement>('[role="alert"]')!;
      expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
      expect(within(kasten).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(kasten).not.toHaveTextContent(/angemeldet|neu laden/);
    });

    it('macht Pfeile, Eckknopf, Personenwahl und Monatstage zu 44-px-Zielen (KAL-08)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      for (const name of ['Vorheriger Zeitraum', 'Nächster Zeitraum', 'Ansicht und Filter']) {
        expect(screen.getByRole('button', { name })).toHaveClass('size-11');
      }
      expect(screen.getByRole('button', { name: 'Heute' })).toHaveClass('min-h-11');
      // 16 px Schrift: darunter zoomt iOS beim Antippen hinein.
      expect(screen.getByLabelText('Behandelnde Person')).toHaveClass('min-h-11', 'text-base');

      fireEvent.click(screen.getByRole('button', { name: /Mai 2027/ }));
      expect(screen.getByRole('button', { name: 'Mittwoch, 12. Mai 2027, heute' })).toHaveClass(
        'size-11',
      );
    });

    it('hebt die Auswahl mit einem Tipp in ihre gezeichnete Flaeche auf (KAL-09)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      const spalte = screen.getByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(spalte, { clientY: 0 });
      // 14 px tiefer: gerundet schon 07:10, aber noch in der 28 px hohen Fläche.
      fireEvent.click(spalte, { clientY: 14 });

      expect(screen.queryByTestId('auswahl-flaeche')).toBeNull();
      expect(screen.queryByRole('group', { name: 'Was soll hier entstehen?' })).toBeNull();
    });

    it('zieht mit einem Tipp unterhalb der Flaeche weiter die Spanne auf (KAL-09)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });
      const spalte = screen.getByRole('group', { name: 'Anna Beispiel' });

      fireEvent.click(spalte, { clientY: 0 });
      fireEvent.click(spalte, { clientY: 40 });

      expect(screen.getByTestId('auswahl-flaeche')).toHaveTextContent('07:00–07:25');
    });

    it('nennt in der Leiste Person und Tag vor der Uhrzeit (KAL-10)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Tim Teamleitung' }), { clientY: 0 });
      expect(screen.getByRole('group', { name: 'Was soll hier entstehen?' })).toHaveTextContent(
        'Tim Teamleitung · Mi 12.05. · 07:00 Uhr',
      );
    });

    it('behaelt beim Zoomen die Auswahl und legt keinen Verlaufseintrag an (KAL-11)', async () => {
      // Ein eigener Router, damit sich die Art der Navigation ablesen lässt.
      const router = createMemoryRouter(
        [{ path: '*', element: <CalendarPage user={testUser(['office'], 'Olivia Office')} /> }],
        { initialEntries: ['/kalender?ansicht=tag&datum=2027-05-12'] },
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Anna Beispiel' }), { clientY: 0 });
      await optionenOeffnen();
      fireEvent.click(screen.getByRole('button', { name: 'Raster feiner' }));

      await waitFor(() => expect(router.state.location.search).toContain('zoom=144'));
      expect(router.state.historyAction).toBe('REPLACE');
      expect(screen.getByTestId('auswahl-flaeche')).toHaveTextContent('07:00');
    });

    it('beschreibt das Raster als Bereich mit einer Gruppe je Spalte (KAL-16)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      expect(screen.queryByRole('grid')).toBeNull();
      expect(screen.queryByRole('gridcell')).toBeNull();
      expect(spalten().map((s) => s.getAttribute('aria-label'))).toEqual([
        'Anna Beispiel',
        'Tim Teamleitung',
      ]);
    });

    it('liest das Zeichen einer Fehlzeit als Wort vor (KAL-16)', async () => {
      fetchAppointments.mockResolvedValue([
        eintrag({
          id: '77777777-7777-4777-8777-00000000000e',
          kind: 'internal',
          title: 'Teambesprechung',
          patient_id: null,
          patient_given_name: null,
          patient_family_name: null,
        }),
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const kachel = await screen.findByRole('button', { name: /Teambesprechung/ });
      // jsdom rechnet den Namen ohne Leerraum zwischen Inline-Elementen zusammen.
      expect(kachel).toHaveAccessibleName(/^Fehlzeit:s*Teambesprechung/);
      expect(kachel).not.toHaveAccessibleName(/▪/);
    });

    it('zeichnet abgesagte Termine mit eigenen Farben und nennt den Status in eigener Zeile (KAL-18, KAL-23)', async () => {
      fetchAppointments.mockResolvedValue([eintrag({ status: 'cancelled' })]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      expect(kachel.className).not.toMatch(/opacity/);
      // Auf dem Seitengrund (Design-Handoff 2026-10-01, Abschnitt 7a).
      expect(kachel.className).toContain('bg-canvas');
      expect(kachel.className).toContain('border-dashed');
      expect(kachel.className).toContain('border-l-danger');
      expect(within(kachel).getByTestId('kachel-status')).toHaveTextContent('× Abgesagt');
      // Die Zeitzeile trägt den Status nicht mehr - dort wurde er abgeschnitten.
      expect(within(kachel).getByText(/09:00–10:00/)).not.toHaveTextContent('Abgesagt');
    });

    it('gibt „Tag umplanen" den Kalenderstand als Rueckweg mit (KAL-19)', async () => {
      rendern(`/kalender?ansicht=tag&datum=2027-05-12&person=${STAFF_ANNA}`);
      await optionenOeffnen();

      const link = await screen.findByRole('link', { name: 'Tag umplanen' });
      const ziel = new URL(link.getAttribute('href')!, 'http://test');
      expect(ziel.pathname).toBe('/kalender/tag-umplanen');
      expect(ziel.searchParams.get('zurueck')).toBe(
        `/kalender?ansicht=tag&datum=2027-05-12&person=${STAFF_ANNA}`,
      );
    });

    it('gibt den Fokus nach dem Monatsblatt an den Monatsknopf zurueck (KAL-21)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const knopf = screen.getByRole('button', { name: /Mai 2027/ });
      fireEvent.click(knopf);
      fireEvent.keyDown(screen.getByRole('group', { name: 'Monatskalender' }), { key: 'Escape' });

      expect(screen.queryByRole('group', { name: 'Monatskalender' })).toBeNull();
      expect(knopf).toHaveFocus();
    });

    it('fuehrt den Fokus in „Ansicht und Filter" hinein und mit Escape zurueck (KAL-21)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const knopf = screen.getByRole('button', { name: 'Ansicht und Filter' });
      fireEvent.click(knopf);
      const feld = screen.getByRole('group', { name: 'Ansicht und Filter' });
      // Der erste Knopf im Feld; „Tag | Woche" steht seit Abschnitt 7a im Kopf.
      await waitFor(() => expect(feld.querySelector('button, a, select')).toHaveFocus());

      fireEvent.keyDown(feld, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Ansicht und Filter' })).toBeNull();
      expect(knopf).toHaveFocus();
    });

    it('gibt den Fokus nach der Anlegen-Leiste an die Spalte zurueck (KAL-21)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const spalte = screen.getByRole('group', { name: 'Anna Beispiel' });
      fireEvent.click(spalte, { clientY: 0 });
      fireEvent.keyDown(screen.getByRole('group', { name: 'Was soll hier entstehen?' }), {
        key: 'Escape',
      });

      await waitFor(() => expect(spalte).toHaveFocus());
    });

    it('gibt den Fokus nach dem Abbrechen der Rueckfrage an die Kachel zurueck (KAL-21)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
      spaltenVermessen();

      eineStundeZiehen(kachel);
      const kasten = await screen.findByRole('group', { name: 'Termin verschieben?' });
      fireEvent.click(within(kasten).getByRole('button', { name: 'Abbrechen' }));

      await waitFor(() => expect(kachel).toHaveFocus());
    });

    it('bietet an vergangenen Tagen keine Fehlzeit an (KAL-22)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-11');
      fireEvent.click(await screen.findByRole('group', { name: 'Anna Beispiel' }));

      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      for (const name of [/^Fehlzeit/, /^Dauerfehlzeit/]) {
        const eintragKnopf = within(menue).getByRole('button', { name });
        expect(eintragKnopf).toBeDisabled();
        expect(eintragKnopf).toHaveTextContent('Nur ab heute möglich');
      }
      expect(within(menue).getByRole('button', { name: /^Neuer Termin/ })).toBeEnabled();
    });

    it('meldet nach dem Eintragen einer Fehlzeit den Erfolg (KAL-22)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&eingetragen=dauerfehlzeit');
      expect(await screen.findByText('Dauerfehlzeit eingetragen.')).toBeInTheDocument();
    });

    it('meldet einen leeren Tag unter Statusfilter mit dem Filter und ueber dem Raster (KAL-26)', async () => {
      fetchAppointments.mockResolvedValue([]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=cancelled');

      const leer = await screen.findByText('Keine abgesagten Termine an diesem Tag.');
      expect(leer.compareDocumentPosition(raster()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      // Die Zeitzone steht nicht mehr als Kennung da.
      expect(screen.queryByText(/Europe\/Berlin/)).toBeNull();
    });

    it('nennt den Monat am Telefon ohne zweistelliges Jahr (KAL-27)', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const knopf = screen.getByRole('button', { name: /Monatskalender/ });
      expect(within(knopf).getByText('Mai')).toBeInTheDocument();
      expect(knopf).not.toHaveTextContent('Mai 27');
    });

    it('nennt das Jahr ausgeschrieben, wenn es nicht das laufende ist (KAL-27)', async () => {
      rendern('/kalender?ansicht=tag&datum=2028-01-12');
      const knopf = await screen.findByRole('button', { name: /Monatskalender/ });
      expect(within(knopf).getByText('Jan. 2028')).toBeInTheDocument();
    });

    it('kennzeichnet heute in der Woche als Wort und als aktuelles Datum (KAL-B01)', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      await screen.findByRole('button', { name: /Max Mustermann/ });

      const koepfe = screen.getAllByRole('link', {
        name: /Tagesansicht aller behandelnden Personen/,
      });
      const heute = koepfe.filter((k) => k.getAttribute('aria-current') === 'date');
      expect(heute).toHaveLength(1);
      expect(heute[0]).toHaveTextContent(/12\.05\..*heute/);
      expect(screen.getByRole('group', { name: 'Mi 12.05., heute' })).toBeInTheDocument();
    });

    it('rollt die Woche waagerecht zum heutigen Tag (RSP-03)', async () => {
      // jsdom kennt kein Layout: Jede Tagesspalte bekommt einen Kasten von
      // 144 px, Montag beginnt neben der Zeitachse.
      const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      const vermessen = vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          const name = this.getAttribute('aria-label') ?? '';
          const index = this.getAttribute('role') === 'group' ? TAGE.indexOf(name.slice(0, 2)) : -1;
          const left = index < 0 ? 0 : 52 + index * 144;
          return {
            left,
            right: left + 144,
            top: 0,
            bottom: 0,
            width: 144,
            height: 0,
            x: left,
            y: 0,
            toJSON: () => ({}),
          };
        });
      try {
        rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
        await screen.findByRole('button', { name: /Max Mustermann/ });
        // Mittwoch: zwei Spalten nach Montag.
        await waitFor(() => expect(raster().parentElement!.scrollLeft).toBe(2 * 144));
      } finally {
        vermessen.mockRestore();
      }
    });
  });

  describe('TRN-006: Trainingstermine im gemeinsamen Kalender', () => {
    const STAFF_TOM = '55555555-5555-4555-8555-000000000006';
    const training = eintrag({
      id: '77777777-7777-4777-8777-0000000000aa',
      kind: 'training',
      patient_id: null,
      patient_given_name: null,
      patient_family_name: null,
      staff_member_id: STAFF_TOM,
      staff_given_name: 'Tom',
      staff_family_name: 'Trainingsbetreuung',
      training_relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
      training_given_name: 'Tina',
      training_family_name: 'Trainingskundin',
    });

    it('zeigt den Trainingstermin mit dem Namen aus dem Training und oeffnet ihn im Trainingsbereich', async () => {
      fetchAssignableTrainers.mockResolvedValue([
        { staff_member_id: STAFF_TOM, display_name: 'Tom Trainingsbetreuung' },
      ]);
      fetchAppointments.mockResolvedValue([eintrag(), training]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const kachel = await screen.findByRole('button', { name: /Tina Trainingskundin/ });
      fireEvent.click(kachel);
      expect(screen.getByRole('link', { name: 'Training →' }).getAttribute('href')).toMatch(
        /^\/training\/termine\/77777777-7777-4777-8777-0000000000aa/,
      );
      // Vorgelesen wird das Wort, nicht das Zeichen (KAL-16).
      expect(kachel).toHaveTextContent(/Training: Tina Trainingskundin/);
      // Toms Spalte steht neben den behandelnden Personen.
      expect(screen.getByRole('group', { name: 'Tom Trainingsbetreuung' })).toBeInTheDocument();
    });

    it('bietet in der Spalte der Trainingsbetreuung nur Trainingstermin und Fehlzeiten an', async () => {
      fetchAssignableTrainers.mockResolvedValue([
        { staff_member_id: STAFF_TOM, display_name: 'Tom Trainingsbetreuung' },
      ]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('button', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('group', { name: 'Tom Trainingsbetreuung' }));
      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      const knoepfe = within(menue)
        .getAllByRole('button')
        .map((k) => k.textContent ?? '');
      expect(knoepfe.some((k) => k.startsWith('Trainingstermin'))).toBe(true);
      expect(knoepfe.some((k) => k.startsWith('Neuer Termin'))).toBe(false);
      expect(knoepfe.some((k) => k.startsWith('Fehlzeit'))).toBe(true);
    });

    it('gibt der Trainingsbetreuung ihre Spalte und nur den Trainingstermin zum Anlegen', async () => {
      fetchAssignableTrainers.mockResolvedValue([
        { staff_member_id: STAFF_TOM, display_name: 'Tom Trainingsbetreuung' },
      ]);
      fetchAppointments.mockResolvedValue([training]);
      renderWithProviders(
        <CalendarPage user={testUser(['trainer'], 'Tom Trainingsbetreuung')} />,
        '/kalender?ansicht=tag&datum=2027-05-12',
      );
      await screen.findByRole('button', { name: /Tina Trainingskundin/ });
      // Die Liste der behandelnden Personen fragt sie gar nicht erst an.
      expect(fetchAssignableTherapists).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('group', { name: /Tom Trainingsbetreuung/ }));
      const menue = screen.getByRole('group', { name: 'Was soll hier entstehen?' });
      expect(
        within(menue)
          .getAllByRole('button')
          .map((k) => (k.textContent ?? '').split(/\d/)[0]),
      ).toEqual(expect.arrayContaining(['Trainingstermin']));
      expect(within(menue).getAllByRole('button')).toHaveLength(2);
    });

    it('zieht einen Trainingstermin nicht', async () => {
      fetchAssignableTrainers.mockResolvedValue([
        { staff_member_id: STAFF_TOM, display_name: 'Tom Trainingsbetreuung' },
      ]);
      fetchAppointments.mockResolvedValue([eintrag(), training]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('button', { name: /Tina Trainingskundin/ });
      // Die Behandlung daneben laesst sich greifen, der Trainingstermin nicht.
      expect(screen.getByRole('button', { name: /Max Mustermann/ }).className).toMatch(
        /cursor-grab/,
      );
      expect(kachel.className).not.toMatch(/cursor-grab/);
    });
  });
});

/**
 * Doku-Stand und Terminpanel (UI-Redesign Zyklen 2-4, Design-Handoff
 * 2026-10-01, Abschnitt 7a).
 */
describe('CalendarPage: Doku offen und Terminpanel', () => {
  // Dieselbe Ausgangslage wie im Haupt-Block - ohne sie liefe der Block nur,
  // wenn ein Test davor die Ersatzfunktionen schon belegt hat.
  beforeEach(() => {
    vergissKalenderstaende();
    fetchAppointments.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchAssignableTrainers.mockReset();
    fetchAssignableTrainers.mockResolvedValue([]);
    fetchLocations.mockReset();
    fetchAppointment.mockReset();
    fetchWorkingHours.mockReset();
    fetchWorkingHourExceptions.mockReset();
    fetchWorkingHours.mockResolvedValue([]);
    fetchWorkingHourExceptions.mockResolvedValue([]);
    fetchAppointment.mockResolvedValue(bestand);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: STAFF_TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
  });

  it('kennzeichnet einen abgeschlossenen Termin ohne festgeschriebene Doku', async () => {
    fetchAppointments.mockResolvedValue([
      eintrag({ status: 'completed', documentation_status: 'none' }),
    ]);
    renderWithProviders(
      <CalendarPage user={testUser(['therapist'], 'Anna Beispiel')} />,
      '/kalender?ansicht=tag&datum=2027-05-12&status=all',
    );

    const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
    expect(within(kachel).getByTestId('kachel-status')).toHaveTextContent('! Doku offen');
    expect(kachel.className).toContain('border-l-warnung');
  });

  it('zeigt auch dem Büro „Doku offen" - es liest Dokumentation (ABN-005, ANN-201 Fassung 2)', async () => {
    fetchAppointments.mockResolvedValue([
      eintrag({ status: 'completed', documentation_status: 'none' }),
    ]);
    rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

    const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
    expect(kachel).toHaveTextContent('Doku offen');
  });

  it('zeigt einen dokumentierten Termin mit Zeichen und Wort, ohne Warnung', async () => {
    fetchAppointments.mockResolvedValue([
      eintrag({ status: 'documented', documentation_status: 'final' }),
    ]);
    rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

    const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
    expect(within(kachel).getByTestId('kachel-status')).toHaveTextContent('✓ Dokumentiert');
    expect(kachel.className).toContain('border-l-line-strong');
  });

  it('behauptet ohne bekannten Stand nichts (Rolle ohne Nachweis)', async () => {
    fetchAppointments.mockResolvedValue([
      eintrag({ status: 'completed', documentation_status: null }),
    ]);
    rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

    const kachel = await screen.findByRole('button', { name: /Max Mustermann/ });
    expect(kachel).not.toHaveTextContent('Doku offen');
  });

  it('bietet am fremden Termin weder Haken noch Doku an, nennt aber die Person', async () => {
    fetchAppointments.mockResolvedValue([eintrag()]);
    const user = userEvent.setup();
    rendern('/kalender?ansicht=tag&datum=2027-05-12');

    await user.click(await screen.findByRole('button', { name: /Max Mustermann/ }));
    const panel = screen.getByRole('region', { name: /Max Mustermann/ });
    expect(within(panel).queryByRole('button', { name: /Termin abschließen/ })).toBeNull();
    expect(within(panel).queryByRole('link', { name: /^Doku/ })).toBeNull();
    expect(within(panel).getByText(/Behandelnde Person/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Terminpanel schließen' }));
    expect(screen.queryByRole('region', { name: /Max Mustermann/ })).toBeNull();
  });

  it('bietet am eigenen Termin Haken und Doku an', async () => {
    fetchAppointments.mockResolvedValue([eintrag()]);
    const user = userEvent.setup();
    renderWithProviders(
      <CalendarPage user={testUser(['therapist'], 'Anna Beispiel')} />,
      '/kalender?ansicht=tag&datum=2027-05-12',
    );

    await user.click(await screen.findByRole('button', { name: /Max Mustermann/ }));
    const panel = screen.getByRole('region', { name: /Max Mustermann/ });
    expect(within(panel).getByRole('button', { name: 'Termin abschließen' })).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Doku schreiben' })).toHaveAttribute(
      'href',
      expect.stringContaining('/termine/77777777-7777-4777-8777-000000000001/abschluss'),
    );
    expect(within(panel).queryByText(/Behandelnde Person/)).toBeNull();
  });
});

describe('CalendarPage: Fahrwege als Bloecke (UBK-005, ANN-235)', () => {
  beforeEach(() => {
    vergissKalenderstaende();
    fetchAppointments.mockReset();
    fetchAppointments.mockResolvedValue([eintrag()]);
    fetchAssignableTherapists.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: STAFF_TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchAssignableTrainers.mockReset();
    fetchAssignableTrainers.mockResolvedValue([]);
    fetchLocations.mockReset();
    fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
    fetchWorkingHours.mockReset();
    fetchWorkingHours.mockResolvedValue([]);
    fetchWorkingHourExceptions.mockReset();
    fetchWorkingHourExceptions.mockResolvedValue([]);
    fetchDayRoute.mockReset();
    fetchDayRoute.mockResolvedValue([]);
    fetchStandorte.mockReset();
    fetchStandorte.mockResolvedValue([]);
    rufeFunktionAuf.mockReset();
    fahrzeitfaktor.wert = 1;
  });

  /** Ein Punkt der Tagesroute: Kennung, Zeit, Koordinate - mehr gibt es nicht. */
  function punkt(id: string, beginn: string, ende: string, lat: number) {
    return {
      id,
      kind: 'therapy',
      appointment_type: 'home_visit' as const,
      status: 'confirmed',
      starts_at: beginn,
      ends_at: ende,
      lat,
      lon: 9.05,
      geocode_precision: 'address' as const,
      position_source: 'visit' as const,
    };
  }
  const STANDORT = {
    id: ORT,
    name: 'Hauptstandort Tuebingen',
    street: 'Praxisweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    lat: 48.5,
    lon: 9.05,
    geocode_precision: 'address' as const,
  };
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

  async function mitUhr(test: () => Promise<void>) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 05:00 UTC = 07:00 in Tuebingen, vor allen Terminen des Tages.
    vi.setSystemTime(new Date('2027-05-12T05:00:00Z'));
    try {
      await test();
    } finally {
      vi.useRealTimers();
    }
  }

  it('zeichnet vor jedem Besuch einen Block so lang wie die Fahrzeit, nur mit Koordinaten zum Dienst', async () => {
    await mitUhr(async () => {
      fetchStandorte.mockResolvedValue([STANDORT]);
      fetchDayRoute.mockImplementation((_datum: string, person: string) =>
        Promise.resolve(
          person === STAFF_ANNA
            ? [
                punkt('a', '2027-05-12T07:00:00.000Z', '2027-05-12T08:00:00.000Z', 48.51),
                punkt('b', '2027-05-12T09:00:00.000Z', '2027-05-12T10:00:00.000Z', 48.52),
              ]
            : [],
        ),
      );
      rufeFunktionAuf.mockResolvedValue(route('anbieter', 12, 20));
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const anna = await screen.findByRole('group', { name: /^Anna Beispiel/ });
      await waitFor(() => expect(within(anna).getAllByTestId('fahrweg')).toHaveLength(2));
      const [erster, zweiter] = within(anna).getAllByTestId('fahrweg');
      expect(erster).toHaveTextContent('Weg ≈ 12 min');
      expect(erster).toHaveTextContent('Fahrweg etwa 12 Minuten, 08:48 bis 09:00');
      expect(zweiter).toHaveTextContent('Fahrweg etwa 20 Minuten, 10:40 bis 11:00');
      // Nicht antippbar: Die freie Fläche darunter bleibt eine Auswahl.
      expect(erster).toHaveClass('pointer-events-none');
      // Die andere Spalte hat keine Besuche mit Ort - keine Blöcke.
      const tim = screen.getByRole('group', { name: /^Tim Teamleitung/ });
      expect(within(tim).queryByTestId('fahrweg')).toBeNull();

      // ADR-019 Punkt 12: an die Function nur Koordinaten und das Profil.
      const [, koerper] = rufeFunktionAuf.mock.calls[0] as [string, Record<string, unknown>];
      expect(Object.keys(koerper).sort()).toEqual(['profile', 'waypoints']);
      expect(JSON.stringify(koerper)).not.toMatch(/Mustermann|2027|"a"/);
    });
  });

  it('rechnet die Bloecke mit dem Fahrzeitfaktor der Praxis (UBK-010, ANN-237)', async () => {
    await mitUhr(async () => {
      fahrzeitfaktor.wert = 1.5;
      fetchStandorte.mockResolvedValue([STANDORT]);
      fetchDayRoute.mockResolvedValue([
        punkt('a', '2027-05-12T07:00:00.000Z', '2027-05-12T08:00:00.000Z', 48.51),
      ]);
      rufeFunktionAuf.mockResolvedValue(route('anbieter', 12));
      rendern('/kalender?ansicht=tag&datum=2027-05-12&person=' + STAFF_ANNA);

      // 12 Minuten des Kartendienstes mal 1,5.
      const block = await screen.findByTestId('fahrweg');
      expect(block).toHaveTextContent('Fahrweg etwa 18 Minuten, 08:42 bis 09:00');
    });
  });

  it('fragt fuer einen vergangenen Tag nichts an', async () => {
    await mitUhr(async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-11');
      await screen.findByRole('group', { name: /^Anna Beispiel/ });
      expect(fetchDayRoute).not.toHaveBeenCalled();
      expect(screen.queryByTestId('fahrweg')).toBeNull();
    });
  });

  it('fragt in der Woche je Werktag der gezeigten Person ab heute', async () => {
    await mitUhr(async () => {
      rendern('/kalender?ansicht=woche&datum=2027-05-12&person=' + STAFF_ANNA);
      await waitFor(() => expect(fetchDayRoute).toHaveBeenCalled());
      const tage = fetchDayRoute.mock.calls.map(([datum]) => datum as string).sort();
      // Mittwoch bis Sonntag - Montag und Dienstag sind vorbei.
      expect(tage).toEqual(['2027-05-12', '2027-05-13', '2027-05-14', '2027-05-15', '2027-05-16']);
      expect(fetchDayRoute.mock.calls.every(([, person]) => person === STAFF_ANNA)).toBe(true);
    });
  });

  it('sagt dazu, wenn die Fahrwege eine Nachbildung ohne Kartendienst sind', async () => {
    await mitUhr(async () => {
      fetchStandorte.mockResolvedValue([STANDORT]);
      fetchDayRoute.mockResolvedValue([
        punkt('a', '2027-05-12T07:00:00.000Z', '2027-05-12T08:00:00.000Z', 48.51),
      ]);
      rufeFunktionAuf.mockResolvedValue(route('nachbildung', 9));
      rendern('/kalender?ansicht=tag&datum=2027-05-12&person=' + STAFF_ANNA);
      expect(
        await screen.findByText(/Nachbildung ohne Kartendienst: Die Fahrwege/),
      ).toBeInTheDocument();
    });
  });

  it('zeigt ohne Route keinen Block - ungeprueft ist nicht kurz', async () => {
    await mitUhr(async () => {
      fetchDayRoute.mockResolvedValue([
        punkt('a', '2027-05-12T07:00:00.000Z', '2027-05-12T08:00:00.000Z', 48.51),
        punkt('b', '2027-05-12T09:00:00.000Z', '2027-05-12T10:00:00.000Z', 48.52),
      ]);
      rufeFunktionAuf.mockResolvedValue({
        ok: false,
        error: { kind: 'not_configured', message: 'aus' },
      });
      rendern('/kalender?ansicht=tag&datum=2027-05-12&person=' + STAFF_ANNA);
      await waitFor(() => expect(rufeFunktionAuf).toHaveBeenCalled());
      expect(screen.queryByTestId('fahrweg')).toBeNull();
    });
  });

  it('fragt fuer die Trainingsbetreuung keine Fahrwege an', async () => {
    await mitUhr(async () => {
      fetchAssignableTrainers.mockResolvedValue([
        { staff_member_id: STAFF_ANNA, display_name: 'Tom Trainingsbetreuung' },
      ]);
      fetchAppointments.mockResolvedValue([]);
      renderWithProviders(
        <CalendarPage user={testUser(['trainer'], 'Tom Trainingsbetreuung')} />,
        '/kalender?ansicht=tag&datum=2027-05-12',
      );
      await screen.findByRole('group', { name: /Tom Trainingsbetreuung/ });
      expect(fetchDayRoute).not.toHaveBeenCalled();
    });
  });
});
