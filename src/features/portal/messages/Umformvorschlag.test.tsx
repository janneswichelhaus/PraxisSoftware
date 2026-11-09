import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as MessagesApi from './api';
import type { Rueckfrage } from './api';
import type * as KiUmformen from '@/lib/ki/umformen';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders, testUser } from '@/test-utils';
import {
  NICHTS_UMZUFORMEN,
  VORSCHLAG_OFFEN,
  VORSCHLAG_UEBERNOMMEN,
  umformenNachbildung,
} from './umformen';

// Antworten umformen (ANN-861, ANN-862): ein Vorschlag Satz für Satz mit seiner Quelle unter dem
// Feld; erst „Übernehmen“ setzt ihn ins Feld, und gesendet wird nur, was dort steht.

const fetchRueckfrage = vi.fn<() => Promise<Rueckfrage | null>>();
const answerRueckfrage = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof MessagesApi>()),
  fetchRueckfrage: () => fetchRueckfrage(),
  answerRueckfrage: (...a: unknown[]) => answerRueckfrage(...a) as Promise<void>,
  fetchAktenNachrichten: () => Promise.resolve([]),
}));

const textUmformen = vi.fn();
const umformenVerfuegbar = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/ki/umformen', async (importOriginal) => ({
  ...(await importOriginal<typeof KiUmformen>()),
  textUmformen: (...a: unknown[]) => textUmformen(...a) as Promise<KiUmformen.Umformergebnis>,
  umformenVerfuegbar: () => umformenVerfuegbar(),
}));

const { RueckfragePage } = await import('./RueckfragenPage');

const ID = 'dddddddd-dddd-4ddd-8ddd-000000000001';
const VORGANG: Rueckfrage = {
  id: ID,
  relationship_kind: 'treatment',
  relationship_id: '66666666-6666-4666-8666-000000000002',
  patient_id: '66666666-6666-4666-8666-000000000002',
  training_relationship_id: null,
  given_name: 'Erika',
  family_name: 'Beispiel',
  topic: 'complaint',
  reference_label: null,
  status: 'open',
  due_on: '2026-10-07',
  overdue: false,
  created_at: '2026-10-05T08:00:00Z',
  closed_at: null,
  closed_by_side: null,
  can_answer: true,
  record_assigned_at: null,
  exercise_plan_id: null,
  record_assigned_by_label: null,
  can_assign: false,
  entries: [
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
      side: 'person',
      body: 'Synthetisch: Darf ich wieder Treppen steigen?',
      author_kind: 'self',
      author_label: null,
      created_at: '2026-10-05T08:00:00Z',
    },
  ],
};

const STICHPUNKTE = 'knie li. kühlen, 10 Min. alles ok';
const VORSCHLAG: KiUmformen.Umformvorschlag = {
  saetze: [
    {
      quelle: 'knie li. kühlen, 10 Min.',
      text: 'Knie links kühlen, 10 Minuten.',
      unveraendert: false,
    },
    { quelle: 'alles ok', text: 'alles ok', unveraendert: true },
  ],
  text: 'Knie links kühlen, 10 Minuten. alles ok',
  quelle: 'nachbildung',
};

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <Routes>
      <Route path="/rueckfragen/:messageId" element={<RueckfragePage user={testUser(rollen)} />} />
    </Routes>,
    `/rueckfragen/${ID}`,
  );
}

async function tippen(nutzer: ReturnType<typeof userEvent.setup>, text = STICHPUNKTE) {
  const feld = await screen.findByLabelText('Antwort an die Person');
  await nutzer.type(feld, text);
  return feld;
}

describe('Antwort ausformulieren an der Rückfrage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRueckfrage.mockResolvedValue(VORGANG);
    answerRueckfrage.mockResolvedValue(undefined);
    umformenVerfuegbar.mockResolvedValue(true);
    textUmformen.mockResolvedValue({ ok: true, vorschlag: VORSCHLAG });
  });

  it('schickt nur den eigenen Text und die Rückfrage - nicht die Frage der Person', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));

    await screen.findByRole('heading', { level: 3, name: 'Vorschlag – bitte prüfen' });
    expect(textUmformen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ zweck: 'nachricht.entwurf', rueckfrageId: ID, text: STICHPUNKTE }),
    );
    expect(JSON.stringify(textUmformen.mock.calls)).not.toContain('Treppen');
  });

  it('zeigt je Satz die Quelle und kennzeichnet, was im Wortlaut blieb', async () => {
    const nutzer = userEvent.setup();
    rendern();
    const feld = await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));

    const liste = await screen.findByRole('list', { name: 'Vorschlag Satz für Satz' });
    const [umgeformt, wortlaut] = within(liste).getAllByRole('listitem');
    expect(umgeformt).toHaveTextContent('Knie links kühlen, 10 Minuten.');
    expect(umgeformt).toHaveTextContent('Aus: „knie li. kühlen, 10 Min.“');
    expect(wortlaut).toHaveTextContent('alles ok');
    expect(wortlaut).toHaveTextContent('unverändert');
    expect(wortlaut).not.toHaveTextContent('Aus:');
    expect(screen.getByText(umformenNachbildung('nachricht.entwurf'))).toBeInTheDocument();
    // Das Feld bleibt, wie es ist; ein Hauptknopf je Ansicht.
    expect(feld).toHaveValue(STICHPUNKTE);
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: 'Antwort senden' })).not.toHaveClass('bg-accent');
    expect(screen.queryByRole('button', { name: 'Ausformulieren' })).toBeNull();
  });

  it('sendet nichts, solange der Vorschlag offen ist', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    await screen.findByRole('list', { name: 'Vorschlag Satz für Satz' });

    await nutzer.click(screen.getByRole('button', { name: 'Antwort senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent(VORSCHLAG_OFFEN);
    expect(answerRueckfrage).not.toHaveBeenCalled();
  });

  it('setzt den Vorschlag erst mit „Übernehmen“ ins Feld und sendet dann genau das Feld', async () => {
    const nutzer = userEvent.setup();
    rendern();
    const feld = await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Übernehmen' }));

    expect(feld).toHaveValue(VORSCHLAG.text);
    expect(screen.getByText(VORSCHLAG_UEBERNOMMEN)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Vorschlag Satz für Satz' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toHaveClass('bg-accent');

    await nutzer.click(screen.getByRole('button', { name: 'Antwort senden' }));
    await waitFor(() => expect(answerRueckfrage).toHaveBeenCalledWith(ID, VORSCHLAG.text, null));
  });

  it('holt mit „Rückgängig“ den eigenen Text zurück', async () => {
    const nutzer = userEvent.setup();
    rendern();
    const feld = await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Übernehmen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Rückgängig' }));

    expect(feld).toHaveValue(STICHPUNKTE);
    expect(screen.queryByText(VORSCHLAG_UEBERNOMMEN)).toBeNull();
  });

  it('verwirft ohne Rückfrage und lässt den Vorschlag fallen, wenn weitergetippt wird', async () => {
    const nutzer = userEvent.setup();
    rendern();
    const feld = await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByRole('list', { name: 'Vorschlag Satz für Satz' })).toBeNull();
    expect(feld).toHaveValue(STICHPUNKTE);

    await nutzer.click(screen.getByRole('button', { name: 'Ausformulieren' }));
    await screen.findByRole('list', { name: 'Vorschlag Satz für Satz' });
    await nutzer.type(feld, ' danke');
    expect(screen.queryByRole('list', { name: 'Vorschlag Satz für Satz' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toHaveClass('bg-accent');
  });

  it('sagt, wenn nichts umzuformen ist, und zeigt Fehler des Gateways', async () => {
    const nutzer = userEvent.setup();
    textUmformen.mockResolvedValueOnce({
      ok: true,
      vorschlag: {
        ...VORSCHLAG,
        saetze: [{ quelle: STICHPUNKTE, text: STICHPUNKTE, unveraendert: true }],
      },
    });
    rendern();
    const feld = await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    expect(await screen.findByText(NICHTS_UMZUFORMEN)).toBeInTheDocument();

    textUmformen.mockResolvedValueOnce({
      ok: false,
      fehler: 'forbidden',
      meldung: 'Dafür fehlt hier die Berechtigung.',
    });
    await nutzer.click(screen.getByRole('button', { name: 'Ausformulieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dafür fehlt hier die Berechtigung.',
    );
    expect(feld).toHaveValue(STICHPUNKTE);
  });

  it('verlangt zuerst einen Text', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine Antwort schreiben.');
    expect(textUmformen).not.toHaveBeenCalled();
  });

  it('bleibt weg, wo der Gateway es nicht anbietet oder die Antwort jemand anderem zusteht', async () => {
    umformenVerfuegbar.mockResolvedValue(false);
    const { unmount } = rendern();
    await screen.findByLabelText('Antwort an die Person');
    expect(screen.queryByRole('button', { name: 'Ausformulieren' })).toBeNull();
    unmount();

    umformenVerfuegbar.mockResolvedValue(true);
    fetchRueckfrage.mockResolvedValue({ ...VORGANG, can_answer: false });
    rendern(['office']);
    expect(await screen.findByText(/antworten Therapeut:innen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ausformulieren' })).toBeNull();
  });

  it('besteht mit offenem Vorschlag die Barrierefreiheitsprüfung', async () => {
    const nutzer = userEvent.setup();
    const { container } = rendern();
    await tippen(nutzer);
    await nutzer.click(await screen.findByRole('button', { name: 'Ausformulieren' }));
    await screen.findByRole('list', { name: 'Vorschlag Satz für Satz' });
    await pruefeBarrierefreiheit(container);
  });
});

describe('Antwort in Alltagssprache an der Rückfrage', () => {
  const ANTWORT = 'Das Ödem geht zurück. Bitte weiter kühlen.';
  const ERKLAERT: KiUmformen.Umformvorschlag = {
    saetze: [
      {
        quelle: 'Das Ödem geht zurück.',
        text: 'Das Ödem (Schwellung) geht zurück.',
        unveraendert: false,
      },
      { quelle: 'Bitte weiter kühlen.', text: 'Bitte weiter kühlen.', unveraendert: true },
    ],
    text: 'Das Ödem (Schwellung) geht zurück. Bitte weiter kühlen.',
    quelle: 'nachbildung',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchRueckfrage.mockResolvedValue(VORGANG);
    answerRueckfrage.mockResolvedValue(undefined);
    umformenVerfuegbar.mockResolvedValue(true);
    textUmformen.mockResolvedValue({ ok: true, vorschlag: ERKLAERT });
  });

  it('steht neben „Ausformulieren“ und fragt mit dem eigenen Zweck', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await tippen(nutzer, ANTWORT);
    const knopf = await screen.findByRole('button', { name: 'In Alltagssprache' });
    expect(knopf.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Ausformulieren' }),
    );
    await nutzer.click(knopf);

    await screen.findByRole('list', { name: 'Vorschlag Satz für Satz' });
    expect(textUmformen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        zweck: 'nachricht.alltagssprache',
        rueckfrageId: ID,
        text: ANTWORT,
      }),
    );
    expect(screen.getByText(umformenNachbildung('nachricht.alltagssprache'))).toBeInTheDocument();
    expect(screen.getByText('Aus: „Das Ödem geht zurück.“')).toBeInTheDocument();
  });

  it('sendet nach der Übernahme den erklärten Text', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await tippen(nutzer, ANTWORT);
    await nutzer.click(await screen.findByRole('button', { name: 'In Alltagssprache' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Übernehmen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Antwort senden' }));
    await waitFor(() => expect(answerRueckfrage).toHaveBeenCalledWith(ID, ERKLAERT.text, null));
  });

  it('sperrt beide Knöpfe, solange eine Anfrage läuft', async () => {
    const nutzer = userEvent.setup();
    textUmformen.mockReturnValue(new Promise(() => undefined));
    rendern();
    await tippen(nutzer, ANTWORT);
    await nutzer.click(await screen.findByRole('button', { name: 'In Alltagssprache' }));

    expect(await screen.findByRole('button', { name: 'Wird umgeformt …' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ausformulieren' })).toBeDisabled();
  });
});
