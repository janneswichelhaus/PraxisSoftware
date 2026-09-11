import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
const termin: AppointmentsApi.Appointment = {
  id: TERMIN_ID,
  patient_id: '66666666-6666-4666-8666-000000000001',
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  location_id: '33333333-3333-4333-8333-000000000001',
  appointment_type: 'practice',
  status: 'confirmed',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-01T10:00:00.000000+00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  completed_at: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

/** Synthetischer Inhalt - keine Zeile stammt aus einem realen Behandlungsfall. */
const INHALT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';
const NACHTRAG_INHALT = 'Synthetisch: Heimprogramm nachgereicht.';

const STAND = '2027-05-12T08:30:00.654321+00:00';

const doku: DokumentationApi.TreatmentNote = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: INHALT,
  // Format wie von PostgREST geliefert: ISO 8601 mit Mikrosekunden und Offset.
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: STAND,
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Tim Teamleitung',
  finalized_by_name: null,
};

const finalisiert: DokumentationApi.TreatmentNote = {
  ...doku,
  status: 'final',
  finalized_at: '2027-05-12T09:00:00.000000+00:00',
  finalisation_kind: 'manual',
  version_count: 1,
  finalized_by_name: 'Tim Teamleitung',
};

const nachtrag: DokumentationApi.TreatmentNote = {
  ...doku,
  id: NACHTRAG_ID,
  addendum_to_note_id: DOKU_ID,
  content: NACHTRAG_INHALT,
};

const fetchTreatmentDocumentation = vi.fn();
const finalizeTreatmentNote = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
    finalizeTreatmentNote: (noteId: string, stand: string) =>
      finalizeTreatmentNote(noteId, stand) as Promise<void>,
  };
});

const { TreatmentNoteSection } = await import('./TreatmentNoteSection');

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  ueberschreiben: Partial<AppointmentsApi.Appointment> = {},
) {
  return renderWithProviders(
    <TreatmentNoteSection appointment={{ ...termin, ...ueberschreiben }} user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}`,
  );
}

describe('TreatmentNoteSection', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    finalizeTreatmentNote.mockResolvedValue(undefined);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
  });

  it('zeigt den Entwurf mit Zustand, Urheberschaft und Aenderungszeitpunkt', async () => {
    rendern();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getByText(/noch nicht finalisiert/)).toBeInTheDocument();
    // 08:30 UTC ist 10:30 Ortszeit in Europe/Berlin.
    expect(
      screen.getByText(
        /Verfasst von Anna Beispiel\. Zuletzt geändert am Mittwoch, 12\. Mai 2027, 10:30 Uhr von Tim Teamleitung\./,
      ),
    ).toBeInTheDocument();
  });

  it('bietet therapeutischen Rollen das Bearbeiten an', async () => {
    rendern(['therapist']);

    const link = await screen.findByRole('link', { name: 'Dokumentation bearbeiten' });
    expect(link).toHaveAttribute('href', `/termine/${TERMIN_ID}/dokumentation`);
  });

  it('zeigt owner den Inhalt, aber keine Schaltflaeche zum Schreiben', async () => {
    rendern(['owner']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
  });

  it('fragt fuer office gar nicht erst ab und zeigt nichts an', async () => {
    const { container } = rendern(['office']);

    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(INHALT)).toBeNull();
  });

  it('zeigt Patientenkonten nichts an', async () => {
    const { container } = rendern(['patient']);

    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('bietet ohne vorhandene Dokumentation das Anlegen an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist']);

    expect(
      await screen.findByText(
        'Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Dokumentation anlegen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation`,
    );
  });

  it('bietet zu einem abgesagten Termin kein Anlegen an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist'], { status: 'cancelled' });

    expect(
      await screen.findByText(
        'Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokumentation anlegen' })).toBeNull();
  });

  it('zeigt eine vorhandene Dokumentation auch bei abgesagtem Termin weiter an', async () => {
    // Ein einmal geschriebener Text darf nicht verschwinden, nur weil der
    // Termin nachtraeglich abgesagt wurde (PROJECT_PRINCIPLES.md 13).
    rendern(['therapist'], { status: 'cancelled' });

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
  });

  it('meldet einen Ladefehler verstaendlich', async () => {
    fetchTreatmentDocumentation.mockRejectedValue(new Error('kaputt'));
    rendern(['therapist']);

    expect(
      await screen.findByText('Die Behandlungsdokumentation konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});

describe('TreatmentNoteSection: Finalisierung (DOK-002)', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    finalizeTreatmentNote.mockResolvedValue(undefined);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
  });

  it('finalisiert nicht auf den ersten Klick, sondern fragt nach', async () => {
    const user = userEvent.setup();
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));

    expect(screen.getByRole('group', { name: 'Dokumentation finalisieren' })).toBeInTheDocument();
    expect(finalizeTreatmentNote).not.toHaveBeenCalled();
  });

  it('uebergibt bei der Bestaetigung den gelesenen Stand (ADR-001)', async () => {
    const user = userEvent.setup();
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));
    await user.click(screen.getByRole('button', { name: 'Ja, jetzt finalisieren' }));

    await waitFor(() => {
      expect(finalizeTreatmentNote).toHaveBeenCalledWith(DOKU_ID, STAND);
    });
  });

  it('meldet einen Konflikt, ohne den Eintrag zu veraendern', async () => {
    const user = userEvent.setup();
    finalizeTreatmentNote.mockRejectedValue(new Error('Zwischenzeitlich geändert.'));
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));
    await user.click(screen.getByRole('button', { name: 'Ja, jetzt finalisieren' }));

    expect(await screen.findByText('Nicht finalisiert')).toBeInTheDocument();
    expect(screen.getByText('Zwischenzeitlich geändert.')).toBeInTheDocument();
  });

  it('bietet einem Entwurf noch keinen Aenderungsverlauf an', async () => {
    rendern(['therapist']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Änderungsverlauf' })).toBeNull();
  });
});

describe('TreatmentNoteSection: finalisierter Eintrag (DOK-002)', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
  });

  it('zeigt Zustand und Finalisierung statt der letzten Aenderung', async () => {
    rendern(['therapist']);

    expect(await screen.findByText('Finalisiert')).toBeInTheDocument();
    expect(
      screen.getByText(/Finalisiert am Mittwoch, 12\. Mai 2027, 11:00 Uhr von Tim Teamleitung\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/noch nicht finalisiert/)).toBeNull();
  });

  it('nennt eine automatische Finalisierung als solche - ohne erfundene Person (DOK-004)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: {
        ...finalisiert,
        finalisation_kind: 'automatic',
        finalized_by_name: null,
      },
      addenda: [],
    });
    rendern(['therapist']);

    expect(
      await screen.findByText(
        /Automatisch finalisiert am Mittwoch, 12\. Mai 2027, 11:00 Uhr nach Ablauf der Frist\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Uhr von /)).toBeNull();
    // Korrektur und Nachtrag stehen wie nach jeder Finalisierung offen.
    expect(screen.getByRole('link', { name: 'Korrigieren' })).toBeInTheDocument();
  });

  it('bietet statt des Entwurfsweges die Korrektur an', async () => {
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Korrigieren' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/korrektur`,
    );
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
  });

  it('bietet den Nachtrag erst nach der Finalisierung an (ADR-016 Punkt 6)', async () => {
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Nachtrag hinzufügen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag`,
    );
  });

  it('zeigt owner den Verlauf, aber weder Korrektur noch Nachtrag (Punkt 8)', async () => {
    rendern(['owner']);

    expect(await screen.findByRole('link', { name: 'Änderungsverlauf' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/verlauf`,
    );
    expect(screen.queryByRole('link', { name: 'Korrigieren' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nachtrag hinzufügen' })).toBeNull();
  });

  it('weist auf mehrere Versionen hin, sobald korrigiert wurde', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...finalisiert, version_count: 2 },
      addenda: [],
    });
    rendern(['therapist']);

    expect(await screen.findByText(/2 Versionen/)).toBeInTheDocument();
  });

  it('zeigt einen Nachtrag als eigenen Eintrag neben dem Ursprung', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: finalisiert,
      addenda: [nachtrag],
    });
    rendern(['therapist']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.getByText(NACHTRAG_INHALT)).toBeInTheDocument();
    expect(screen.getByText('Nachtrag')).toBeInTheDocument();
    // Der Nachtrag ist selbst ein Entwurf und wird gesondert finalisiert.
    expect(screen.getByRole('button', { name: 'Finalisieren' })).toBeInTheDocument();
  });

  it('laesst einen Nachtrag im Entwurf noch bearbeiten', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: finalisiert,
      addenda: [nachtrag],
    });
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Nachtrag bearbeiten' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NACHTRAG_ID}/bearbeiten`,
    );
  });
});
