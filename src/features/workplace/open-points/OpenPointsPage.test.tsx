import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as FilesApi from '@/features/patients/files/api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchOffeneScans = vi.fn();

vi.mock('@/features/patients/files/api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    fetchOffeneScans: () => fetchOffeneScans() as Promise<FilesApi.OffenerScan[]>,
  };
});

const { OpenPointsPage } = await import('./OpenPointsPage');

const SCAN: FilesApi.OffenerScan = {
  file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  patient_id: '66666666-6666-4666-8666-000000000001',
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  uploaded_at: '2026-09-29T08:00:00.000Z',
  uploaded_by_name: 'Anna Beispiel',
};

describe('Offene Punkte - Verordnungen zu erfassen (PRX-011)', () => {
  beforeEach(() => {
    fetchOffeneScans.mockReset();
  });

  it('fuehrt vom Foto ins Formular, mit Foto und Rueckweg', async () => {
    fetchOffeneScans.mockResolvedValue([SCAN]);
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);

    expect(await screen.findByText('Mustermann, Max')).toBeInTheDocument();
    expect(screen.getByText(/Foto vom 29\.09\.2026 · Anna Beispiel/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Verordnungen zu erfassen (1)' }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Grundlage erfassen/ });
    expect(link).toHaveAttribute(
      'href',
      `/patienten/${SCAN.patient_id}/verordnungen/neu?scan=${SCAN.file_id}&zurueck=%2Foffen`,
    );
    // Kein Bild in der Liste (ADR-017 Punkt 15).
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('zeigt ohne Foto keine Gruppe - „Nichts offen" sagt die Seite einmal (Eingang.test)', async () => {
    fetchOffeneScans.mockResolvedValue([]);
    renderWithProviders(<OpenPointsPage user={testUser(['therapist'])} />);
    await waitFor(() => expect(fetchOffeneScans).toHaveBeenCalled());
    expect(screen.queryByText('Verordnungen zu erfassen', { exact: false })).toBeNull();
  });

  it('fragt fuer eine Rolle ohne Grundlagenrecht gar nicht erst', () => {
    renderWithProviders(<OpenPointsPage user={testUser(['trainer'])} />);
    expect(fetchOffeneScans).not.toHaveBeenCalled();
  });
});
