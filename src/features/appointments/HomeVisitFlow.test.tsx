import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import type * as AppointmentsApi from './api';
import type * as TodayApi from '@/features/today/api';
import { renderWithProviders, testAppointment } from '@/test-utils';
import { HomeVisitFlow } from './HomeVisitFlow';

const recordNoShow = vi.fn();
const fetchAppointment = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  recordNoShow: (...args: unknown[]) => recordNoShow(...args) as Promise<void>,
  fetchAppointment: (id: string) =>
    fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
}));
vi.mock('@/features/today/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TodayApi>()),
  fetchDayPlan: () => Promise.resolve([]),
}));

const termin = testAppointment({ appointment_type: 'home_visit' });
/** So kennt die Übersicht den Termin: ohne Bearbeitungsstand. */
const ausDerUebersicht = {
  id: termin.id,
  patient_id: termin.patient_id,
  staff_member_id: termin.staff_member_id,
  starts_at: termin.starts_at,
  organization_time_zone: termin.organization_time_zone,
};

describe('HomeVisitFlow an der Karte der Übersicht (Auftrag C1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    recordNoShow.mockReset();
    recordNoShow.mockResolvedValue(undefined);
    fetchAppointment.mockReset();
    fetchAppointment.mockResolvedValue(termin);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('zeigt die 15-Minuten-Uhr ab dem Tipp und lässt „gewartet" von Hand bestätigen (ANN-479)', async () => {
    renderWithProviders(
      <HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} mitUhr inKarte />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    expect(screen.getByRole('timer')).toHaveTextContent('Gewartet 0:00 von 15:00');
    const gewartet = screen.getByRole('checkbox', { name: '15 Minuten vor Ort gewartet' });
    expect(gewartet).not.toBeChecked();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('Gewartet 5:00 von 15:00');
    expect(gewartet).not.toBeChecked();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('15 Minuten um – bitte bestätigen');
    // Die Uhr hakt nicht selbst: Aus dem Haken entsteht eine Forderung (ADR-018 Punkt 9).
    expect(gewartet).not.toBeChecked();
    fireEvent.click(gewartet);
    expect(gewartet).toBeChecked();
    // Klingeln und Anrufen bestätigt weiter die Person selbst - ohne sie kein Vermerk.
    fireEvent.click(screen.getByRole('button', { name: /nicht angetroffen/ }));
    expect(
      await screen.findByText('Bitte alle drei Schritte des Protokolls bestätigen.'),
    ).toBeVisible();
    expect(recordNoShow).not.toHaveBeenCalled();
  });

  it('liest den Bearbeitungsstand unmittelbar vor dem Vermerk', async () => {
    const melden = vi.fn();
    renderWithProviders(
      <HomeVisitFlow appointment={ausDerUebersicht} melden={melden} mitUhr inKarte />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    for (const name of [
      'An der Tür geklingelt',
      '15 Minuten vor Ort gewartet',
      'Telefonisch angerufen',
    ]) {
      fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    fireEvent.click(screen.getByRole('button', { name: /nicht angetroffen/ }));
    await vi.waitFor(() => expect(recordNoShow).toHaveBeenCalledTimes(1));
    expect(fetchAppointment).toHaveBeenCalledWith(termin.id);
    expect(recordNoShow).toHaveBeenCalledWith(termin.id, termin.updated_at, true);
    await vi.waitFor(() => expect(melden).toHaveBeenCalled());
  });

  it('führt in der Übersicht über Wege statt über Knöpfe des Terminfensters', () => {
    renderWithProviders(
      <HomeVisitFlow
        appointment={ausDerUebersicht}
        melden={() => undefined}
        inKarte
        wege={{ ohneBehandlung: '/ohne', absagen: '/absagen' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    expect(screen.getByRole('link', { name: 'Ohne Behandlung festhalten' })).toHaveAttribute(
      'href',
      '/ohne',
    );
    expect(screen.getByRole('link', { name: '„Termin absagen“' })).toHaveAttribute(
      'href',
      '/absagen',
    );
    expect(screen.queryByText(/Dann oben/)).toBeNull();
    // Ohne `mitUhr` keine Uhr - so im Terminfenster.
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
