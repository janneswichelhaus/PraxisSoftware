import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as AppointmentsApi from './api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

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
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

const fetchAppointment = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
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

function rendern() {
  return renderWithProviders(<AppointmentDetailPage />, `/termine/${TERMIN_ID}`);
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
    fetchAppointment.mockResolvedValue(praxistermin);
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

  it('bietet in diesem Stand weder Bearbeiten noch Absagen an', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');

    expect(screen.queryByRole('button', { name: /Bearbeiten/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Absagen/i })).not.toBeInTheDocument();
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
