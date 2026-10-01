import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as TasksApi from './tasks-api';
import type * as FilesApi from '@/features/files/api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTasks = vi.fn();
const fetchOffeneScans = vi.fn();

vi.mock('./tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  fetchTasks: (status: string) => fetchTasks(status) as Promise<TasksApi.Task[]>,
}));
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchOffeneScans: () => fetchOffeneScans() as Promise<FilesApi.OffenerScan[]>,
}));

const { OpenPointsSummary } = await import('./OpenPointsSummary');

const HEUTE = '2026-09-29';

function aufgabe(due_on: string | null): Partial<TasksApi.Task> {
  return { id: `t-${due_on}`, title: 'x', due_on, status: 'open' };
}

describe('OpenPointsSummary', () => {
  beforeEach(() => {
    fetchTasks.mockReset();
    fetchOffeneScans.mockReset();
  });

  it('zaehlt Ueberfaelliges, heute Faelliges und Fotos in einer Zeile', async () => {
    fetchTasks.mockResolvedValue([
      aufgabe('2026-09-20'),
      aufgabe('2026-09-28'),
      aufgabe(HEUTE),
      aufgabe('2026-10-10'),
    ]);
    fetchOffeneScans.mockResolvedValue([{ file_id: 'f' }]);
    renderWithProviders(<OpenPointsSummary user={testUser(['office'])} today={HEUTE} />);

    expect(
      await screen.findByText(
        '2 überfällige Aufgaben · 1 Aufgabe heute fällig · 1 Verordnung zu erfassen',
      ),
    ).toBeInTheDocument();
    // Die Zeile selbst ist der Link (UX-005h).
    expect(screen.getByRole('link', { name: /^Offene Punkte: 2 überfällige/ })).toHaveAttribute(
      'href',
      '/offen',
    );
  });

  it('bleibt still, wenn nichts faellig ist', async () => {
    fetchTasks.mockResolvedValue([aufgabe('2026-10-10'), aufgabe(null)]);
    fetchOffeneScans.mockResolvedValue([]);
    const { container } = renderWithProviders(
      <OpenPointsSummary user={testUser(['therapist'])} today={HEUTE} />,
    );
    await vi.waitFor(() => expect(fetchTasks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('fragt fuer die Trainingsbetreuung nichts ab', () => {
    renderWithProviders(<OpenPointsSummary user={testUser(['trainer'])} today={HEUTE} />);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(fetchOffeneScans).not.toHaveBeenCalled();
  });
});
