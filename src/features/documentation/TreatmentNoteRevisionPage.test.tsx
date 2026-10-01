import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Korrektur eines finalisierten Eintrags (DOK-002, ADR-016 Punkt 5 und 6).
 *
 * Alle Inhalte sind erkennbar synthetisch (PROJECT_PRINCIPLES.md 3.1).
 */

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';
const STAND = '2027-05-12T08:30:00.654321+00:00';

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
  updated_at: STAND,
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
const reviseTreatmentNote = vi.fn();
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
    reviseTreatmentNote: (id: string, stand: string, inhalt: string, grund: string) =>
      reviseTreatmentNote(id, stand, inhalt, grund) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN_ID, noteId: DOKU_ID }),
}));

const { TreatmentNoteRevisionPage } = await import('./TreatmentNoteRevisionPage');
const { DokumentationVeraendertError } = await import('./api');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist'], suche = '') {
  return renderWithProviders(
    <TreatmentNoteRevisionPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/korrektur${suche}`,
  );
}

const feld = () => screen.getByLabelText('Korrigierter Eintrag');
const grundfeld = () => screen.getByLabelText('Begründung der Korrektur');

describe('TreatmentNoteRevisionPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    reviseTreatmentNote.mockReset();
    navigate.mockReset();

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
    reviseTreatmentNote.mockResolvedValue(undefined);
  });

  it('speichert Inhalt und Begruendung mit dem gelesenen Stand', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Korrigiert.');
    await user.type(grundfeld(), 'Zahlendreher.');
    // „Festschreiben“, weil „Speichern“ in der Dokumentation Entwurf heißt (DOK-08).
    await user.click(screen.getByRole('button', { name: 'Korrektur festschreiben' }));

    await waitFor(() => {
      expect(reviseTreatmentNote).toHaveBeenCalledWith(
        DOKU_ID,
        // Der gelesene Stand geht unveraendert zurueck (ADR-001).
        STAND,
        `${INHALT} Korrigiert.`,
        'Zahlendreher.',
      );
    });
    // Der Termin erfährt, welche Version entstanden ist (DOK-15).
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`, {
        state: { meldung: 'Korrektur als Version 2 festgeschrieben.' },
      }),
    );
  });

  it('behält den mitgereisten Rückweg für „Abbrechen“, Nachtrag und den Weg danach (DOK-01)', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], '?zurueck=%2F');

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}?zurueck=%2F`,
    );
    expect(screen.getByRole('link', { name: 'Nachtrag' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag?zurueck=%2F`,
    );

    await user.type(feld(), ' Korrigiert.');
    await user.type(grundfeld(), 'Zahlendreher.');
    await user.click(screen.getByRole('button', { name: 'Korrektur festschreiben' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}?zurueck=%2F`, {
        state: { meldung: 'Korrektur als Version 2 festgeschrieben.' },
      }),
    );
  });

  it('verbindet die Folge mit dem Knopf (DOK-20)', async () => {
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    expect(
      screen.getByRole('button', { name: 'Korrektur festschreiben' }),
    ).toHaveAccessibleDescription(/Jede Korrektur wird als neue Version festgeschrieben/);
  });

  it('sagt beim Verlassen, dass eine Korrektur nicht zwischengespeichert wird (DOK-05)', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Korrigiert.');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const kasten = await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' });
    expect(kasten).toHaveTextContent(
      'Eine Korrektur lässt sich nicht zwischenspeichern: Sie wird erst mit „Korrektur festschreiben“ Teil der Akte. Zum Festschreiben hier bleiben; beim Weitergehen gehen Text und Begründung verloren.',
    );
    // Ohne Entwurf gibt es kein „Speichern“ aus der Rückfrage (ANN-046).
    expect(within(kasten).queryByRole('button', { name: /Speichern/ })).toBeNull();
  });

  it('fragt den Server ohne Begruendung gar nicht erst (ADR-016 Punkt 6)', async () => {
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Korrigiert.');
    await user.click(screen.getByRole('button', { name: 'Korrektur festschreiben' }));

    expect(
      await screen.findByText('Bitte kurz begründen, was korrigiert wird.'),
    ).toBeInTheDocument();
    expect(reviseTreatmentNote).not.toHaveBeenCalled();
  });

  it('laesst ohne inhaltliche Aenderung nicht speichern', async () => {
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    expect(screen.getByRole('button', { name: 'Korrektur festschreiben' })).toBeDisabled();
  });

  it('verweist auf den Nachtrag als Regelfall', async () => {
    rendern();

    expect(await screen.findByRole('link', { name: 'Nachtrag' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag`,
    );
  });

  it('meldet einen Konflikt und laesst den eigenen Text stehen', async () => {
    reviseTreatmentNote.mockRejectedValue(new DokumentationVeraendertError());
    const user = userEvent.setup();
    rendern();

    await waitFor(() => expect(feld()).toHaveValue(INHALT));
    await user.type(feld(), ' Eigener Zusatz.');
    await user.type(grundfeld(), 'Begruendung.');
    await user.click(screen.getByRole('button', { name: 'Korrektur festschreiben' }));

    expect(await screen.findByText('Nicht festgeschrieben')).toBeInTheDocument();
    expect(feld()).toHaveValue(`${INHALT} Eigener Zusatz.`);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('weist einen Entwurf auf den Bearbeitungsweg', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    rendern();

    expect(await screen.findByText('Noch ein Entwurf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Korrigierter Eintrag')).toBeNull();
    // Ein erwartbarer Zustand mit dem Weg dorthin, kein Alarm (DOK-12).
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Entwurf bearbeiten' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/abschluss`,
    );
  });

  it('meldet einen Eintrag, der nicht zu diesem Termin gehoert', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...finalisiert, id: NACHTRAG_ID },
      addenda: [],
    });
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });

  it('zeigt einem office-Zugang nichts und fragt nichts ab (4.3)', async () => {
    rendern(['office']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(fetchAppointment).not.toHaveBeenCalled();
  });

  it('zeigt einem reinen owner-Zugang kein Korrekturformular (4.1 gegen 4.2)', async () => {
    rendern(['owner']);

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(screen.queryByLabelText('Korrigierter Eintrag')).toBeNull();
  });
});
