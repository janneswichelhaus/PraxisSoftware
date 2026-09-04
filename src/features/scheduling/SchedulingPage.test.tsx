import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as SchedulingApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as DokumentationApi from '@/features/documentation/api';
import { renderWithProviders, testUser } from '@/test-utils';

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

const fetchWorkingHours = vi.fn();
const fetchWorkingHourExceptions = vi.fn();
const saveWorkingHours = vi.fn();
const saveWorkingHourException = vi.fn();
const saveAppointmentGrid = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchDocumentationDeadline = vi.fn();
const saveDocumentationDeadline = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    fetchWorkingHours: () => fetchWorkingHours() as Promise<SchedulingApi.WorkingHour[]>,
    fetchWorkingHourExceptions: (von: string, bis: string) =>
      fetchWorkingHourExceptions(von, bis) as Promise<SchedulingApi.WorkingHourException[]>,
    saveWorkingHours: (staff: string, tag: number, bloecke: unknown) =>
      saveWorkingHours(staff, tag, bloecke) as Promise<void>,
    saveWorkingHourException: (staff: string, datum: string, abwesend: boolean, bloecke: unknown) =>
      saveWorkingHourException(staff, datum, abwesend, bloecke) as Promise<void>,
    saveAppointmentGrid: (minuten: number) => saveAppointmentGrid(minuten) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    // Der heutige Tag wird festgehalten, damit die Tests nicht mit der Uhr laufen.
    todayInTimeZone: () => '2027-05-12',
  };
});

vi.mock('@/features/documentation/api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchDocumentationDeadline: (organizationId: string) =>
      fetchDocumentationDeadline(organizationId) as Promise<number>,
    saveDocumentationDeadline: (tage: number) => saveDocumentationDeadline(tage) as Promise<void>,
  };
});

const { SchedulingPage } = await import('./SchedulingPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(<SchedulingPage user={testUser(rollen)} />, '/praxis/planung');
}

/** Wartet, bis der Wochenplan gerendert ist. */
function wochenplanAbwarten() {
  return screen.findByRole('heading', { name: 'Wochenplan' });
}

describe('SchedulingPage', () => {
  beforeEach(() => {
    fetchWorkingHours.mockReset();
    fetchWorkingHourExceptions.mockReset();
    saveWorkingHours.mockReset();
    saveWorkingHourException.mockReset();
    saveAppointmentGrid.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchDocumentationDeadline.mockReset();
    saveDocumentationDeadline.mockReset();
    fetchDocumentationDeadline.mockResolvedValue(1);
    saveDocumentationDeadline.mockResolvedValue(undefined);

    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchWorkingHours.mockResolvedValue([
      { id: 'a1', staff_member_id: ANNA, weekday: 1, starts_at: '08:00', ends_at: '12:00' },
      { id: 'a2', staff_member_id: ANNA, weekday: 1, starts_at: '13:00', ends_at: '18:00' },
      { id: 't1', staff_member_id: TIM, weekday: 2, starts_at: '10:00', ends_at: '16:00' },
    ]);
    fetchWorkingHourExceptions.mockResolvedValue([]);
    saveWorkingHours.mockResolvedValue(undefined);
    saveWorkingHourException.mockResolvedValue(undefined);
    saveAppointmentGrid.mockResolvedValue(undefined);
  });

  describe('Praxisraster', () => {
    it('bietet owner die drei zulaessigen Werte an', async () => {
      rendern(['owner']);
      const auswahl = await screen.findByLabelText('Minutenraster');
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual(['5 Minuten', '10 Minuten', '15 Minuten']);
    });

    it('zeigt den aktuellen Wert der Praxis', async () => {
      rendern(['owner']);
      expect(await screen.findByLabelText('Minutenraster')).toHaveValue('5');
    });

    it('speichert den gewaehlten Wert', async () => {
      const user = userEvent.setup();
      rendern(['owner']);
      await screen.findByLabelText('Minutenraster');

      await user.selectOptions(screen.getByLabelText('Minutenraster'), '15');
      await user.click(screen.getByRole('button', { name: 'Raster speichern' }));

      await waitFor(() => expect(saveAppointmentGrid).toHaveBeenCalledWith(15));
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s die Rastereinstellung nicht',
      async (rolle) => {
        rendern([rolle]);
        await wochenplanAbwarten();
        expect(screen.queryByLabelText('Minutenraster')).not.toBeInTheDocument();
      },
    );
  });

  describe('Dokumentationsfrist (DOK-004)', () => {
    it('zeigt owner die gespeicherte Frist mit den Stufen', async () => {
      fetchDocumentationDeadline.mockResolvedValue(3);
      rendern(['owner']);

      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('3'));
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual([
        'Ende des Behandlungstages',
        'Ende des Folgetages',
        'Ende des 2. Tages nach der Behandlung',
        'Ende des 3. Tages nach der Behandlung',
        'Ende des 7. Tages nach der Behandlung',
        'Ende des 14. Tages nach der Behandlung',
      ]);
      expect(fetchDocumentationDeadline).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-000000000001',
      );
    });

    it('zeigt einen gespeicherten Wert ausserhalb der Stufen trotzdem an', async () => {
      fetchDocumentationDeadline.mockResolvedValue(5);
      rendern(['owner']);

      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('5'));
      expect(auswahl).toHaveTextContent('Ende des 5. Tages nach der Behandlung');
    });

    it('speichert die gewaehlte Frist', async () => {
      const user = userEvent.setup();
      rendern(['owner']);
      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('1'));

      await user.selectOptions(auswahl, '0');
      await user.click(screen.getByRole('button', { name: 'Frist speichern' }));

      await waitFor(() => expect(saveDocumentationDeadline).toHaveBeenCalledWith(0));
      expect(await screen.findByRole('status')).toHaveTextContent('Die Frist ist gespeichert.');
    });

    it('meldet einen Fehler beim Speichern ohne interne Details', async () => {
      const user = userEvent.setup();
      saveDocumentationDeadline.mockRejectedValue(
        new Error('Die Dokumentationsfrist konnte nicht gespeichert werden.'),
      );
      rendern(['owner']);
      await waitFor(() => expect(screen.getByLabelText('Frist')).toHaveValue('1'));

      await user.click(screen.getByRole('button', { name: 'Frist speichern' }));

      expect(
        await screen.findByText('Die Dokumentationsfrist konnte nicht gespeichert werden.'),
      ).toBeInTheDocument();
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s die Frist nicht und fragt sie nicht ab',
      async (rolle) => {
        rendern([rolle]);
        await wochenplanAbwarten();
        expect(screen.queryByLabelText('Frist')).not.toBeInTheDocument();
        expect(fetchDocumentationDeadline).not.toHaveBeenCalled();
      },
    );
  });

  describe('Wochenplan', () => {
    it('zeigt alle sieben Wochentage der gewaehlten Person', async () => {
      rendern();
      await wochenplanAbwarten();

      for (const tag of [
        'Montag',
        'Dienstag',
        'Mittwoch',
        'Donnerstag',
        'Freitag',
        'Samstag',
        'Sonntag',
      ]) {
        expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
      }
    });

    it('fasst mehrere Bloecke eines Tages zusammen', async () => {
      rendern();
      await wochenplanAbwarten();
      expect(await screen.findByText('08:00–12:00, 13:00–18:00')).toBeInTheDocument();
    });

    it('zeigt einen Tag ohne Arbeitszeit als solchen und nicht als Luecke', async () => {
      rendern();
      await wochenplanAbwarten();
      // Sechs Tage ohne Eintrag bei Anna.
      expect(screen.getAllByText('—')).toHaveLength(6);
    });

    it('wechselt mit der Person auch die angezeigten Zeiten', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('08:00–12:00, 13:00–18:00');

      await user.selectOptions(screen.getByLabelText('Behandelnde Person'), TIM);

      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
      expect(screen.queryByText('08:00–12:00, 13:00–18:00')).not.toBeInTheDocument();
    });

    it('speichert die Bloecke eines Wochentags vollstaendig', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      await waitFor(() =>
        expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '18:00' },
        ]),
      );
    });

    it('speichert einen geleerten Wochentag als "keine Termine"', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Blöcke leeren' }));
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      await waitFor(() => expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, []));
    });

    it('meldet ueberschneidende Bloecke verstaendlich', async () => {
      saveWorkingHours.mockRejectedValue(
        new Error('Die Zeitblöcke überschneiden sich. Bitte die Zeiten anpassen.'),
      );
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));
      expect(await screen.findByText(/überschneiden sich/)).toBeInTheDocument();
    });

    it('laesst therapist lesen, aber nicht pflegen', async () => {
      rendern(['therapist']);
      await wochenplanAbwarten();

      // Die Zeiten sind sichtbar ...
      expect(await screen.findByText('08:00–12:00, 13:00–18:00')).toBeInTheDocument();
      // ... die Pflege nicht.
      expect(screen.queryByRole('button', { name: /speichern/ })).not.toBeInTheDocument();
      expect(screen.getByText(/fehlt Ihrem Zugang die Berechtigung/)).toBeInTheDocument();
    });
  });

  describe('Abweichungen an einzelnen Tagen', () => {
    it('speichert eine vollstaendige Abwesenheit ohne Bloecke', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');
      await user.click(screen.getByLabelText('An diesem Tag keine Termine'));
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));

      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-05-20', true, []),
      );
    });

    it('blendet die Zeitfelder aus, wenn der ganze Tag entfaellt', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      expect(screen.getByText('Abweichende Zeitblöcke')).toBeInTheDocument();
      await user.click(screen.getByLabelText('An diesem Tag keine Termine'));
      expect(screen.queryByText('Abweichende Zeitblöcke')).not.toBeInTheDocument();
    });

    it('speichert abweichende Bloecke', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');
      await user.type(screen.getByLabelText('Abweichender Block 1 von'), '18:00');
      await user.type(screen.getByLabelText('Abweichender Block 1 bis'), '20:00');
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));

      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-05-20', false, [
          { von: '18:00', bis: '20:00' },
        ]),
      );
    });

    it('unterscheidet die Felder von Wochenplan und Abweichung', async () => {
      // Gleiche Beschriftung auf einer Seite waere fuer Screenreader nicht
      // aufloesbar.
      rendern();
      await wochenplanAbwarten();
      expect(screen.getByLabelText('Block 1 von')).toBeInTheDocument();
      expect(screen.getByLabelText('Abweichender Block 1 von')).toBeInTheDocument();
    });

    it('speichert nicht ohne Datum', async () => {
      rendern();
      await wochenplanAbwarten();
      expect(screen.getByRole('button', { name: 'Abweichung speichern' })).toBeDisabled();
    });

    it('zeigt eine hinterlegte Abwesenheit', async () => {
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      await wochenplanAbwarten();

      expect(await screen.findByText('2027-06-01')).toBeInTheDocument();
      expect(screen.getByText('Keine Termine')).toBeInTheDocument();
    });

    it('zeigt nur die Abweichungen der gewaehlten Person', async () => {
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x2',
          staff_member_id: TIM,
          on_date: '2027-06-02',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      await wochenplanAbwarten();

      expect(await screen.findByText(/keine Abweichung hinterlegt/)).toBeInTheDocument();
      expect(screen.queryByText('2027-06-02')).not.toBeInTheDocument();
    });
  });

  it('nennt die Zeitzone und grenzt gegen Arbeitszeiterfassung ab', async () => {
    rendern();
    await wochenplanAbwarten();
    expect(screen.getByText(/Europe\/Berlin/)).toBeInTheDocument();
    expect(screen.getByText(/keine Arbeitszeiterfassung/)).toBeInTheDocument();
  });
});
