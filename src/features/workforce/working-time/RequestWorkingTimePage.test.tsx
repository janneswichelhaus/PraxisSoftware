import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as WorkingTimeApi from './api';
import { BASELINE_ERROR, PREVIEW_ERROR } from './api';
import { ANNAS_TAG, testWeek, testWorkingTime } from './testdata';

/**
 * Arbeitszeitänderung beantragen, geführt (G8, AZ-001): Budget ≤ 8 Tipps und
 * die Zeiten - einmalig 5, dauerhaft mit einem Wochentag 7. Was nicht geht,
 * sagt die Seite vor dem Absenden (ANN-588).
 */

const fetchWorkingTime = vi.fn();
const fetchBaseline = vi.fn();
const previewChange = vi.fn();
const requestChange = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkingTimeApi>();
  return {
    ...actual,
    fetchWorkingTime: (...a: unknown[]) => fetchWorkingTime(...a) as unknown,
    fetchBaseline: (...a: unknown[]) => fetchBaseline(...a) as unknown,
    previewChange: (...a: unknown[]) => previewChange(...a) as unknown,
    requestChange: (...a: unknown[]) => requestChange(...a) as unknown,
  };
});

const { RequestWorkingTimePage } = await import('./RequestWorkingTimePage');

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
        path: '/betrieb/arbeitszeit/beantragen',
        element: <RequestWorkingTimePage user={testUser(rollen)} />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: ['/betrieb/arbeitszeit/beantragen'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function tag(fenster: HTMLElement, name: string) {
  return within(fenster).getByRole('button', { name: (n) => n.startsWith(name) });
}

function zeit(fenster: HTMLElement, label: string, wert: string) {
  fireEvent.change(within(fenster).getByLabelText(label), { target: { value: wert } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchWorkingTime.mockReset().mockResolvedValue(testWorkingTime());
  fetchBaseline
    .mockReset()
    .mockImplementation((kind: string) =>
      Promise.resolve(
        kind === 'once'
          ? { previous: ANNAS_TAG, previous_minutes: 540, self_entered: false }
          : { previous: testWeek(), previous_minutes: 45 * 60, self_entered: false },
      ),
    );
  previewChange.mockReset().mockResolvedValue({
    previous: ANNAS_TAG,
    previous_minutes: 540,
    new_minutes: 540,
    unchanged: false,
    reduced: false,
    problems: [],
    appointment_days: [],
    self_entered: false,
  });
  requestChange.mockReset().mockResolvedValue('neu-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestWorkingTimePage', () => {
  it('ändert einen Tag in vier Tipps und den Zeiten', async () => {
    const user = userEvent.setup();
    rendern();
    let tipps = 0;
    const art = await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' });
    expect(within(art).getByText('Schritt 1 von 4')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await user.click(within(art).getByRole('button', { name: 'Einen Tag' }));
    tipps += 1;

    const datum = await screen.findByRole('dialog', { name: 'An welchem Tag?' });
    // Heute geht nicht - frühestens morgen (ANN-588).
    expect(tag(datum, 'Freitag, 16. Oktober 2026')).toBeDisabled();
    await user.click(tag(datum, 'Dienstag, 20. Oktober 2026'));
    tipps += 1;

    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    expect(fetchBaseline).toHaveBeenCalledWith('once', '2026-10-20');
    expect(
      await within(zeiten).findByText('Bisher: 08:00–12:00, 13:00–18:00 · 9:00 Std.'),
    ).toBeInTheDocument();
    const weiter = within(zeiten).getByRole('button', { name: 'Weiter' });
    // Unverändert geht nicht weiter.
    expect(weiter).toBeDisabled();
    zeit(zeiten, 'Beginn', '07:00');
    zeit(zeiten, 'Ende', '17:00');
    expect(within(zeiten).getByText('9:00 Std., gleich wie bisher')).toBeInTheDocument();
    await user.click(weiter);
    tipps += 1;

    const abschluss = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    expect(
      await within(abschluss).findByText('Einmalig: Dienstag, 20. Oktober'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByText('07:00–12:00, 13:00–17:00')).toBeInTheDocument();
    // Die Stunden stehen an der Zeile des Datums - eine Zeile weniger im Abschluss.
    expect(within(abschluss).getByText('Am Tag 9:00 Std., gleich wie bisher')).toBeInTheDocument();
    expect(
      await within(abschluss).findByText('Keine Termine außerhalb der neuen Zeiten'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByText('Praxisinhaber')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await user.click(within(abschluss).getByRole('button', { name: 'Änderung beantragen' }));
    tipps += 1;

    expect(requestChange).toHaveBeenCalledWith({
      kind: 'once',
      onDate: '2026-10-20',
      blocks: [
        { von: '07:00', bis: '12:00' },
        { von: '13:00', bis: '17:00' },
      ],
      message: null,
    });
    expect(
      await screen.findByText(
        'Ziel /betrieb/arbeitszeit: Änderung beantragt: Einmalig: Dienstag, 20. Oktober. Es entscheidet: Praxisinhaber.',
      ),
    ).toBeInTheDocument();
    // Mit dem Einstieg „Änderung beantragen“ fünf und die Zeiten - Budget G8 ≤ 8.
    expect(tipps + 1).toBeLessThanOrEqual(8);
  });

  it('lässt weniger Stunden nicht weiter und nennt den Grund (ANN-588)', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    await within(zeiten).findByText(/^Bisher:/);
    zeit(zeiten, 'Ende', '17:00');
    expect(
      within(zeiten).getByText(/Weniger Stunden laufen nicht über diesen Antrag/),
    ).toBeInTheDocument();
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeDisabled();
    // Eine längere Pause kürzt die Arbeitszeit - der Ablauf schlägt das spätere Ende vor.
    zeit(zeiten, 'Ende', '18:00');
    fireEvent.change(within(zeiten).getByLabelText('Dauer der Pause'), { target: { value: '90' } });
    await user.click(within(zeiten).getByRole('button', { name: 'Ende auf 18:30 setzen' }));
    expect(within(zeiten).getByLabelText('Ende')).toHaveValue('18:30');
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeEnabled();
  });

  it('ändert einen Wochentag im Wochenplan ab einem Datum in sechs Tipps', async () => {
    const user = userEvent.setup();
    previewChange.mockResolvedValue({
      previous: testWeek(),
      previous_minutes: 45 * 60,
      new_minutes: 45 * 60,
      unchanged: false,
      reduced: false,
      problems: [],
      appointment_days: [
        { on_date: '2026-12-01', appointments: 2 },
        { on_date: '2026-12-08', appointments: 1 },
        { on_date: '2026-12-15', appointments: 1 },
        { on_date: '2026-12-22', appointments: 1 },
        { on_date: '2026-12-29', appointments: 1 },
      ],
      self_entered: false,
    });
    rendern();
    let tipps = 0;
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Den Wochenplan ab einem Datum' },
      ),
    );
    tipps += 1;
    // Der Monatserste ist eine Schnellwahl - kein Blättern bis Dezember.
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ab wann?' })).getByRole('button', {
        name: 'Ab Dienstag, 1. Dezember',
      }),
    );
    tipps += 1;

    const woche = await screen.findByRole('dialog', {
      name: 'Wochenplan ab 1. Dezember',
    });
    await user.click(await within(woche).findByRole('button', { name: /^Dienstag / }));
    tipps += 1;
    const dienstag = await screen.findByRole('dialog', { name: 'Dienstags ab 1. Dezember' });
    zeit(dienstag, 'Pause ab', '12:30');
    await user.click(within(dienstag).getByRole('button', { name: 'Übernehmen' }));
    tipps += 1;

    const zurueck = await screen.findByRole('dialog', {
      name: 'Wochenplan ab 1. Dezember',
    });
    const geaendert = within(zurueck).getByRole('button', { name: /^Dienstag / });
    expect(geaendert).toHaveTextContent('Dienstag 08:00–12:30, 13:30–18:00');
    expect(within(geaendert).getByText('geändert')).toBeInTheDocument();
    await user.click(within(zurueck).getByRole('button', { name: 'Weiter' }));
    tipps += 1;

    const abschluss = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    expect(
      await within(abschluss).findByText('Dienstag 08:00–12:30, 13:30–18:00'),
    ).toBeInTheDocument();
    expect(
      within(abschluss).getByText('In der Woche 45:00 Std., gleich wie bisher'),
    ).toBeInTheDocument();
    expect(
      await within(abschluss).findByText('6 Termine außerhalb der neuen Zeiten'),
    ).toBeInTheDocument();
    // Je Tag die Zahl, ab dem vierten Tag nur noch die Zahl der Tage - die Zeile
    // bleibt kurz, der Abschluss rollt nicht; umplanen wird, wer entscheidet
    // (BEF-219). Ein Eintrag bricht nicht in sich.
    const tage = within(abschluss).getByText(
      '1. Dez.: 2 · 8. Dez.: 1 · 15. Dez.: 1 · 2 weitere Tage',
    );
    expect(tage.textContent).toBe(
      '1.\u00a0Dez.:\u00a02 · 8.\u00a0Dez.:\u00a01 · 15.\u00a0Dez.:\u00a01 · 2\u00a0weitere\u00a0Tage',
    );
    expect(
      within(abschluss).getByText('Praxisinhaber, plant nach dem Genehmigen um'),
    ).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Änderung beantragen' }));
    tipps += 1;
    expect(requestChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'permanent',
        onDate: '2026-12-01',
        blocks: testWeek({
          2: [
            { von: '08:00', bis: '12:30' },
            { von: '13:30', bis: '18:00' },
          ],
        }),
      }),
    );
    // Mit dem Einstieg sieben - Budget G8 ≤ 8.
    expect(tipps + 1).toBeLessThanOrEqual(8);
  });

  it('sperrt das Absenden, wenn der Server einen Grund nennt (Ruhe zum Nachbartag)', async () => {
    const user = userEvent.setup();
    previewChange.mockResolvedValue({
      previous: ANNAS_TAG,
      previous_minutes: 540,
      new_minutes: 540,
      unchanged: false,
      reduced: false,
      problems: ['rest_shorter_than_eleven_hours'],
      appointment_days: [],
      self_entered: false,
    });
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    await within(zeiten).findByText(/^Bisher:/);
    zeit(zeiten, 'Beginn', '06:00');
    zeit(zeiten, 'Ende', '16:00');
    await user.click(within(zeiten).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    expect(await within(abschluss).findByText(/Weniger als 11 Stunden Ruhe/)).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Änderung beantragen' })).toBeDisabled();
  });

  it('ein Fehler der Vorschau ist nie „keine Termine“ - mit „Erneut versuchen“ (Regel 8)', async () => {
    const user = userEvent.setup();
    previewChange.mockRejectedValueOnce(new Error(PREVIEW_ERROR));
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    await within(zeiten).findByText(/^Bisher:/);
    zeit(zeiten, 'Beginn', '07:00');
    zeit(zeiten, 'Ende', '17:00');
    await user.click(within(zeiten).getByRole('button', { name: 'Weiter' }));

    const abschluss = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    expect(await within(abschluss).findByText(PREVIEW_ERROR)).toBeInTheDocument();
    expect(within(abschluss).queryByText(/Keine Termine/)).toBeNull();
    expect(within(abschluss).getByRole('button', { name: 'Änderung beantragen' })).toBeDisabled();
    await user.click(within(abschluss).getByRole('button', { name: 'Erneut versuchen' }));
    expect(
      await within(abschluss).findByText('Keine Termine außerhalb der neuen Zeiten'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Änderung beantragen' })).toBeEnabled();
  });

  it('sagt im Abschluss, warum der Knopf ruht, wenn „Ändern“ die Änderung zurücknimmt', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Den Wochenplan ab einem Datum' },
      ),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ab wann?' })).getByRole('button', {
        name: 'Ab Dienstag, 1. Dezember',
      }),
    );
    const woche = await screen.findByRole('dialog', {
      name: 'Wochenplan ab 1. Dezember',
    });
    await user.click(await within(woche).findByRole('button', { name: /^Dienstag / }));
    zeit(
      await screen.findByRole('dialog', { name: 'Dienstags ab 1. Dezember' }),
      'Pause ab',
      '12:30',
    );
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Wochenplan ab 1. Dezember' })).getByRole(
        'button',
        { name: 'Weiter' },
      ),
    );

    const abschluss = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    await user.click(await within(abschluss).findByRole('button', { name: 'Dienstag ändern' }));
    zeit(
      await screen.findByRole('dialog', { name: 'Dienstags ab 1. Dezember' }),
      'Pause ab',
      '12:00',
    );
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    const wieder = await screen.findByRole('dialog', { name: 'Änderung beantragen?' });
    expect(within(wieder).getByText('Noch nichts geändert.')).toBeInTheDocument();
    expect(within(wieder).getByRole('button', { name: 'Änderung beantragen' })).toBeDisabled();
    expect(within(wieder).queryByText('Termine werden geprüft …')).toBeNull();
  });

  it('lädt die bisherigen Zeiten nach einem Funkloch mit „Erneut versuchen“ (Regel 8)', async () => {
    const user = userEvent.setup();
    fetchBaseline.mockRejectedValueOnce(new Error(BASELINE_ERROR));
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    expect(await within(zeiten).findByText(BASELINE_ERROR)).toBeInTheDocument();
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeDisabled();
    await user.click(within(zeiten).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await within(zeiten).findByText(/^Bisher:/)).toBeInTheDocument();
    expect(within(zeiten).getByLabelText('Beginn')).toHaveValue('08:00');
  });

  it('schlägt bei einem früheren Schluss kein späteres Ende vor', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    await within(zeiten).findByText(/^Bisher:/);
    zeit(zeiten, 'Ende', '17:00');
    // Der Vorschlag nähme den früheren Schluss zurück; es zählt der Grund.
    expect(within(zeiten).queryByRole('button', { name: /^Ende auf/ })).toBeNull();
    expect(within(zeiten).queryByText(/längeren Pause/)).toBeNull();
    expect(
      within(zeiten).getByText(/Weniger Stunden laufen nicht über diesen Antrag/),
    ).toBeInTheDocument();
  });

  it('nennt den Verstoß an der Zeile des Tages und bringt nach „Tag frei“ die bisherigen Zeiten zurück', async () => {
    const user = userEvent.setup();
    // Samstags zehn Stunden ohne Pause - schon im bisherigen Plan.
    fetchBaseline.mockImplementation((kind: string) =>
      Promise.resolve(
        kind === 'once'
          ? { previous: ANNAS_TAG, previous_minutes: 540, self_entered: false }
          : {
              previous: testWeek({ 6: [{ von: '09:00', bis: '19:00' }] }),
              previous_minutes: 55 * 60,
              self_entered: false,
            },
      ),
    );
    rendern();
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Den Wochenplan ab einem Datum' },
      ),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ab wann?' })).getByRole('button', {
        name: 'Ab Dienstag, 1. Dezember',
      }),
    );
    const woche = await screen.findByRole('dialog', {
      name: 'Wochenplan ab 1. Dezember',
    });
    const samstag = await within(woche).findByRole('button', { name: /^Samstag / });
    expect(within(samstag).getByText('Pause zu kurz')).toBeInTheDocument();
    // Der Fuß nennt den Tag kurz, als Statusmeldung.
    expect(within(woche).getByText('Samstag: Pause zu kurz')).toBeInTheDocument();
    expect(within(woche).getByRole('button', { name: 'Weiter' })).toBeDisabled();

    await user.click(within(woche).getByRole('button', { name: /^Dienstag / }));
    const dienstag = await screen.findByRole('dialog', { name: 'Dienstags ab 1. Dezember' });
    await user.click(within(dienstag).getByRole('button', { name: 'Tag frei' }));
    expect(within(dienstag).getByText('An diesem Tag frei.')).toBeInTheDocument();
    await user.click(within(dienstag).getByRole('button', { name: 'Arbeitszeit eintragen' }));
    expect(within(dienstag).getByLabelText('Beginn')).toHaveValue('08:00');
    expect(within(dienstag).getByLabelText('Ende')).toHaveValue('18:00');
    expect(within(dienstag).getByLabelText('Pause ab')).toHaveValue('12:00');
  });

  it('owner trägt die eigene Änderung ein', async () => {
    const user = userEvent.setup();
    fetchWorkingTime.mockResolvedValue(testWorkingTime({ self_entered: true, can_decide: true }));
    previewChange.mockResolvedValue({
      previous: ANNAS_TAG,
      previous_minutes: 540,
      new_minutes: 540,
      unchanged: false,
      reduced: false,
      problems: [],
      appointment_days: [{ on_date: '2026-10-20', appointments: 1 }],
      self_entered: true,
    });
    rendern(['owner']);
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Was möchten Sie ändern?' })).getByRole(
        'button',
        { name: 'Einen Tag' },
      ),
    );
    await user.click(
      tag(
        await screen.findByRole('dialog', { name: 'An welchem Tag?' }),
        'Dienstag, 20. Oktober 2026',
      ),
    );
    const zeiten = await screen.findByRole('dialog', {
      name: 'Ihre Zeiten am Dienstag, 20. Oktober',
    });
    await within(zeiten).findByText(/^Bisher:/);
    zeit(zeiten, 'Beginn', '07:30');
    zeit(zeiten, 'Ende', '17:30');
    await user.click(within(zeiten).getByRole('button', { name: 'Weiter' }));
    const abschluss = await screen.findByRole('dialog', { name: 'Änderung eintragen?' });
    expect(
      await within(abschluss).findByText('Sie tragen die Änderung selbst ein'),
    ).toBeInTheDocument();
    // Wer selbst einträgt, plant selbst um - das sagt die Terminzeile (BEF-219).
    expect(
      await within(abschluss).findByText('20. Okt.: 1 · nach dem Eintragen umplanen'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByText('Sie gilt für den Tag sofort.')).toBeInTheDocument();
    await user.click(await within(abschluss).findByRole('button', { name: 'Änderung eintragen' }));
    expect(
      await screen.findByText(
        'Ziel /betrieb/arbeitszeit: Änderung eingetragen: Einmalig: Dienstag, 20. Oktober.',
      ),
    ).toBeInTheDocument();
  });
});
