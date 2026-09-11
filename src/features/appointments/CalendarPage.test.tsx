import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as SchedulingApi from '@/features/scheduling/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';
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
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useNavigate: () => navigate };
});

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
    staff_member_id: STAFF_ANNA,
    location_id: ORT,
    appointment_type: 'practice',
    status: 'scheduled',
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
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    updateAppointment: (id: string, stand: string, werte: unknown, bestaetigt?: boolean) =>
      updateAppointment(id, stand, werte, bestaetigt) as Promise<void>,
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
  status: 'scheduled' as const,
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

const { CalendarPage } = await import('./CalendarPage');
const { AusserhalbArbeitszeitError } = await import('./api');

function rendern(pfad = '/kalender') {
  return renderWithProviders(<CalendarPage user={testUser(['office'], 'Olivia Office')} />, pfad);
}

/** Argumente des jeweils letzten Abrufs. */
function letzteAbfrage() {
  return fetchAppointments.mock.calls.at(-1)?.[0] as AppointmentsApi.CalendarQuery;
}

describe('CalendarPage', () => {
  beforeEach(() => {
    fetchAppointments.mockReset();
    fetchAssignableTherapists.mockReset();
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
  });

  describe('Zeitbereiche', () => {
    it('fragt ohne Parameter die laufende Woche ab', async () => {
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ von: '2027-05-10', bis: '2027-05-17' });
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

    it('kehrt mit "Heute" zum laufenden Zeitraum zurueck', async () => {
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

      await user.click(screen.getByRole('button', { name: 'Tag' }));
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ von: HEUTE, bis: '2027-05-13' }));

      await user.click(screen.getByRole('button', { name: 'Woche' }));
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

      await screen.findByRole('option', { name: 'Hauptstandort Tuebingen' });
      await user.selectOptions(screen.getByLabelText('Standort'), ORT);
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ standort: ORT }));
    });

    it('zeigt standardmaessig geplante und abgeschlossene Termine', async () => {
      // Nicht 'scheduled': ein abgeschlossener Termin hat stattgefunden und
      // belegt den Tag weiter - er darf nicht aus der Ansicht verschwinden.
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(letzteAbfrage()).toMatchObject({ status: 'active' });
    });

    it('kann gezielt auf abgeschlossene Termine filtern', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await user.selectOptions(screen.getByLabelText('Status'), 'completed');
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ status: 'completed' }));
    });

    it('kann abgesagte Termine einblenden', async () => {
      const user = userEvent.setup();
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      await user.selectOptions(screen.getByLabelText('Status'), 'all');
      await waitFor(() => expect(letzteAbfrage()).toMatchObject({ status: 'all' }));
    });

    it('kennzeichnet einen abgesagten Termin', async () => {
      fetchAppointments.mockResolvedValue([eintrag({ status: 'cancelled' })]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12&status=all');

      const eintragLink = await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(eintragLink).toHaveTextContent('Abgesagt');
    });

    it('zeigt einen abgeschlossenen Termin unveraendert im Tag', async () => {
      // Der Termin hat stattgefunden: er bleibt sichtbar, behaelt seine Zeit
      // und wird gekennzeichnet - im Standardfilter, ohne Zutun (CAL-004).
      fetchAppointments.mockResolvedValue([eintrag({ status: 'completed' })]);
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const eintragLink = await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(eintragLink).toHaveTextContent('Abgeschlossen');
      expect(eintragLink).toHaveTextContent('09:00–10:00');
      expect(letzteAbfrage()).toMatchObject({ status: 'active' });
    });
  });

  describe('Darstellung', () => {
    it('zeigt in der Tagesansicht Patient, Zeit und Ort in der Kachel', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const link = await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(link).toHaveTextContent('Max Mustermann');
      // 07:00 UTC ist 09:00 Ortszeit - der Kalender zeigt die Praxiszeit.
      expect(link).toHaveTextContent('09:00–10:00');
      expect(link).toHaveTextContent('Hauptstandort Tuebingen');
    });

    it('nennt die behandelnde Person im Spaltenkopf statt in jeder Kachel', async () => {
      // Eine Spalte je Person: der Name gehoert einmal an den Kopf, nicht in
      // jede einzelne Kachel (CAL-006).
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      const gitter = screen.getByRole('grid', { name: 'Tagesansicht nach behandelnder Person' });
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

      const annaSpalte = await screen.findByRole('gridcell', { name: 'Anna Beispiel' });
      const timSpalte = screen.getByRole('gridcell', { name: 'Tim Teamleitung' });
      expect(within(annaSpalte).getByRole('link', { name: /Max Mustermann/ })).toBeInTheDocument();
      expect(within(timSpalte).getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
    });

    it('verlinkt jeden Termin auf seine Detailansicht', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const link = await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(link).toHaveAttribute('href', '/termine/77777777-7777-4777-8777-000000000001');
    });

    it('zeigt in der Wochenansicht sieben Tagesspalten', async () => {
      rendern();
      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());

      // Montag 10.05. bis Sonntag 16.05.
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
      const donnerstag = await screen.findByRole('gridcell', { name: 'Do' });
      expect(within(donnerstag).getByRole('link', { name: /Max Mustermann/ })).toBeInTheDocument();
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

      expect(await screen.findByRole('link', { name: /Max Mustermann/ })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Erika Beispiel/ })).not.toBeInTheDocument();
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
      await screen.findByRole('link', { name: /Max Mustermann/ });

      for (const begriff of [/diagnose/i, /befund/i, /therapie/i, /anamnese/i]) {
        expect(screen.queryByText(begriff)).not.toBeInTheDocument();
      }
    });

    it('zeigt weder Geburtsdatum noch Kontaktdaten', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const link = await screen.findByRole('link', { name: /Max Mustermann/ });

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

  describe('CAL-011: Zoomstufen und sichtbares Praxisraster', () => {
    it('zeigt in der Voreinstellung das Fuenf-Minuten-Raster an', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('5-Minuten-Raster')).toBeInTheDocument();
    });

    it('nimmt die Zoomstufe aus der Adresszeile', async () => {
      // 40 px je Stunde tragen die Viertelstunde, nicht die fuenf Minuten.
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=40');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('15-Minuten-Raster')).toBeInTheDocument();
    });

    it('faellt bei einer erfundenen Zoomstufe auf die Voreinstellung zurueck', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12&zoom=9999');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('5-Minuten-Raster')).toBeInTheDocument();
    });

    it('vergroebert das Gitter ueber die Bedienung', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      await userEvent.click(screen.getByRole('button', { name: 'Gitter verkleinern' }));

      const zoom = screen.getByRole('group', { name: 'Zoom' });
      expect(within(zoom).getByText('15-Minuten-Raster')).toBeInTheDocument();
    });
  });

  describe('CAL-006: Verschieben per Zeigegerät', () => {
    /**
     * jsdom kennt kein Layout: `getBoundingClientRect` liefert überall Nullen.
     * Die Spalten bekommen deshalb künstliche Kästen, damit die Zuordnung
     * "welche Spalte liegt unter dem Zeiger" überhaupt eine Aussage hat.
     */
    function spaltenVermessen(): void {
      const zellen = screen.getAllByRole('gridcell');
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
    } {
      const aufruf = updateAppointment.mock.calls.at(-1) as
        [string, string, AppointmentsApi.AppointmentFormValues, boolean | undefined] | undefined;
      if (!aufruf) throw new Error('Es wurde nichts geschrieben.');
      return { id: aufruf[0], stand: aufruf[1], werte: aufruf[2], bestaetigt: aufruf[3] };
    }

    async function tagesansicht() {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();
      return kachel;
    }

    it('verschiebt einen Termin auf eine andere Uhrzeit', async () => {
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });

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
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      ziehen(kachel, { dy: 208 });

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

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte } = letzterSchreibvorgang();
      expect(werte.start_time).toMatch(/:\d[05]$/);
      expect(werte).toMatchObject({ start_time: '09:30' });
    });

    it('verschiebt in der Tagesansicht auf eine andere behandelnde Person', async () => {
      const kachel = await tagesansicht();

      // Zweite Spalte: x zwischen 300 und 500.
      ziehen(kachel, { dy: EINE_STUNDE, x: 400 });

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte } = letzterSchreibvorgang();
      expect(werte).toMatchObject({ staff_member_id: STAFF_TIM, date: '2027-05-12' });
    });

    it('verschiebt in der Wochenansicht auf einen anderen Tag', async () => {
      rendern(`/kalender?ansicht=woche&datum=2027-05-12&person=${STAFF_ANNA}`);
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      // Der Termin liegt am Mittwoch, also in der dritten Spalte (500-700).
      // Gezogen wird in die erste Spalte: Montag, der 10.05.
      ziehen(kachel, { dy: 0, startX: 550, x: 150 });

      await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
      const { werte } = letzterSchreibvorgang();
      expect(werte).toMatchObject({ date: '2027-05-10', staff_member_id: STAFF_ANNA });
    });

    it('schreibt nichts, wenn sich nichts aendert', async () => {
      const kachel = await tagesansicht();

      // Ueber die Schwelle bewegt, aber wieder auf denselben Rasterpunkt.
      ziehen(kachel, { dy: 1 });

      await waitFor(() => expect(fetchAppointments).toHaveBeenCalled());
      expect(updateAppointment).not.toHaveBeenCalled();
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
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      ziehen(kachel, { dy: EINE_STUNDE });
      expect(updateAppointment).not.toHaveBeenCalled();
    });

    it('fragt bei einer Randzeit nach und verschiebt zunaechst nicht', async () => {
      updateAppointment.mockRejectedValue(new AusserhalbArbeitszeitError());
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });

      const rueckfrage = await screen.findByRole('group', { name: 'Außerhalb der Arbeitszeit' });
      expect(rueckfrage).toHaveTextContent(/noch nicht verschoben/);
      expect(rueckfrage).toHaveTextContent('10:00–11:00');
    });

    it('verschiebt nach ausdruecklicher Bestaetigung mit Kennzeichen', async () => {
      updateAppointment.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
      updateAppointment.mockResolvedValue(undefined);
      const user = userEvent.setup();
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });
      await screen.findByRole('group', { name: 'Außerhalb der Arbeitszeit' });

      await user.click(screen.getByRole('button', { name: 'Trotzdem verschieben' }));

      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(2));
      const { werte, bestaetigt } = letzterSchreibvorgang();
      expect(werte).toMatchObject({ start_time: '10:00' });
      expect(bestaetigt).toBe(true);
    });

    it('meldet eine Ueberschneidung, ohne nachzufragen', async () => {
      updateAppointment.mockRejectedValue(
        new Error('In diesem Zeitraum hat die behandelnde Person bereits einen Termin.'),
      );
      const kachel = await tagesansicht();

      ziehen(kachel, { dy: EINE_STUNDE });

      expect(await screen.findByText(/bereits einen Termin/)).toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Außerhalb der Arbeitszeit' }),
      ).not.toBeInTheDocument();
    });

    it('nennt das Bearbeiten als gleichwertigen Weg', async () => {
      // Ziehen darf niemals der einzige Weg zum Verschieben sein.
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(screen.getByText(/über „Bearbeiten" in der Detailansicht/)).toBeInTheDocument();
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
      await screen.findByRole('link', { name: /Max Mustermann/ });

      // Ohne die Erweiterung begaenne die Achse erst um 07:00.
      expect(screen.getByText('06:00')).toBeInTheDocument();
    });
  });

  describe('UX-005: Tap auf freie Zeit', () => {
    it('fuehrt aus der Tagesansicht mit Person, Tag und Uhrzeit in die Terminanlage', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });

      fireEvent.click(screen.getByRole('gridcell', { name: 'Anna Beispiel' }));

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.pathname).toBe('/termine/neu');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
      expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
      expect(ziel.searchParams.get('art')).toBe('home_visit');
      // Vorbelegtes Zeitfenster von 60 Minuten (PROJECT_PRINCIPLES.md 8.1).
      expect(ziel.searchParams.get('beginn')).toBe('07:00');
      expect(ziel.searchParams.get('ende')).toBe('08:00');
    });

    it('fuehrt aus der Wochenansicht mit dem Tag der Spalte in die Terminanlage', async () => {
      rendern('/kalender?ansicht=woche&datum=2027-05-12&person=' + STAFF_ANNA);
      await screen.findByRole('link', { name: /Max Mustermann/ });

      // Spalten sind hier Wochentage; die Beschriftung ist der Kurzname.
      fireEvent.click(screen.getAllByRole('gridcell')[0]!);

      const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
      expect(ziel.searchParams.get('datum')).toBe('2027-05-10');
      expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
    });

    it('loest nichts aus, wenn auf einen bestehenden Termin getippt wird', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });

      fireEvent.click(kachel);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('bietet denselben Weg als Schaltflaeche an - ohne Uhrzeit', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
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
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: 'Termin anlegen' })).toBeNull(),
      );
    });
  });

  describe('UX-010: Langer Druck am Finger und Rueckgaengig', () => {
    /** Wie in CAL-006: jsdom kennt kein Layout. */
    function spaltenVermessen(): void {
      const zellen = screen.getAllByRole('gridcell');
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
        const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
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
        const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
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

        await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
      } finally {
        vi.useRealTimers();
      }
    });

    it('verschiebt am Zeigegeraet weiterhin sofort - dort gibt es nichts zu warten', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, {
        clientX: 150,
        clientY: 200,
        button: 0,
        pointerType: 'mouse',
      });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });

      await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
    });

    it('bietet nach dem Verschieben den alten Platz zum Zurueckholen an', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });

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
      const kachel = await screen.findByRole('link', { name: /Max Mustermann/ });
      spaltenVermessen();

      fireEvent.pointerDown(kachel, { clientX: 150, clientY: 200, button: 0 });
      fireEvent.pointerMove(window, { clientX: 150, clientY: 256, button: 0 });
      fireEvent.pointerUp(window, { clientX: 150, clientY: 256 });
      await screen.findByText(/Termin verschoben\. Vorher:/);

      await user.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }));
      await waitFor(() => expect(screen.queryByText(/Termin verschoben\. Vorher:/)).toBeNull());
    });

    it('zeigt ohne Verschiebung keine Leiste', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');
      await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
    });
  });
});
