import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const aktiv: PatientsApi.Patient = {
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
};

const fetchPatient = vi.fn();
const setPatientStatus = vi.fn();
const logPatientRecordView = vi.fn();
const fetchTreatmentEvidencePage = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    setPatientStatus: (id: string, status: string) => setPatientStatus(id, status) as Promise<void>,
    logPatientRecordView: (id: string) => logPatientRecordView(id) as Promise<void>,
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
    logPatientRecordView.mockReset();
    fetchTreatmentEvidencePage.mockReset();
    fetchPatientTreatmentNotesPage.mockReset();
    fetchPatient.mockResolvedValue(aktiv);
    setPatientStatus.mockResolvedValue(undefined);
    logPatientRecordView.mockResolvedValue(undefined);
    fetchTreatmentEvidencePage.mockResolvedValue([]);
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
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
});
