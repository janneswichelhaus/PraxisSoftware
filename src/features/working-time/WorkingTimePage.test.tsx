import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders, testUser } from '@/test-utils';
import type * as WorkingTimeApi from './api';
import type * as SchedulingApi from '@/features/scheduling/api';
import { testOpenRequest, testOwnRequest, testWeek, testWorkingTime } from './testdata';
import type * as Datum from '@/lib/datum';
import type * as StaffApi from '@/features/staff/api';

/**
 * Die Seite Arbeitszeit (AZ-001): der eigene Plan heute und - genehmigt - ab
 * wann ein neuer gilt, die eigenen Anträge, für owner die offenen der
 * anderen (ANN-590). Keine Übersicht über alle (§20).
 */

const fetchWorkingTime = vi.fn();
const withdrawRequest = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkingTimeApi>();
  return {
    ...actual,
    fetchWorkingTime: (...a: unknown[]) => fetchWorkingTime(...a) as unknown,
    withdrawRequest: (...a: unknown[]) => withdrawRequest(...a) as unknown,
  };
});
vi.mock('@/features/staff/api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
  fetchAssignableTherapists: () =>
    Promise.resolve([
      { staff_member_id: '55555555-5555-4555-8555-000000000002', display_name: 'Anna Beispiel' },
      {
        staff_member_id: '55555555-5555-4555-8555-000000000004',
        display_name: 'Tim Teamleitung',
      },
    ]),
}));

// Der heutige Tag wird festgehalten, damit die Tests nicht mit der Uhr laufen.
vi.mock('@/lib/datum', async (importOriginal) => ({
  ...(await importOriginal<typeof Datum>()),
  todayInTimeZone: () => '2026-11-12',
}));
vi.mock('@/features/scheduling/api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    fetchWorkingHours: () => Promise.resolve([]),
    fetchWorkingHourExceptions: () => Promise.resolve([]),
  };
});

const { WorkingTimePage } = await import('./WorkingTimePage');

beforeEach(() => {
  fetchWorkingTime.mockReset().mockResolvedValue(testWorkingTime());
  withdrawRequest.mockReset().mockResolvedValue(undefined);
});

describe('WorkingTimePage', () => {
  it('zeigt den eigenen Wochenplan mit Stunden und den Weg zum Antrag', async () => {
    renderWithProviders(<WorkingTimePage user={testUser(['therapist'])} />);
    const plan = await screen.findByRole('heading', { name: 'Mein Wochenplan' });
    expect(plan).toBeInTheDocument();
    expect(screen.getAllByText('08:00–12:00, 13:00–18:00')).toHaveLength(5);
    expect(screen.getByText('45:00 Std.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Änderung beantragen' })).toHaveAttribute(
      'href',
      '/betrieb/arbeitszeit/beantragen',
    );
    await pruefeBarrierefreiheit(document.body);
  });

  it('sagt es, wenn das Konto keinen Mitarbeiterdatensatz hat', async () => {
    fetchWorkingTime.mockResolvedValue(testWorkingTime({ my_staff_member_id: null, plan: null }));
    renderWithProviders(<WorkingTimePage user={testUser(['office'])} />);
    expect(await screen.findByText('Keine eigene Arbeitszeit')).toBeInTheDocument();
    expect(
      screen.getByText('Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Änderung/ })).toBeNull();
  });

  it('nennt einen schon genehmigten künftigen Plan', async () => {
    fetchWorkingTime.mockResolvedValue(
      testWorkingTime({
        plan: {
          has_plan: true,
          current: testWeek(),
          next_from: '2026-12-01',
          next: testWeek({
            6: [{ von: '08:00', bis: '13:00' }],
            5: [{ von: '08:00', bis: '12:00' }],
          }),
        },
      }),
    );
    renderWithProviders(<WorkingTimePage user={testUser(['therapist'])} />);
    expect(
      await screen.findByRole('heading', { name: 'Ab Dienstag, 1. Dezember' }),
    ).toBeInTheDocument();
  });

  it('zeigt eigene Anträge mit Zustand und zieht einen offenen zurück', async () => {
    const user = userEvent.setup();
    fetchWorkingTime.mockResolvedValue(
      testWorkingTime({
        own: [
          testOwnRequest({ message: 'Elternabend' }),
          testOwnRequest({
            id: 'antrag-2',
            status: 'rejected',
            decision_note: 'Dann fehlt die Frühschicht',
          }),
        ],
      }),
    );
    renderWithProviders(<WorkingTimePage user={testUser(['therapist'])} />);
    const liste = await screen.findByRole('heading', { name: 'Meine Anträge (2)' });
    expect(liste).toBeInTheDocument();
    expect(screen.getByText(/Ihr Grund: Elternabend/)).toBeInTheDocument();
    expect(screen.getByText(/Grund der Ablehnung: Dann fehlt die Frühschicht/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zurückziehen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    expect(withdrawRequest).toHaveBeenCalledWith('antrag-1');
  });

  it('zeigt owner die offenen Anträge der anderen', async () => {
    fetchWorkingTime.mockResolvedValue(
      testWorkingTime({ can_decide: true, self_entered: true, to_decide: [testOpenRequest()] }),
    );
    renderWithProviders(<WorkingTimePage user={testUser(['owner'])} />);
    const abschnitt = await screen.findByRole('heading', { name: 'Zu entscheiden (1)' });
    expect(abschnitt).toBeInTheDocument();
    const zeile = screen.getByRole('link', { name: /Anna Beispiel/ });
    expect(zeile).toHaveAttribute('href', '/betrieb/arbeitszeit/entscheiden/antrag-1');
    expect(within(zeile).getByText(/Wochenplan ab Dienstag, 1. Dezember/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Änderung eintragen' })).toBeInTheDocument();
  });

  it('ohne Wochenplan gibt es nichts zu beantragen', async () => {
    fetchWorkingTime.mockResolvedValue(
      testWorkingTime({
        plan: { has_plan: false, current: testWeek(), next_from: null, next: null },
      }),
    );
    renderWithProviders(<WorkingTimePage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Noch kein Wochenplan')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Änderung beantragen' })).toBeNull();
  });

  it('trägt die Planung je Person: Personenwahl, eigene Person vorgewählt (ORG-003)', async () => {
    renderWithProviders(<WorkingTimePage user={testUser(['therapist'])} />);
    const wahl = await screen.findByLabelText('Person');
    expect(wahl).toHaveValue('55555555-5555-4555-8555-000000000002');
    expect(within(wahl).getByRole('option', { name: 'Tim Teamleitung' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mein Wochenplan' })).toBeInTheDocument();
  });

  it('führt zurück zum Antrag, wenn ein Urlaub an abweichenden Zeiten anhielt (URL-001)', async () => {
    renderWithProviders(
      <WorkingTimePage user={testUser(['owner'])} />,
      '/betrieb/arbeitszeit?person=s1&zurueck=%2Fbetrieb%2Furlaub%2Fentscheiden%2Fa1',
    );
    expect(await screen.findByRole('link', { name: '← Zurück zum Antrag' })).toHaveAttribute(
      'href',
      '/betrieb/urlaub/entscheiden/a1',
    );
  });
});
