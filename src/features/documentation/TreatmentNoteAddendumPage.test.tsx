import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Nachtrag zu einem finalisierten Eintrag (DOK-002, ADR-016 Punkt 6).
 *
 * Alle Inhalte sind erkennbar synthetisch (PROJECT_PRINCIPLES.md 3.1).
 */

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';

const termin = testAppointment({
  id: TERMIN_ID,
  updated_at: '2027-05-01T10:00:00.000000+00:00',
});

const INHALT = 'Synthetisch: Belastung in drei Stufen gesteigert.';

const entwurf: DokumentationApi.TreatmentNote = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: INHALT,
  visit_without_treatment: false,
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: '2027-05-12T08:30:00.654321+00:00',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: null,
};

const finalisiert: DokumentationApi.TreatmentNote = {
  ...entwurf,
  status: 'final',
  finalized_at: '2027-05-12T09:00:00.000000+00:00',
  finalisation_kind: 'manual',
  version_count: 1,
  finalized_by_name: 'Anna Beispiel',
};

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const createTreatmentNoteAddendum = vi.fn();
const navigate = vi.fn();

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
    createTreatmentNoteAddendum: (id: string, inhalt: string) =>
      createTreatmentNoteAddendum(id, inhalt) as Promise<string>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN_ID, noteId: DOKU_ID }),
}));

const { TreatmentNoteAddendumPage } = await import('./TreatmentNoteAddendumPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <TreatmentNoteAddendumPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag`,
  );
}

const feld = () => screen.getByLabelText('Nachtrag');

describe('TreatmentNoteAddendumPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    createTreatmentNoteAddendum.mockReset();
    navigate.mockReset();

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
    createTreatmentNoteAddendum.mockResolvedValue(NACHTRAG_ID);
  });

  it('zeigt den Ursprungseintrag und legt den Nachtrag als eigenen Eintrag an', async () => {
    const user = userEvent.setup();
    rendern();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    await user.type(feld(), 'Synthetisch: Heimprogramm nachgereicht.');
    await user.click(screen.getByRole('button', { name: 'Nachtrag als Entwurf speichern' }));

    await waitFor(() => {
      expect(createTreatmentNoteAddendum).toHaveBeenCalledWith(
        DOKU_ID,
        'Synthetisch: Heimprogramm nachgereicht.',
      );
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`));
  });

  it('laesst einen leeren Nachtrag nicht abschicken', async () => {
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Nachtrag als Entwurf speichern' })).toBeDisabled();
  });

  it('verweist bei einem Entwurf auf den Bearbeitungsweg', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    rendern();

    expect(await screen.findByText('Noch ein Entwurf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nachtrag')).toBeNull();
  });

  it('schliesst den Nachtrag zum Nachtrag aus', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...finalisiert, id: NACHTRAG_ID },
      addenda: [{ ...finalisiert, addendum_to_note_id: NACHTRAG_ID }],
    });
    rendern();

    expect(await screen.findByText('Kein Nachtrag zum Nachtrag')).toBeInTheDocument();
  });

  it('meldet einen Serverfehler verstaendlich', async () => {
    createTreatmentNoteAddendum.mockRejectedValue(
      new Error('Der Nachtrag konnte nicht angelegt werden.'),
    );
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Nachtrag'), 'Synthetisch: nachgereicht.');
    await user.click(screen.getByRole('button', { name: 'Nachtrag als Entwurf speichern' }));

    expect(await screen.findByText('Nicht gespeichert')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('zeigt einem office-Zugang nichts und fragt nichts ab (4.3)', async () => {
    rendern(['office']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(fetchAppointment).not.toHaveBeenCalled();
  });
});
