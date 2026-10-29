import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type * as PlattformApi from './api';
import type { EigenePlaene, Einheitsereignis, Plattformzugang, Termin, Uebertragung } from './api';
import { renderWithProviders } from '@/test-utils';
import { speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { eigenerPlan } from './testdaten';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003) mit der Warteschlange auf
 * dem Gerät (TRK-008, ADR-024 Punkte 5, 7 und 8, ANN-358): Übung für Übung,
 * jeder Haken erst auf dem Gerät, dann beim Server; ohne Verbindung bleibt
 * er stehen und wartet.
 */

const ladePlaene = vi.fn();
const ladeTermine = vi.fn();
const einheitUebertragen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlaene: (...a: unknown[]) => ladePlaene(...a) as Promise<EigenePlaene>,
  ladeTermine: (...a: unknown[]) => ladeTermine(...a) as Promise<Termin[]>,
  einheitUebertragen: (...a: unknown[]) => einheitUebertragen(...a) as Promise<Uebertragung>,
}));

const { Durchfuehrung } = await import('./Durchfuehrung');
const { ersteOffeneUebung } = await import('./haken');
const { kalendertag, tagFest } = await import('./zeit');
const { UebertragungAbgewiesen } = await import('./api');
const {
  DurchfuehrungKontext,
  ablageZuruecksetzen,
  ereignisAblegen,
  geraetetag,
  plaeneAblegen,
  uebertragen,
  useWarteschlange,
  wartendeEinheiten,
} = await import('./ablage');

const KONTO = 'eeeeeeee-0000-4000-8000-000000000001';
const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};
const PLAN = eigenerPlan();
const ZWEI = eigenerPlan({
  items: [
    PLAN.items[0]!,
    {
      ...PLAN.items[0]!,
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      position: 2,
      variant_lay_name: 'Gelbes Band heranziehen',
      sets: 2,
      rest_seconds: null,
      note: null,
    },
  ],
});
const PFAD = `/p/uebungen/einheit/${PLAN.id}`;

interface Sendung {
  id: string;
  planId: string;
  ereignisse: Einheitsereignis[];
}

function sendungen(): Sendung[] {
  return einheitUebertragen.mock.calls.map((c) => c[1] as Sendung);
}

/** Alle gesendeten Ereignisse, in der Reihenfolge der Aufrufe. */
function gesendet(): Einheitsereignis[] {
  return sendungen().flatMap((s) => s.ereignisse);
}

function zeige(ui: ReactNode, { mitNetz = true } = {}) {
  return renderWithProviders(
    <DurchfuehrungKontext.Provider
      value={{ besitzer: KONTO, anstossen: mitNetz ? () => uebertragen(KONTO) : null }}
    >
      {ui}
    </DurchfuehrungKontext.Provider>,
    PFAD,
  );
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  ablageZuruecksetzen();
  for (const f of [ladePlaene, ladeTermine, einheitUebertragen]) f.mockReset();
  ladePlaene.mockResolvedValue({ today: geraetetag(), plans: [ZWEI] });
  ladeTermine.mockResolvedValue([]);
  einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
    Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
  );
});

describe('Durchführungsansicht (UEB-010, TRK-008)', () => {
  it('hält die Überschriftenfolge: die Übung als h1, „So geht’s“ als h2 (DR-158)', async () => {
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Am Geländer in die Hocke' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'So geht’s' })).toBeInTheDocument();
  });

  it('führt Übung für Übung, hakt ab und überträgt sofort', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByRole('heading', { name: 'Am Geländer in die Hocke' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Übung 1 von 2')).toBeInTheDocument();
    const erster = screen.getByRole('button', { name: '1. Durchgang' });
    expect(erster).toHaveAttribute('aria-pressed', 'false');
    await user.click(erster);
    await waitFor(() =>
      expect(gesendet()).toEqual([
        expect.objectContaining({
          kind: 'set',
          item_id: PLAN.items[0]!.id,
          set_number: 1,
          done: true,
        }),
      ]),
    );
    expect(einheitUebertragen).toHaveBeenCalledWith(
      ZUGANG.access_id,
      expect.objectContaining({ planId: PLAN.id, tag: geraetetag() }),
    );
    expect(erster).toHaveAttribute('aria-pressed', 'true');
    // Die Pause der Fachperson: 30 Sekunden, einmal angesagt.
    expect(screen.getByText('Pause: 30 Sekunden.')).toBeInTheDocument();
    expect(await screen.findByText('Übertragen an die Praxis')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^2\. Durchgang/ }));
    await waitFor(() => expect(gesendet()).toHaveLength(2));
    // Dieselbe Einheit.
    expect(new Set(sendungen().map((s) => s.id)).size).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    expect(screen.getByRole('heading', { name: 'Gelbes Band heranziehen' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Durchgang/ })).toHaveLength(2);
  });

  it('ohne Verbindung bleibt der Haken stehen und wartet auf dem Gerät (ADR-024 Punkt 5)', async () => {
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    const erster = await screen.findByRole('button', { name: '1. Durchgang' });
    await user.click(erster);
    // Erst nach einer Sekunde Warten (ANN-710).
    expect(
      await screen.findByText('Auf diesem Gerät, noch nicht übertragen', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(erster).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Nicht gespeichert/)).not.toBeInTheDocument();
    const [wartend] = await wartendeEinheiten(KONTO);
    expect(wartend!.ereignisse).toHaveLength(1);

    // Wieder Verbindung: alles geht hinüber, nichts wartet mehr.
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
    );
    await act(() => uebertragen(KONTO));
    expect(await screen.findByText('Übertragen an die Praxis')).toBeInTheDocument();
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('übernimmt die Haken einer heute begonnenen Einheit', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [
        {
          ...ZWEI,
          open_session: {
            id: 'cccccccc-0000-4000-8000-000000000009',
            sets: [{ item_id: PLAN.items[0]!.id, set_number: 2 }],
          },
        },
      ],
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(await screen.findByRole('button', { name: '2. Durchgang erledigt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(sendungen()[0]!.id).toBe('cccccccc-0000-4000-8000-000000000009'));
  });

  it('setzt eine heute auf dem Gerät begonnene Einheit mit ihren Haken fort', async () => {
    await ereignisAblegen(
      KONTO,
      {
        id: 'dddddddd-0000-4000-8000-000000000001',
        zugangId: ZUGANG.access_id,
        planId: PLAN.id,
        tag: geraetetag(),
        begonnenAm: new Date().toISOString(),
      },
      {
        id: 'dddddddd-0000-4000-8000-000000000002',
        kind: 'set',
        at: new Date().toISOString(),
        item_id: PLAN.items[0]!.id,
        set_number: 3,
        done: true,
      },
    );
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(await screen.findByRole('button', { name: '3. Durchgang erledigt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '1. Durchgang' }));
    await waitFor(async () => {
      const [einheit] = await wartendeEinheiten(KONTO);
      expect(einheit!.id).toBe('dddddddd-0000-4000-8000-000000000001');
      expect(einheit!.ereignisse).toHaveLength(2);
    });
  });

  it('beendet mit „schwierig, weil …" und ohne Lob', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.type(screen.getByLabelText('Das war schwierig, weil … (freiwillig)'), 'Knie zieht');
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(gesendet().at(-1)).toEqual(
        expect.objectContaining({ kind: 'finish', note: 'Knie zieht', values: {} }),
      ),
    );
    expect(new Set(sendungen().map((s) => s.id)).size).toBe(1);
    expect(screen.queryByText(/Super|Toll|Prima|Punkte/)).not.toBeInTheDocument();
    await waitFor(async () => expect(await wartendeEinheiten(KONTO)).toEqual([]));
  });

  it('nimmt Anstrengung und Schmerz freiwillig mit, nichts vorausgewählt (TRK-001)', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    const anstrengung = screen.getByRole('group', { name: 'Wie anstrengend war die Einheit?' });
    const schmerz = screen.getByRole('group', {
      name: 'Wie stark waren Schmerzen während der Einheit?',
    });
    for (const gruppe of [anstrengung, schmerz]) {
      expect(
        within(gruppe)
          .getAllByRole('button')
          .some((b) => b.getAttribute('aria-pressed') === 'true'),
      ).toBe(false);
    }
    await user.click(within(anstrengung).getByRole('button', { name: '6' }));
    // Gewählt und mit einem zweiten Tipp zurückgenommen heißt: keine Angabe.
    await user.click(within(schmerz).getByRole('button', { name: '2' }));
    await user.click(within(schmerz).getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(gesendet().at(-1)).toEqual(
        expect.objectContaining({ kind: 'finish', note: '', values: { session_exertion: 6 } }),
      ),
    );
    // Keine Einordnung des Werts (ADR-006 Punkt 11).
    expect(screen.queryByText(/hoch|zu viel|Warnung|reduzieren/i)).not.toBeInTheDocument();
  });

  it('beendet im Training ohne Einwilligung direkt von der letzten Übung (ADR-021 Punkt 4)', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    // Keine Seite „Einheit beenden“: Der eine Hauptknopf speichert.
    expect(screen.queryByRole('button', { name: 'Zum Abschluss' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(gesendet().at(-1)).toEqual(
        expect.objectContaining({ kind: 'finish', note: '', values: {} }),
      ),
    );
    expect(screen.queryByLabelText(/schwierig/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /anstrengend/ })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ihre Trainingsbetreuung sieht sie beim nächsten Termin.'),
    ).toBeInTheDocument();
  });

  it('ohne Einwilligung und ohne Haken führt die letzte Übung zum Abschluss, der nichts speichert', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    await user.click(await screen.findByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(screen.getByText(/noch keinen Durchgang abgehakt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zurück zu den Übungen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einheit beenden' })).not.toBeInTheDocument();
  });

  it('lässt ohne Recht nicht üben', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, can_exercise: false }],
    });
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByText('Mit diesem Plan können Sie hier gerade nicht üben.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Übungen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Durchgang/ })).not.toBeInTheDocument();
  });
});

describe('Ohne Verbindung (TRK-008, ADR-024 Punkte 5 und 8)', () => {
  it('übt am Plan vom letzten Laden, wenn der Server nicht antwortet', async () => {
    await plaeneAblegen(KONTO, ZUGANG.access_id, null, { today: geraetetag(), plans: [ZWEI] });
    ladePlaene.mockRejectedValue(new Error('Ihre Übungen konnten nicht geladen werden.'));
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    // BEF-197: Das Gerät meldet Verbindung, der Server antwortet nicht.
    expect(await screen.findByText(/Die Praxis antwortet gerade nicht/)).toBeInTheDocument();
    expect(screen.queryByText(/Ohne Verbindung/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1. Durchgang' }));
    await waitFor(async () => expect(await wartendeEinheiten(KONTO)).toHaveLength(1));
  });

  it('ohne abgelegten Plan: sagt, dass nichts geladen ist', async () => {
    ladePlaene.mockRejectedValue(new Error('Ihre Übungen konnten nicht geladen werden.'));
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByText('Ihre Übungen lassen sich gerade nicht laden.'),
    ).toBeInTheDocument();
    // Ein Seitentitel wie am Reiter, der Weg zurück als Hauptknopf.
    expect(screen.getByRole('heading', { level: 1, name: 'Übungen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Übungen' })).toBeInTheDocument();
  });

  it('ohne Übertragung (lokale Ansicht): sagt, dass erst nach dem Entsperren übertragen wird', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />, { mitNetz: false });
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(
      await screen.findByText(
        /sobald Verbindung besteht und Sie die Anwendung entsperrt haben/,
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(einheitUebertragen).not.toHaveBeenCalled();
  });

  it('zeigt eine Abweisung des Servers mit Grund und verwirft danach', async () => {
    einheitUebertragen.mockRejectedValue(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(
      await screen.findByText(/Nicht übertragen: Der Plan gilt nicht mehr\./),
    ).toBeInTheDocument();
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Ausblenden' }));
    expect(screen.queryByText(/Nicht übertragen/)).not.toBeInTheDocument();
  });
});

describe('Durchführung nach dem Zweitreview', () => {
  it('bietet ohne einen Haken kein Beenden an', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(screen.getByText(/noch keinen Durchgang abgehakt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einheit beenden' })).not.toBeInTheDocument();
  });

  it('wurde die Einheit anderswo beendet, kommen die Haken in eine neue', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, open_session: { id: 'cccccccc-0000-4000-8000-000000000009', sets: [] } }],
    });
    einheitUebertragen.mockImplementationOnce((_z: string, e: Sendung) =>
      Promise.resolve({ session_id: e.id, status: 'closed', note_dropped: false }),
    );
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(2));
    const [erste, zweite] = sendungen();
    expect(erste!.id).toBe('cccccccc-0000-4000-8000-000000000009');
    expect(zweite!.id).not.toBe(erste!.id);
    expect(zweite!.ereignisse).toEqual(erste!.ereignisse);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('startet die Pause beim nächsten Durchgang neu; Tippen in der Pause hakt ab', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    const zweiter = screen.getByRole('button', { name: /^2\. Durchgang/ });
    expect(zweiter).toHaveTextContent('Pause · 30 Sekunden');
    await user.click(zweiter);
    expect(zweiter).toHaveAttribute('aria-pressed', 'true');
    expect(zweiter).not.toHaveTextContent('Pause');
    expect(screen.getByRole('button', { name: /^3\. Durchgang/ })).toHaveTextContent(
      'Pause · 30 Sekunden',
    );
    expect(screen.getByText('Pause: 30 Sekunden.')).toBeInTheDocument();
    // Nach dem letzten Durchgang keine Pause.
    await user.click(screen.getByRole('button', { name: /^3\. Durchgang/ }));
    expect(screen.queryByText(/Pause ·/)).not.toBeInTheDocument();
    expect(screen.queryByText('Pause: 30 Sekunden.')).not.toBeInTheDocument();
  });
});

describe('Durchführung im Vollbild (DRP-EPIC-008, Handoff 2026-10-24)', () => {
  it('„Weiter üben“ setzt bei der ersten Übung mit offenem Durchgang ein (ANN-711)', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [
        {
          ...ZWEI,
          open_session: {
            id: 'cccccccc-0000-4000-8000-000000000009',
            sets: [1, 2, 3].map((n) => ({ item_id: PLAN.items[0]!.id, set_number: n })),
          },
        },
      ],
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gelbes Band heranziehen' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Übung 2 von 2')).toBeInTheDocument();
    // „Zurück“ im Kopf führt zur vorigen Übung, der Fokus geht auf ihren Namen.
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    const name = screen.getByRole('heading', { level: 1, name: 'Am Geländer in die Hocke' });
    expect(name).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
  });

  it('ersteOffeneUebung: ohne Haken die erste, alles gehakt die letzte', () => {
    const items = [
      { id: 'a', sets: 2 },
      { id: 'b', sets: 1 },
    ];
    expect(ersteOffeneUebung(items, new Set())).toBe(0);
    expect(ersteOffeneUebung(items, new Set(['a:1']))).toBe(0);
    expect(ersteOffeneUebung(items, new Set(['a:1', 'a:2']))).toBe(1);
    expect(ersteOffeneUebung(items, new Set(['a:1', 'a:2', 'b:1']))).toBe(1);
  });

  it('zeigt Bühne, Marken und genau einen Hauptknopf; der Stand erst nach dem ersten Haken', async () => {
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    const buehne = await screen.findByRole('region', { name: 'Am Geländer in die Hocke' });
    expect(within(buehne).getByText('10 bis 12')).toBeInTheDocument();
    expect(within(buehne).getByText('Wiederholungen je Durchgang')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Dosierung' })).toHaveTextContent('3 Durchgänge');
    expect(screen.getByRole('link', { name: 'Später weiter' })).toHaveAttribute(
      'href',
      '/p/uebungen',
    );
    expect(screen.getByRole('button', { name: 'Nächste Übung' })).toBeInTheDocument();
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
    expect(screen.queryByText(/Abbrechen|Vorige Übung|Fertig/)).not.toBeInTheDocument();
  });

  it('ohne Netz spricht der Kopf, nicht die Meldung „Praxis antwortet nicht“ (BEF-197)', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await plaeneAblegen(KONTO, ZUGANG.access_id, null, { today: geraetetag(), plans: [ZWEI] });
      ladePlaene.mockRejectedValue(new Error('Ihre Übungen konnten nicht geladen werden.'));
      zeige(<Durchfuehrung zugang={ZUGANG} />);
      expect(
        await screen.findByText('Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Die Praxis antwortet gerade nicht/)).not.toBeInTheDocument();
    } finally {
      onLine.mockRestore();
    }
  });

  it('endet auf der Seite „Gespeichert“ mit Namen und nächstem Übungstag (ANN-706, ANN-712)', async () => {
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, weekdays: [1, 2, 3, 4, 5, 6, 7], runs_until: '2099-12-31' }],
    });
    ladeTermine.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        starts_at: morgen.toISOString(),
        ends_at: new Date(morgen.getTime() + 3600_000).toISOString(),
        appointment_type: 'home_visit',
        status: 'confirmed',
        staff_name: 'Anna Beispiel',
        location_name: null,
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
        late_notice: false,
        open_request_kind: null,
      },
    ]);
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Einheit beenden' })).toHaveFocus();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Wie war es heute?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alle Angaben sind freiwillig.')).toBeInTheDocument();
    // Tag und Monat hängen mit geschütztem Leerzeichen zusammen.
    expect(screen.getByText(/Heimprogramm Knie/).closest('p')!.textContent).toBe(
      `Heimprogramm Knie · ${tagFest(geraetetag())}`,
    );
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ist bei der Praxis\./).textContent).toBe(
      `Ihre Einheit vom ${tagFest(geraetetag())} ist bei der Praxis.`,
    );
    expect(
      await screen.findByText('Anna Beispiel sieht sie beim nächsten Termin.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nächster Übungstag:/).textContent).toBe(
      `Nächster Übungstag: ${tagFest(kalendertag(morgen))}`,
    );
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/p');
    expect(screen.getByRole('link', { name: 'Zu den Übungen' })).toHaveAttribute(
      'href',
      '/p/uebungen',
    );
    // Die Einheit ist zu Ende; kein Hakenzeile mehr, kein Lob.
    expect(screen.queryByRole('button', { name: /Durchgang/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Super|Toll|Prima|Serie/)).not.toBeInTheDocument();
  });

  it('endet auf „Auf diesem Gerät gespeichert“, wenn die Einheit nicht übertragen ist', async () => {
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Auf diesem Gerät gespeichert' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bis dahin liegt sie nur auf diesem Telefon.')).toBeInTheDocument();
    expect(screen.queryByText(/sieht sie beim nächsten Termin/)).not.toBeInTheDocument();
    // Ohne gewählte Übungstage keine Zeile dazu.
    expect(screen.queryByText(/Nächster Übungstag/)).not.toBeInTheDocument();
    expect(await wartendeEinheiten(KONTO)).toHaveLength(1);
  });
});

describe('Befunde aus den Reviews zu Schritt 2b', () => {
  const ANNA: Termin = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    late_notice: false,
    open_request_kind: null,
  };

  it('nach einem Ende ohne Netz beginnt eine neue Einheit, statt hinter das Ende zu schreiben (BEF-213)', async () => {
    const X = 'cccccccc-0000-4000-8000-000000000009';
    // Der Server kennt X noch offen; auf dem Gerät ist X beendet und wartet.
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [
        {
          ...ZWEI,
          open_session: { id: X, sets: [{ item_id: PLAN.items[0]!.id, set_number: 1 }] },
        },
      ],
    });
    await ereignisAblegen(
      KONTO,
      {
        id: X,
        zugangId: ZUGANG.access_id,
        planId: PLAN.id,
        tag: geraetetag(),
        begonnenAm: new Date().toISOString(),
      },
      { id: 'e-ende', kind: 'finish', at: new Date().toISOString(), note: '', values: {} },
    );
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    // Kein Haken der beendeten Einheit steht da; es geht bei Übung 1 los.
    const erster = await screen.findByRole('button', { name: '1. Durchgang' });
    expect(erster).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Übung 1 von 2')).toBeInTheDocument();
    await user.click(erster);
    await waitFor(async () => expect(await wartendeEinheiten(KONTO)).toHaveLength(2));
    const [beendete, neue] = await wartendeEinheiten(KONTO);
    expect(beendete!.id).toBe(X);
    expect(beendete!.ereignisse.map((e) => e.kind)).toEqual(['finish']);
    expect(neue!.id).not.toBe(X);
    expect(neue!.ereignisse.map((e) => e.kind)).toEqual(['set']);
  });

  it('während des Beendens nimmt die Einheit keinen Haken mehr an (BEF-213)', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    let freigeben: () => void = () => undefined;
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      e.ereignisse.some((x) => x.kind === 'finish')
        ? new Promise((r) => {
            freigeben = () => r({ session_id: e.id, status: 'ok', note_dropped: false });
          })
        : Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
    );
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(gesendet()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(await screen.findByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
    const zweite = screen.getByRole('button', { name: '1. Durchgang' });
    await user.click(zweite);
    expect(zweite).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      freigeben();
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
    expect(gesendet().filter((e) => e.kind === 'set')).toHaveLength(1);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('sagt nach dem ersten Haken ohne Übertragung nie „Übertragen an die Praxis“ (ADR-024 Punkt 8)', async () => {
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
    expect(
      await screen.findByText('Auf diesem Gerät, noch nicht übertragen', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
  });

  it('in der lokalen Ansicht sagt der Fuß nie „übertragen“, auch nicht kurz (ADR-025 Punkt 16)', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />, { mitNetz: false });
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        /sobald Verbindung besteht und Sie die Anwendung entsperrt/,
        {},
        {
          timeout: 3000,
        },
      ),
    ).toBeInTheDocument();
    // Der Stand bleibt beim Wechsel der Übung und zum Abschluss stehen (ANN-710).
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    expect(screen.getByText(/Auf diesem Gerät, noch nicht übertragen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(screen.getByText(/Auf diesem Gerät, noch nicht übertragen/)).toBeInTheDocument();
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
  });

  it('ohne Netz sagt der Fuß nicht „übertragen“, während der Kopf „auf diesem Gerät“ sagt', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      ladePlaene.mockResolvedValue({
        today: geraetetag(),
        plans: [
          {
            ...ZWEI,
            open_session: {
              id: 'cccccccc-0000-4000-8000-000000000009',
              sets: [{ item_id: PLAN.items[0]!.id, set_number: 1 }],
            },
          },
        ],
      });
      zeige(<Durchfuehrung zugang={ZUGANG} />);
      expect(
        await screen.findByText('Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.'),
      ).toBeInTheDocument();
      await act(() => new Promise((r) => setTimeout(r, 50)));
      expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
    } finally {
      onLine.mockRestore();
    }
  });

  it('beim Wiederverbinden bleibt die Einheit am Plan vom Gerät stehen, mit ihrer Übung', async () => {
    await plaeneAblegen(KONTO, ZUGANG.access_id, null, { today: geraetetag(), plans: [ZWEI] });
    let antworten: (p: EigenePlaene) => void = () => undefined;
    ladePlaene.mockImplementation(
      () =>
        new Promise<EigenePlaene>((r) => {
          antworten = r;
        }),
    );
    onlineManager.setOnline(false);
    try {
      const user = userEvent.setup();
      zeige(<Durchfuehrung zugang={ZUGANG} />);
      // Der erste Abruf hält an; geübt wird am Plan vom Gerät.
      await user.click(await screen.findByRole('button', { name: 'Nächste Übung' }));
      expect(
        screen.getByRole('heading', { level: 1, name: 'Gelbes Band heranziehen' }),
      ).toBeInTheDocument();
      act(() => onlineManager.setOnline(true));
      await waitFor(() => expect(ladePlaene).toHaveBeenCalled());
      expect(
        screen.getByRole('heading', { level: 1, name: 'Gelbes Band heranziehen' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Übung wird geladen')).not.toBeInTheDocument();
      await act(async () => {
        antworten({ today: geraetetag(), plans: [ZWEI] });
        await Promise.resolve();
      });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Gelbes Band heranziehen' }),
      ).toBeInTheDocument();
      // Der Plan kommt jetzt vom Server: dieselbe Einheit, ohne die Warnung.
      await waitFor(() =>
        expect(screen.queryByText(/Die Praxis antwortet gerade nicht/)).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('heading', { level: 1, name: 'Gelbes Band heranziehen' }),
      ).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('weist der Server das Ende ab, sagt die Ansicht warum und zeigt keine Endseite', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(gesendet()).toHaveLength(1));
    einheitUebertragen.mockRejectedValue(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByText('Nicht übertragen: Der Plan gilt nicht mehr.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Nicht übertragen/)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: /gespeichert/i })).not.toBeInTheDocument();
  });

  it('nennt am freien Feld, wer den Satz sieht - wie die Endseite (ANN-712)', async () => {
    ladeTermine.mockResolvedValue([ANNA]);
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(await screen.findByText(/Anna Beispiel sieht diesen Satz\./)).toBeInTheDocument();
    // „Zurück“ zur letzten Übung und wieder hin: der Satz bleibt.
    await user.type(screen.getByLabelText('Das war schwierig, weil … (freiwillig)'), 'Knie');
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    expect(screen.getByLabelText('Das war schwierig, weil … (freiwillig)')).toHaveValue('Knie');
  });

  it('ein Tag im Link, den es nicht gibt, bringt die Endseite nicht zu Fall', async () => {
    renderWithProviders(
      <DurchfuehrungKontext.Provider
        value={{ besitzer: KONTO, anstossen: () => uebertragen(KONTO) }}
      >
        <Durchfuehrung zugang={ZUGANG} />
      </DurchfuehrungKontext.Provider>,
      `${PFAD}?gespeichert=1&tag=2026-13-45`,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ist bei der Praxis\./).textContent).toBe(
      `Ihre Einheit vom ${tagFest(geraetetag())} ist bei der Praxis.`,
    );
  });
});

describe('Befunde aus dem Zweitreview, zweite Runde', () => {
  it('nach einer Abweisung sagt der Fuß nie „übertragen“, auch nach „Ausblenden“ (ADR-024 Punkt 8)', async () => {
    einheitUebertragen.mockRejectedValue(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'));
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(
      await screen.findByText(/Nicht übertragen: Der Plan gilt nicht mehr\./),
    ).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ausblenden' }));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByText('Übertragen an die Praxis')).not.toBeInTheDocument();
  });

  it('eine alte Abweisung derselben Einheit macht ein angenommenes Ende nicht zur Abweisung', async () => {
    // Der erste Haken wird abgewiesen, danach nimmt der Server alles an.
    einheitUebertragen.mockRejectedValueOnce(
      new UebertragungAbgewiesen('Diese Übung gibt es nicht mehr.'),
    );
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    expect(await screen.findByText(/Nicht übertragen: Diese Übung/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^2\. Durchgang/ }));
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
  });

  it('nimmt der Server das Ende unter neuer Kennung an („closed“), ist es gespeichert', async () => {
    const X = 'cccccccc-0000-4000-8000-000000000009';
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, open_session: { id: X, sets: [] } }],
    });
    // Die Einheit X ist anderswo beendet: Alles geht unter neuer Kennung hinüber.
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      Promise.resolve({
        session_id: e.id,
        status: e.id === X ? 'closed' : 'ok',
        note_dropped: false,
      }),
    );
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gespeichert' }),
    ).toBeInTheDocument();
    expect(gesendet().filter((e) => e.kind === 'finish')).not.toHaveLength(0);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });
});

describe('Befunde aus dem Zweitreview, dritte Runde', () => {
  it('kommt das Ende während einer abgewiesenen Übertragung dazu, zeigt die Ansicht den Grund, keine Endseite', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    let abweisen: () => void = () => undefined;
    let erste = true;
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) => {
      if (!erste) return Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false });
      erste = false;
      return new Promise((_r, reject) => {
        abweisen = () => reject(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'));
      });
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    // Ohne Einwilligung beendet die letzte Übung direkt (ANN-715).
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await act(async () => {
      abweisen();
      await Promise.resolve();
    });
    expect(
      await screen.findByText('Nicht übertragen: Der Plan gilt nicht mehr.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /gespeichert/i })).not.toBeInTheDocument();
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('legt der Server zu einem Ende nichts an („empty“), sagt die Ansicht es statt „Gespeichert“', async () => {
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      Promise.resolve({
        session_id: e.id,
        status: e.ereignisse.some((x) => x.kind === 'finish') ? 'empty' : 'ok',
        note_dropped: false,
      }),
    );
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Zum Abschluss' }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    expect(
      await screen.findByText(
        'Nicht übertragen: Bei der Praxis ist zu dieser Einheit nichts mehr offen.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /gespeichert/i })).not.toBeInTheDocument();
  });
});

describe('Befunde aus dem Zweitreview, vierte Runde', () => {
  it('eine wiederholte Abweisung derselben Einheit ersetzt die erste (eine Zeile am Reiter)', async () => {
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      Promise.resolve({ session_id: e.id, status: 'empty', note_dropped: false }),
    );
    const einheit = {
      id: 'dddddddd-0000-4000-8000-000000000001',
      zugangId: ZUGANG.access_id,
      planId: PLAN.id,
      tag: geraetetag(),
      begonnenAm: new Date().toISOString(),
    };
    const ende = (id: string) => ({
      id,
      kind: 'finish' as const,
      at: new Date().toISOString(),
      note: '',
      values: {},
    });
    const { result } = renderHook(() => useWarteschlange(KONTO));
    await ereignisAblegen(KONTO, einheit, ende('dddddddd-0000-4000-8000-000000000002'));
    await act(async () => {
      await uebertragen(KONTO);
    });
    await ereignisAblegen(KONTO, einheit, ende('dddddddd-0000-4000-8000-000000000003'));
    await act(async () => {
      await uebertragen(KONTO);
    });
    await waitFor(() =>
      expect(result.current.abgewiesen.map((a) => a.ereignisse)).toEqual([
        ['dddddddd-0000-4000-8000-000000000003'],
      ]),
    );
  });
});
