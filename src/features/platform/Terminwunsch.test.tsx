import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * „Termin wünschen" (POR-009, DSN-001 4.1), seit Überholung 6 als geführter
 * Ablauf im Fenster: „Wann passt es Ihnen?“ mit Wochentagen und Tageszeiten
 * samt „Egal“, dann die Zusammenfassung; ohne Tag geht es nicht weiter. Der
 * Wunsch geht als Wunsch an den Server, nie als Termin, und das steht über dem
 * Knopf (§8).
 */

const terminWuenschen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  terminWuenschen: (...args: unknown[]) => terminWuenschen(...args) as Promise<string>,
}));

const { Terminwunsch } = await import('./Terminwunsch');
const { WUNSCHTAGE } = await import('./terminablauf');
const { naechsteWerktage } = await import('./zeit');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function Ort() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}

function zeige(pfad = '/p/termine/wunsch?bereich=treatment') {
  return renderWithProviders(
    <>
      <Terminwunsch zugang={ZUGANG} />
      <Ort />
    </>,
    pfad,
  );
}

/** Mit der Terminliste davor im Verlauf - für das Zurück des Browsers. */
function zeigeMitVerlauf() {
  const router = createMemoryRouter(
    [
      { path: '/p/termine/wunsch', element: <Terminwunsch zugang={ZUGANG} /> },
      { path: '*', element: <Ort /> },
    ],
    {
      initialEntries: ['/p/termine?bereich=treatment', '/p/termine/wunsch?bereich=treatment'],
      initialIndex: 1,
    },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function tageAm(...wochentage: number[]): string[] {
  return naechsteWerktage(WUNSCHTAGE).filter((tag) =>
    wochentage.includes(new Date(`${tag}T12:00:00`).getDay()),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  terminWuenschen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000001');
});

describe('Terminwunsch (POR-009, Überholung 6)', () => {
  it('fragt im Fenster nach Wochentagen und Tageszeiten samt „Egal“, nichts vorbelegt', () => {
    zeige();
    const fenster = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(fenster).getByText('Termin wünschen')).toBeInTheDocument();
    expect(within(fenster).getByText('Schritt 1 von 2')).toBeInTheDocument();
    for (const name of [
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Vormittag',
      'Mittag',
      'Nachmittag',
      'Egal',
    ]) {
      expect(within(fenster).getByRole('checkbox', { name })).not.toBeChecked();
    }
    expect(within(fenster).queryByRole('checkbox', { name: /Samstag|Sonntag/ })).toBeNull();
    expect(within(fenster).getByRole('checkbox', { name: 'Montag' })).toHaveFocus();
    expect(within(fenster).getByRole('button', { name: 'Weiter' })).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('verlangt mindestens einen Tag, bevor es weitergeht', async () => {
    const nutzer = userEvent.setup();
    zeige('/p/termine/wunsch');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte wählen Sie mindestens einen Tag.');
    expect(screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' })).toBeInTheDocument();
    expect(terminWuenschen).not.toHaveBeenCalled();
  });

  it('sendet Tage, Tageszeiten und Zeile als Wunsch; §8 steht über dem Knopf', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('checkbox', { name: 'Dienstag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Nachmittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 2 von 2')).toBeInTheDocument();
    expect(within(ende).getByText('Montag und Dienstag')).toBeInTheDocument();
    expect(within(ende).getByText('Nachmittag')).toBeInTheDocument();
    const satz = within(ende).getByText(/Ein vereinbarter Termin ist das noch nicht/);
    const knopf = within(ende).getByRole('button', { name: 'Wunsch senden' });
    expect(satz.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await nutzer.click(within(ende).getByText('Nachricht an die Praxis (freiwillig)'));
    // Wer die Nachricht aufklappt, schreibt gleich.
    expect(within(ende).getByLabelText('Was sollen wir noch wissen?')).toHaveFocus();
    await nutzer.keyboard('Bitte nach 15 Uhr.');
    await nutzer.click(knopf);
    await waitFor(() =>
      expect(terminWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        tage: tageAm(1, 2),
        zeiten: ['afternoon'],
        notiz: 'Bitte nach 15 Uhr.',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ort')).toHaveTextContent(
        /^\/p\/termine\?bereich=treatment&gesendet=1$/,
      ),
    );
  });

  it('sendet bei „Egal“ keine Tageszeit und führt mit „← Zurück“ zur Wahl, die stehen bleibt', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('checkbox', { name: 'Donnerstag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Egal' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Jede Tageszeit')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    const wann = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(wann).getByRole('checkbox', { name: 'Donnerstag' })).toBeChecked();
    expect(within(wann).getByRole('checkbox', { name: 'Egal' })).toBeChecked();
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Wunsch senden' }));
    await waitFor(() =>
      expect(terminWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ tage: tageAm(4), zeiten: [], notiz: '' }),
      ),
    );
  });

  it('besteht axe auf beiden Seiten', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('checkbox', { name: 'Freitag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Vormittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByText('Nachricht an die Praxis (freiwillig)'));
    expect(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück und fragt auf der ersten Seite', async () => {
    const nutzer = userEvent.setup();
    const router = zeigeMitVerlauf();
    await nutzer.click(await screen.findByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Mittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();

    await act(() => router.navigate(-1));
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(wann).getByRole('checkbox', { name: 'Montag' })).toBeChecked();

    // Auf der ersten Seite mit einer Wahl: die Rückfrage, in den Worten des Wunschs.
    await act(() => router.navigate(-1));
    const frage = await screen.findByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Weiter ausfüllen' }));
    expect(screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/p/termine/wunsch');
    expect(terminWuenschen).not.toHaveBeenCalled();
  });

  it('zeigt die Abweisung des Servers als Satz', async () => {
    const nutzer = userEvent.setup();
    terminWuenschen.mockRejectedValue(new Error('Bitte wählen Sie höchstens 14 Tage.'));
    zeige('/p/termine/wunsch');
    await nutzer.click(screen.getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Vormittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Wunsch senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('höchstens 14 Tage');
    expect(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
  });
});
