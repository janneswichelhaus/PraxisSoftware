import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as VacationApi from './api';
import { testUrlaub, testVorschau } from './testdaten';

/**
 * Urlaub beantragen, geführt (G7, URL-001): Budget ≤ 6 Tipps, Ziel 5 -
 * „Urlaub beantragen“, erster Tag, letzter Tag, Weiter, Absenden. Die Tage
 * zählt der Server (ANN-577); die Notiz sieht nur die Person (ANN-580).
 */

const fetchUrlaub = vi.fn();
const previewLeave = vi.fn();
const requestLeave = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof VacationApi>();
  return {
    ...actual,
    fetchUrlaub: (...a: unknown[]) => fetchUrlaub(...a) as unknown,
    previewLeave: (...a: unknown[]) => previewLeave(...a) as unknown,
    requestLeave: (...a: unknown[]) => requestLeave(...a) as unknown,
  };
});

const { UrlaubBeantragenPage } = await import('./UrlaubBeantragenPage');

function Ziel() {
  const ort = useLocation();
  const zustand = ort.state as { meldung?: string } | null;
  return (
    <p>
      Ziel {ort.pathname}: {zustand?.meldung ?? ''}
    </p>
  );
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/urlaub/beantragen',
        element: <UrlaubBeantragenPage user={testUser(rollen)} />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: ['/betrieb/urlaub/beantragen'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Ein Tag im Kalender, am Anfang seines Namens erkannt. */
function tag(fenster: HTMLElement, name: string) {
  return within(fenster).getByRole('button', { name: (n) => n.startsWith(name) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchUrlaub.mockReset().mockResolvedValue(testUrlaub());
  previewLeave.mockReset().mockResolvedValue(testVorschau());
  requestLeave.mockReset().mockResolvedValue('neu-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UrlaubBeantragenPage', () => {
  it('führt mit vier Tipps vom ersten Tag bis zum Absenden', async () => {
    const user = userEvent.setup();
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    expect(within(kalender).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(kalender).getByText('Ersten Urlaubstag wählen.')).toBeInTheDocument();
    const weiter = within(kalender).getByRole('button', { name: 'Weiter' });
    expect(weiter).toBeDisabled();

    let tipps = 0;
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    tipps += 1;
    expect(within(kalender).getByText(/letzten Tag wählen/)).toBeInTheDocument();
    await user.click(tag(kalender, 'Freitag, 13. November 2026'));
    tipps += 1;
    expect(previewLeave).toHaveBeenCalledWith('2026-11-02', '2026-11-13');
    expect(await within(kalender).findByText('9 Urlaubstage')).toBeInTheDocument();
    expect(within(kalender).getByText(/danach 3 übrig/)).toBeInTheDocument();
    await user.click(weiter);
    tipps += 1;

    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(within(abschluss).getByText('2.–13. Nov.')).toBeInTheDocument();
    expect(within(abschluss).getByText('Danach 3 von 30 Tagen übrig')).toBeInTheDocument();
    expect(within(abschluss).getByText('Tim Teamleitung (5.–6. Nov.)')).toBeInTheDocument();
    expect(within(abschluss).getByText('Praxisinhaber')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' }));
    tipps += 1;

    expect(requestLeave).toHaveBeenCalledWith({
      von: '2026-11-02',
      bis: '2026-11-13',
      notiz: null,
    });
    expect(
      await screen.findByText(
        'Ziel /betrieb/urlaub: Urlaub beantragt: 2.–13. Nov. (9 Urlaubstage). Es entscheidet: Praxisinhaber.',
      ),
    ).toBeInTheDocument();
    // Mit dem Einstieg „Urlaub beantragen“ fünf - Budget G7 ≤ 6.
    expect(tipps + 1).toBeLessThanOrEqual(6);
  });

  it('kommt über eigenem Urlaub oder ohne Arbeitstag nicht weiter', async () => {
    const user = userEvent.setup();
    previewLeave.mockResolvedValueOnce(testVorschau({ overlaps_own: true }));
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    await user.click(tag(kalender, 'Dienstag, 3. November 2026'));
    expect(
      await within(kalender).findByText('überschneidet sich mit Ihrem Urlaub'),
    ).toBeInTheDocument();
    expect(within(kalender).getByRole('button', { name: 'Weiter' })).toBeDisabled();

    previewLeave.mockResolvedValueOnce(testVorschau({ days: 0 }));
    await user.click(tag(kalender, 'Samstag, 7. November 2026'));
    await user.click(tag(kalender, 'Sonntag, 8. November 2026'));
    expect(await within(kalender).findByText('kein Arbeitstag')).toBeInTheDocument();
    expect(within(kalender).getByRole('button', { name: 'Weiter' })).toBeDisabled();
  });

  it('nennt Feiertage und eigenen Urlaub am Tag und sperrt Vergangenes', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        own: [
          {
            id: 'eigen-1',
            kind: 'leave',
            refers_to: null,
            starts_on: '2026-12-21',
            ends_on: '2026-12-23',
            days: 3,
            message: null,
            status: 'approved',
            requested_at: '2026-10-01T08:00:00Z',
            decided_at: '2026-10-02T08:00:00Z',
            decided_by_name: 'Jannes Test',
            decision_note: null,
            self_entered: false,
            open_cancellation: false,
          },
        ],
      }),
    );
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    expect(tag(kalender, 'Sonntag, 1. November 2026')).toHaveAccessibleName(
      'Sonntag, 1. November 2026, Feiertag (Allerheiligen)',
    );
    expect(tag(kalender, 'Dienstag, 22. Dezember 2026')).toHaveAccessibleName(
      'Dienstag, 22. Dezember 2026, Ihr Urlaub (genehmigt)',
    );
    expect(tag(kalender, 'Donnerstag, 15. Oktober 2026')).toBeDisabled();
    expect(tag(kalender, 'Freitag, 16. Oktober 2026')).toHaveAccessibleName(
      'Freitag, 16. Oktober 2026, heute',
    );
    await act(() => pruefeBarrierefreiheit(kalender));
  });

  it('nimmt die Notiz mit, wenn eine geschrieben ist', async () => {
    const user = userEvent.setup();
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    await user.click(tag(kalender, 'Freitag, 13. November 2026'));
    await within(kalender).findByText('9 Urlaubstage');
    await user.click(within(kalender).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await user.click(within(abschluss).getByText('Notiz hinzufügen'));
    await user.type(
      within(abschluss).getByLabelText('Notiz – nur für Sie sichtbar'),
      'Hochzeit der Schwester',
    );
    await act(() => pruefeBarrierefreiheit(abschluss));
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' }));
    expect(requestLeave).toHaveBeenCalledWith({
      von: '2026-11-02',
      bis: '2026-11-13',
      notiz: 'Hochzeit der Schwester',
    });
  });

  it('ändert den Zeitraum aus der Zusammenfassung und kehrt dorthin zurück', async () => {
    const user = userEvent.setup();
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    await user.click(tag(kalender, 'Freitag, 13. November 2026'));
    await within(kalender).findByText('9 Urlaubstage');
    await user.click(within(kalender).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await user.click(within(abschluss).getByRole('button', { name: 'Zeitraum ändern' }));

    const wieder = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    // Die Wahl steht noch; ein Tipp beginnt neu.
    expect(tag(wieder, 'Montag, 2. November 2026')).toHaveAttribute('aria-pressed', 'true');
    previewLeave.mockResolvedValueOnce(testVorschau({ days: 4, team: [] }));
    await user.click(tag(wieder, 'Montag, 9. November 2026'));
    await user.click(tag(wieder, 'Donnerstag, 12. November 2026'));
    await within(wieder).findByText('4 Urlaubstage');
    await user.click(within(wieder).getByRole('button', { name: 'Weiter' }));
    const zurueck = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(within(zurueck).getByText('9.–12. Nov.')).toBeInTheDocument();
    expect(within(zurueck).getByText('Zur selben Zeit fehlt niemand')).toBeInTheDocument();
  });

  it('lässt owner den eigenen Urlaub direkt eintragen', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(testUrlaub({ self_entered: true, can_decide: true }));
    rendern(['owner']);
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    await user.click(tag(kalender, 'Freitag, 13. November 2026'));
    await within(kalender).findByText('9 Urlaubstage');
    await user.click(within(kalender).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub eintragen?' });
    expect(within(abschluss).getByText('Sie tragen den Urlaub selbst ein')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub eintragen' }));
    expect(
      await screen.findByText(
        'Ziel /betrieb/urlaub: Urlaub eingetragen: 2.–13. Nov. (9 Urlaubstage).',
      ),
    ).toBeInTheDocument();
  });

  it('zeigt einen Fehler des Servers über dem Knopf und bleibt stehen', async () => {
    const user = userEvent.setup();
    requestLeave.mockRejectedValue(new Error('Für diese Tage gibt es schon einen Urlaubsantrag.'));
    rendern();
    const kalender = await screen.findByRole('dialog', { name: 'Welche Tage?' });
    await user.click(tag(kalender, 'Montag, 2. November 2026'));
    await user.click(tag(kalender, 'Freitag, 13. November 2026'));
    await within(kalender).findByText('9 Urlaubstage');
    await user.click(within(kalender).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' }));
    expect(
      await within(abschluss).findByText('Für diese Tage gibt es schon einen Urlaubsantrag.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Ziel/)).toBeNull();
  });
});
