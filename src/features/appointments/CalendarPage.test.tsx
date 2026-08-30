import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

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

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointments: (query: unknown) =>
      fetchAppointments(query) as Promise<AppointmentsApi.CalendarEntry[]>,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    // Der heutige Tag wird festgehalten, damit die Tests nicht mit der Uhr laufen.
    todayInTimeZone: () => HEUTE,
  };
});

const { CalendarPage } = await import('./CalendarPage');

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
    it('zeigt in der Tagesansicht Patient, Zeit, Person, Art und Ort', async () => {
      rendern('/kalender?ansicht=tag&datum=2027-05-12');

      const link = await screen.findByRole('link', { name: /Max Mustermann/ });
      expect(link).toHaveTextContent('Max Mustermann');
      // 07:00 UTC ist 09:00 Ortszeit - der Kalender zeigt die Praxiszeit.
      expect(link).toHaveTextContent('09:00–10:00');
      expect(link).toHaveTextContent('Anna Beispiel');
      expect(link).toHaveTextContent('Praxis');
      expect(link).toHaveTextContent('Hauptstandort Tuebingen');
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

      const dreizehnter = (await screen.findByText('13.05.')).closest('section');
      expect(dreizehnter).not.toBeNull();
      expect(
        within(dreizehnter!).getByRole('link', { name: /Max Mustermann/ }),
      ).toBeInTheDocument();
    });

    it('nennt bei mehreren behandelnden Personen eine Farbzuordnung', async () => {
      fetchAppointments.mockResolvedValue([
        eintrag(),
        eintrag({
          id: '77777777-7777-4777-8777-000000000002',
          staff_member_id: STAFF_TIM,
          staff_given_name: 'Tim',
          staff_family_name: 'Teamleitung',
          starts_at: '2027-05-12T07:30:00.000Z',
          ends_at: '2027-05-12T08:30:00.000Z',
        }),
      ]);
      rendern();

      const legende = await screen.findByLabelText('Farbzuordnung');
      expect(within(legende).getByText('Anna Beispiel')).toBeInTheDocument();
      expect(within(legende).getByText('Tim Teamleitung')).toBeInTheDocument();
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
});
