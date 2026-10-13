import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as RemindersApi from './reminders-api';
import { renderWithProviders } from '@/test-utils';

const fetchEndingPrescriptions = vi.fn();
const fetchCareWithoutConclusion = vi.fn();

vi.mock('./reminders-api', async (importOriginal) => ({
  ...(await importOriginal<typeof RemindersApi>()),
  fetchEndingPrescriptions: () =>
    fetchEndingPrescriptions() as Promise<RemindersApi.EndingPrescription[]>,
  fetchCareWithoutConclusion: () =>
    fetchCareWithoutConclusion() as Promise<RemindersApi.CareWithoutConclusion[]>,
}));

const { EndingPrescriptions, CareWithoutConclusionList } = await import('./Reminders');

const PATIENT = '66666666-6666-4666-8666-000000000001';

describe('Verordnung endet (PRX-016)', () => {
  it('nennt Stand, letzte Behandlung, Empfehlung ja/nein und die Verordner:in zum Anrufen', async () => {
    fetchEndingPrescriptions.mockResolvedValue([
      {
        treatment_basis_id: 'v1',
        patient_id: PATIENT,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        treatment_basis_kind: 'follow_up',
        issued_on: '2026-06-18',
        prescribed: 10,
        used: 8,
        planned: 10,
        last_appointment_at: '2026-10-06T08:00:00.000Z',
        has_recommendation: false,
        prescriber_name: 'Dr. med. Petra Probst',
        prescriber_phone: '+49 7071 1234',
      },
    ]);
    renderWithProviders(<EndingPrescriptions timeZone="Europe/Berlin" />);

    // Die ganze Zeile ist der Weg zu den Verordnungen (Design-Rollout B5).
    expect(await screen.findByRole('link', { name: /^Mustermann, Max/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/verordnungen?zurueck=%2Foffen`,
    );
    expect(screen.getByText('Keine Empfehlung')).toBeInTheDocument();
    expect(screen.getByText(/10 von 10 Terminen · letzter am 06\.10\.2026/)).toBeInTheDocument();
    // Der Anruf bei der Verordner:in steht als `tel:` neben der Zeile.
    expect(
      screen.getByRole('link', { name: 'Dr. med. Petra Probst anrufen, +49 7071 1234' }),
    ).toHaveAttribute('href', expect.stringMatching(/^tel:/));
  });

  it('zeigt keine Gruppe, wenn nichts endet', async () => {
    fetchEndingPrescriptions.mockResolvedValue([]);
    const { container } = renderWithProviders(<EndingPrescriptions timeZone="Europe/Berlin" />);
    await vi.waitFor(() => expect(fetchEndingPrescriptions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Versorgung abschliessen? (PRX-016)', () => {
  it('fuehrt in die Stammdaten, wo der Abschluss gesetzt wird', async () => {
    fetchCareWithoutConclusion.mockResolvedValue([
      {
        patient_id: PATIENT,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        last_appointment_at: '2026-02-01T08:00:00.000Z',
        patient_created_at: '2025-11-01T08:00:00.000Z',
      },
    ]);
    renderWithProviders(<CareWithoutConclusionList timeZone="Europe/Berlin" />);
    expect(await screen.findByRole('link', { name: /^Mustermann, Max/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/stammdaten?zurueck=%2Foffen`,
    );
    // Die Frist hängt am Abschluss (ADR-008) - der Satz bleibt als Kleingedrucktes.
    expect(screen.getByText(/erst mit ihm läuft die Aufbewahrungsfrist/)).toBeInTheDocument();
    expect(screen.getByText('Letzter Termin am 01.02.2026')).toBeInTheDocument();
  });
});
