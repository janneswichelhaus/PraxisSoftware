import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as FilesApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Der Bereich „Dateien" der Akte (DAT-001; UXR-009: DAT-01, DAT-21).
 */

const fetchPatientFiles = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    fetchPatientFiles: (id: string, verordnung?: string | null) =>
      fetchPatientFiles(id, verordnung) as Promise<FilesApi.PatientFile[]>,
  };
});

const { Dateienbereich } = await import('./PatientFilesPage');

const PATIENT = '66666666-6666-4666-8666-000000000001';

describe('Dateienbereich', () => {
  beforeEach(() => {
    fetchPatientFiles.mockReset().mockResolvedValue([]);
  });

  it('führt Fotos der Person in den Behandlungsverlauf, nicht in die Dateien (DAT-01)', async () => {
    renderWithProviders(<Dateienbereich patientId={PATIENT} user={testUser(['therapist'])} />);

    expect(await screen.findByText(/entstehen/)).toHaveTextContent(
      /Fotos der Person – Region, Haltung, Narbe – entstehen im Behandlungsverlauf unter „Fotos“/,
    );
    expect(screen.getByRole('link', { name: 'im Behandlungsverlauf' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/verlauf`,
    );
  });

  it('nennt im leeren Bereich den Weg zum Scan an der Verordnung', async () => {
    renderWithProviders(<Dateienbereich patientId={PATIENT} user={testUser(['therapist'])} />);

    expect(await screen.findByText(/Noch liegt nichts vor/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Behandlungsgrundlagen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/verordnungen`,
    );
  });

  it('rahmt nur die Liste, nicht das Formular darunter (DAT-21)', async () => {
    renderWithProviders(<Dateienbereich patientId={PATIENT} user={testUser(['therapist'])} />);

    const leer = await screen.findByText('Keine Datei');
    const hinzufuegen = screen.getByRole('heading', { level: 3, name: 'Datei hinzufügen' });
    // Die Überschrift des Formulars steht nicht im Rahmen der Liste.
    const rahmen = leer.closest('div.rounded-card');
    expect(rahmen).not.toBeNull();
    expect(rahmen!.contains(hinzufuegen)).toBe(false);
  });

  it('zeigt dem Praxismanagement keinen Weg zu einem Scan, den es nicht anlegt', async () => {
    renderWithProviders(<Dateienbereich patientId={PATIENT} user={testUser(['office'])} />);

    expect(
      await screen.findByText(/Einwilligungen und Verträge lassen sich hier hinzufügen/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Zu den Behandlungsgrundlagen' })).toBeNull();
  });
});
