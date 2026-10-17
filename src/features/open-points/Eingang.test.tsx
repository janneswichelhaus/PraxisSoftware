import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { OffenerScan } from '@/features/files/api';
import type { Rueckfragezeile } from '@/features/messages/api';
import type { Patienteneintrag } from '@/features/patients/uebersicht';
import type { CareWithoutConclusion } from './reminders-api';
import type { Urlaubsstand } from '@/features/vacation/api';
import type { WorkingTime } from '@/features/working-time/api';
import type { Overview } from '@/features/reimbursements/api';
import { TIM, testOverview, testReimbursement } from '@/features/reimbursements/testdata';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Offene Punkte als **ein** Eingang (Design-Rollout B5, ANN-450): eine Gruppe
 * nur, wenn sie etwas enthält, das Dringlichste zuerst, und ist alles leer,
 * einmal „Nichts offen" - aber nie, wenn eine Liste nicht geladen werden
 * konnte. Alle Listen sind hier leer gestellt; jeder Test füllt, was er
 * braucht.
 */

const leer = () => Promise.resolve([]);
const fetchRueckfragen = vi.fn<() => Promise<Rueckfragezeile[]>>();
const fetchOffeneScans = vi.fn<() => Promise<OffenerScan[]>>();
const fetchOpenIntakes = vi.fn<() => Promise<unknown[]>>();
const fetchPatientOverview = vi.fn<() => Promise<Patienteneintrag[]>>();
const fetchConsentWithdrawals = vi.fn<() => Promise<unknown[]>>();
const fetchCareWithoutConclusion = vi.fn<() => Promise<CareWithoutConclusion[]>>();

vi.mock('@/features/messages/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRueckfragen: () => fetchRueckfragen(),
}));
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOffeneScans: () => fetchOffeneScans(),
}));
vi.mock('./intake-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOpenIntakes: () => fetchOpenIntakes(),
}));
vi.mock('./reminders-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchEndingPrescriptions: leer,
  fetchCareWithoutConclusion: () => fetchCareWithoutConclusion(),
}));
vi.mock('@/features/patients/uebersicht', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPatientOverview: () => fetchPatientOverview(),
}));
vi.mock('./consent-withdrawals-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchConsentWithdrawals: () => fetchConsentWithdrawals(),
}));
vi.mock('./platform-requests-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPlatformRequests: leer,
}));
vi.mock('./tasks-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTasks: leer,
}));
vi.mock('./call-list-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchCallList: leer,
}));
vi.mock('./training-withdrawals-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTrainingswiderrufe: leer,
}));
vi.mock('./aftercare-cancellations-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAboKuendigungen: leer,
}));
vi.mock('@/features/exercise-plans/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFaellige: () => Promise.resolve({ today: '2026-10-12', plans: [] }),
}));
vi.mock('@/features/waitlist/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchWaitlist: leer,
}));
const fetchUrlaub = vi.fn<() => Promise<Urlaubsstand>>();
vi.mock('@/features/vacation/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchUrlaub: () => fetchUrlaub(),
}));

const fetchWorkingTime = vi.fn<() => Promise<WorkingTime>>();
vi.mock('@/features/working-time/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchWorkingTime: () => fetchWorkingTime(),
}));

const fetchReimbursements = vi.fn<() => Promise<Overview>>();
vi.mock('@/features/reimbursements/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchReimbursements: () => fetchReimbursements(),
}));

/** Die Arbeitszeit ohne offene Anträge (AZ-001). */
const ARBEITSZEIT_LEER: WorkingTime = {
  my_staff_member_id: '55555555-5555-4555-8555-000000000001',
  can_decide: true,
  self_entered: true,
  today: '2026-10-12',
  plan: null,
  own: [],
  to_decide: [],
};

/** Der Urlaub ohne offene Anträge - jeder Test füllt `to_decide`, wenn er sie braucht. */
const URLAUB_LEER: Urlaubsstand = {
  my_staff_member_id: '55555555-5555-4555-8555-000000000001',
  can_decide: true,
  self_entered: true,
  can_manage_entitlements: true,
  federal_state: 'BW',
  balance: null,
  own: [],
  to_decide: [],
  team: [],
  balances: [],
};

const { OpenPointsPage } = await import('./OpenPointsPage');

const ERIKA = '66666666-6666-4666-8666-000000000002';

const RUECKFRAGE: Rueckfragezeile = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  relationship_kind: 'treatment',
  relationship_id: ERIKA,
  patient_id: ERIKA,
  training_relationship_id: null,
  given_name: 'Erika',
  family_name: 'Beispiel',
  topic: 'complaint',
  reference_label: null,
  status: 'open',
  due_on: '2026-10-07',
  overdue: true,
  created_at: '2026-10-05T08:00:00Z',
  last_entry_at: '2026-10-05T08:00:00Z',
  closed_at: null,
  closed_by_side: null,
  entry_count: 1,
  asked_by: 'self',
  representative_name: null,
  can_answer: true,
  record_assigned_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchRueckfragen.mockResolvedValue([]);
  fetchOffeneScans.mockResolvedValue([]);
  fetchOpenIntakes.mockResolvedValue([]);
  fetchPatientOverview.mockResolvedValue([]);
  fetchConsentWithdrawals.mockResolvedValue([]);
  fetchCareWithoutConclusion.mockResolvedValue([]);
  fetchUrlaub.mockResolvedValue(URLAUB_LEER);
  fetchWorkingTime.mockResolvedValue(ARBEITSZEIT_LEER);
  fetchReimbursements.mockResolvedValue(testOverview({ can_decide: true, can_read_all: true }));
});

/** Die Überschriften der sichtbaren Gruppen, in ihrer Reihenfolge. */
function gruppen(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
}

describe('Offene Punkte als ein Eingang (ANN-450)', () => {
  it('sagt einmal „Nichts offen", wenn alles leer ist - ohne leere Abschnitte', async () => {
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    expect(await screen.findByText('Nichts offen')).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(screen.queryByText(/^Kein /)).toBeNull();
    // Leise am Ende: der Rückblick und der Weg zur Anrufliste.
    expect(screen.getByText('Zuletzt erledigt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anrufliste' })).toHaveAttribute(
      'href',
      '/offen/anrufe',
    );
  });

  it('zeigt nur Gruppen mit Einträgen, das Dringlichste zuerst', async () => {
    fetchRueckfragen.mockResolvedValue([RUECKFRAGE]);
    fetchOffeneScans.mockResolvedValue([
      {
        file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        patient_id: ERIKA,
        patient_given_name: 'Erika',
        patient_family_name: 'Beispiel',
        uploaded_at: '2026-10-10T08:00:00.000Z',
        uploaded_by_name: null,
      },
    ]);
    fetchPatientOverview.mockResolvedValue([
      {
        id: ERIKA,
        given_name: 'Erika',
        family_name: 'Beispiel',
        date_of_birth: null,
        email: null,
        phone: null,
        postal_code: null,
        city: null,
        last_visit_on: '2026-02-01',
        next_appointment_at: null,
        open_bases: 1,
        bases_need_appointments: 1,
        bases_need_followup: 0,
        bases_ready: 0,
        bases_in_billing: 0,
        billing_visible: false,
        invoices_issued: null,
        invoices_paid: null,
        outstanding_cents: null,
        invoices_overdue: null,
        reminders_due: null,
      },
    ]);
    // B1 (Zweitreview A): eine Akte ohne jede Behandlung hat keinen
    // Fristanker - sie steht als letzte Gruppe da.
    fetchCareWithoutConclusion.mockResolvedValue([
      {
        patient_id: '66666666-6666-4666-8666-000000000003',
        patient_given_name: 'Max',
        patient_family_name: 'Muster',
        last_appointment_at: null,
        patient_created_at: '2025-11-01T08:00:00.000Z',
      },
    ]);
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');

    await screen.findByRole('heading', { name: 'Rückfragen von der Plattform (1)' });
    await screen.findByRole('heading', { name: 'Akte ohne Behandlung (1)' });
    expect(gruppen()).toEqual([
      'Rückfragen von der Plattform (1)',
      'Verordnungen zu erfassen (1)',
      'Verordnung offen (1)',
      'Akte ohne Behandlung (1)',
    ]);
    expect(screen.queryByText('Nichts offen')).toBeNull();
  });

  it('ein Ladefehler ist nie „nichts offen" - die Gruppe sagt es', async () => {
    fetchOpenIntakes.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    expect(
      await screen.findByText('Die offenen Erstaufnahmen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByText('Nichts offen')).toBeNull();
  });

  it('eine stille Liste bleibt bei einem Fehler still, wie bisher', async () => {
    fetchConsentWithdrawals.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    expect(await screen.findByText('Nichts offen')).toBeInTheDocument();
    await waitFor(() => expect(fetchConsentWithdrawals).toHaveBeenCalledTimes(1));
  });

  it('sagt es, wenn die Arbeitszeitänderungen nicht laden (AZ-001)', async () => {
    fetchWorkingTime.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    const gruppe = (await screen.findByRole('heading', { name: 'Arbeitszeitänderungen' })).closest(
      'section',
    )!;
    expect(
      within(gruppe).getByText('Die Arbeitszeitänderungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('sagt es, wenn die Urlaubsanträge nicht laden, statt still zu fehlen (URL-001)', async () => {
    fetchUrlaub.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    const gruppe = (await screen.findByRole('heading', { name: 'Urlaubsanträge' })).closest(
      'section',
    )!;
    expect(
      within(gruppe).getByText('Die Urlaubsanträge konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('zeigt owner die offenen Urlaubsanträge mit dem Weg zum Entscheiden (URL-001)', async () => {
    fetchUrlaub.mockResolvedValue({
      ...URLAUB_LEER,
      to_decide: [
        {
          id: 'abababab-abab-4bab-8bab-000000000001',
          kind: 'leave',
          refers_to: null,
          staff_member_id: '55555555-5555-4555-8555-000000000002',
          name: 'Anna Beispiel',
          starts_on: '2027-08-02',
          ends_on: '2027-08-13',
          days: 10,
          days_following_year: 0,
          requested_at: '2026-10-12T08:00:00Z',
          balance: {
            year: 2027,
            entitlement: 30,
            carryover: 0,
            approved: 0,
            requested: 10,
            rest: 30,
          },
          team: [],
          appointments: 3,
          exception_days: [],
        },
      ],
    });
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    expect(await screen.findByRole('heading', { name: /Urlaubsanträge/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anna Beispiel/ })).toHaveAttribute(
      'href',
      '/betrieb/urlaub/entscheiden/abababab-abab-4bab-8bab-000000000001?zurueck=%2Foffen',
    );
    expect(fetchUrlaub).toHaveBeenCalledTimes(1);
  });

  it('fragt den Urlaub nur für die ab, die entscheiden', async () => {
    renderWithProviders(<OpenPointsPage user={testUser(['team_lead'])} />, '/offen');
    await screen.findByText('Nichts offen');
    expect(fetchUrlaub).not.toHaveBeenCalled();
  });

  it('zeigt owner offene und auszuzahlende Erstattungen mit dem Weg dorthin (ERS-001)', async () => {
    fetchReimbursements.mockResolvedValue(
      testOverview({
        can_decide: true,
        can_read_all: true,
        to_decide: [testReimbursement()],
        to_pay: [
          {
            ...testReimbursement({
              id: 'erstattung-3',
              staff_member_id: TIM,
              name: 'Tim Teamleitung',
              status: 'approved',
            }),
            iban_masked: 'DE02 •••• 2051',
          },
        ],
      }),
    );
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    expect(await screen.findByRole('heading', { name: 'Erstattungen (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anna Beispiel/ })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/entscheiden/erstattung-1?zurueck=%2Foffen',
    );
    const auszahlen = screen.getByRole('heading', { name: 'Auszuzahlen (1)' }).closest('section')!;
    expect(within(auszahlen).getByText(/DE02 •••• 2051/)).toBeInTheDocument();
    expect(within(auszahlen).getByRole('link', { name: /Tim Teamleitung/ })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/auszahlen/erstattung-3?zurueck=%2Foffen',
    );
    expect(screen.queryByText('Nichts offen')).toBeNull();
    expect(fetchReimbursements).toHaveBeenCalledTimes(1);
  });

  it('sagt es, wenn die Erstattungen nicht laden (ERS-001)', async () => {
    fetchReimbursements.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    const gruppe = (await screen.findByRole('heading', { name: 'Erstattungen' })).closest(
      'section',
    )!;
    expect(
      within(gruppe).getByText('Die Erstattungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByText('Nichts offen')).toBeNull();
  });

  it('fragt die Erstattungen nur für die ab, die entscheiden (ERS-001)', async () => {
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />, '/offen');
    await screen.findByText('Nichts offen');
    expect(fetchReimbursements).not.toHaveBeenCalled();
  });

  it('lädt jede Liste nur einmal, obwohl Seite und Gruppe sie lesen', async () => {
    renderWithProviders(<OpenPointsPage user={testUser(['owner', 'therapist'])} />, '/offen');
    await screen.findByText('Nichts offen');
    expect(fetchOffeneScans).toHaveBeenCalledTimes(1);
    expect(fetchRueckfragen).toHaveBeenCalledTimes(1);
    expect(fetchOpenIntakes).toHaveBeenCalledTimes(1);
  });
});
