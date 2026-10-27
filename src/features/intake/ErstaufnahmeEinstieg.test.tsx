import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as IntakeApi from '@/features/intake/api';
import type * as PatientenApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const fetchIntakeChecklist = vi.fn();
vi.mock('@/features/intake/api', async (importOriginal) => {
  const actual = await importOriginal<typeof IntakeApi>();
  return {
    ...actual,
    fetchIntakeChecklist: (id: string) => fetchIntakeChecklist(id) as Promise<unknown>,
  };
});

const fetchPatient = vi.fn();
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientenApi>();
  return { ...actual, fetchPatient: (id: string) => fetchPatient(id) as Promise<unknown> };
});

const { ErstaufnahmeEinstieg } = await import('./ErstaufnahmeEinstieg');

describe('Einstieg in die Erstaufnahme am Termin (K10)', () => {
  beforeEach(() => {
    fetchPatient.mockResolvedValue(testPatient({ treatment_table_required: false }));
  });

  it('nennt, was fehlt, und führt mit Termin und Rückweg in die geführte Erstaufnahme', async () => {
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'open' },
      { item: 'registration_form', state: 'done' },
    ]);
    renderWithProviders(
      <ErstaufnahmeEinstieg
        patientId="p1"
        terminId="t1"
        zurueck="/kalender"
        user={testUser(['therapist'])}
      />,
    );
    expect(await screen.findByText('Fehlt: Verordnungsfoto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Erstaufnahme' })).toHaveAttribute(
      'href',
      `/patienten/p1/erstaufnahme?termin=t1&zurueck=${encodeURIComponent('/kalender')}`,
    );
  });

  it('bleibt, solange die Liege nicht entschieden ist - auch mit beiden Fotos', async () => {
    fetchPatient.mockResolvedValue(testPatient({ treatment_table_required: null }));
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'done' },
      { item: 'registration_form', state: 'done' },
    ]);
    renderWithProviders(
      <ErstaufnahmeEinstieg
        patientId="p1"
        terminId="t1"
        zurueck="/kalender"
        user={testUser(['therapist'])}
      />,
    );
    expect(await screen.findByText('Fehlt: Liege')).toBeInTheDocument();
  });

  it('steht nicht da, wenn nichts fehlt', async () => {
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'not_needed' },
      { item: 'registration_form', state: 'done' },
    ]);
    const { container } = renderWithProviders(
      <ErstaufnahmeEinstieg
        patientId="p1"
        terminId="t1"
        zurueck="/kalender"
        user={testUser(['therapist'])}
      />,
    );
    await vi.waitFor(() => {
      expect(fetchIntakeChecklist).toHaveBeenCalled();
      expect(fetchPatient).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
