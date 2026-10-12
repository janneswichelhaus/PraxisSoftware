import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type * as PlattformApi from './api';
import type { EigenePlaene, Einheitsereignis, Plattformzugang, Uebertragung } from './api';
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
const einheitUebertragen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlaene: (...a: unknown[]) => ladePlaene(...a) as Promise<EigenePlaene>,
  einheitUebertragen: (...a: unknown[]) => einheitUebertragen(...a) as Promise<Uebertragung>,
}));

const { Durchfuehrung } = await import('./Durchfuehrung');
const { UebertragungAbgewiesen } = await import('./api');
const {
  DurchfuehrungKontext,
  ablageZuruecksetzen,
  ereignisAblegen,
  geraetetag,
  plaeneAblegen,
  uebertragen,
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
  for (const f of [ladePlaene, einheitUebertragen]) f.mockReset();
  ladePlaene.mockResolvedValue({ today: geraetetag(), plans: [ZWEI] });
  einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
    Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
  );
});

describe('Durchführungsansicht (UEB-010, TRK-008)', () => {
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
    // Die Pause der Fachperson: 30 Sekunden.
    expect(screen.getByRole('status')).toHaveTextContent('Pause: 30 Sekunden.');
    await waitFor(() =>
      expect(screen.getByTestId('uebertragungsstand')).toHaveTextContent('Alles übertragen.'),
    );

    await user.click(screen.getByRole('button', { name: '2. Durchgang' }));
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
    await waitFor(() =>
      expect(screen.getByTestId('uebertragungsstand')).toHaveTextContent(
        'Auf dem Gerät gespeichert, noch nicht übertragen.',
      ),
    );
    expect(erster).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Nicht gespeichert/)).not.toBeInTheDocument();
    const [wartend] = await wartendeEinheiten(KONTO);
    expect(wartend!.ereignisse).toHaveLength(1);

    // Wieder Verbindung: alles geht hinüber, nichts wartet mehr.
    einheitUebertragen.mockImplementation((_z: string, e: Sendung) =>
      Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
    );
    await act(() => uebertragen(KONTO));
    await waitFor(() =>
      expect(screen.getByTestId('uebertragungsstand')).toHaveTextContent('Alles übertragen.'),
    );
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
    expect(await screen.findByRole('button', { name: '2. Durchgang' })).toHaveAttribute(
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
    expect(await screen.findByRole('button', { name: '3. Durchgang' })).toHaveAttribute(
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
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
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
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    const anstrengung = screen.getByRole('group', { name: 'Wie anstrengend war die Einheit?' });
    const schmerz = screen.getByRole('group', {
      name: 'Wie stark waren Schmerzen während der Einheit?',
    });
    for (const gruppe of [anstrengung, schmerz]) {
      expect(
        within(gruppe)
          .getAllByRole('radio')
          .some((r) => (r as HTMLInputElement).checked),
      ).toBe(false);
    }
    await user.click(within(anstrengung).getByLabelText('6'));
    // Gewählt und wieder entfernt heißt: keine Angabe.
    await user.click(within(schmerz).getByLabelText('2'));
    await user.click(within(schmerz).getByRole('button', { name: /Angabe entfernen/ }));
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(gesendet().at(-1)).toEqual(
        expect.objectContaining({ kind: 'finish', note: '', values: { session_exertion: 6 } }),
      ),
    );
    // Keine Einordnung des Werts (ADR-006 Punkt 11).
    expect(screen.queryByText(/hoch|zu viel|Warnung|reduzieren/i)).not.toBeInTheDocument();
  });

  it('fragt im Training ohne Einwilligung nicht nach dem Befinden (ADR-021 Punkt 4)', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByLabelText(/schwierig/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /anstrengend/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(gesendet().at(-1)).toEqual(
        expect.objectContaining({ kind: 'finish', note: '', values: {} }),
      ),
    );
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
    expect(await screen.findByText(/Ihr Plan vom letzten Laden/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1. Durchgang' }));
    await waitFor(async () => expect(await wartendeEinheiten(KONTO)).toHaveLength(1));
  });

  it('ohne abgelegten Plan: sagt, dass nichts geladen ist', async () => {
    ladePlaene.mockRejectedValue(new Error('Ihre Übungen konnten nicht geladen werden.'));
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    expect(
      await screen.findByText('Ihre Übungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('ohne Übertragung (lokale Ansicht): sagt, dass erst nach dem Entsperren übertragen wird', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />, { mitNetz: false });
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() =>
      expect(screen.getByTestId('uebertragungsstand')).toHaveTextContent(
        'sobald Verbindung besteht und Sie die Anwendung entsperrt haben',
      ),
    );
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
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.getByText(/noch keinen Durchgang abgehakt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einheit beenden' })).not.toBeInTheDocument();
  });

  it('wurde die Einheit anderswo beendet, kommen die Haken in eine neue', async () => {
    ladePlaene.mockResolvedValue({
      today: geraetetag(),
      plans: [{ ...ZWEI, open_session: { id: 'cccccccc-0000-4000-8000-000000000009', sets: [] } }],
    });
    einheitUebertragen.mockImplementationOnce((_z: string, e: Sendung) =>
      Promise.resolve({ session_id: e.id, status: 'finished', note_dropped: false }),
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

  it('startet die Pause beim nächsten Durchgang neu', async () => {
    const user = userEvent.setup();
    zeige(<Durchfuehrung zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Pause überspringen' }));
    expect(screen.queryByRole('button', { name: 'Pause überspringen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2. Durchgang' }));
    expect(screen.getByRole('button', { name: 'Pause überspringen' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pause: 30 Sekunden.');
  });
});
