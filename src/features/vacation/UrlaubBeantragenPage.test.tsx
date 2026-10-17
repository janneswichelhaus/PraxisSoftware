import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as VacationApi from './api';
import { STAFF, testUrlaub, testVorschau } from './testdaten';

/**
 * Urlaub beantragen, geführt (G7, URL-001): Budget ≤ 6 Tipps, Ziel 5 -
 * „Urlaub beantragen“, Monat, erster Tag, letzter Tag (oder eine Dauer),
 * Absenden. Keine Seite rollt: ein Monat je Kalenderseite (Design-Review
 * Überholung 7). Die Tage zählt der Server (ANN-577); die Notiz sieht nur die
 * Person (ANN-580).
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

type Nutzer = ReturnType<typeof userEvent.setup>;

/** Monat, erster und letzter Tag - drei Tipps bis zur Zusammenfassung. */
async function waehle(
  user: Nutzer,
  monat: string,
  erster: string,
  letzter: string | { dauer: string },
) {
  const monate = await screen.findByRole('dialog', { name: 'Ab welchem Monat?' });
  await user.click(within(monate).getByRole('button', { name: monat }));
  await user.click(tag(screen.getByRole('dialog', { name: 'Erster Urlaubstag?' }), erster));
  const ende = screen.getByRole('dialog', { name: 'Letzter Urlaubstag?' });
  await user.click(
    typeof letzter === 'string'
      ? tag(ende, letzter)
      : within(ende).getByRole('button', { name: letzter.dauer }),
  );
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
  it('führt mit vier Tipps vom Monat bis zum Absenden - mit dem Einstieg fünf', async () => {
    const user = userEvent.setup();
    rendern();
    let tipps = 0;
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await user.click(ziel);
    };

    const monate = await screen.findByRole('dialog', { name: 'Ab welchem Monat?' });
    expect(within(monate).getByText('Schritt 1 von 4')).toBeInTheDocument();
    // Dreizehn Monate ab dem laufenden, je Jahr als Kacheln ohne Rollen.
    expect(within(monate).getAllByRole('button', { name: /^\S+ 202[67]$/ })).toHaveLength(13);
    expect(within(monate).getByRole('group', { name: '2027' })).toHaveTextContent(/^2027Jan\./);
    await tippe(within(monate).getByRole('button', { name: 'November 2026' }));

    const beginn = screen.getByRole('dialog', { name: 'Erster Urlaubstag?' });
    // Ein Monat je Seite; der Feiertag steht als Zeichen und Wort darunter.
    expect(within(beginn).getAllByRole('group', { name: /^\S+ 2026$/ })).toHaveLength(1);
    expect(within(beginn).getByText('Feiertag: 1. Nov.')).toBeInTheDocument();
    await tippe(tag(beginn, 'Montag, 2. November 2026'));

    const ende = screen.getByRole('dialog', { name: 'Letzter Urlaubstag?' });
    expect(tag(ende, 'Montag, 2. November 2026')).toHaveAccessibleName(
      'Montag, 2. November 2026, erster Urlaubstag',
    );
    // Vor dem ersten Tag lässt sich kein letzter wählen.
    expect(tag(ende, 'Sonntag, 1. November 2026')).toBeDisabled();
    await tippe(tag(ende, 'Freitag, 13. November 2026'));

    expect(previewLeave).toHaveBeenCalledWith('2026-11-02', '2026-11-13');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(await within(abschluss).findByText('2.–13. Nov.')).toBeInTheDocument();
    expect(within(abschluss).getByText('9 Urlaubstage')).toBeInTheDocument();
    expect(within(abschluss).getByText('Danach 3 von 30 Tagen übrig')).toBeInTheDocument();
    expect(within(abschluss).getByText('Tim Teamleitung (5.–6. Nov.)')).toBeInTheDocument();
    expect(within(abschluss).getByText('Praxisinhaber')).toBeInTheDocument();
    await tippe(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' }));

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
    expect(tipps + 1).toBe(5);
  });

  it('nimmt eine Dauer ab dem ersten Tag, auch über das Monatsende', async () => {
    const user = userEvent.setup();
    rendern();
    await waehle(user, 'November 2026', 'Montag, 23. November 2026', { dauer: '2 Wochen' });
    expect(previewLeave).toHaveBeenCalledWith('2026-11-23', '2026-12-06');
    expect(await screen.findByRole('dialog', { name: 'Urlaub beantragen?' })).toBeInTheDocument();
  });

  it('blättert auf der Kalenderseite zum Nachbarmonat', async () => {
    const user = userEvent.setup();
    rendern();
    const monate = await screen.findByRole('dialog', { name: 'Ab welchem Monat?' });
    await user.click(within(monate).getByRole('button', { name: 'Oktober 2026' }));
    const beginn = screen.getByRole('dialog', { name: 'Erster Urlaubstag?' });
    // Vor dem laufenden Monat geht es nicht.
    expect(within(beginn).getByRole('button', { name: 'Vorheriger Monat' })).toBeDisabled();
    expect(tag(beginn, 'Donnerstag, 15. Oktober 2026')).toBeDisabled();
    expect(tag(beginn, 'Freitag, 16. Oktober 2026')).toHaveAccessibleName(
      'Freitag, 16. Oktober 2026, heute',
    );
    await user.click(within(beginn).getByRole('button', { name: 'Nächster Monat' }));
    expect(within(beginn).getByRole('group', { name: 'November 2026' })).toBeInTheDocument();
    await user.click(tag(beginn, 'Montag, 30. November 2026'));
    const ende = screen.getByRole('dialog', { name: 'Letzter Urlaubstag?' });
    await user.click(within(ende).getByRole('button', { name: 'Nächster Monat' }));
    await user.click(tag(ende, 'Freitag, 4. Dezember 2026'));
    expect(previewLeave).toHaveBeenCalledWith('2026-11-30', '2026-12-04');
  });

  it('nennt über eigenem Urlaub oder ohne Arbeitstag den Grund und sendet nicht', async () => {
    const user = userEvent.setup();
    previewLeave.mockResolvedValueOnce(testVorschau({ overlaps_own: true }));
    rendern();
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Dienstag, 3. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(
      await within(abschluss).findByText('Der Zeitraum überschneidet sich mit Ihrem Urlaub.'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' })).toBeDisabled();

    previewLeave.mockResolvedValueOnce(testVorschau({ days: 0 }));
    await user.click(within(abschluss).getByRole('button', { name: 'Zeitraum ändern' }));
    await user.click(
      tag(screen.getByRole('dialog', { name: 'Erster Urlaubstag?' }), 'Samstag, 7. November 2026'),
    );
    // Ein einzelner Tag: derselbe Tag noch einmal.
    await user.click(
      tag(screen.getByRole('dialog', { name: 'Letzter Urlaubstag?' }), 'Samstag, 7. November 2026'),
    );
    const wieder = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(
      await within(wieder).findByText('In diesem Zeitraum liegt kein Arbeitstag.'),
    ).toBeInTheDocument();
    expect(within(wieder).getByRole('button', { name: 'Urlaub beantragen' })).toBeDisabled();
  });

  it('nennt Feiertage und eigenen Urlaub am Tag, mit Zeichen und Wort', async () => {
    const user = userEvent.setup();
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
    const monate = await screen.findByRole('dialog', { name: 'Ab welchem Monat?' });
    await user.click(within(monate).getByRole('button', { name: 'Dezember 2026' }));
    const beginn = screen.getByRole('dialog', { name: 'Erster Urlaubstag?' });
    expect(tag(beginn, 'Dienstag, 22. Dezember 2026')).toHaveAccessibleName(
      'Dienstag, 22. Dezember 2026, Ihr Urlaub (genehmigt)',
    );
    expect(tag(beginn, 'Freitag, 25. Dezember 2026')).toHaveAccessibleName(
      'Freitag, 25. Dezember 2026, Feiertag (1. Weihnachtstag)',
    );
    expect(within(beginn).getByText('Ihr Urlaub')).toBeInTheDocument();
    expect(within(beginn).getByText('Feiertag: 25. Dez., 26. Dez.')).toBeInTheDocument();
    await act(() => pruefeBarrierefreiheit(beginn));
  });

  it('nennt in der Zusammenfassung die Feiertage, die nicht zählen', async () => {
    const user = userEvent.setup();
    rendern();
    await waehle(user, 'Oktober 2026', 'Montag, 26. Oktober 2026', { dauer: '1 Woche' });
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(
      await within(abschluss).findByText('9 Urlaubstage · Allerheiligen zählt nicht'),
    ).toBeInTheDocument();
  });

  it('nimmt die Notiz mit, wenn eine geschrieben ist', async () => {
    const user = userEvent.setup();
    rendern();
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await within(abschluss).findByText('2.–13. Nov.');
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
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await within(abschluss).findByText('2.–13. Nov.');
    await user.click(within(abschluss).getByRole('button', { name: 'Zeitraum ändern' }));

    const wieder = screen.getByRole('dialog', { name: 'Erster Urlaubstag?' });
    // Die Wahl steht noch im Monat des Beginns; ein Tipp beginnt neu.
    expect(tag(wieder, 'Montag, 2. November 2026')).toHaveAttribute('aria-pressed', 'true');
    previewLeave.mockResolvedValueOnce(testVorschau({ days: 4, team: [] }));
    await user.click(tag(wieder, 'Montag, 9. November 2026'));
    await user.click(
      tag(
        screen.getByRole('dialog', { name: 'Letzter Urlaubstag?' }),
        'Donnerstag, 12. November 2026',
      ),
    );
    const zurueck = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    expect(await within(zurueck).findByText('9.–12. Nov.')).toBeInTheDocument();
    expect(within(zurueck).getByText('Zur selben Zeit fehlt niemand')).toBeInTheDocument();
  });

  it('lässt owner den eigenen Urlaub direkt eintragen', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(testUrlaub({ self_entered: true, can_decide: true }));
    previewLeave.mockResolvedValue(testVorschau({ self_entered: true }));
    rendern(['owner']);
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub eintragen?' });
    expect(
      await within(abschluss).findByText('Sie tragen den Urlaub selbst ein'),
    ).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub eintragen' }));
    expect(
      await screen.findByText(
        'Ziel /betrieb/urlaub: Urlaub eingetragen: 2.–13. Nov. (9 Urlaubstage).',
      ),
    ).toBeInTheDocument();
  });

  it('nennt owner beim eigenen Urlaub die Termine danach je Tag zum Umplanen (ANN-578)', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(
      testUrlaub({ my_staff_member_id: STAFF.jannes, self_entered: true, can_decide: true }),
    );
    previewLeave.mockResolvedValue(
      testVorschau({
        self_entered: true,
        appointment_days: [
          { on_date: '2026-11-03', appointments: 2 },
          { on_date: '2026-11-10', appointments: 1 },
        ],
      }),
    );
    rendern(['owner']);
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub eintragen?' });
    expect(await within(abschluss).findByText('3 Termine im Zeitraum')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub eintragen' }));

    const fertig = await screen.findByRole('dialog', { name: 'Eingetragen' });
    expect(
      within(fertig).getByRole('heading', { name: 'Termine umplanen (3)' }),
    ).toBeInTheDocument();
    const umplanen = within(fertig).getByRole('link', { name: 'Dienstag, 3. November umplanen' });
    expect(
      umplanen
        .getAttribute('href')
        ?.startsWith(`/kalender/tag-umplanen?person=${STAFF.jannes}&datum=2026-11-03`),
    ).toBe(true);
    await act(() => pruefeBarrierefreiheit(fertig));
  });

  it('hält owner vor abweichenden Arbeitszeiten an und nennt den Tag', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(
      testUrlaub({ my_staff_member_id: STAFF.jannes, self_entered: true, can_decide: true }),
    );
    previewLeave.mockResolvedValue(
      testVorschau({ self_entered: true, exception_days: ['2026-11-03'] }),
    );
    rendern(['owner']);
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub eintragen?' });
    expect(
      await within(abschluss).findByText(
        'Abweichende Arbeitszeiten am 3. Nov. – erst in der Planung ändern.',
      ),
    ).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Urlaub eintragen' })).toBeDisabled();
    expect(within(abschluss).getByRole('link', { name: 'Zur Planung' })).toHaveAttribute(
      'href',
      `/praxis/planung?person=${STAFF.jannes}`,
    );
  });

  it('zeigt einen Fehler des Servers über dem Knopf und bleibt stehen', async () => {
    const user = userEvent.setup();
    requestLeave.mockRejectedValue(new Error('Für diese Tage gibt es schon einen Urlaubsantrag.'));
    rendern();
    await waehle(user, 'November 2026', 'Montag, 2. November 2026', 'Freitag, 13. November 2026');
    const abschluss = await screen.findByRole('dialog', { name: 'Urlaub beantragen?' });
    await within(abschluss).findByText('2.–13. Nov.');
    await user.click(within(abschluss).getByRole('button', { name: 'Urlaub beantragen' }));
    expect(
      await within(abschluss).findByText('Für diese Tage gibt es schon einen Urlaubsantrag.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Ziel/)).toBeNull();
  });
});
