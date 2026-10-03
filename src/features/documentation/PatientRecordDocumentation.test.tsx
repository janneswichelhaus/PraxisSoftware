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
    // Ein Tag Frist: Ein Entwurf vom 12.05. wird am 13.05. festgeschrieben.
    fetchDocumentationDeadline: () => Promise.resolve(1),
  };
});

const { PatientRecordDocumentation } = await import('./PatientRecordDocumentation');
const { AKTE_SEITENGROESSE } = await import('./api');

/**
 * Öffnet das Lese-Fenster eines Termins über seine Zeile (Akte entschlacken,
 * 2026-10-03): Die Liste zeigt Datum und zwei Zeilen Text, der Rest steht im
 * Fenster.
 */
async function fensterOeffnen(datum: string): Promise<HTMLElement> {
  const knopf = (await screen.findAllByRole('button')).find((b) => b.textContent?.includes(datum));
  if (!knopf) throw new Error(`Keine Zeile für ${datum}`);
  await userEvent.click(knopf);
  return screen.findByRole('dialog', { name: datum });
}

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

  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'zeigt %s die Eintraege als Zeilen und im Lese-Fenster samt Herkunft',
    async (role) => {
      renderWithProviders(<PatientRecordDocumentation patient={patient} user={testUser([role])} />);

      const abschnitt = await screen.findByRole('region', { name: 'Behandlungsdokumentation' });
      const zeilen = await within(abschnitt).findAllByRole('listitem');
      expect(zeilen).toHaveLength(2);

      // Die Zeile: Datum, Zeit · behandelnde Person, der Eintrag gekürzt.
      expect(zeilen[0]).toHaveTextContent('12.05.2027');
      expect(zeilen[0]).toHaveTextContent('09:00–10:00 Uhr · Anna Beispiel');
      expect(zeilen[0]).not.toHaveTextContent('Abgeschlossen');
      expect(zeilen[0]).toHaveTextContent(INHALT);
      // Nur ein Termin, der nicht stattfand, traegt sein Etikett.
      expect(zeilen[1]).toHaveTextContent('Abgesagt');
      expect(zeilen[1]).toHaveTextContent('Keine Dokumentation.');
      expect(abschnitt).toHaveTextContent('2 Einträge');

      // Im Fenster: Etikett, Herkunft, Nachtrag (Design-Handoff, Abschnitt 7).
      const fenster = await fensterOeffnen('12.05.2027');
      expect(fenster).toHaveTextContent('09:00–10:00 Uhr · Praxis · Anna Beispiel');
      expect(within(fenster).getByText('Version 1')).toBeInTheDocument();
      expect(fenster).toHaveTextContent('Finalisiert 12.05.2027, 11:32');
      expect(fenster).not.toHaveTextContent('von Anna Beispiel');
      expect(fenster).not.toHaveTextContent('Verfasst von');
      expect(fenster).toHaveTextContent('Nachtrag');
      expect(fenster).toHaveTextContent(NACHTRAG_INHALT);
      expect(fenster).toHaveTextContent('wird am 13.05. automatisch festgeschrieben');
      expect(fenster).toHaveTextContent('Zuletzt geändert 13.05.2027, 08:15 von Tim Teamleitung');

      expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null);
      expect(screen.queryByText(/werden je Eintrag protokolliert/)).not.toBeInTheDocument();
      // Der eine Satz vor dem Lesen bleibt (Design-Handoff 2026-10-01, Abschnitt 1).
      expect(screen.getByText('Das Öffnen der Akte wird protokolliert.')).toBeInTheDocument();
    },
  );

  // AKTE-008: Der vorausgewählte Termin steht oben als „Dieser Termin"; die
  // Liste darunter nennt ihn nicht ein zweites Mal.
  it('laesst den oben gezeigten Termin in der Liste aus', async () => {
    renderWithProviders(
      <PatientRecordDocumentation
        patient={patient}
        user={testUser(['therapist'])}
        ohneTermin="77777777-7777-4777-8777-000000000001"
      />,
    );
    const abschnitt = await screen.findByRole('region', { name: 'Behandlungsdokumentation' });
    const zeilen = await within(abschnitt).findAllByRole('listitem');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toHaveTextContent('Abgesagt');
    expect(abschnitt).not.toHaveTextContent(INHALT);
  });

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

    const erstes = await fensterOeffnen('12.05.2027');
    expect(erstes).toHaveTextContent('Finalisiert 12.05.2027, 11:32 von Tim Teamleitung');
    await userEvent.click(within(erstes).getByRole('button', { name: 'Schließen' }));
    const zweites = await fensterOeffnen('05.05.2027');
    expect(zweites).toHaveTextContent('Automatisch finalisiert 12.05.2027, 11:32');
    expect(zweites).not.toHaveTextContent(' von ');
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

    const fenster = await fensterOeffnen('12.05.2027');
    expect(within(fenster).getByText('Ohne Behandlung')).toBeInTheDocument();
  });

  it('verlinkt den Aenderungsverlauf nur fuer Eintraege mit Versionen', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const fenster = await fensterOeffnen('12.05.2027');
    const verlauf = within(fenster).getAllByRole('link', { name: 'Änderungsverlauf' });
    expect(verlauf).toHaveLength(1);
    // Vom Verlauf aus führt der Rückweg wieder in die Akte (DOK-01).
    expect(verlauf[0]).toHaveAttribute(
      'href',
      `/termine/77777777-7777-4777-8777-000000000001/dokumentation/${HAUPT_ID}/verlauf?zurueck=${encodeURIComponent(`/patienten/${PATIENT_ID}/doku`)}`,
    );

    // Das Datum ist der Kopf der Karte, kein Weg mehr: Ein Termin hat keine
    // eigene Seite (Akte entschlacken, 2026-10-03).
    expect(screen.queryByRole('link', { name: 'Zum Termin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '05.05.2027' })).toBeNull();
    expect(screen.queryByRole('link', { name: '12.05.2027' })).toBeNull();
  });

  it('kennzeichnet Entwurf mit Frist und festgeschriebene Version als Etikett (UIK-18, Abschnitt 7)', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const fenster = await fensterOeffnen('12.05.2027');
    const entwurf = within(fenster).getByText('Entwurf · Frist 13.05.');
    // Kein Rahmen für Bedienbares an einem Etikett; Zeichen und Wort (UIK-18).
    expect(entwurf).not.toHaveClass('border-line-strong');
    expect(entwurf).toHaveTextContent('!');
    expect(within(fenster).getByText('Version 1')).toHaveTextContent('✓');
  });

  it('gruppiert nach Monat und springt ab zwei Monaten über Chips (Abschnitt 7)', async () => {
    const [erster] = (await fetchPatientTreatmentNotesPage.getMockImplementation()?.(
      patient.id,
      null,
    )) as DokumentationApi.PatientTreatmentNotesEntry[];
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      erster!,
      {
        ...erster!,
        appointment_id: 'april',
        starts_at: '2027-04-20T07:00:00.000Z',
        ends_at: '2027-04-20T08:00:00.000Z',
        notes: [],
      },
    ]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );

    const leiste = await screen.findByRole('navigation', { name: 'Springen zu' });
    expect(within(leiste).getByRole('link', { name: 'Mai 2027' })).toHaveAttribute(
      'href',
      '#monat-2027-05',
    );
    expect(within(leiste).getByRole('link', { name: 'April 2027' })).toHaveAttribute(
      'href',
      '#monat-2027-04',
    );
    expect(within(leiste).queryByText('Springen zu')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Mai 2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'April 2027' })).toBeInTheDocument();
    // Kein Schreibknopf in der Liste: geschrieben wird auf der Schreibseite.
    expect(screen.queryByRole('link', { name: /Behandlungsnotiz|^Doku/ })).toBeNull();
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

  it('bietet office in der Akte keine Schreibhandlungen an', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );
    await fensterOeffnen('12.05.2027');

    for (const name of ['Finalisieren', 'Korrigieren', 'Nachtrag hinzufügen', 'Weiterschreiben']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  // Seit der Termin keine eigene Seite mehr hat (Akte entschlacken,
  // 2026-10-03), stehen Nachtrag und Korrektur am festgeschriebenen Eintrag in
  // der Akte (ADR-016 Punkt 6). Geschrieben wird weiter auf den Schreibseiten.
  it('bietet therapist am festgeschriebenen Eintrag Nachtrag und Korrektur an', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['therapist'])} />,
    );
    const fenster = await fensterOeffnen('12.05.2027');

    const zurueck = encodeURIComponent(`/patienten/${PATIENT_ID}/doku`);
    const korrektur = screen
      .getAllByRole('link', { name: 'Korrigieren' })[0]!
      .getAttribute('href')!;
    expect(korrektur).toContain('/korrektur?zurueck=');
    expect(korrektur.endsWith(`zurueck=${zurueck}`)).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Nachtrag hinzufügen' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).not.toBeInTheDocument();
    // Der Nachtrag im Entwurf wird auf der Schreibseite weiterbearbeitet.
    expect(within(fenster).getByRole('link', { name: 'Nachtrag bearbeiten' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/dokumentation/${NACHTRAG_ID}/bearbeiten?zurueck=`),
    );
  });

  it('nennt den leeren Zustand, wenn es keine Termine in der Akte gibt', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(await screen.findByText('Noch kein Eintrag.')).toBeInTheDocument();
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
