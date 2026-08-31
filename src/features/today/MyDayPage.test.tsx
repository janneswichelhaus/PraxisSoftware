import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as AppointmentsApiModule from '@/features/appointments/api';
import { renderMitVorschau, testUser } from '@/test-utils';
import { MyDayPage } from './MyDayPage';

/**
 * „Mein Tag" mischt bewusst zwei Dinge: echte Termine aus dem Kalender und
 * Hinweise aus Bereichen, die noch keine Anbindung haben. Geprüft wird, dass
 * beides unterscheidbar bleibt und dass die eigenen Besuche nicht über den
 * Anzeigenamen, sondern über die Beschäftigtenkennung gefunden werden.
 */

const EIGENE_STAFF_ID = 'staff-eigene';
const FREMDE_STAFF_ID = 'staff-fremde';
const HEUTE = '2026-08-31';

function termin(teil: Partial<AppointmentsApiModule.CalendarEntry>) {
  return {
    id: 'termin-1',
    patient_id: 'p1',
    staff_member_id: EIGENE_STAFF_ID,
    location_id: null,
    appointment_type: 'home_visit' as const,
    status: 'scheduled' as const,
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

vi.mock('@/features/today/api', () => ({
  fetchOwnStaffMemberId: () => Promise.resolve('staff-eigene'),
}));

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApiModule>();
  return { ...actual, fetchAppointments: () => Promise.resolve(termine) };
});

describe('Mein Tag', () => {
  it('trennt die eigenen Besuche vom Tagesplan des Teams', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    expect(await screen.findByRole('heading', { name: 'Meine Besuche heute' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tagesplan des Teams' })).toBeInTheDocument();

    // Der fremde Termin steht nur im Teamplan, der eigene in beiden Listen.
    expect(screen.getAllByText('Erika Beispiel')).toHaveLength(2);
    expect(screen.getAllByText('Max Mustermann')).toHaveLength(1);
  });

  it('fuehrt keine zweite Terminliste, sondern verweist in den Kalender', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    expect(await screen.findByRole('link', { name: /Im Kalender öffnen/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/kalender?ansicht=tag'),
    );
  });

  it('ist kein Begruessungsbildschirm mit Patientenzaehler', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
    expect(screen.queryByText(/Personen in laufender Versorgung/)).toBeNull();
  });

  it('kennzeichnet den noch nicht angebundenen Teil als Vorschau', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    expect(
      await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Es entstehen keine echten Vorgänge/)).toBeInTheDocument();
  });

  it('benennt die Demoperson, der die Vorschaudaten gehoeren', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.getByText(/zur Rolle passend gewählt/)).toBeInTheDocument();
  });

  it('sagt bei den Wegen, dass die Zeiten geschaetzt und nicht berechnet sind', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.getByText(/Wegzeiten sind geschätzt, nicht berechnet/)).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.queryByText('Zu entscheiden')).toBeNull();
  });

  it('zeigt einem Patientenkonto weder Termine noch Betriebsbereiche', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
    expect(await screen.findByRole('heading', { name: 'Ihr Zugang' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tagesplan des Teams' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Betrieb, Wege und Team' })).toBeNull();
  });
});
