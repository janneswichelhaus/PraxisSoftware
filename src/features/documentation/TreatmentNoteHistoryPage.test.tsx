import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Änderungsverlauf einer Behandlungsdokumentation (DOK-002, ADR-016 Punkt 5, 8).
 *
 * Alle Inhalte sind erkennbar synthetisch (PROJECT_PRINCIPLES.md 3.1).
 */

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';

const termin = testAppointment({
  id: TERMIN_ID,
  updated_at: '2027-05-01T10:00:00.000000+00:00',
});

const ERSTE = 'Synthetisch: Belastung in drei Stufen gesteigert.';
const ZWEITE = 'Synthetisch: Belastung in vier Stufen gesteigert.';

const finalisiert: DokumentationApi.TreatmentNote = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'final',
  content: ZWEITE,
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: '2027-05-12T10:00:00.000000+00:00',
  finalized_at: '2027-05-12T09:00:00.000000+00:00',
  finalisation_kind: 'manual',
  version_count: 2,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Tim Teamleitung',
  finalized_by_name: 'Anna Beispiel',
};

const versionen: DokumentationApi.TreatmentNoteVersion[] = [
  {
    version_no: 1,
    content: ERSTE,
    change_reason: null,
    recorded_at: '2027-05-12T09:00:00.000000+00:00',
    author_name: 'Anna Beispiel',
  },
  {
    version_no: 2,
    content: ZWEITE,
    change_reason: 'Zahlendreher bei der Stufenzahl.',
    recorded_at: '2027-05-12T10:00:00.000000+00:00',
    author_name: 'Tim Teamleitung',
  },
];

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const fetchTreatmentNoteVersions = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
    fetchTreatmentNoteVersions: (id: string) =>
      fetchTreatmentNoteVersions(id) as Promise<DokumentationApi.TreatmentNoteVersion[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ appointmentId: TERMIN_ID, noteId: DOKU_ID }),
}));

const { TreatmentNoteHistoryPage } = await import('./TreatmentNoteHistoryPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <TreatmentNoteHistoryPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/verlauf`,
  );
}

describe('TreatmentNoteHistoryPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    fetchTreatmentNoteVersions.mockReset();

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
    fetchTreatmentNoteVersions.mockResolvedValue(versionen);
  });

  it('zeigt jede Version mit Inhalt, Zeitpunkt und Urheber (ADR-016 Punkt 5)', async () => {
    rendern();

    // Der urspruengliche Wortlaut bleibt neben dem korrigierten sichtbar - das
    // ist die Anforderung aus 630f Abs. 1 S. 2 BGB.
    expect(await screen.findByText(ERSTE)).toBeInTheDocument();
    expect(screen.getByText(ZWEITE)).toBeInTheDocument();
    expect(screen.getByLabelText('Version 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Version 2')).toBeInTheDocument();
    expect(screen.getByText(/Anna Beispiel/)).toBeInTheDocument();
    expect(screen.getByText(/Tim Teamleitung/)).toBeInTheDocument();
  });

  it('zeigt die Begruendung der Korrektur und kennzeichnet Version 1', async () => {
    rendern();

    expect(await screen.findByText(/Zahlendreher bei der Stufenzahl\./)).toBeInTheDocument();
    expect(screen.getByText('Bei der Finalisierung festgeschriebener Stand.')).toBeInTheDocument();
  });

  it('erklaert einen Entwurf ohne festgeschriebene Versionen', async () => {
    fetchTreatmentNoteVersions.mockResolvedValue([]);
    rendern();

    expect(
      await screen.findByText(/Festgeschriebene Versionen entstehen erst/),
    ).toBeInTheDocument();
  });

  it('laesst owner den Verlauf lesen, ohne selbst zu dokumentieren (4.1)', async () => {
    rendern(['owner']);

    expect(await screen.findByText(ERSTE)).toBeInTheDocument();
  });

  it('zeigt einem office-Zugang nichts und fragt nichts ab (Punkt 8, 4.3)', async () => {
    rendern(['office']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(fetchTreatmentNoteVersions).not.toHaveBeenCalled();
    expect(fetchAppointment).not.toHaveBeenCalled();
  });

  it('zeigt Patientenkonten nichts an (4.6)', async () => {
    rendern(['patient']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTreatmentNoteVersions).not.toHaveBeenCalled();
  });

  it('meldet einen Ladefehler verstaendlich', async () => {
    fetchTreatmentNoteVersions.mockRejectedValue(new Error('kaputt'));
    rendern();

    expect(
      await screen.findByText('Der Änderungsverlauf konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});
