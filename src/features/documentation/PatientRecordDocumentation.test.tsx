import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import { renderWithProviders, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const patient: PatientsApi.Patient = {
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Berta',
  family_name: 'Bestand',
  date_of_birth: '1985-07-19',
  email: null,
  phone: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
};

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
function termin(
  nr: number,
  rest: Partial<DokumentationApi.TreatmentEvidenceEntry> = {},
): DokumentationApi.TreatmentEvidenceEntry {
  const id = `77777777-7777-4777-8777-${String(nr).padStart(12, '0')}`;
  return {
    appointment_id: id,
    starts_at: '2027-05-12T07:00:00+00:00',
    ends_at: '2027-05-12T08:00:00+00:00',
    appointment_type: 'practice',
    appointment_status: 'scheduled',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
    documentation_status: 'none',
    documented_at: null,
    ...rest,
  };
}

/** Synthetischer Inhalt - keine Zeile stammt aus einem realen Behandlungsfall. */
const INHALT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';
const NACHTRAG_INHALT = 'Synthetisch: Heimprogramm nachgereicht.';

const HAUPT_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';

function eintrag(
  rest: Partial<DokumentationApi.TreatmentNote> = {},
): DokumentationApi.TreatmentNote {
  return {
    id: HAUPT_ID,
    appointment_id: '77777777-7777-4777-8777-000000000001',
    addendum_to_note_id: null,
    status: 'final',
    content: INHALT,
    // Format wie aus einem jsonb-Feld: ISO 8601 mit Offset.
    created_at: '2027-05-12T08:10:00.123456+00:00',
    updated_at: '2027-05-12T09:32:00.654321+00:00',
    finalized_at: '2027-05-12T09:32:00.654321+00:00',
    version_count: 1,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: 'Anna Beispiel',
    ...rest,
  };
}

function akteTermin(
  nr: number,
  notes: DokumentationApi.TreatmentNote[],
  rest: Partial<DokumentationApi.PatientTreatmentNotesEntry> = {},
): DokumentationApi.PatientTreatmentNotesEntry {
  const basis = termin(nr);
  return {
    appointment_id: basis.appointment_id,
    starts_at: basis.starts_at,
    ends_at: basis.ends_at,
    appointment_type: basis.appointment_type,
    appointment_status: basis.appointment_status,
    staff_given_name: basis.staff_given_name,
    staff_family_name: basis.staff_family_name,
    organization_time_zone: basis.organization_time_zone,
    notes,
    ...rest,
  };
}

const fetchTreatmentEvidencePage = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentEvidencePage: (patientId: string, cursor: DokumentationApi.AkteCursor | null) =>
      fetchTreatmentEvidencePage(patientId, cursor) as Promise<
        DokumentationApi.TreatmentEvidenceEntry[]
      >,
    fetchPatientTreatmentNotesPage: (
      patientId: string,
      cursor: DokumentationApi.AkteCursor | null,
    ) =>
      fetchPatientTreatmentNotesPage(patientId, cursor) as Promise<
        DokumentationApi.PatientTreatmentNotesEntry[]
      >,
  };
});

const { PatientRecordDocumentation } = await import('./PatientRecordDocumentation');
const { AKTE_SEITENGROESSE } = await import('./api');

describe('PatientRecordDocumentation: Behandlungsnachweis (DOK-003)', () => {
  beforeEach(() => {
    fetchTreatmentEvidencePage.mockReset();
    fetchPatientTreatmentNotesPage.mockReset();
    fetchPatientTreatmentNotesPage.mockRejectedValue(new Error('darf office nicht anfragen'));
    fetchTreatmentEvidencePage.mockResolvedValue([
      termin(1, {
        appointment_status: 'completed',
        documentation_status: 'final',
        documented_at: '2027-05-12T09:32:00+00:00',
      }),
      termin(2, {
        starts_at: '2027-05-05T07:00:00+00:00',
        ends_at: '2027-05-05T07:45:00+00:00',
        appointment_type: 'home_visit',
        staff_given_name: 'Tim',
        staff_family_name: 'Teamleitung',
        documentation_status: 'draft',
      }),
      termin(3, {
        starts_at: '2027-04-28T07:00:00+00:00',
        ends_at: '2027-04-28T07:45:00+00:00',
        appointment_status: 'cancelled',
      }),
    ]);
  });

  it('zeigt office je Termin Datum, Zeit, Person, Status und Dokumentationsstand - ohne Inhalt', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    const abschnitt = await screen.findByRole('region', { name: 'Behandlungsnachweis' });
    const zeilen = await within(abschnitt).findAllByRole('listitem');
    expect(zeilen).toHaveLength(3);

    expect(zeilen[0]).toHaveTextContent('Mittwoch, 12. Mai 2027');
    expect(zeilen[0]).toHaveTextContent('09:00–10:00 Uhr · Praxis · Anna Beispiel');
    expect(zeilen[0]).toHaveTextContent('Abgeschlossen');
    expect(zeilen[0]).toHaveTextContent(
      'Dokumentation finalisiert am Mittwoch, 12. Mai 2027, 11:32 Uhr.',
    );

    expect(zeilen[1]).toHaveTextContent('Hausbesuch · Tim Teamleitung');
    expect(zeilen[1]).toHaveTextContent(
      'Dokumentation als Entwurf vorhanden, noch nicht finalisiert.',
    );

    expect(zeilen[2]).toHaveTextContent('Abgesagt');
    expect(zeilen[2]).toHaveTextContent('Keine Dokumentation.');

    expect(fetchTreatmentEvidencePage).toHaveBeenCalledWith(PATIENT_ID, null);
    // Die Verwaltung startet keinen Aufruf, der ohnehin abgewiesen wuerde -
    // und damit auch keinen Auditeintrag fuer einen abgewiesenen Zugriff.
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
  });

  it('verlinkt jeden Termin', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    const links = await screen.findAllByRole('link', { name: 'Zum Termin' });
    expect(links[0]).toHaveAttribute('href', '/termine/77777777-7777-4777-8777-000000000001');
    expect(links).toHaveLength(3);
  });

  it('nennt den leeren Zustand, wenn es keine Termine in der Akte gibt', async () => {
    fetchTreatmentEvidencePage.mockResolvedValue([]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('Für diese Person gibt es noch keine Termine in der Akte.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchTreatmentEvidencePage.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('Der Behandlungsnachweis konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('laedt eine weitere Seite ueber den Cursor der letzten Zeile', async () => {
    const user = userEvent.setup();
    const ersteSeite = Array.from({ length: AKTE_SEITENGROESSE }, (_, i) =>
      termin(i + 1, { starts_at: `2027-03-${String(28 - i).padStart(2, '0')}T07:00:00+00:00` }),
    );
    fetchTreatmentEvidencePage.mockResolvedValueOnce(ersteSeite);
    fetchTreatmentEvidencePage.mockResolvedValueOnce([
      termin(99, { starts_at: '2027-02-01T07:00:00+00:00' }),
    ]);

    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Ältere Termine anzeigen' }));

    const letzte = ersteSeite[ersteSeite.length - 1]!;
    await waitFor(() =>
      expect(fetchTreatmentEvidencePage).toHaveBeenLastCalledWith(PATIENT_ID, {
        beforeStartsAt: letzte.starts_at,
        beforeId: letzte.appointment_id,
      }),
    );

    const abschnitt = screen.getByRole('region', { name: 'Behandlungsnachweis' });
    await waitFor(() =>
      expect(within(abschnitt).getAllByRole('listitem')).toHaveLength(AKTE_SEITENGROESSE + 1),
    );
    // Die zweite Seite war nicht voll: es gibt keine weitere.
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('bietet nach einer nicht vollen Seite keine weitere an', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('rendert fuer ein Patientenkonto keinen Abschnitt und fragt nichts ab', () => {
    const { container } = renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['patient'])} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled();
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
  });
});

describe('PatientRecordDocumentation: klinische Sicht (DOK-003)', () => {
  beforeEach(() => {
    fetchTreatmentEvidencePage.mockReset();
    fetchPatientTreatmentNotesPage.mockReset();
    fetchTreatmentEvidencePage.mockRejectedValue(
      new Error('klinische Rollen fragen den Nachweis nicht an'),
    );
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      akteTermin(
        1,
        [
          eintrag(),
          eintrag({
            id: NACHTRAG_ID,
            addendum_to_note_id: HAUPT_ID,
            status: 'draft',
            content: NACHTRAG_INHALT,
            finalized_at: null,
            finalized_by_name: null,
            version_count: 0,
            author_name: 'Tim Teamleitung',
            last_editor_name: 'Tim Teamleitung',
            updated_at: '2027-05-13T06:15:00+00:00',
          }),
        ],
        { appointment_status: 'completed' },
      ),
      akteTermin(2, [], {
        starts_at: '2027-05-05T07:00:00+00:00',
        ends_at: '2027-05-05T07:45:00+00:00',
        appointment_status: 'cancelled',
      }),
    ]);
  });

  it.each([['owner'], ['therapist'], ['team_lead']] as const)(
    'zeigt %s die Eintraege samt Inhalt, Herkunft und Verlauf',
    async (role) => {
      renderWithProviders(<PatientRecordDocumentation patient={patient} user={testUser([role])} />);

      const abschnitt = await screen.findByRole('region', { name: 'Behandlungsdokumentation' });
      const zeilen = await within(abschnitt).findAllByRole('listitem');
      expect(zeilen).toHaveLength(2);

      expect(zeilen[0]).toHaveTextContent('Mittwoch, 12. Mai 2027');
      expect(zeilen[0]).toHaveTextContent('09:00–10:00 Uhr · Praxis · Anna Beispiel');
      expect(zeilen[0]).toHaveTextContent('Abgeschlossen');
      expect(zeilen[0]).toHaveTextContent(INHALT);
      expect(zeilen[0]).toHaveTextContent('Finalisiert');
      expect(zeilen[0]).toHaveTextContent(
        'Verfasst von Anna Beispiel. Finalisiert am Mittwoch, 12. Mai 2027, 11:32 Uhr von Anna Beispiel.',
      );
      expect(zeilen[0]).toHaveTextContent('Nachtrag');
      expect(zeilen[0]).toHaveTextContent(NACHTRAG_INHALT);
      expect(zeilen[0]).toHaveTextContent('noch nicht finalisiert');
      expect(zeilen[0]).toHaveTextContent(
        'Zuletzt geändert am Donnerstag, 13. Mai 2027, 08:15 Uhr von Tim Teamleitung.',
      );

      expect(zeilen[1]).toHaveTextContent('Abgesagt');
      expect(zeilen[1]).toHaveTextContent('Keine Dokumentation.');

      expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null);
      expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled();
    },
  );

  it('verlinkt den Aenderungsverlauf nur fuer Eintraege mit Versionen und jeden Termin', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const verlauf = await screen.findAllByRole('link', { name: 'Änderungsverlauf' });
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0]).toHaveAttribute(
      'href',
      `/termine/77777777-7777-4777-8777-000000000001/dokumentation/${HAUPT_ID}/verlauf`,
    );

    const termine = screen.getAllByRole('link', { name: 'Zum Termin' });
    expect(termine).toHaveLength(2);
    expect(termine[1]).toHaveAttribute('href', '/termine/77777777-7777-4777-8777-000000000002');
  });

  it('bietet in der Akte keine Schreibhandlungen an', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );
    await screen.findByText(INHALT);

    for (const name of [
      'Finalisieren',
      'Korrigieren',
      'Nachtrag hinzufügen',
      'Dokumentation bearbeiten',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('zeigt einem Zugang mit office- und therapist-Rolle die klinische Sicht', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office', 'therapist'])} />,
    );

    expect(
      await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Behandlungsnachweis' })).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientTreatmentNotesPage.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['owner'])} />,
    );

    expect(
      await screen.findByText('Die Behandlungsdokumentation konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('laedt eine weitere Seite ueber den Cursor der letzten Zeile', async () => {
    const user = userEvent.setup();
    const ersteSeite = Array.from({ length: AKTE_SEITENGROESSE }, (_, i) =>
      akteTermin(i + 1, [], {
        starts_at: `2027-03-${String(28 - i).padStart(2, '0')}T07:00:00+00:00`,
      }),
    );
    fetchPatientTreatmentNotesPage.mockResolvedValueOnce(ersteSeite);
    fetchPatientTreatmentNotesPage.mockResolvedValueOnce([]);

    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Ältere Termine anzeigen' }));

    const letzte = ersteSeite[ersteSeite.length - 1]!;
    await waitFor(() =>
      expect(fetchPatientTreatmentNotesPage).toHaveBeenLastCalledWith(PATIENT_ID, {
        beforeStartsAt: letzte.starts_at,
        beforeId: letzte.appointment_id,
      }),
    );
    // Die volle Seite war die letzte: die leere Folgeseite beendet das Blaettern.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(AKTE_SEITENGROESSE);
  });
});
