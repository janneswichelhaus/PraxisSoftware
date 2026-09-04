import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PatientsApiModule from '@/features/patients/api';
import type * as AppointmentsApiModule from '@/features/appointments/api';
import type * as DokumentationApiModule from '@/features/documentation/api';
import { AuthenticatedRoutes } from './AuthenticatedRoutes';
import { renderWithProviders, testUser } from '@/test-utils';

vi.mock('@/features/audit/api', () => ({
  fetchAuditEvents: () => Promise.resolve({ events: [], totalCount: 0 }),
  fetchOrganizationMembers: () => Promise.resolve([]),
  formatTimestamp: () => '—',
  shortReference: () => '—',
}));
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApiModule>();
  return {
    ...actual,
    fetchAppointment: () => Promise.resolve(null),
    fetchAppointments: () => Promise.resolve([]),
    fetchAssignableTherapists: () => Promise.resolve([]),
    fetchLocations: () => Promise.resolve([]),
  };
});
vi.mock('@/features/documentation/api', async (importOriginal) => ({
  ...(await importOriginal<typeof DokumentationApiModule>()),
  fetchTreatmentDocumentation: () => Promise.resolve({ primary: null, addenda: [] }),
  fetchTreatmentNoteVersions: () => Promise.resolve([]),
}));
vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApiModule>()),
  fetchPatients: () => Promise.resolve([]),
  fetchPatient: () => Promise.resolve(null),
  logPatientRecordView: () => Promise.resolve(),
  fullName: () => '',
  formatDate: () => '—',
  ageInYears: () => null,
}));

const AUDIT = '/praxis/sicherheit/audit';
const NEU = '/patienten/neu';
const BEARBEITEN = '/patienten/66666666-6666-4666-8666-000000000001/bearbeiten';
const TERMIN_NEU = '/patienten/66666666-6666-4666-8666-000000000001/termine/neu';
const TERMIN_DETAIL = '/termine/77777777-7777-4777-8777-000000000001';
const TERMIN_BEARBEITEN = '/termine/77777777-7777-4777-8777-000000000001/bearbeiten';
const KALENDER = '/kalender';
const TERMIN_DOKUMENTATION = '/termine/77777777-7777-4777-8777-000000000001/dokumentation';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const TERMIN_NOTIZ_BEARBEITEN = `${TERMIN_DOKUMENTATION}/${DOKU_ID}/bearbeiten`;
const TERMIN_KORREKTUR = `${TERMIN_DOKUMENTATION}/${DOKU_ID}/korrektur`;
const TERMIN_NACHTRAG = `${TERMIN_DOKUMENTATION}/${DOKU_ID}/nachtrag`;
const TERMIN_VERLAUF = `${TERMIN_DOKUMENTATION}/${DOKU_ID}/verlauf`;

describe('AuthenticatedRoutes', () => {
  it('oeffnet die Auditansicht fuer owner', async () => {
    renderWithProviders(
      <AuthenticatedRoutes user={testUser(['owner'], 'Jannes Test')} onSignOut={vi.fn()} />,
      AUDIT,
    );
    expect(await screen.findByRole('heading', { name: 'Audit' })).toBeInTheDocument();
  });

  it.each([['therapist'], ['team_lead'], ['office'], ['patient']] as const)(
    'leitet %s von der Auditansicht auf die Uebersicht um',
    async (role) => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />,
        AUDIT,
      );
      expect(screen.queryByRole('heading', { name: 'Audit' })).toBeNull();
      expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
    },
  );

  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'oeffnet das Anlageformular fuer %s',
    async (role) => {
      renderWithProviders(<AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />, NEU);
      expect(await screen.findByRole('heading', { name: 'Neue:r Patient:in' })).toBeInTheDocument();
    },
  );

  it('leitet ein Patientenkonto vom Anlageformular auf die Uebersicht um', async () => {
    renderWithProviders(
      <AuthenticatedRoutes user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()} />,
      NEU,
    );
    expect(screen.queryByRole('heading', { name: 'Neue:r Patient:in' })).toBeNull();
    expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
  });

  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'oeffnet das Bearbeitungsformular fuer %s',
    async (role) => {
      // fetchPatient ist gemockt und liefert null - entscheidend ist hier
      // allein, dass die Route ueberhaupt gemountet wird.
      renderWithProviders(
        <AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />,
        BEARBEITEN,
      );
      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    },
  );

  it('leitet ein Patientenkonto vom Bearbeitungsformular auf die Uebersicht um', async () => {
    renderWithProviders(
      <AuthenticatedRoutes user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()} />,
      BEARBEITEN,
    );
    expect(screen.queryByText('Nicht gefunden')).toBeNull();
    expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
  });

  it('blendet den Sicherheitsbereich fuer Nicht-owner aus der Navigation aus', () => {
    renderWithProviders(
      <AuthenticatedRoutes user={testUser(['therapist', 'team_lead'])} onSignOut={vi.fn()} />,
    );
    expect(screen.queryByRole('link', { name: 'Sicherheit' })).toBeNull();
  });

  it('zeigt owner den Sicherheitsbereich in der Navigation', () => {
    renderWithProviders(
      <AuthenticatedRoutes user={testUser(['owner'], 'Jannes Test')} onSignOut={vi.fn()} />,
    );
    expect(screen.getAllByRole('link', { name: 'Sicherheit' }).length).toBeGreaterThan(0);
  });

  describe('Terminrouten', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'oeffnet %s die Terminanlage',
      async (role) => {
        renderWithProviders(
          <AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />,
          TERMIN_NEU,
        );
        // fetchPatient liefert im Mock null - die Route greift trotzdem.
        expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
      },
    );

    it('leitet ein Patientenkonto von der Terminanlage auf die Uebersicht um', async () => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser(['patient'])} onSignOut={vi.fn()} />,
        TERMIN_NEU,
      );
      expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
    });

    it('leitet ein Patientenkonto von der Termindetailansicht auf die Uebersicht um', async () => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser(['patient'])} onSignOut={vi.fn()} />,
        TERMIN_DETAIL,
      );
      expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
    });

    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'oeffnet %s den Kalender',
      async (role) => {
        renderWithProviders(
          <AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />,
          KALENDER,
        );
        expect(await screen.findByRole('heading', { name: 'Kalender' })).toBeInTheDocument();
      },
    );

    it.each([[TERMIN_BEARBEITEN], [KALENDER]])(
      'leitet ein Patientenkonto von %s auf die Uebersicht um',
      async (pfad) => {
        renderWithProviders(
          <AuthenticatedRoutes user={testUser(['patient'])} onSignOut={vi.fn()} />,
          pfad,
        );
        expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
      },
    );

    it('oeffnet die Terminbearbeitung fuer eine berechtigte Rolle', async () => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser(['office'])} onSignOut={vi.fn()} />,
        TERMIN_BEARBEITEN,
      );
      // Der Termin ist im Mock nicht auffindbar - die Route greift trotzdem.
      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    });
  });

  describe('Dokumentationsroute (DOK-001)', () => {
    it.each([['therapist'], ['team_lead']] as const)(
      'oeffnet %s den Entwurf der Behandlungsdokumentation',
      async (role) => {
        renderWithProviders(
          <AuthenticatedRoutes user={testUser([role])} onSignOut={vi.fn()} />,
          TERMIN_DOKUMENTATION,
        );
        // fetchAppointment liefert im Mock null - entscheidend ist, dass die
        // Route ueberhaupt gemountet wird.
        expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
      },
    );

    it.each([['office'], ['owner'], ['patient']] as const)(
      'leitet %s von der Dokumentationsroute auf die Uebersicht um',
      async (role) => {
        renderWithProviders(
          <AuthenticatedRoutes user={testUser([role], 'Olivia Office')} onSignOut={vi.fn()} />,
          TERMIN_DOKUMENTATION,
        );
        expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
      },
    );
  });

  describe('Korrektur, Nachtrag und Verlauf (DOK-002)', () => {
    it.each([
      ['bearbeiten', TERMIN_NOTIZ_BEARBEITEN],
      ['korrektur', TERMIN_KORREKTUR],
      ['nachtrag', TERMIN_NACHTRAG],
      ['verlauf', TERMIN_VERLAUF],
    ])('oeffnet therapeutischen Rollen die Route %s', async (_name, pfad) => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser(['therapist'])} onSignOut={vi.fn()} />,
        pfad,
      );
      // fetchAppointment liefert im Mock null - entscheidend ist, dass die
      // Route ueberhaupt gemountet wird.
      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    });

    it.each([
      ['office', TERMIN_NOTIZ_BEARBEITEN],
      ['office', TERMIN_KORREKTUR],
      ['office', TERMIN_NACHTRAG],
      ['office', TERMIN_VERLAUF],
      ['patient', TERMIN_VERLAUF],
      ['owner', TERMIN_KORREKTUR],
      ['owner', TERMIN_NACHTRAG],
    ] as const)('leitet %s von %s auf die Uebersicht um', async (role, pfad) => {
      renderWithProviders(
        <AuthenticatedRoutes user={testUser([role], 'Olivia Office')} onSignOut={vi.fn()} />,
        pfad,
      );
      expect(await screen.findByRole('heading', { name: /Guten/ })).toBeInTheDocument();
    });

    it('oeffnet owner den Aenderungsverlauf (ADR-016 Punkt 8)', async () => {
      // Die Praxisleitung liest die Akte, ohne selbst zu dokumentieren
      // (PROJECT_PRINCIPLES.md 4.1 gegenueber 4.2).
      renderWithProviders(
        <AuthenticatedRoutes user={testUser(['owner'], 'Jannes Test')} onSignOut={vi.fn()} />,
        TERMIN_VERLAUF,
      );
      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    });
  });
});
