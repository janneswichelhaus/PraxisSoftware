import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as FleetApi from '@/features/fleet/api';
import { testFlotte } from '@/features/fleet/testdaten';
import type * as ReimbursementsApi from '@/features/reimbursements/api';
import { testOverview, testReimbursement } from '@/features/reimbursements/testdata';
import type * as TimeAccountApi from '@/features/timeaccount/api';
import { testEntry, testTimeAccount } from '@/features/timeaccount/testdata';
import type * as VacationApi from '@/features/vacation/api';
import { testUrlaub } from '@/features/vacation/testdaten';
import type * as WorkingTimeApi from '@/features/working-time/api';
import { testOwnRequest, testWorkingTime } from '@/features/working-time/testdata';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Der Eingang von Organisation (ORG-004): offene Anträge für die, die
 * entscheiden, Räder mit Problem für die, die freigeben, und die eigenen
 * Anträge - mit dem einen Einstieg „Neuer Antrag".
 */

const fetchUrlaub = vi.fn();
const fetchWorkingTime = vi.fn();
const fetchReimbursements = vi.fn();
const fetchTimeAccount = vi.fn();
const fetchFleet = vi.fn<() => Promise<FleetApi.Fleet>>();

vi.mock('@/features/vacation/api', async (importOriginal) => ({
  ...(await importOriginal<typeof VacationApi>()),
  fetchUrlaub: (...a: unknown[]) => fetchUrlaub(...a) as unknown,
}));
vi.mock('@/features/working-time/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkingTimeApi>()),
  fetchWorkingTime: () => fetchWorkingTime() as unknown,
}));
vi.mock('@/features/reimbursements/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ReimbursementsApi>()),
  fetchReimbursements: (...a: unknown[]) => fetchReimbursements(...a) as unknown,
}));
vi.mock('@/features/timeaccount/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TimeAccountApi>()),
  fetchTimeAccount: (...a: unknown[]) => fetchTimeAccount(...a) as unknown,
}));
vi.mock('@/features/fleet/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FleetApi>()),
  fetchFleet: () => fetchFleet(),
}));

const { EingangPage } = await import('./EingangPage');
const { NeuerAntragPage } = await import('./NeuerAntragPage');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchUrlaub.mockReset().mockResolvedValue(testUrlaub());
  fetchWorkingTime.mockReset().mockResolvedValue(testWorkingTime());
  fetchReimbursements.mockReset().mockResolvedValue(testOverview());
  fetchTimeAccount.mockReset().mockResolvedValue(testTimeAccount());
  fetchFleet.mockReset().mockResolvedValue(testFlotte());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EingangPage (ORG-004)', () => {
  it('bietet den einen Einstieg in jeden neuen Antrag und sagt, wenn nichts läuft', async () => {
    renderWithProviders(<EingangPage user={testUser(['therapist'])} />, '/betrieb');
    expect(screen.getByRole('heading', { level: 1, name: 'Eingang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neuer Antrag' })).toHaveAttribute(
      'href',
      '/betrieb/neu',
    );
    expect(await screen.findByText('Keine offenen Anträge')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  it('nennt die eigenen laufenden Anträge und einen zurückgewiesenen Eintrag (BEF-179)', async () => {
    fetchWorkingTime.mockResolvedValue(testWorkingTime({ own: [testOwnRequest()] }));
    fetchReimbursements.mockResolvedValue(
      testOverview({
        person: {
          staff_member_id: '55555555-5555-4555-8555-000000000002',
          name: 'Anna Beispiel',
          account: null,
          reimbursements: [testReimbursement({ status: 'approved' })],
        },
      }),
    );
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        account: {
          staff_member_id: '55555555-5555-4555-8555-000000000002',
          name: 'Anna Beispiel',
          balance_minutes: 0,
          entries: [
            testEntry({
              id: 'kommt',
              kind: 'time_off',
              on_date: '2026-10-20',
              status: 'rejected',
              rejection_note: 'Teamtag',
            }),
            testEntry({
              id: 'vorbei',
              kind: 'time_off',
              on_date: '2026-10-01',
              status: 'rejected',
            }),
          ],
        },
      }),
    );
    renderWithProviders(<EingangPage user={testUser(['therapist'])} />, '/betrieb');
    const liste = await screen.findByRole('heading', { name: 'Meine Anträge (3)' });
    const abschnitt = liste.closest('section')!;
    expect(within(abschnitt).getByRole('link', { name: /Arbeitszeit/ })).toHaveAttribute(
      'href',
      '/betrieb/arbeitszeit',
    );
    expect(within(abschnitt).getByRole('link', { name: /Erstattung/ })).toHaveTextContent(
      'Genehmigt',
    );
    const zurueck = within(abschnitt).getByRole('link', { name: /Freizeitausgleich/ });
    expect(zurueck).toHaveTextContent('Zurückgewiesen');
    expect(zurueck).toHaveTextContent('Grund: Teamtag');
  });

  it('zeigt gesperrte Räder nur denen, die freigeben dürfen', async () => {
    fetchFleet.mockResolvedValue(testFlotte({ can_release: true }));
    renderWithProviders(<EingangPage user={testUser(['team_lead'])} />, '/betrieb');
    const raeder = await screen.findByRole('heading', { name: /^Räder mit Problem/ });
    expect(within(raeder.closest('section')!).getByText('Lastenrad 3')).toBeInTheDocument();
  });

  it('zeigt Rädern ohne Freigaberecht nichts', async () => {
    renderWithProviders(<EingangPage user={testUser(['therapist'])} />, '/betrieb');
    await screen.findByText('Keine offenen Anträge');
    expect(screen.queryByRole('heading', { name: /^Räder mit Problem/ })).toBeNull();
  });
});

describe('NeuerAntragPage (ORG-004)', () => {
  it('führt in jeden geführten Ablauf, mit dem Rückweg hierher', () => {
    renderWithProviders(<NeuerAntragPage user={testUser(['therapist'])} />, '/betrieb/neu');
    expect(screen.getByRole('link', { name: /^Urlaub/ })).toHaveAttribute(
      'href',
      '/betrieb/urlaub/beantragen?zurueck=%2Fbetrieb%2Fneu',
    );
    for (const name of [/^Arbeitszeit ändern/, /^Zeitkonto/, /^Erstattung/, /^Panne melden/]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('bietet der Trainingsbetreuung keine Radflotte an', () => {
    renderWithProviders(<NeuerAntragPage user={testUser(['trainer'])} />, '/betrieb/neu');
    expect(screen.getByRole('link', { name: /^Urlaub/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Panne melden/ })).toBeNull();
  });
});
