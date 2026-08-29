import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PatientsApiModule from '@/features/patients/api';
import { AuthenticatedRoutes } from './AuthenticatedRoutes';
import { renderWithProviders, testUser } from '@/test-utils';

vi.mock('@/features/audit/api', () => ({
  fetchAuditEvents: () => Promise.resolve({ events: [], totalCount: 0 }),
  fetchOrganizationMembers: () => Promise.resolve([]),
  formatTimestamp: () => '—',
  shortReference: () => '—',
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
});
