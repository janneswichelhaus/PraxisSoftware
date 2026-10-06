import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as TasksApi from './tasks-api';
import type * as FilesApi from '@/features/files/api';
import type * as PlatformRequestsApi from './platform-requests-api';
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
// POR-011: Terminwünsche von der Plattform.
const fetchPlatformRequests = vi.fn();
vi.mock('./platform-requests-api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformRequestsApi>()),
  fetchPlatformRequests: () =>
    fetchPlatformRequests() as Promise<PlatformRequestsApi.PlatformRequest[]>,
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
    fetchPlatformRequests.mockReset();
    fetchPlatformRequests.mockResolvedValue([]);
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
    const zeile = screen.getByRole('link', { name: /^Offene Punkte: 2 überfällige/ });
    expect(zeile).toHaveAttribute('href', '/offen');
    // Design-Handoff 2026-10-01: eine Karte von 60 px, die sich beim
    // Überfahren in die Akzentfläche legt - ohne Schatten.
    const klassen = zeile.className.split(/\s+/);
    expect(klassen).toEqual(
      expect.arrayContaining(['min-h-15', 'rounded-card', 'bg-surface', 'hover:bg-accent-soft']),
    );
    expect(zeile.className).not.toMatch(/shadow|ring/);
    expect(screen.getByText('Offene Punkte').className).toContain('font-semibold');
    // Rechts die Summe als Bild; gelesen wird, was sie zählt.
    const summe = screen.getByText('4');
    expect(summe).toHaveAttribute('aria-hidden', 'true');
    expect(zeile).toHaveAccessibleName(
      'Offene Punkte: 2 überfällige Aufgaben · 1 Aufgabe heute fällig · 1 Verordnung zu erfassen',
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
