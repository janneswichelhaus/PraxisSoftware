import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';

const termin = testAppointment({
  id: TERMIN_ID,
  updated_at: '2027-05-01T10:00:00.000000+00:00',
});

/** Synthetischer Inhalt - keine Zeile stammt aus einem realen Behandlungsfall. */
const INHALT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';
const STAND = '2027-05-12T08:30:00.654321+00:00';

const doku: DokumentationApi.TreatmentNote = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: INHALT,
  visit_without_treatment: false,
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: STAND,
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: null,
};

const LEER: DokumentationApi.TreatmentDocumentation = { primary: null, addenda: [] };

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const createTreatmentNote = vi.fn();
const updateTreatmentNote = vi.fn();
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
    createTreatmentNote: (id: string, inhalt: string) =>
      createTreatmentNote(id, inhalt) as Promise<string>,
    updateTreatmentNote: (id: string, stand: string, inhalt: string) =>
      updateTreatmentNote(id, stand, inhalt) as Promise<void>,
  };
});

/** Veraenderbar, damit auch die Bearbeitungsroute eines Nachtrags pruefbar ist. */
let params: Record<string, string> = { appointmentId: TERMIN_ID };

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => params,
}));

const { TreatmentNotePage } = await import('./TreatmentNotePage');
const { DokumentationVeraendertError } = await import('./api');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <TreatmentNotePage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/dokumentation`,
  );
}

function feld(): HTMLElement {
  return screen.getByLabelText('Eintrag zur Behandlung');
}

describe('TreatmentNotePage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    createTreatmentNote.mockReset();
    updateTreatmentNote.mockReset();
    navigate.mockReset();

    params = { appointmentId: TERMIN_ID };
    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue(LEER);
    createTreatmentNote.mockResolvedValue(DOKU_ID);
    updateTreatmentNote.mockResolvedValue(undefined);
  });

  it('legt einen neuen Entwurf an und kehrt zum Termin zurueck', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(''));
    await user.type(feld(), 'Neuer synthetischer Eintrag.');
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    await waitFor(() => {
      expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Neuer synthetischer Eintrag.');
    });
    expect(updateTreatmentNote).not.toHaveBeenCalled();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`));
  });

  it('laedt einen vorhandenen Entwurf und speichert ihn mit dem gelesenen Stand', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Ergaenzung.');
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    await waitFor(() => {
      // Der gelesene Stand geht unveraendert zurueck - Grundlage der
      // Konflikterkennung (ADR-001).
      expect(updateTreatmentNote).toHaveBeenCalledWith(DOKU_ID, STAND, `${INHALT} Ergaenzung.`);
    });
    expect(createTreatmentNote).not.toHaveBeenCalled();
  });

  describe('Befund aus Bausteinen (FRB-003b)', () => {
    async function myofaszial(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => expect(feld()).toHaveValue(INHALT));
      await user.click(screen.getByText('Befund aus Bausteinen'));
      await user.click(screen.getByRole('button', { name: 'Knie' }));
      const seite = screen.getByRole('group', { name: 'Seite Knie' });
      await user.click(within(seite).getByRole('button', { name: 'links' }));
      await user.click(screen.getByText('Therapie'));
      await user.click(
        within(screen.getByRole('group', { name: 'Myofaszial' })).getByRole('button', {
          name: 'durchgeführt',
        }),
      );
    }

    it('speichert nicht, solange ein Vorschlag nicht im Text steht', async () => {
      fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
      const user = userEvent.setup();
      rendern();
      await myofaszial(user);
      // Nur ein Häkchen, kein getippter Text: Das ist trotzdem ungespeicherte Arbeit.
      await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/noch nicht im Text/);
      expect(updateTreatmentNote).not.toHaveBeenCalled();
    });

    it('hängt den Vorschlag aus der Rückfrage beim Verlassen an den Entwurf', async () => {
      fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
      const user = userEvent.setup();
      rendern();
      await myofaszial(user);
      await user.click(screen.getByRole('link', { name: 'Abbrechen' }));
      await user.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

      await waitFor(() =>
        expect(updateTreatmentNote).toHaveBeenCalledWith(
          DOKU_ID,
          STAND,
          `${INHALT}\n\nKnie links – Therapie\n• Myofaszial`,
        ),
      );
    });
  });

  it('laesst ohne Aenderung nicht speichern', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    expect(screen.getByRole('button', { name: 'Als Entwurf speichern' })).toBeDisabled();
  });

  it('weist einen Eintrag aus reinen Leerzeichen ab, ohne den Server zu fragen', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(''));
    await user.type(feld(), '   ');
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    expect(
      await screen.findByText('Die Behandlungsdokumentation darf nicht leer sein.'),
    ).toBeInTheDocument();
    expect(createTreatmentNote).not.toHaveBeenCalled();
  });

  it('meldet einen Konflikt und laesst den eigenen Text stehen (PROJECT_PRINCIPLES.md 13)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    updateTreatmentNote.mockRejectedValue(new DokumentationVeraendertError());
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Eigener Zusatz.');
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    expect(await screen.findByText('Nicht gespeichert')).toBeInTheDocument();
    expect(
      screen.getByText(/zwischenzeitlich von einer anderen Person geändert/),
    ).toBeInTheDocument();
    // Entscheidend: der eigene Text ist noch da.
    expect(feld()).toHaveValue(`${INHALT} Eigener Zusatz.`);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fragt vor dem Verwerfen ungespeicherter Eingaben nach', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(''));
    await user.type(feld(), 'Noch nicht gespeichert.');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    // Die Rückfrage stellt seit FIX-011 der Navigationsschutz: derselbe Kasten
    // für „Abbrechen", das Hauptmenü, den Patientenwechsel und das Zurück des
    // Browsers.
    expect(await screen.findByText(/Beim Weitergehen geht er verloren/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hier bleiben' }));
    expect(feld()).toHaveValue('Noch nicht gespeichert.');
    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
  });

  /**
   * „Speichern" aus der Rückfrage heraus ist der Entwurfsweg - derselbe, den
   * die Schaltfläche nimmt. Eine Finalisierung entsteht daraus nicht
   * (FIX-EPIC-003, ADR-016).
   */
  it('sichert aus der Rueckfrage den Entwurf', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(''));
    await user.type(feld(), 'Noch nicht gespeichert.');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

    await waitFor(() =>
      expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Noch nicht gespeichert.'),
    );
  });

  it('zeigt einem office-Zugang nichts und fragt nichts ab', async () => {
    rendern(['office']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(fetchAppointment).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
  });

  it('zeigt einem reinen owner-Zugang kein Schreibformular', async () => {
    rendern(['owner']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
  });

  it('verweigert das Schreiben zu einem abgesagten Termin ohne Dokumentation', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    rendern();

    expect(await screen.findByText('Termin abgesagt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
  });

  it('meldet einen unbekannten Termin verstaendlich', async () => {
    fetchAppointment.mockResolvedValue(null);
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });

  it('bearbeitet eine vorhandene Dokumentation auch bei abgesagtem Termin weiter', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
  });

  it('bearbeitet ueber die Bearbeitungsroute den Nachtrag, nicht den Haupteintrag (DOK-002)', async () => {
    const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';
    const NACHTRAG_STAND = '2027-05-12T11:00:00.111111+00:00';
    const NACHTRAG_TEXT = 'Synthetisch: nachgereicht.';

    params = { appointmentId: TERMIN_ID, noteId: NACHTRAG_ID };
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...doku, status: 'final', version_count: 1 },
      addenda: [
        {
          ...doku,
          id: NACHTRAG_ID,
          addendum_to_note_id: DOKU_ID,
          content: NACHTRAG_TEXT,
          updated_at: NACHTRAG_STAND,
        },
      ],
    });

    const user = userEvent.setup();
    rendern();

    const nachtragsfeld = await screen.findByLabelText('Nachtrag');
    expect(nachtragsfeld).toHaveValue(NACHTRAG_TEXT);
    // Ein Nachtrag ergänzt, er befundet nicht neu (FRB-003b, ANN-120).
    expect(screen.queryByText('Befund aus Bausteinen')).toBeNull();

    await user.type(nachtragsfeld, ' Ergaenzt.');
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    await waitFor(() => {
      expect(updateTreatmentNote).toHaveBeenCalledWith(
        NACHTRAG_ID,
        NACHTRAG_STAND,
        `${NACHTRAG_TEXT} Ergaenzt.`,
      );
    });
  });

  it('meldet einen Eintrag, der nicht zu diesem Termin gehoert', async () => {
    params = { appointmentId: TERMIN_ID, noteId: '99999999-9999-4999-8999-000000000009' };
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });

  it('verschliesst den Entwurfsweg fuer einen finalisierten Eintrag (DOK-002)', async () => {
    // Reine Darstellung - verbindlich weist update_treatment_note den Weg ab.
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: {
        ...doku,
        status: 'final',
        finalized_at: '2027-05-12T09:00:00.000000+00:00',
        finalisation_kind: 'manual',
        version_count: 1,
        finalized_by_name: 'Anna Beispiel',
      },
      addenda: [],
    });
    rendern();

    expect(await screen.findByText('Bereits finalisiert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
  });
});
