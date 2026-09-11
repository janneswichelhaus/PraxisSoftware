import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as VerordnungenApi from '@/features/prescriptions/api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const aktiv: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1985-07-19',
  email: 'max.mustermann@example.invalid',
  phone: '0221 1234567',
  street: 'Musterweg',
  house_number: '12b',
  postal_code: '50667',
  city: 'Köln',
});

const fetchPatient = vi.fn();
const setPatientStatus = vi.fn();
const concludePatientCare = vi.fn();
const reopenPatientCare = vi.fn();
const logPatientRecordView = vi.fn();
const fetchPatientPrescriptions = vi.fn();
const fetchPatientPrescriptionsClinical = vi.fn();
const fetchTreatmentEvidencePage = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();
const fetchUpcomingAppointments = vi.fn();

// Kuenftige Termine kommen ueber einen eigenen Lesepfad (UX-006); hier zaehlt
// nur, dass der Abschnitt rollenabhaengig da ist.
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchUpcomingAppointments: (patientId: string, limit?: number) =>
      fetchUpcomingAppointments(patientId, limit) as Promise<AppointmentsApi.UpcomingAppointment[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    setPatientStatus: (id: string, status: string) => setPatientStatus(id, status) as Promise<void>,
    concludePatientCare: (id: string, tag?: string) =>
      concludePatientCare(id, tag) as Promise<void>,
    reopenPatientCare: (id: string) => reopenPatientCare(id) as Promise<void>,
    logPatientRecordView: (id: string) => logPatientRecordView(id) as Promise<void>,
  };
});

// Verordnungen kommen ueber eigene, rollenabhaengig projizierte Lesepfade
// (VER-002). Hier zaehlt nur, dass der Abschnitt da ist; seine Darstellung hat
// eigene Tests in features/prescriptions.
vi.mock('@/features/prescriptions/api', async (importOriginal) => {
  const actual = await importOriginal<typeof VerordnungenApi>();
  return {
    ...actual,
    fetchPatientPrescriptions: (patientId: string) =>
      fetchPatientPrescriptions(patientId) as Promise<VerordnungenApi.Prescription[]>,
    fetchPatientPrescriptionsClinical: (patientId: string) =>
      fetchPatientPrescriptionsClinical(patientId) as Promise<
        VerordnungenApi.ClinicalPrescription[]
      >,
  };
});

// Die Akte holt ihre Dokumentation ueber eigene Lesepfade (DOK-003). Hier
// zaehlt nur, dass der Abschnitt rollenabhaengig da ist; seine Darstellung hat
// eigene Tests in features/documentation.
vi.mock('@/features/documentation/api', async (importOriginal) => {
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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useParams: () => ({ patientId: PATIENT_ID }) };
});

const { PatientDetailPage } = await import('./PatientDetailPage');

describe('PatientDetailPage', () => {
  beforeEach(() => {
    fetchPatient.mockReset();
    setPatientStatus.mockReset();
    concludePatientCare.mockReset();
    reopenPatientCare.mockReset();
    concludePatientCare.mockResolvedValue(undefined);
    reopenPatientCare.mockResolvedValue(undefined);
    logPatientRecordView.mockReset();
    fetchTreatmentEvidencePage.mockReset();
    fetchPatientTreatmentNotesPage.mockReset();
    fetchPatient.mockResolvedValue(aktiv);
    setPatientStatus.mockResolvedValue(undefined);
    logPatientRecordView.mockResolvedValue(undefined);
    fetchTreatmentEvidencePage.mockResolvedValue([]);
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
    fetchPatientPrescriptions.mockReset();
    fetchPatientPrescriptionsClinical.mockReset();
    fetchPatientPrescriptions.mockResolvedValue([]);
    fetchPatientPrescriptionsClinical.mockResolvedValue([]);
    fetchUpcomingAppointments.mockReset();
    fetchUpcomingAppointments.mockResolvedValue([]);
  });

  // Wer die Kartei lesen darf, darf die Stammdaten auch aendern - dieselbe
  // Rollenmenge wie app.can_update_patient(). Ein Negativfall waere hier
  // erfunden; verbindlich ist ohnehin die Pruefung in update_patient.
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'bietet %s die Bearbeitung der Stammdaten an',
    async (role) => {
      renderWithProviders(<PatientDetailPage user={testUser([role])} />);

      const link = await screen.findByRole('link', { name: 'Stammdaten bearbeiten' });
      expect(link).toHaveAttribute('href', `/patienten/${PATIENT_ID}/bearbeiten`);
    },
  );

  it.each([['owner'], ['team_lead'], ['office']] as const)(
    'zeigt %s die Statusaktion',
    async (role) => {
      renderWithProviders(<PatientDetailPage user={testUser([role])} />);
      expect(
        await screen.findByRole('button', { name: 'Als inaktiv markieren' }),
      ).toBeInTheDocument();
    },
  );

  it('blendet die Statusaktion fuer therapist aus, obwohl die Akte lesbar ist', async () => {
    renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

    // Die Akte ist da - nur der Verwaltungsvorgang nicht.
    expect(await screen.findByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Als inaktiv markieren' })).not.toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv markieren' }));
    expect(setPatientStatus).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
    await user.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'inactive'));
  });

  it('verwirft die Rueckfrage bei Abbrechen ohne Schreibvorgang', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv markieren' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(setPatientStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).not.toBeInTheDocument();
  });

  it('bietet einem inaktiven Datensatz die Reaktivierung an', async () => {
    const user = userEvent.setup();
    fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Wieder als aktiv führen' }));
    const buttons = screen.getAllByRole('button', { name: 'Wieder als aktiv führen' });
    await user.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'active'));
  });

  it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
    const user = userEvent.setup();
    let aufloesen: () => void = () => undefined;
    setPatientStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          aufloesen = resolve;
        }),
    );

    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);
    await user.click(await screen.findByRole('button', { name: 'Als inaktiv markieren' }));
    const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
    await user.click(buttons[buttons.length - 1]!);

    const laufend = await screen.findByRole('button', { name: 'Wird geändert …' });
    await user.click(laufend);

    expect(setPatientStatus).toHaveBeenCalledTimes(1);

    aufloesen();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Wird geändert …' })).not.toBeInTheDocument(),
    );
    expect(setPatientStatus).toHaveBeenCalledTimes(1);
  });

  it('meldet einen fehlgeschlagenen Statuswechsel ohne interne Details', async () => {
    const user = userEvent.setup();
    setPatientStatus.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv markieren' }));
    const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
    await user.click(buttons[buttons.length - 1]!);

    expect(
      await screen.findByText('Der Versorgungsstatus konnte nicht geändert werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('protokolliert den Aktenzugriff erst bei sichtbarem Datensatz', async () => {
    fetchPatient.mockResolvedValue(null);
    renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(logPatientRecordView).not.toHaveBeenCalled();
  });

  describe('Dokumentation in der Akte (DOK-003)', () => {
    it('zeigt office den Behandlungsnachweis', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

      expect(
        await screen.findByRole('region', { name: 'Behandlungsnachweis' }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(fetchTreatmentEvidencePage).toHaveBeenCalledWith(PATIENT_ID, null),
      );
    });

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'zeigt %s die Behandlungsdokumentation statt des Nachweises',
      async (role) => {
        renderWithProviders(<PatientDetailPage user={testUser([role])} />);

        expect(
          await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('region', { name: 'Behandlungsnachweis' }),
        ).not.toBeInTheDocument();
        await waitFor(() =>
          expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null),
        );
        expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled();
      },
    );

    it('zeigt einem Patientenkonto keinen Dokumentationsabschnitt', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['patient'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.queryByRole('region', { name: 'Behandlungsnachweis' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Behandlungsdokumentation' }),
      ).not.toBeInTheDocument();
      expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled();
      expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
    });
  });

  describe('Einstieg in die Terminanlage', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s die Aktion "Termin anlegen" an',
      async (role) => {
        renderWithProviders(<PatientDetailPage user={testUser([role])} />);

        const link = await screen.findByRole('link', { name: 'Termin anlegen' });
        expect(link).toHaveAttribute('href', `/patienten/${PATIENT_ID}/termine/neu`);
      },
    );

    it('blendet die Aktion fuer ein Patientenkonto aus', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['patient'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    });

    it('bietet fuer eine:n inaktive:n Patient:in keinen Termin an', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    });
  });
  describe('Hausbesuch und Versorgung (PAT-005)', () => {
    it('zeigt Zugangshinweis, Besonderheit und feste Therapeut:in', async () => {
      fetchPatient.mockResolvedValue(
        testPatient({
          id: PATIENT_ID,
          home_visit_access_note: '2. OG links, Klingel "Mustermann".',
          special_note: 'Hund im Flur.',
          primary_therapist_name: 'Anna Beispiel',
          remark: 'Bevorzugt Vormittage.',
        }),
      );
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.getByText('2. OG links, Klingel "Mustermann".')).toBeInTheDocument();
      expect(screen.getByText('Hund im Flur.')).toBeInTheDocument();
      expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
      expect(screen.getByText('Bevorzugt Vormittage.')).toBeInTheDocument();
    });

    it('laesst den Abschnitt weg, wenn die Sicht nichts liefert', async () => {
      // Fuer ein Patientenkonto sind die internen Angaben serverseitig leer
      // (ANN-010). Die Oberflaeche zeigt dann keinen leeren Abschnitt.
      fetchPatient.mockResolvedValue(testPatient({ id: PATIENT_ID }));
      renderWithProviders(<PatientDetailPage user={testUser(['patient'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.queryByText('Hausbesuch und Versorgung')).not.toBeInTheDocument();
    });

    it('bietet die Mobilnummer als Anruf an', async () => {
      fetchPatient.mockResolvedValue(
        testPatient({ id: PATIENT_ID, phone_mobile: '+49 160 0000005' }),
      );
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.getByRole('link', { name: '+49 160 0000005' })).toHaveAttribute(
        'href',
        'tel:+491600000005',
      );
    });
  });
  describe('Verordnungen in der Akte (VER-002)', () => {
    it('holt fuer eine therapeutische Rolle die klinische Sicht', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);
      await screen.findByRole('heading', { name: 'Verordnungen' });

      expect(fetchPatientPrescriptionsClinical).toHaveBeenCalledWith(PATIENT_ID);
      expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
    });

    it('holt fuer office die organisatorische Sicht', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Verordnungen' });

      expect(fetchPatientPrescriptions).toHaveBeenCalledWith(PATIENT_ID);
      expect(fetchPatientPrescriptionsClinical).not.toHaveBeenCalled();
    });

    it('zeigt einem Patientenkonto keinen Abschnitt Verordnungen', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['patient'])} />);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      expect(screen.queryByRole('heading', { name: 'Verordnungen' })).not.toBeInTheDocument();
      expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
      expect(fetchPatientPrescriptionsClinical).not.toHaveBeenCalled();
    });
  });

  describe('UX-006: Naechste Termine', () => {
    const naechster: AppointmentsApi.UpcomingAppointment = {
      id: '77777777-7777-4777-8777-000000000001',
      starts_at: '2027-05-19T07:00:00.000Z',
      ends_at: '2027-05-19T08:00:00.000Z',
      appointment_type: 'home_visit',
      status: 'scheduled',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      organization_time_zone: 'Europe/Berlin',
    };

    it('zeigt den naechsten Termin mit Datum, Zeit und behandelnder Person', async () => {
      fetchUpcomingAppointments.mockResolvedValue([naechster]);
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      expect(await screen.findByRole('heading', { name: 'Nächste Termine' })).toBeInTheDocument();
      expect(await screen.findByText(/19\. Mai 2027/)).toBeInTheDocument();
      expect(screen.getByText(/09:00–10:00 Uhr · Hausbesuch · Anna Beispiel/)).toBeInTheDocument();
    });

    it('fuehrt vom Eintrag zum Termin', async () => {
      fetchUpcomingAppointments.mockResolvedValue([naechster]);
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      const link = await screen.findByRole('link', { name: /19\. Mai 2027/ });
      expect(link).toHaveAttribute('href', `/termine/${naechster.id}`);
    });

    it('sagt es als Text, wenn nichts vereinbart ist', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);
      expect(await screen.findByText('Kein weiterer Termin vereinbart.')).toBeInTheDocument();
    });

    it('fuehrt keinen zweiten Weg "Termin anlegen" neben dem der Akte', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Nächste Termine' });

      expect(screen.getAllByRole('link', { name: 'Termin anlegen' })).toHaveLength(1);
    });

    it('fragt fuer ein Patientenkonto gar nicht erst', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['patient'], 'Max Mustermann')} />);
      await waitFor(() => expect(fetchPatient).toHaveBeenCalled());
      expect(fetchUpcomingAppointments).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Nächste Termine' })).toBeNull();
    });
  });
  // ---------------------------------------------------------------------------
  // Abschluss der Versorgung (LOE-001b)
  //
  // Der Vorgang startet die zehnjaehrige Aufbewahrung nach ADR-008. Geprueft
  // wird deshalb dreierlei: der Rollenschnitt (ohne office), dass nichts ohne
  // Rueckfrage geschrieben wird, und dass der Zustand als Text dasteht - nicht
  // nur als Abwesenheit einer Schaltflaeche.
  // ---------------------------------------------------------------------------
  describe('Abschluss der Versorgung', () => {
    const abgeschlossen = {
      ...aktiv,
      care_concluded_on: '2026-03-12',
      care_concluded_at: '2026-03-12T10:00:00Z',
    };

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'bietet %s den Abschluss an',
      async (role) => {
        renderWithProviders(<PatientDetailPage user={testUser([role])} />);
        expect(
          await screen.findByRole('button', { name: 'Versorgung abschließen' }),
        ).toBeInTheDocument();
      },
    );

    it('bietet office den Abschluss nicht an', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['office'])} />);

      expect(await screen.findByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Versorgung abschließen' }),
      ).not.toBeInTheDocument();
    });

    it('nennt die laufende Versorgung als Text', async () => {
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);
      expect(await screen.findByText('Laufende Versorgung')).toBeInTheDocument();
    });

    it('nennt Abschlusstag und Ende der Aufbewahrung als Text', async () => {
      fetchPatient.mockResolvedValue(abgeschlossen);
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      expect(await screen.findByText(/12\.03\.2026 — Aufbewahrung bis 2036/)).toBeInTheDocument();
    });

    it('schreibt erst nach der Rueckfrage und mit dem gewaehlten Tag', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      await user.click(await screen.findByRole('button', { name: 'Versorgung abschließen' }));
      expect(concludePatientCare).not.toHaveBeenCalled();

      const feld = screen.getByLabelText('Letzter Behandlungstag');
      await user.clear(feld);
      await user.type(feld, '2026-09-01');

      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() =>
        expect(concludePatientCare).toHaveBeenCalledWith(PATIENT_ID, '2026-09-01'),
      );
    });

    it('bietet einem abgeschlossenen Fall die Ruecknahme an', async () => {
      const user = userEvent.setup();
      fetchPatient.mockResolvedValue(abgeschlossen);
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      await user.click(await screen.findByRole('button', { name: 'Abschluss zurücknehmen' }));
      const buttons = screen.getAllByRole('button', { name: 'Abschluss zurücknehmen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(reopenPatientCare).toHaveBeenCalledWith(PATIENT_ID));
      expect(concludePatientCare).not.toHaveBeenCalled();
    });

    it('meldet einen Fehler, ohne Erfolg vorzutaeuschen', async () => {
      const user = userEvent.setup();
      concludePatientCare.mockRejectedValue(new Error('abgelehnt'));
      renderWithProviders(<PatientDetailPage user={testUser(['therapist'])} />);

      await user.click(await screen.findByRole('button', { name: 'Versorgung abschließen' }));
      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      expect(await screen.findByRole('alert')).toHaveTextContent(/konnte nicht gespeichert werden/);
    });
  });
});
