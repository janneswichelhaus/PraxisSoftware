import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as PatientsApi from './api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as VerordnungenApi from '@/features/treatment-bases/api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const aktiv: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1985-07-19',
});

const fetchPatient = vi.fn();
const logPatientRecordView = vi.fn();
const fetchUpcomingAppointments = vi.fn();
const fetchPatientAppointments = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    logPatientRecordView: (id: string) => logPatientRecordView(id) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchUpcomingAppointments: (patientId: string, limit?: number) =>
      fetchUpcomingAppointments(patientId, limit) as Promise<AppointmentsApi.UpcomingAppointment[]>,
    fetchPatientAppointments: (patientId: string, query: unknown) =>
      fetchPatientAppointments(patientId, query) as Promise<AppointmentsApi.PatientAppointment[]>,
  };
});

vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof VerordnungenApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: (id: string) =>
      fetchPatientTreatmentBases(id) as Promise<VerordnungenApi.TreatmentBasis[]>,
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<VerordnungenApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<VerordnungenApi.TreatmentBasisKontingent[]>,
  };
});

vi.mock('@/features/documentation/api', async (importOriginal) => {
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

const { AkteEinstieg, PatientRecordLayout } = await import('./PatientRecordLayout');
const { PatientMasterDataPage } = await import('./PatientMasterDataPage');
const { PatientAppointmentsPage } = await import('@/features/appointments/PatientAppointmentsPage');
const { PatientTreatmentBasesPage } =
  await import('@/features/treatment-bases/PatientTreatmentBasesPage');
const { PatientCoursePage } = await import('@/features/documentation/PatientCoursePage');

/**
 * Die Akte wird als Routenbaum gerendert und nicht als einzelne Komponente:
 * Der Rahmen und seine Bereiche sind genau das - eine verschachtelte Route -,
 * und der Bereichswechsel ist das, was hier zu prüfen ist.
 */
function akteRendern(roles: RoleKey[], pfad = `/patienten/${PATIENT_ID}`) {
  return renderWithProviders(
    <Routes>
      <Route path="/patienten/:patientId" element={<PatientRecordLayout user={testUser(roles)} />}>
        <Route index element={<AkteEinstieg />} />
        <Route path="termine" element={<PatientAppointmentsPage />} />
        <Route path="verordnungen" element={<PatientTreatmentBasesPage />} />
        <Route path="verlauf" element={<PatientCoursePage />} />
        <Route path="stammdaten" element={<PatientMasterDataPage />} />
      </Route>
    </Routes>,
    pfad,
  );
}

describe('Rahmen der Patientenakte (AKTE-000)', () => {
  beforeEach(() => {
    for (const mock of [
      fetchPatient,
      logPatientRecordView,
      fetchUpcomingAppointments,
      fetchPatientAppointments,
      fetchPatientTreatmentBases,
      fetchPatientTreatmentBasesClinical,
      fetchPatientTreatmentBasisSlots,
      fetchPatientTreatmentNotesPage,
    ]) {
      mock.mockReset();
    }
    fetchPatient.mockResolvedValue(aktiv);
    logPatientRecordView.mockResolvedValue(undefined);
    fetchUpcomingAppointments.mockResolvedValue([]);
    fetchPatientAppointments.mockResolvedValue([]);
    fetchPatientTreatmentBases.mockResolvedValue([]);
    fetchPatientTreatmentBasesClinical.mockResolvedValue([]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
  });

  describe('Kopf der Akte', () => {
    it('nennt Name, Geburtsdatum und Versorgungsstatus', async () => {
      akteRendern(['office']);

      expect(await screen.findByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      // Das Alter haengt am heutigen Tag - geprueft wird die Form, nicht die
      // Zahl, damit der Test nicht an einem Geburtstag rot wird.
      expect(screen.getByText(/^geb\. 19\.07\.1985 · \d+ Jahre$/)).toBeInTheDocument();
      expect(screen.getByText('In Versorgung')).toBeInTheDocument();
    });

    it('kennzeichnet eine nicht laufende Versorgung', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office']);

      expect(await screen.findByText('Nicht in laufender Versorgung')).toBeInTheDocument();
      expect(screen.queryByText('In Versorgung')).not.toBeInTheDocument();
    });

    it('nennt den Abschluss der Versorgung im Kopf', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, care_concluded_on: '2026-03-12' });
      akteRendern(['therapist']);

      expect(await screen.findByText('Versorgung abgeschlossen am 12.03.2026')).toBeInTheDocument();
    });

    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s den Termin aus dem Kopf heraus an',
      async (role) => {
        akteRendern([role]);

        const link = await screen.findByRole('link', { name: 'Termin anlegen' });
        expect(link).toHaveAttribute('href', `/patienten/${PATIENT_ID}/termine/neu`);
      },
    );

    it('bietet fuer eine:n inaktive:n Patient:in keinen Termin an', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    });

    it('bietet das Erfassen einer Verordnung nur den therapeutischen Rollen an', async () => {
      akteRendern(['therapist']);
      expect(await screen.findByRole('link', { name: 'Grundlage erfassen' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/verordnungen/neu`,
      );
    });

    it('zeigt office im Kopf kein Erfassen einer Verordnung', async () => {
      akteRendern(['office']);
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      // Im Kopf nicht - im Verordnungsbereich prueft das dessen eigener Test.
      expect(screen.queryByRole('link', { name: 'Grundlage erfassen' })).not.toBeInTheDocument();
    });
  });

  describe('Bereichsnavigation', () => {
    it('fuehrt alle sechs Bereiche fuer eine therapeutische Rolle', async () => {
      akteRendern(['therapist']);

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      const eintraege = screen.getAllByRole('link').filter((link) => navigation.contains(link));
      // "Dateien" ist seit DAT-001 dabei und steht vor den Stammdaten: "was
      // liegt uns vor" wird im Gespraech haeufiger gebraucht als eine Adresse.
      // "Datenschutz" (PAT-006) steht dazwischen: Aufnahme und Rueckfrage.
      expect(eintraege.map((link) => link.textContent)).toEqual([
        'Termine',
        'Behandlungsgrundlagen',
        'Behandlungsverlauf',
        'Dateien',
        'Datenschutz',
        'Stammdaten',
      ]);
    });

    // UI-002a: Der Bereich ist samt seiner Schaltflaeche weg - nicht nur
    // versteckt. Ein Auszug aus den vier anderen Bereichen kostete bei jedem
    // Aufruf der Akte einen Tap, bevor etwas zu tun war.
    it('fuehrt keinen Bereich "Uebersicht" mehr', async () => {
      akteRendern(['therapist']);

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      expect(
        screen.queryAllByRole('link', { name: 'Übersicht' }).filter((l) => navigation.contains(l)),
      ).toEqual([]);
    });

    it('laesst einem Patientenkonto nur die Stammdaten', async () => {
      akteRendern(['patient']);

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      const eintraege = screen.getAllByRole('link').filter((link) => navigation.contains(link));
      expect(eintraege.map((link) => link.textContent)).toEqual(['Stammdaten']);
    });

    it('wechselt den Bereich, ohne die Akte neu zu laden', async () => {
      const user = userEvent.setup();
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await user.click(screen.getByRole('link', { name: 'Stammdaten' }));

      expect(await screen.findByText('Kontakt')).toBeInTheDocument();
      // Der Kopf bleibt stehen - er gehoert dem Rahmen, nicht dem Bereich.
      expect(screen.getByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(fetchPatient).toHaveBeenCalledTimes(1);
    });

    it('protokolliert den Aktenzugriff einmal je geoeffneter Akte', async () => {
      const user = userEvent.setup();
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await user.click(screen.getByRole('link', { name: 'Stammdaten' }));
      await screen.findByText('Kontakt');

      expect(logPatientRecordView).toHaveBeenCalledTimes(1);
      expect(logPatientRecordView).toHaveBeenCalledWith(PATIENT_ID);
    });

    it('protokolliert erst bei sichtbarem Datensatz', async () => {
      fetchPatient.mockResolvedValue(null);
      akteRendern(['office']);

      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
      expect(logPatientRecordView).not.toHaveBeenCalled();
    });
  });

  describe('Einstieg in die Akte (UI-002a)', () => {
    it('fuehrt von /patienten/:id in die Termine', async () => {
      akteRendern(['office']);

      expect(await screen.findByRole('heading', { name: 'Kommende Termine' })).toBeInTheDocument();
      await waitFor(() => expect(fetchPatientAppointments).toHaveBeenCalled());
    });

    it('fuehrt ein Patientenkonto in die Stammdaten', async () => {
      akteRendern(['patient']);

      expect(await screen.findByText('Kontakt')).toBeInTheDocument();
    });

    // Der Rueckweg der Akte steht in den Suchparametern (UX-012). Ginge er
    // beim Weiterleiten verloren, waere er genau beim Oeffnen weg.
    it('nimmt den Rueckweg mit', async () => {
      akteRendern(['office'], `/patienten/${PATIENT_ID}?zurueck=%2Fkalender%3Fansicht%3Dtag`);

      const zurueck = await screen.findByRole('link', { name: /Zurück/ });
      expect(zurueck).toHaveAttribute('href', '/kalender?ansicht=tag');
    });
  });

  describe('Hinweise vor dem Hausbesuch im Kopf (UI-002a)', () => {
    it('nennt Zugang und Besonderheit, wenn sie hinterlegt sind', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: 'Klingel defekt, bitte anrufen',
        special_note: 'Hund im Flur',
      });
      akteRendern(['therapist']);

      expect(await screen.findByText('Klingel defekt, bitte anrufen')).toBeInTheDocument();
      expect(screen.getByText('Hund im Flur')).toBeInTheDocument();
    });

    it('laesst den Kopf leer, wenn nichts hinterlegt ist', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: null,
        special_note: null,
      });
      akteRendern(['therapist']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.queryByText('Zugang:')).not.toBeInTheDocument();
      expect(screen.queryByText('Besonderheit:')).not.toBeInTheDocument();
    });
  });

  describe('Bereiche hinter ihren Adressen', () => {
    it('zeigt office im Verlauf die Behandlungsdokumentation (E15, ROL-001)', async () => {
      akteRendern(['office'], `/patienten/${PATIENT_ID}/verlauf`);

      expect(
        await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null),
      );
    });

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'zeigt %s im Verlauf die Behandlungsdokumentation',
      async (role) => {
        akteRendern([role], `/patienten/${PATIENT_ID}/verlauf`);

        expect(
          await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('region', { name: 'Behandlungsnachweis' }),
        ).not.toBeInTheDocument();
      },
    );

    it('holt die Dokumentation erst, wenn der Verlauf geoeffnet ist', async () => {
      akteRendern(['therapist']);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      // Der Einstieg fuehrt in die Termine, nicht in den Verlauf: Jeder
      // gelesene Eintrag der klinischen Sicht wird protokolliert (ADR-010) -
      // ein Auditeintrag fuer etwas, das niemand sieht, waere falsch.
      expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
    });
  });
});
