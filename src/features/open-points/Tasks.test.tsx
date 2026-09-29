import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TasksApi from './tasks-api';
import type * as StaffApi from '@/features/staff/api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTasks = vi.fn();
const createTask = vi.fn();
const updateTask = vi.fn();
const setTaskDone = vi.fn();
const deleteTask = vi.fn();
const fetchStaffMembers = vi.fn();

vi.mock('./tasks-api', async (importOriginal) => {
  const actual = await importOriginal<typeof TasksApi>();
  return {
    ...actual,
    fetchTasks: (status: string) => fetchTasks(status) as Promise<TasksApi.Task[]>,
    createTask: (eingabe: TasksApi.TaskInput) => createTask(eingabe) as Promise<string>,
    updateTask: (id: string, eingabe: TasksApi.TaskInput) =>
      updateTask(id, eingabe) as Promise<void>,
    setTaskDone: (id: string, done: boolean) => setTaskDone(id, done) as Promise<void>,
    deleteTask: (id: string) => deleteTask(id) as Promise<void>,
  };
});

vi.mock('@/features/staff/api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMembers: () => fetchStaffMembers() as Promise<StaffApi.StaffMember[]>,
  };
});

// Die Seite liest den Fetch der Akte nur für den Namen der gewählten Person.
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOffeneScans: () => Promise.resolve([]),
}));

const { OpenPointsPage } = await import('./OpenPointsPage');
const { isOverdue } = await import('./tasks-api');

const HEUTE = '2026-09-29';

function aufgabe(rest: Partial<TasksApi.Task> = {}): TasksApi.Task {
  return {
    id: 't1',
    title: 'Verordnung nachfordern',
    note: null,
    due_on: '2026-09-30',
    status: 'open',
    patient_id: '66666666-6666-4666-8666-000000000001',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    assigned_staff_member_id: 'anna',
    assigned_name: 'Anna Beispiel',
    created_at: '2026-09-20T08:00:00.000Z',
    created_by_name: 'Olivia Office',
    done_at: null,
    done_by_name: null,
    ...rest,
  };
}

const anna = {
  id: 'anna',
  person_id: 'p',
  given_name: 'Anna',
  family_name: 'Beispiel',
  employment_status: 'active',
  work_email: null,
  work_phone: null,
  primary_location_id: null,
  primary_location_name: null,
  date_of_birth: null,
  private_email: null,
  private_phone: null,
  street: null,
  postal_code: null,
  city: null,
} as StaffApi.StaffMember;

describe('isOverdue', () => {
  it('nennt nur vor heute Faelliges ueberfaellig - heute ist heute faellig', () => {
    expect(isOverdue({ due_on: '2026-09-28', status: 'open' }, HEUTE)).toBe(true);
    expect(isOverdue({ due_on: HEUTE, status: 'open' }, HEUTE)).toBe(false);
    expect(isOverdue({ due_on: null, status: 'open' }, HEUTE)).toBe(false);
    expect(isOverdue({ due_on: '2026-09-28', status: 'done' }, HEUTE)).toBe(false);
  });
});

describe('Offene Punkte - Aufgaben (PRX-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-09-29T08:00:00Z') });
    fetchTasks.mockResolvedValue([]);
    createTask.mockResolvedValue('neu');
    updateTask.mockResolvedValue(undefined);
    setTaskDone.mockResolvedValue(undefined);
    deleteTask.mockResolvedValue(undefined);
    fetchStaffMembers.mockResolvedValue([anna]);
  });

  it('zeigt Titel, Faelligkeit, Zuweisung und Person; ueberfaellig als Wort', async () => {
    fetchTasks.mockResolvedValue([
      aufgabe({ id: 'a', title: 'Rückruf', due_on: '2026-09-27' }),
      aufgabe({ id: 'b', due_on: HEUTE, patient_id: null, assigned_name: null }),
    ]);
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);

    expect(await screen.findByText('Rückruf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aufgaben (2)' })).toBeInTheDocument();
    expect(screen.getByText('Überfällig')).toBeInTheDocument();
    expect(screen.getByText('Heute fällig')).toBeInTheDocument();
    expect(screen.getByText('Für alle im Team')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Max Mustermann' })).toHaveAttribute(
      'href',
      '/patienten/66666666-6666-4666-8666-000000000001?zurueck=%2Foffen',
    );
    vi.useRealTimers();
  });

  it('legt eine Aufgabe an - ohne Titel haelt das Formular auf', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Aufgabe anlegen' }));
    const formular = screen.getByRole('form', { name: 'Aufgabe anlegen' });
    await user.click(within(formular).getByRole('button', { name: 'Anlegen' }));
    expect(within(formular).getByText('Was ist zu tun?')).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();

    await user.type(within(formular).getByLabelText('Was ist zu tun? *'), 'Rückruf Praxis Probst');
    await user.type(within(formular).getByLabelText('Fällig am'), '2026-10-02');
    await within(formular).findByRole('option', { name: 'Anna Beispiel' });
    await user.selectOptions(within(formular).getByLabelText('Für'), 'anna');
    await user.click(within(formular).getByRole('button', { name: 'Anlegen' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith({
        title: 'Rückruf Praxis Probst',
        note: '',
        dueOn: '2026-10-02',
        assignedStaffMemberId: 'anna',
        patientId: null,
      }),
    );
    expect(await screen.findByText('Aufgabe angelegt.')).toBeInTheDocument();
  });

  it('oeffnet das Formular aus der Adresse mit der Person vor', async () => {
    vi.useRealTimers();
    renderWithProviders(
      <OpenPointsPage user={testUser(['therapist'])} />,
      '/offen?aufgabe=neu&patient=66666666-6666-4666-8666-000000000001',
    );
    const formular = await screen.findByRole('form', { name: 'Aufgabe anlegen' });
    expect(within(formular).getByText('Zur Person:')).toBeInTheDocument();
    expect(within(formular).getByRole('button', { name: 'Bezug entfernen' })).toBeInTheDocument();
  });

  it('erledigt eine Aufgabe mit einem Tipp', async () => {
    vi.useRealTimers();
    fetchTasks.mockResolvedValue([aufgabe()]);
    const user = userEvent.setup();
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);

    await user.click(
      await screen.findByRole('button', { name: 'Erledigt: Verordnung nachfordern' }),
    );
    await waitFor(() => expect(setTaskDone).toHaveBeenCalledWith('t1', true));
    expect(await screen.findByText('„Verordnung nachfordern“ erledigt.')).toBeInTheDocument();
  });

  it('aendert eine Aufgabe im selben Formular', async () => {
    vi.useRealTimers();
    fetchTasks.mockResolvedValue([aufgabe()]);
    const user = userEvent.setup();
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Ändern: Verordnung nachfordern' }));
    const formular = screen.getByRole('form', { name: 'Aufgabe ändern' });
    const titel = within(formular).getByLabelText('Was ist zu tun? *');
    await user.clear(titel);
    await user.type(titel, 'Verordnung liegt vor');
    await user.click(within(formular).getByRole('button', { name: 'Änderung speichern' }));
    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ title: 'Verordnung liegt vor', dueOn: '2026-09-30' }),
      ),
    );
  });

  it('laedt die erledigten erst beim Aufklappen', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderWithProviders(<OpenPointsPage user={testUser(['office'])} />);
    await screen.findByText('Keine offene Aufgabe.');
    expect(fetchTasks).not.toHaveBeenCalledWith('done');

    await user.click(screen.getByText('Zuletzt erledigt'));
    await waitFor(() => expect(fetchTasks).toHaveBeenCalledWith('done'));
  });

  it('zeigt der Trainingsbetreuung keine Aufgaben und fragt nicht', () => {
    vi.useRealTimers();
    renderWithProviders(<OpenPointsPage user={testUser(['trainer'])} />);
    expect(screen.queryByRole('heading', { name: /Aufgaben/ })).toBeNull();
    expect(fetchTasks).not.toHaveBeenCalled();
  });
});
