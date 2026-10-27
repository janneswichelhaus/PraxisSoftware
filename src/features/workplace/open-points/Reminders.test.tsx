import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as RemindersApi from './reminders-api';
import type * as UebersichtApi from '@/features/patients/uebersicht';
import { renderWithProviders } from '@/test-utils';

const fetchEndingPrescriptions = vi.fn();
const fetchCareWithoutConclusion = vi.fn();
const fetchPatientOverview = vi.fn();

vi.mock('./reminders-api', async (importOriginal) => ({
  ...(await importOriginal<typeof RemindersApi>()),
  fetchEndingPrescriptions: () =>
    fetchEndingPrescriptions() as Promise<RemindersApi.EndingPrescription[]>,
  fetchCareWithoutConclusion: () =>
    fetchCareWithoutConclusion() as Promise<RemindersApi.CareWithoutConclusion[]>,
}));
vi.mock('@/features/patients/uebersicht', async (importOriginal) => ({
  ...(await importOriginal<typeof UebersichtApi>()),
  fetchPatientOverview: () => fetchPatientOverview() as Promise<UebersichtApi.Patienteneintrag[]>,
}));

const { AktenOhneBehandlung, EndingPrescriptions, OffeneVerordnungen } =
  await import('./Reminders');

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

// B1 (BEF-151): Statt „Versorgung abschließen?“ die Karteileichen - eine
// Verordnung, die Termine braucht oder abzurechnen ist.
describe('Verordnung offen (B1)', () => {
  function eintrag(
    id: string,
    family: string,
    overrides: Partial<UebersichtApi.Patienteneintrag>,
  ): UebersichtApi.Patienteneintrag {
    return {
      id,
      given_name: 'Max',
      family_name: family,
      date_of_birth: null,
      email: null,
      phone: null,
      postal_code: null,
      city: null,
      last_visit_on: null,
      next_appointment_at: null,
      open_bases: 0,
      bases_need_appointments: 0,
      bases_need_followup: 0,
      bases_ready: 0,
      bases_in_billing: 0,
      billing_visible: false,
      invoices_issued: null,
      invoices_paid: null,
      outstanding_cents: null,
      invoices_overdue: null,
      reminders_due: null,
      ...overrides,
    };
  }

  it('führt zu den Grundlagen der Akte und nennt, was fehlt', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag(PATIENT, 'Mustermann', { open_bases: 1, bases_need_appointments: 1 }),
      eintrag('p2', 'Beispiel', { open_bases: 1, bases_ready: 1 }),
      eintrag('p3', 'Ruhig', { open_bases: 1 }),
    ]);
    renderWithProviders(<OffeneVerordnungen />);

    const max = await screen.findByRole('link', { name: /^Mustermann, Max/ });
    expect(max).toHaveAttribute('href', `/patienten/${PATIENT}/verordnungen?zurueck=%2Foffen`);
    expect(max).toHaveTextContent('Termine fehlen');
    expect(screen.getByRole('link', { name: /^Beispiel, Max/ })).toHaveTextContent('Abrechnen');
    // Was läuft, ist keine Karteileiche.
    expect(screen.queryByRole('link', { name: /^Ruhig/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'In der Patientenliste' })).toHaveAttribute(
      'href',
      '/patienten?sort=verordnung',
    );
  });

  it('zeigt keine Gruppe, wenn keine Verordnung offen ist', async () => {
    fetchPatientOverview.mockResolvedValue([eintrag(PATIENT, 'Mustermann', { open_bases: 1 })]);
    const { container } = renderWithProviders(<OffeneVerordnungen />);
    await vi.waitFor(() => expect(fetchPatientOverview).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Akte ohne Behandlung (Zweitreview A, ADR-008 Punkt 3)', () => {
  it('führt in die Stammdaten, wo der Abschluss den Fristanker setzt', async () => {
    fetchCareWithoutConclusion.mockResolvedValue([
      {
        patient_id: PATIENT,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        last_appointment_at: null,
        patient_created_at: '2025-11-01T08:00:00.000Z',
      },
    ]);
    renderWithProviders(<AktenOhneBehandlung timeZone="Europe/Berlin" />);
    expect(await screen.findByRole('link', { name: /^Mustermann, Max/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/stammdaten?zurueck=%2Foffen`,
    );
    expect(screen.getByText('Ohne Termin, angelegt am 01.11.2025')).toBeInTheDocument();
    // Der Rechtssatz zur Frist steht als Kleingedrucktes (DESIGN.md Regel 6).
    expect(screen.getByText(/Ohne Behandlung läuft keine Aufbewahrungsfrist/)).toBeInTheDocument();
  });

  it('zeigt keine Gruppe, wenn jede Akte einen Anker hat', async () => {
    fetchCareWithoutConclusion.mockResolvedValue([]);
    const { container } = renderWithProviders(<AktenOhneBehandlung timeZone="Europe/Berlin" />);
    await vi.waitFor(() => expect(fetchCareWithoutConclusion).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
