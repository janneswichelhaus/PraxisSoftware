import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type * as AssessmentsApi from '@/features/assessments/api';
import type * as IntakeApi from '@/features/intake/api';
import type * as PatientenApi from '@/features/patients/api';
import type * as Vermerke from '@/features/datenschutz/vermerke';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const fetchPatient = vi.fn();
const fetchIntakeChecklist = vi.fn();
const fetchErhebungen = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientenApi>();
  return { ...actual, fetchPatient: (id: string) => fetchPatient(id) as Promise<unknown> };
});
vi.mock('@/features/intake/api', async (importOriginal) => {
  const actual = await importOriginal<typeof IntakeApi>();
  return {
    ...actual,
    fetchIntakeChecklist: (id: string) => fetchIntakeChecklist(id) as Promise<unknown>,
  };
});
vi.mock('@/features/assessments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AssessmentsApi>();
  return { ...actual, fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<unknown> };
});
vi.mock('@/features/datenschutz/vermerke', async (importOriginal) => {
  const actual = await importOriginal<typeof Vermerke>();
  return { ...actual, fetchDatenschutzvermerke: () => Promise.resolve([]) };
});

const { ErstaufnahmePage } = await import('./ErstaufnahmePage');

function zeigen(pfad: string, rollen: RoleKey[] = ['therapist']) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/erstaufnahme"
        element={<ErstaufnahmePage user={testUser(rollen)} />}
      />
    </Routes>,
    pfad,
  );
}

function abschnitt(titel: string): HTMLElement {
  return screen.getByRole('heading', { name: titel }).closest('section')!;
}

describe('Erstaufnahme, geführt (K10)', () => {
  beforeEach(() => {
    fetchErhebungen.mockReset();
    fetchPatient.mockResolvedValue(testPatient({ treatment_table_required: null }));
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'open' },
      { item: 'registration_form', state: 'open' },
    ]);
    fetchErhebungen.mockResolvedValue([]);
  });

  it('führt durch alle Schritte und sagt, wie viele noch offen sind', async () => {
    const { container } = zeigen(`/patienten/${PATIENT_ID}/erstaufnahme?termin=t1`);
    expect(await screen.findByText(/noch 4 offen/)).toBeInTheDocument();
    const titel = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titel).toEqual([
      'Verordnung',
      'Anmeldebogen',
      'Einwilligungen',
      'Anamnesebogen',
      'Behandlungsliege',
    ]);
    expect(within(abschnitt('Verordnung')).getByText('Offen')).toBeInTheDocument();
    expect(
      within(abschnitt('Verordnung')).getByLabelText('Verordnung als Datei'),
    ).toBeInTheDocument();
    expect(
      within(abschnitt('Anmeldebogen')).getByLabelText('Anmeldebogen als Datei'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liege nicht nötig' })).toBeInTheDocument();
    // Der Bogen kommt hierher zurück.
    expect(screen.getByRole('link', { name: 'Bogen erheben' }).getAttribute('href')).toContain(
      `zurueck=${encodeURIComponent(`/patienten/${PATIENT_ID}/erstaufnahme?termin=t1`)}`,
    );
    // Ein Hauptknopf: mit Termin weiter zur Doku.
    expect(screen.getByRole('link', { name: 'Weiter zu Befund und Doku' })).toHaveAttribute(
      'href',
      '/termine/t1/abschluss',
    );
    // Kein Erklärsatz in der geführten Fassung (DESIGN.md Regel 6).
    expect(screen.queryByText(/Neues Rezept dabei/)).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('sagt, wenn der Stand nicht geladen werden konnte, statt Schritte ohne Zustand zu zeigen', async () => {
    fetchIntakeChecklist.mockRejectedValue(new Error('netz'));
    zeigen(`/patienten/${PATIENT_ID}/erstaufnahme`);
    expect(
      await screen.findByText('Der Stand der Erstaufnahme konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Erneut versuchen/ })).toBeInTheDocument();
  });

  it('zeigt Erledigtes ohne Arbeit und ohne Termin „Fertig“ zurück in die Akte', async () => {
    fetchPatient.mockResolvedValue(testPatient({ treatment_table_required: true }));
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'not_needed' },
      { item: 'registration_form', state: 'done' },
    ]);
    fetchErhebungen.mockResolvedValue([
      {
        id: 'e1',
        instrument_id: 'anamnese_v8',
        definition_version: '1.0.0',
        status: 'abgeschlossen',
        recorded_on: '2026-10-01',
        answers: {},
        supersedes_response_id: null,
        superseded_by_response_id: null,
        change_reason: null,
        created_at: '2026-10-01T08:00:00Z',
        updated_at: '2026-10-01T08:00:00Z',
        completed_at: '2026-10-01T08:10:00Z',
        author_name: null,
        completed_by_name: null,
        source: 'platform',
      },
    ]);
    zeigen(`/patienten/${PATIENT_ID}/erstaufnahme`);
    expect(await screen.findByText(/alles erledigt/)).toBeInTheDocument();
    expect(within(abschnitt('Verordnung')).getByText('Entfällt')).toBeInTheDocument();
    expect(within(abschnitt('Anmeldebogen')).getByText('Erledigt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Verordnung als Datei')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bogen erheben' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fertig' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}`,
    );
  });

  it('führt für das Büro keinen Anamnesebogen und bietet die Doku nicht an', async () => {
    zeigen(`/patienten/${PATIENT_ID}/erstaufnahme?termin=t1`, ['office']);
    // Drei Schritte: Den Bogen erhebt das Büro nie, also zählt er nicht.
    expect(await screen.findByText(/noch 3 offen/)).toBeInTheDocument();
    expect(fetchErhebungen).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Anamnesebogen' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Weiter zu Befund und Doku' })).toBeNull();
    // Fotos darf das Büro (ANN-011, ANN-227).
    expect(screen.getByLabelText('Anmeldebogen als Datei')).toBeInTheDocument();
  });
});
