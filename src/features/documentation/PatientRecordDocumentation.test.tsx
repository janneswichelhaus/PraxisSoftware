import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const patient: PatientsApi.Patient = testPatient({
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
});

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
    visit_without_treatment: false,
    // Format wie aus einem jsonb-Feld: ISO 8601 mit Offset.
    created_at: '2027-05-12T08:10:00.123456+00:00',
    updated_at: '2027-05-12T09:32:00.654321+00:00',
    finalized_at: '2027-05-12T09:32:00.654321+00:00',
    finalisation_kind: 'manual',
    version_count: 1,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: 'Anna Beispiel',
    ...rest,
  };
}

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
function akteTermin(
  nr: number,
  notes: DokumentationApi.TreatmentNote[],
  rest: Partial<DokumentationApi.PatientTreatmentNotesEntry> = {},
): DokumentationApi.PatientTreatmentNotesEntry {
  return {
    appointment_id: `77777777-7777-4777-8777-${String(nr).padStart(12, '0')}`,
    starts_at: '2027-05-12T07:00:00+00:00',
    ends_at: '2027-05-12T08:00:00+00:00',
    appointment_type: 'practice',
    appointment_status: 'confirmed',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
    notes,
    ...rest,
  };
}

const fetchPatientTreatmentNotesPage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
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

describe('PatientRecordDocumentation (DOK-003, ROL-001)', () => {
  beforeEach(() => {
    fetchPatientTreatmentNotesPage.mockReset();
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
            finalisation_kind: null,
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

  // E15: office liest dieselbe Sicht wie die therapeutischen Rollen
  // (PROJECT_PRINCIPLES.md 4.3, ADR-004 Fassung 2).
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'zeigt %s die Eintraege samt Inhalt, Herkunft und Verlauf',
    async (role) => {
      renderWithProviders(<PatientRecordDocumentation patient={patient} user={testUser([role])} />);

      const abschnitt = await screen.findByRole('region', { name: 'Behandlungsdokumentation' });
      const zeilen = await within(abschnitt).findAllByRole('listitem');
      expect(zeilen).toHaveLength(2);

      expect(zeilen[0]).toHaveTextContent('Mittwoch, 12. Mai 2027');
      expect(zeilen[0]).toHaveTextContent('09:00–10:00 Uhr · Praxis · Anna Beispiel');
      // UX-005e: Ein abgeschlossener Termin ist in der Dokumentation der
      // Regelfall und traegt kein Etikett; ebenso wenig der finalisierte
      // Eintrag - die Herkunftszeile nennt die Finalisierung kurz, ohne die
      // behandelnde Person noch einmal zu nennen.
      expect(zeilen[0]).not.toHaveTextContent('Abgeschlossen');
      expect(zeilen[0]).toHaveTextContent(INHALT);
      expect(within(zeilen[0]!).queryByText('Finalisiert')).not.toBeInTheDocument();
      expect(zeilen[0]).toHaveTextContent('Finalisiert 12.05.2027, 11:32');
      expect(zeilen[0]).not.toHaveTextContent('von Anna Beispiel');
      expect(zeilen[0]).not.toHaveTextContent('Verfasst von');
      expect(zeilen[0]).toHaveTextContent('Nachtrag');
      expect(zeilen[0]).toHaveTextContent(NACHTRAG_INHALT);
      expect(zeilen[0]).toHaveTextContent('noch nicht finalisiert');
      // Eine andere Person als die behandelnde steht dran.
      expect(zeilen[0]).toHaveTextContent('Zuletzt geändert 13.05.2027, 08:15 von Tim Teamleitung');

      // Nur ein Termin, der nicht stattfand, traegt sein Etikett.
      expect(zeilen[1]).toHaveTextContent('Abgesagt');
      expect(zeilen[1]).toHaveTextContent('Keine Dokumentation.');

      expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null);
      expect(screen.queryByText(/werden je Eintrag protokolliert/)).not.toBeInTheDocument();
      expect(screen.queryByText('Neueste zuerst. Geschrieben wird am Termin.')).toBeNull();
    },
  );

  it('nennt die finalisierende Person nur, wenn sie nicht die behandelnde ist (UX-005e)', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      akteTermin(1, [eintrag({ finalized_by_name: 'Tim Teamleitung' })]),
      akteTermin(2, [eintrag({ finalisation_kind: 'automatic', finalized_by_name: null })], {
        starts_at: '2027-05-05T07:00:00+00:00',
        ends_at: '2027-05-05T07:45:00+00:00',
      }),
    ]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const zeilen = await screen.findAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('Finalisiert 12.05.2027, 11:32 von Tim Teamleitung');
    expect(zeilen[1]).toHaveTextContent('Automatisch finalisiert 12.05.2027, 11:32');
    expect(zeilen[1]).not.toHaveTextContent(' von ');
  });

  it('zeigt einen nicht angetroffenen Termin mit Etikett, einen bestaetigten ohne (UX-005e)', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      akteTermin(1, [], { appointment_status: 'no_show' }),
      akteTermin(2, [], { appointment_status: 'confirmed' }),
    ]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const zeilen = await screen.findAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('Nicht angetroffen');
    expect(zeilen[1]).not.toHaveTextContent('Bestätigt');
  });

  it('zeigt office keinen Behandlungsnachweis mehr, sondern die Dokumentation (ROL-001)', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Behandlungsnachweis' })).not.toBeInTheDocument();
  });

  /**
   * Hausbesuch-Szenario 1 (CAL-018). Der Pflichtvermerk steht in der Akte wie
   * am Termin - sie ist der Ort, an dem spaeter jemand nachliest, warum ein
   * Termin ohne erbrachte Behandlung abgerechnet wurde.
   */
  it('zeigt den Pflichtvermerk "ohne Behandlung" auch in der Akte', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      akteTermin(1, [eintrag({ visit_without_treatment: true })], {
        appointment_status: 'documented',
      }),
    ]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    expect(await screen.findByText('Ohne Behandlung')).toBeInTheDocument();
  });

  it('verlinkt den Aenderungsverlauf nur fuer Eintraege mit Versionen und jeden Termin', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const verlauf = await screen.findAllByRole('link', { name: 'Änderungsverlauf' });
    expect(verlauf).toHaveLength(1);
    // Vom Verlauf aus führt der Rückweg wieder in die Akte (DOK-01).
    expect(verlauf[0]).toHaveAttribute(
      'href',
      `/termine/77777777-7777-4777-8777-000000000001/dokumentation/${HAUPT_ID}/verlauf?zurueck=${encodeURIComponent(`/patienten/${PATIENT_ID}/verlauf`)}`,
    );

    // UX-005e: Das Datum ist der Weg zum Termin - keine eigene Zeile „Zum
    // Termin" mehr.
    expect(screen.queryByRole('link', { name: 'Zum Termin' })).not.toBeInTheDocument();
    const termin = screen.getByRole('link', { name: 'Mittwoch, 5. Mai 2027' });
    expect(termin.getAttribute('href')).toMatch(
      /^\/termine\/77777777-7777-4777-8777-000000000002\?zurueck=/,
    );
    expect(screen.getByRole('link', { name: 'Mittwoch, 12. Mai 2027' })).toHaveAttribute(
      'href',
      `/termine/77777777-7777-4777-8777-000000000001?zurueck=${encodeURIComponent(`/patienten/${PATIENT_ID}/verlauf`)}`,
    );
  });

  it('zeigt nur den Entwurf als Etikett, den finalisierten Eintrag ohne (UIK-18, UX-005e)', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const entwurf = await screen.findByText('Entwurf');
    // Kein Rahmen für Bedienbares an einem Etikett.
    expect(entwurf).not.toHaveClass('border-line-strong');
    expect(screen.queryByText('Finalisiert')).not.toBeInTheDocument();
    expect(
      screen.getByText('noch nicht finalisiert · wird automatisch finalisiert'),
    ).toBeInTheDocument();
  });

  it('steht als Abschnitt mit Überschrift im Label-Stil da (UIK-20, TOK-05)', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const abschnitt = await screen.findByRole('region', { name: 'Behandlungsdokumentation' });
    expect(
      within(abschnitt).getByRole('heading', { level: 2, name: 'Behandlungsdokumentation' }),
    ).toHaveClass('tracking-label', 'text-xs');
  });

  it('bietet bei einem Ladefehler einen neuen Versuch an (WRT-01)', async () => {
    fetchPatientTreatmentNotesPage.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(
      screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.'),
    ).toBeInTheDocument();
  });

  it.each([['therapist'], ['office']] as const)(
    'bietet %s in der Akte keine Schreibhandlungen an',
    async (role) => {
      renderWithProviders(<PatientRecordDocumentation patient={patient} user={testUser([role])} />);
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
    },
  );

  it('nennt den leeren Zustand, wenn es keine Termine in der Akte gibt', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
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

  it('rendert fuer ein Patientenkonto keinen Abschnitt und fragt nichts ab', () => {
    const { container } = renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['patient'])} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
  });
});
