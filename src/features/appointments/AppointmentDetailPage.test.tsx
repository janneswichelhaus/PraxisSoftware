import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
const praxistermin: AppointmentsApi.Appointment = {
  id: TERMIN_ID,
  patient_id: PATIENT_ID,
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  location_id: '33333333-3333-4333-8333-000000000001',
  appointment_type: 'practice',
  status: 'scheduled',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-01T10:00:00.000000+00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  completed_at: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

const fetchAppointment = vi.fn();
const cancelAppointment = vi.fn();
const completeAppointment = vi.fn();
const reopenAppointment = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    cancelAppointment: (id: string, erwartet: string) =>
      cancelAppointment(id, erwartet) as Promise<void>,
    completeAppointment: (id: string, erwartet: string) =>
      completeAppointment(id, erwartet) as Promise<void>,
    reopenAppointment: (id: string, erwartet: string) =>
      reopenAppointment(id, erwartet) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    useParams: () => ({ appointmentId: TERMIN_ID }),
  };
});

const { AppointmentDetailPage } = await import('./AppointmentDetailPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(
    <AppointmentDetailPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}`,
  );
}

/** Liest den Wert einer Datenzeile ueber ihre Beschriftung. */
function zeile(beschriftung: string): string {
  const dt = screen.getAllByText(beschriftung).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`Datenzeile "${beschriftung}" nicht gefunden.`);
  return dt.nextElementSibling?.textContent?.trim() ?? '';
}

describe('AppointmentDetailPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    cancelAppointment.mockReset();
    completeAppointment.mockReset();
    reopenAppointment.mockReset();
    fetchAppointment.mockResolvedValue(praxistermin);
    cancelAppointment.mockResolvedValue(undefined);
    completeAppointment.mockResolvedValue(undefined);
    reopenAppointment.mockResolvedValue(undefined);
  });

  it('zeigt Patient, behandelnde Person, Art und Status', async () => {
    rendern();
    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getAllByText('Berta Bestand').length).toBeGreaterThan(0);
    expect(zeile('Art')).toBe('Praxis');
    expect(zeile('Status')).toBe('Geplant');
  });

  it('zeigt Datum und Zeit in der Praxiszeitzone, nicht in UTC', async () => {
    rendern();
    // 07:00 UTC entspricht 09:00 Ortszeit in Europe/Berlin (Sommerzeit).
    expect(await screen.findByText('09:00–10:00 Uhr')).toBeInTheDocument();
    expect(zeile('Zeit')).toBe('09:00–10:00 Uhr');
    expect(zeile('Datum')).toMatch(/12\. Mai 2027/);
  });

  it('zeigt beim Praxistermin den Standort', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');
    expect(zeile('Standort')).toBe('Hauptstandort Tuebingen');
  });

  it('zeigt beim Hausbesuch die festgehaltene Anschrift', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Altstrasse',
      visit_house_number: '1',
      visit_postal_code: '50667',
      visit_city: 'Koeln',
    });
    rendern();

    await screen.findByText('Anna Beispiel');
    expect(zeile('Anschrift')).toBe('Altstrasse 1, 50667 Koeln');
  });

  it('zeigt beim Videotermin keinen Ort und den Hinweis zum fehlenden Link', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'video',
      location_id: null,
      location_name: null,
    });
    rendern();

    await screen.findByText('Anna Beispiel');
    expect(zeile('Ort')).toBe('Videotermin');
    expect(screen.getByText(/noch kein Videolink erzeugt/)).toBeInTheDocument();
  });

  it('kennzeichnet einen abgesagten Termin', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
    rendern();

    expect(await screen.findByText('Dieser Termin ist abgesagt.')).toBeInTheDocument();
    expect(zeile('Status')).toBe('Abgesagt');
  });

  describe('Aktionen (CAL-003)', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s Bearbeiten und Absagen an',
      async (rolle) => {
        rendern([rolle]);
        await screen.findByText('Anna Beispiel');

        expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute(
          'href',
          `/termine/${TERMIN_ID}/bearbeiten`,
        );
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
      },
    );

    it('blendet beide Aktionen fuer ein Patientenkonto aus', async () => {
      rendern(['patient']);
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('bietet bei einem abgesagten Termin keine Aktionen mehr an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText('Dieser Termin ist abgesagt.');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('sagt nicht auf einen einzelnen Klick hin ab, sondern fragt zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      expect(cancelAppointment).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Ja, Termin absagen' })).toBeInTheDocument();
    });

    it('nennt in der Rueckfrage den betroffenen Termin und vermeidet Loeschsprache', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      const rueckfrage = await screen.findByRole('group', { name: 'Termin absagen' });
      expect(rueckfrage).toHaveTextContent('Berta Bestand');
      expect(rueckfrage).toHaveTextContent('12. Mai 2027');
      expect(rueckfrage).toHaveTextContent('09:00');
      expect(rueckfrage).toHaveTextContent(/bleibt vollständig erhalten/);
      expect(rueckfrage.textContent ?? '').not.toMatch(/l\u00f6sch/i);
    });

    it('setzt den Fokus auf die Bestaetigung', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ja, Termin absagen' })).toHaveFocus(),
      );
    });

    it('gibt den Fokus beim Abbrechen zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toHaveFocus(),
      );
      expect(cancelAppointment).not.toHaveBeenCalled();
    });

    it('sagt nach Bestaetigung mit dem gelesenen Stand ab', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      await waitFor(() =>
        expect(cancelAppointment).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
    });

    it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
      let aufloesen: (() => void) | undefined;
      cancelAppointment.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            aufloesen = resolve;
          }),
      );

      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      const knopf = screen.getByRole('button', { name: 'Ja, Termin absagen' });
      await user.click(knopf);
      await user.click(knopf);

      expect(cancelAppointment).toHaveBeenCalledTimes(1);
      aufloesen?.();
    });

    it('zeigt einen Konflikt verstaendlich an, ohne fremde Daten zu nennen', async () => {
      cancelAppointment.mockRejectedValue(
        new Error(
          'Der Termin wurde zwischenzeitlich von einer anderen Person geändert. Bitte die Ansicht neu laden und die Änderung erneut vornehmen.',
        ),
      );
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      expect(
        await screen.findByText(/zwischenzeitlich von einer anderen Person/),
      ).toBeInTheDocument();
    });
  });

  describe('CAL-004: Abschliessen und Wiederoeffnen', () => {
    /** Derselbe Termin, aber bereits abgeschlossen. */
    const abgeschlossen: AppointmentsApi.Appointment = {
      ...praxistermin,
      status: 'completed',
      updated_at: '2027-05-12T08:05:00.000000+00',
      completed_at: '2027-05-12T08:05:00.000Z',
    };

    it('schliesst einen geplanten Termin auf dem gelesenen Stand ab', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() =>
        expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
    });

    it('fragt beim Abschliessen nicht nach einer Behandlungsdokumentation', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() => expect(completeAppointment).toHaveBeenCalled());
      // Kein Zwischenschritt, keine Rueckfrage nach Inhalten.
      expect(screen.queryByText(/dokumentation/i)).not.toBeInTheDocument();
    });

    it('markiert einen abgeschlossenen Termin nicht als unvollstaendig', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(zeile('Status')).toBe('Abgeschlossen');
      expect(screen.queryByText(/fehlt|unvollständig|ausstehend/i)).not.toBeInTheDocument();
    });

    it('zeigt den Abschlusszeitpunkt in der Praxiszeitzone', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      // 08:05 UTC entspricht 10:05 Ortszeit in Europe/Berlin (Sommerzeit).
      expect(zeile('Abgeschlossen am')).toMatch(/12\. Mai 2027, 10:05 Uhr/);
    });

    it('bietet am abgeschlossenen Termin weder Bearbeiten noch Absagen an', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });

    it('oeffnet einen abgeschlossenen Termin wieder', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin wieder öffnen' }));

      await waitFor(() =>
        expect(reopenAppointment).toHaveBeenCalledWith(TERMIN_ID, abgeschlossen.updated_at),
      );
    });

    it('bietet am abgesagten Termin kein Abschliessen an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Termin wieder öffnen' }),
      ).not.toBeInTheDocument();
    });

    it('bietet einem Patientenkonto keine Statusaktion an', async () => {
      rendern(['patient']);
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });

    it('zeigt die Meldung, wenn der Abschluss abgewiesen wird', async () => {
      completeAppointment.mockRejectedValue(
        new Error('Der Termin konnte nicht abgeschlossen werden.'),
      );
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      expect(
        await screen.findByText('Der Termin konnte nicht abgeschlossen werden.'),
      ).toBeInTheDocument();
    });
  });

  it('verlinkt zurueck in die Patientenakte', async () => {
    rendern();
    const link = await screen.findByRole('link', { name: 'Berta Bestand' });
    expect(link).toHaveAttribute('href', `/patienten/${PATIENT_ID}`);
  });

  it('zeigt keine klinischen Angaben', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');

    for (const begriff of [/diagnose/i, /befund/i, /therapie/i, /anamnese/i]) {
      expect(screen.queryByText(begriff)).not.toBeInTheDocument();
    }
  });

  it('meldet einen nicht freigegebenen Termin ohne Details', async () => {
    fetchAppointment.mockResolvedValue(null);
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
  });
});
