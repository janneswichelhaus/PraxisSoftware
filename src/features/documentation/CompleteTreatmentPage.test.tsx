import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as DokumentationApi from './api';
import type * as Bausteine from './textbausteine';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const NOTE_ID = '88888888-8888-4888-8888-000000000001';

const termin: AppointmentsApi.Appointment = {
  id: TERMIN_ID,
  patient_id: '66666666-6666-4666-8666-000000000001',
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  location_id: null,
  appointment_type: 'home_visit',
  status: 'confirmed',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-01T10:00:00.000000+00',
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  completed_at: null,
  cancellation_reason: null,
  no_show_recorded_at: null,
  cancellation_received_at: null,
  fee_basis: null,
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: null,
  notification_channels: [],
  organization_time_zone: 'Europe/Berlin',
};

const entwurf: DokumentationApi.TreatmentNote = {
  id: NOTE_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: 'Bereits geschriebener Entwurf',
  created_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-12T08:05:00.000000+00',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: null,
};

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const completeTreatment = vi.fn();
const createTreatmentNote = vi.fn();
const updateTreatmentNote = vi.fn();
const navigate = vi.fn();
const fetchTextSnippets = vi.fn();

vi.mock('./textbausteine', async (importOriginal) => {
  const actual = await importOriginal<typeof Bausteine>();
  return {
    ...actual,
    fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
  };
});

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
    completeTreatment: (...args: unknown[]) => completeTreatment(...args) as Promise<void>,
    createTreatmentNote: (...args: unknown[]) => createTreatmentNote(...args) as Promise<string>,
    updateTreatmentNote: (...args: unknown[]) => updateTreatmentNote(...args) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ appointmentId: TERMIN_ID }),
  };
});

const { CompleteTreatmentPage } = await import('./CompleteTreatmentPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <CompleteTreatmentPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/abschluss`,
  );
}

/**
 * Der Abschluss in einem Schritt ist der Regelfall am Ende eines Besuchs
 * (UX-007). Geprüft wird, dass er genau ein Schreibvorgang ist, dass er seine
 * Folge nennt, bevor er ausgelöst wird (ADR-016 Punkt 4), und dass der Weg
 * „nur speichern" daneben bestehen bleibt.
 */
describe('CompleteTreatmentPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    completeTreatment.mockReset();
    createTreatmentNote.mockReset();
    updateTreatmentNote.mockReset();
    navigate.mockReset();
    fetchTextSnippets.mockReset();
    fetchTextSnippets.mockResolvedValue([
      {
        id: 'b1',
        title: 'Hausbesuch',
        body: 'Hausbesuch durchgefuehrt.',
        shared: true,
        editable: false,
      },
    ]);

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    completeTreatment.mockResolvedValue(undefined);
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    updateTreatmentNote.mockResolvedValue(undefined);
  });

  it('nennt die Folge, bevor abgeschlossen wird', async () => {
    rendern();
    expect(
      await screen.findByText(/als Version 1 festgeschrieben|Bestandteil der Patientenakte/),
    ).toBeInTheDocument();
  });

  it('schliesst Dokumentation und Termin mit einer einzigen Aktion ab', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
    await user.click(screen.getByRole('button', { name: 'Behandlung abschließen' }));

    await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
    expect(completeTreatment).toHaveBeenCalledWith(
      TERMIN_ID,
      'Heute geübt.',
      termin.updated_at,
      null,
    );
    // Kein zweiter Schreibweg daneben.
    expect(createTreatmentNote).not.toHaveBeenCalled();
    expect(updateTreatmentNote).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`);
  });

  it('uebergibt den Stand eines vorhandenen Entwurfs zur Konflikterkennung', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    const user = userEvent.setup();
    rendern();

    const feld = await screen.findByLabelText('Eintrag zur Behandlung');
    expect(feld).toHaveValue('Bereits geschriebener Entwurf');

    await user.clear(feld);
    await user.type(feld, 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Behandlung abschließen' }));

    await waitFor(() =>
      expect(completeTreatment).toHaveBeenCalledWith(
        TERMIN_ID,
        'Neuer Text',
        termin.updated_at,
        entwurf.updated_at,
      ),
    );
  });

  it('laesst einen leeren Text nicht durch und schreibt nichts', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(await screen.findByRole('button', { name: 'Behandlung abschließen' }));

    expect(
      await screen.findByText('Die Behandlungsdokumentation darf nicht leer sein.'),
    ).toBeInTheDocument();
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('bietet daneben weiter den Weg "nur speichern"', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Nur ein Entwurf.');
    await user.click(screen.getByRole('button', { name: 'Nur als Entwurf speichern' }));

    await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledTimes(1));
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('schuetzt einen ungespeicherten Text beim Abbrechen', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    // Seit FIX-011 stellt der Navigationsschutz die Rückfrage - für
    // „Abbrechen" wie für jeden anderen Weg aus dieser Seite heraus.
    expect(
      await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Ungespeichert');
  });

  /**
   * Der Kern der Zusicherung aus FIX-EPIC-003: „Speichern" aus der Rückfrage
   * heraus sichert den **Entwurf**. Ein Seitenwechsel schließt keinen Termin
   * ab und schreibt keine Dokumentation fest (ADR-016, ADR-018).
   */
  it('sichert aus der Rueckfrage nur den Entwurf und schliesst nichts ab', async () => {
    const user = userEvent.setup();
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

    await waitFor(() =>
      expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Ungespeichert'),
    );
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('sagt am bereits abgeschlossenen Termin, dass nur noch dokumentiert wird', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'completed' });
    rendern();
    expect(await screen.findByText(/bereits abgeschlossen/)).toBeInTheDocument();
  });

  it('weist einen abgesagten Termin ab', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    rendern();
    expect(await screen.findByText('Termin abgesagt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
  });

  it('weist eine bereits finalisierte Dokumentation ab', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...entwurf, status: 'final', version_count: 1 },
      addenda: [],
    });
    rendern();
    expect(await screen.findByText('Bereits abgeschlossen')).toBeInTheDocument();
  });

  it('ist fuer office gar nicht erst zu oeffnen und fragt nichts ab', async () => {
    rendern(['office']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
  });

  describe('UX-008: Textbausteine', () => {
    it('fuegt einen Baustein mit einem Tap ein', async () => {
      const user = userEvent.setup();
      rendern();

      await user.click(await screen.findByRole('button', { name: 'Hausbesuch' }));
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Hausbesuch durchgefuehrt.',
      );
    });

    it('haengt an bereits Geschriebenes an, statt es zu ersetzen', async () => {
      const user = userEvent.setup();
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Eigener Satz.');
      await user.click(screen.getByRole('button', { name: 'Hausbesuch' }));

      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Eigener Satz.\n\nHausbesuch durchgefuehrt.',
      );
    });

    it('blockiert die Dokumentation nicht, wenn die Bausteine nicht laden', async () => {
      fetchTextSnippets.mockRejectedValue(new Error('kaputt'));
      rendern();

      expect(await screen.findByLabelText('Eintrag zur Behandlung')).toBeInTheDocument();
      expect(screen.queryByText('Textbausteine:')).toBeNull();
    });
  });
});
