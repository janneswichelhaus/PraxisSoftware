import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type { Antworten } from '@/features/clinical/assessments/antworten';
import { optionKennung } from '@/features/clinical/assessments/schema';
import type * as PlattformApi from './api';
import type { Bogenstand, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Der Fragebogen vor dem ersten Termin als geführter Ablauf in 14 Themen (Handoff Selbstauskunft,
 * 5.2): gespeichert beim Weitergehen, „Später“ wartet darauf, ein Entwurf öffnet beim richtigen
 * Thema, der Abschluss zeigt, was offen ist, „Ändern“ und „Übernehmen“ führen hin und zurück.
 */

const ladeBefundbogen = vi.fn();
const befundbogenSpeichern = vi.fn();
const befundbogenAbsenden = vi.fn();
const befundbogenVerwerfen = vi.fn();
const ladeAbo = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<Bogenstand[]>,
  befundbogenSpeichern: (...args: unknown[]) => befundbogenSpeichern(...args) as Promise<string>,
  befundbogenAbsenden: (...args: unknown[]) => befundbogenAbsenden(...args) as Promise<void>,
  befundbogenVerwerfen: (...args: unknown[]) => befundbogenVerwerfen(...args) as Promise<void>,
  ladeAbo: (...args: unknown[]) => ladeAbo(...args) as Promise<null>,
}));

const { Befundbogen } = await import('./Befundbogen');
const { fuerDiePlattform } = await import('./instrumentwahl');
const { bogenthemen } = await import('./bogenthemen');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};
const ENTWURF = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const SPEICHERFEHLER =
  'Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.';
const THEMEN = bogenthemen(fuerDiePlattform()[0]!);

function entwurf(answers: Antworten): Bogenstand {
  return {
    id: ENTWURF,
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'entwurf',
    recorded_on: '2026-10-27',
    source: 'platform',
    answers,
    updated_at: '2026-10-27T08:00:00.000Z',
    completed_at: null,
  };
}

/** Eine Antwort auf jede Frage der Themen außer `ohne`; „nein“, wo es das gibt, sonst die erste Wahl. */
function beantwortet(ohne: readonly string[] = []): Antworten {
  const antworten: Antworten = {};
  for (const { item, folgeVon } of THEMEN.flatMap((t) => t.fragen)) {
    if (ohne.includes(item.id) || folgeVon) continue;
    const optionen = item.optionen ?? [];
    const wahl = optionKennung(optionen.find((o) => o.label === 'nein') ?? optionen[0] ?? {});
    if (item.typ === 'einzelauswahl') antworten[item.id] = { auswahl: wahl };
    else if (item.typ === 'mehrfachauswahl') antworten[item.id] = { auswahl: [wahl] };
    else if (item.typ === 'skala') antworten[item.id] = { wert: 2 };
    else if (item.typ === 'koerperschema') {
      antworten[item.id] = { markierungen: [{ x: 0.726, y: 0.147, bereich: 'nacken' }] };
    } else antworten[item.id] = { text: 'synthetisch' };
  }
  return antworten;
}

function Ort() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}

function zeige(zugang: Plattformzugang = ZUGANG, pfad = '/p/befundbogen?bereich=treatment') {
  return renderWithProviders(
    <>
      <Befundbogen zugang={zugang} />
      <Ort />
    </>,
    pfad,
  );
}

const knopf = (name: string | RegExp) => screen.getByRole('button', { name });
const ort = () => screen.getByTestId('ort');

beforeEach(() => {
  vi.clearAllMocks();
  ladeBefundbogen.mockResolvedValue([]);
  befundbogenSpeichern.mockResolvedValue(ENTWURF);
  befundbogenAbsenden.mockResolvedValue(undefined);
  befundbogenVerwerfen.mockResolvedValue(undefined);
  ladeAbo.mockResolvedValue(null);
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

// Viele Tipps je Test: Auf einem ausgelasteten Rechner reichen fünf Sekunden nicht immer.
describe('Fragebogen vor dem ersten Termin', { timeout: 20_000 }, () => {
  it('bietet genau die Boegen an, die die Person ausfuellt (ANN-248)', () => {
    const boegen = fuerDiePlattform();
    expect(boegen.map((b) => b.meta.id)).toEqual(['anamnese_v8']);
    expect(boegen.every((b) => b.meta.ausgefuellt_von === 'patient' && b.meta.aktiv)).toBe(true);
  });

  it(
    'führt mit je einem Tipp durch 14 Themen zum Abschluss und sendet Entwurf und Abschluss',
    { timeout: 30_000 },
    async () => {
      const nutzer = userEvent.setup();
      zeige();
      const erstes = await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
      expect(within(erstes).getByText('Fragebogen vor dem ersten Termin')).toBeInTheDocument();
      expect(
        within(erstes).getByText('Ihre Antworten werden beim Weitergehen gespeichert.'),
      ).toBeInTheDocument();
      // Name und Fassung der Vorlage nur im Kleingedruckten.
      expect(
        within(erstes).getByText('Vorlage der Fragen: DIGOTOR GbR, Version 8, 07/2026.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Anamnesebogen Version 8/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Zwischenspeichern' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
      await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');

      let tipps = 0;
      for (let nummer = 1; nummer <= 14; nummer += 1) {
        expect(screen.getByText(`Thema ${nummer} von 14`)).toBeInTheDocument();
        // Das Feld der Praxis und die Hinweise für Papier stehen in keinem Thema.
        expect(screen.queryByText(/Anmerkungen Therapeut/)).toBeNull();
        expect(screen.queryByText(/\(bitte (einzeichnen|kennzeichnen)\)/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Bogen senden' })).toBeNull();
        await nutzer.click(knopf('Weiter'));
        tipps += 1;
      }
      expect(tipps).toBe(14);
      const abschluss = await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
      expect(within(abschluss).getByText('Abschluss')).toBeInTheDocument();
      expect(within(abschluss).getByText('Nicht für akute Beschwerden.')).toBeInTheDocument();
      expect(within(abschluss).getByRole('link', { name: '112 anrufen' })).toBeInTheDocument();
      await nutzer.click(knopf('Bogen senden'));

      await waitFor(() =>
        expect(befundbogenAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, ENTWURF),
      );
      // Gespeichert einmal, beim ersten Weitergehen - danach hatte sich nichts geändert.
      expect(befundbogenSpeichern).toHaveBeenCalledTimes(1);
      expect(befundbogenSpeichern).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        entwurfId: null,
        instrumentId: 'anamnese_v8',
        version: '1.0.0',
        antworten: { beruf: { text: 'Lehrerin' } },
      });
      await waitFor(() => expect(ort()).toHaveTextContent('/p?bereich=treatment&bogen=1'));
    },
  );

  it(
    'speichert bei jedem Wechsel, was sich geändert hat, jedes Mal mit allen Antworten',
    { timeout: 20_000 },
    async () => {
      const nutzer = userEvent.setup();
      zeige();
      await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
      await nutzer.click(knopf('Weiter'));
      expect(befundbogenSpeichern).not.toHaveBeenCalled();

      await nutzer.click(knopf('← Zurück'));
      await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');
      await nutzer.click(knopf('Weiter'));
      await waitFor(() => expect(befundbogenSpeichern).toHaveBeenCalledTimes(1));
      expect(befundbogenSpeichern).toHaveBeenLastCalledWith(
        expect.objectContaining({ entwurfId: null, antworten: { beruf: { text: 'Lehrerin' } } }),
      );

      await nutzer.click(knopf('Weiter'));
      const schmerzen = screen.getByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
      await nutzer.click(within(schmerzen).getByRole('button', { name: 'ja' }));
      // Auch „Zurück“ speichert - mit der Kennung des Entwurfs und allen Antworten.
      await nutzer.click(knopf('← Zurück'));
      await waitFor(() => expect(befundbogenSpeichern).toHaveBeenCalledTimes(2));
      expect(befundbogenSpeichern).toHaveBeenLastCalledWith(
        expect.objectContaining({
          entwurfId: ENTWURF,
          antworten: { beruf: { text: 'Lehrerin' }, schmerzen_aktuell: { auswahl: 'ja' } },
        }),
      );
      expect(screen.getByText('Thema 2 von 14')).toBeInTheDocument();
    },
  );

  it('zeigt einen Fehler beim Speichern über dem Fuß; der nächste Wechsel speichert wieder', async () => {
    const nutzer = userEvent.setup();
    befundbogenSpeichern.mockRejectedValueOnce(new Error(SPEICHERFEHLER));
    zeige();
    await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');
    await nutzer.click(knopf('Weiter'));
    // Die nächste Seite steht sofort, der Fehler über dem Fuß.
    expect(screen.getByText('Thema 2 von 14')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(SPEICHERFEHLER);
    await nutzer.click(knopf('Weiter'));
    await waitFor(() => expect(befundbogenSpeichern).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(SPEICHERFEHLER)).toBeNull());
  });

  it('wartet ohne Netz mit dem Speichern und holt es mit der Verbindung nach', async () => {
    const nutzer = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    expect(within(fenster).getByText(/^Keine Verbindung\./)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');
    await nutzer.click(knopf('Weiter'));
    // Antworten und „Weiter“ gehen; gespeichert wird erst mit Verbindung, ohne Fehler davor.
    expect(screen.getByText('Thema 2 von 14')).toBeInTheDocument();
    expect(befundbogenSpeichern).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(befundbogenSpeichern).toHaveBeenCalledTimes(1));
  });

  it('„Später“ wartet auf das Speichern und führt dann zur Übersicht', async () => {
    const nutzer = userEvent.setup();
    let fertig: (id: string) => void = () => undefined;
    befundbogenSpeichern.mockImplementation(
      () =>
        new Promise<string>((aufloesen) => {
          fertig = aufloesen;
        }),
    );
    zeige();
    await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');
    await nutzer.click(knopf('Später'));
    expect(befundbogenSpeichern).toHaveBeenCalledTimes(1);
    expect(ort()).toHaveTextContent('/p/befundbogen?bereich=treatment');
    await act(async () => {
      fertig(ENTWURF);
      await Promise.resolve();
    });
    await waitFor(() => expect(ort()).toHaveTextContent(/^\/p\?bereich=treatment$/));
    expect(screen.queryByRole('dialog', { name: 'Noch nicht gespeichert' })).toBeNull();
  });

  it('„Später“ fragt, wenn das Speichern scheitert', async () => {
    const nutzer = userEvent.setup();
    befundbogenSpeichern.mockRejectedValue(new Error(SPEICHERFEHLER));
    zeige();
    await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    await nutzer.type(screen.getByLabelText('Beruf'), 'Lehrerin');
    await nutzer.click(knopf('Später'));
    const frage = await screen.findByRole('dialog', { name: 'Noch nicht gespeichert' });
    expect(
      within(frage).getByText(
        'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
      ),
    ).toBeInTheDocument();
    expect(ort()).toHaveTextContent('/p/befundbogen?bereich=treatment');
  });

  it('„Später“ ohne Änderung geht sofort, ohne zu speichern', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    await nutzer.click(knopf('Später'));
    await waitFor(() => expect(ort()).toHaveTextContent(/^\/p\?bereich=treatment$/));
    expect(befundbogenSpeichern).not.toHaveBeenCalled();
  });

  it('öffnet mit Entwurf beim Thema nach dem letzten mit einer Antwort, einmal mit Satz', async () => {
    const nutzer = userEvent.setup();
    ladeBefundbogen.mockResolvedValue([
      entwurf({
        beruf: { text: 'Lehrerin' },
        beschwerden_ort: { markierungen: [{ x: 0.185, y: 0.19, bereich: 'schulter_rechts' }] },
      }),
    ]);
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Ihre Schmerzen heute' });
    expect(within(fenster).getByText('Thema 3 von 14')).toBeInTheDocument();
    expect(
      within(fenster).getByText('Ihre bisherigen Antworten sind gespeichert.'),
    ).toBeInTheDocument();
    await nutzer.click(knopf('Weiter'));
    expect(screen.queryByText('Ihre bisherigen Antworten sind gespeichert.')).toBeNull();
    // Der Weg zurück steht offen, bis zum ersten Thema.
    await nutzer.click(knopf('← Zurück'));
    await nutzer.click(knopf('← Zurück'));
    await nutzer.click(knopf('← Zurück'));
    expect(screen.getByLabelText('Beruf')).toHaveValue('Lehrerin');
    expect(screen.queryByRole('button', { name: '← Zurück' })).toBeNull();
  });

  it('öffnet beim Abschluss, wenn das letzte Thema schon eine Antwort hat', async () => {
    ladeBefundbogen.mockResolvedValue([entwurf({ erwartungen_ziele: { text: 'Rad fahren' } })]);
    zeige();
    expect(await screen.findByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
  });

  it(
    'zählt im Abschluss, was offen ist - ohne Folgefragen zu 26 ohne „ja“',
    { timeout: 20_000 },
    async () => {
      const nutzer = userEvent.setup();
      ladeBefundbogen.mockResolvedValue([
        entwurf(
          beantwortet([
            'verbessert_durch',
            'verschlechtert_durch',
            'medikamente',
            'erwartungen_ziele',
          ]),
        ),
      ]);
      zeige();
      const fenster = await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
      const offen = within(fenster).getByRole('list', { name: 'Noch offen' });
      expect(
        within(offen)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual([
        'Was verbessert, was verschlechtert?, 2 Fragen offen, Ändern',
        'Medikamente, 1 Frage offen, Ändern',
        'Untersuchungen, Erwartungen und Ziele, 1 Frage offen, Ändern',
      ]);
      // „Alle Themen“ nennt alle 14 mit „Ändern“.
      await nutzer.click(within(fenster).getByText('Alle Themen'));
      const alle = within(fenster).getByRole('list', { name: 'Alle Themen', hidden: true });
      expect(within(alle).getAllByRole('button', { hidden: true })).toHaveLength(14);
      await pruefeBarrierefreiheit(document.body);

      // Mit „ja“ bei 26 zählen die drei Folgefragen.
      await nutzer.click(
        within(alle).getByRole('button', { name: /^Vorerkrankungen/, hidden: true }),
      );
      const tumor = screen.getByRole('group', {
        name: '26. Hatten Sie jemals einen Tumor oder eine Krebserkrankung?',
      });
      await nutzer.click(within(tumor).getByRole('button', { name: 'ja' }));
      await nutzer.click(knopf('Übernehmen'));
      // Auch „Übernehmen“ speichert, mit allen Antworten.
      await waitFor(() =>
        expect(befundbogenSpeichern).toHaveBeenLastCalledWith(
          expect.objectContaining({
            antworten: expect.objectContaining({ tumor: { auswahl: 'ja' } }) as unknown,
          }),
        ),
      );
      const wieder = within(
        await screen.findByRole('dialog', { name: 'Ist alles richtig?' }),
      ).getByRole('list', { name: 'Noch offen' });
      expect(within(wieder).getByRole('button', { name: /^Vorerkrankungen/ })).toHaveTextContent(
        '3 Fragen offen',
      );
    },
  );

  it('„Ändern“ öffnet das Thema, „Übernehmen“ führt zurück zum Abschluss: zwei Tipps', async () => {
    const nutzer = userEvent.setup();
    ladeBefundbogen.mockResolvedValue([entwurf(beantwortet(['medikamente']))]);
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
    let tipps = 0;
    await nutzer.click(
      within(fenster).getByRole('button', { name: /^Medikamente,\s?1 Frage offen/ }),
    );
    tipps += 1;
    const thema = await screen.findByRole('dialog', {
      name: /^30\. Nehmen Sie momentan Medikamente wie/,
    });
    expect(within(thema).getByText('Thema 12 von 14')).toBeInTheDocument();
    expect(within(thema).queryByRole('button', { name: 'Weiter' })).toBeNull();
    await nutzer.click(within(thema).getByRole('button', { name: 'Übernehmen' }));
    tipps += 1;
    expect(await screen.findByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    expect(tipps).toBe(2);
    // „← Zurück“ aus dem geöffneten Thema führt ebenso zum Abschluss.
    await nutzer.click(screen.getByRole('button', { name: /^Medikamente,\s?1 Frage offen/ }));
    await nutzer.click(knopf('← Zurück'));
    expect(await screen.findByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
  });

  it('zeigt die Folgefragen zu 26 erst mit „ja“; mit Antwort aus einem Entwurf bleiben sie', async () => {
    const nutzer = userEvent.setup();
    // Bis Thema 10 beantwortet: Der Bogen öffnet bei Thema 11.
    const bisZehn = Object.fromEntries(
      Object.entries(beantwortet()).filter(([id]) =>
        THEMEN.slice(0, 10).some((t) => t.fragen.some((f) => f.item.id === id)),
      ),
    );
    ladeBefundbogen.mockResolvedValue([entwurf(bisZehn)]);
    const { unmount } = zeige();
    await screen.findByRole('dialog', { name: 'Vorerkrankungen und Ereignisse' });
    expect(screen.queryByLabelText('26. Welche/n?')).toBeNull();
    const tumor = screen.getByRole('group', {
      name: '26. Hatten Sie jemals einen Tumor oder eine Krebserkrankung?',
    });
    await nutzer.click(within(tumor).getByRole('button', { name: 'ja' }));
    expect(screen.getByLabelText('26. Welche/n?')).toBeInTheDocument();
    expect(screen.getByLabelText('26. Wann?')).toBeInTheDocument();
    expect(screen.getByLabelText('26. Letzte Nachuntersuchung?')).toBeInTheDocument();
    // Ein zweiter Tipp nimmt „ja“ zurück, die Folgefragen gehen mit; sofort danach wäre er ein
    // Doppeltipp und behielte die Wahl (ANN-787), deshalb kommt er hier eine Sekunde später.
    const echt = Date.now.bind(Date);
    const spaeter = vi.spyOn(Date, 'now').mockImplementation(() => echt() + 1000);
    await nutzer.click(within(tumor).getByRole('button', { name: 'ja' }));
    spaeter.mockRestore();
    expect(screen.queryByLabelText('26. Welche/n?')).toBeNull();
    unmount();

    // Mit Antworten in Thema 11 öffnet der Bogen bei Thema 12; einen Schritt zurück.
    ladeBefundbogen.mockResolvedValue([
      entwurf({ ...bisZehn, tumor: { auswahl: 'nein' }, tumor_wann: { text: '2019' } }),
    ]);
    zeige();
    await screen.findByRole('dialog', { name: /^30\. Nehmen Sie momentan Medikamente/ });
    await nutzer.click(knopf('← Zurück'));
    await screen.findByRole('dialog', { name: 'Vorerkrankungen und Ereignisse' });
    expect(screen.getByLabelText('26. Wann?')).toHaveValue('2019');
    expect(screen.queryByLabelText('26. Welche/n?')).toBeNull();
  });

  it('nimmt bei Mehrfachwahl mit „nein“ die anderen zurück und öffnet die eigene Angabe', async () => {
    const nutzer = userEvent.setup();
    ladeBefundbogen.mockResolvedValue([
      entwurf({ schmerzstaerke: { wert: 4 }, beruf: { text: 'Lehrerin' } }),
    ]);
    zeige();
    await screen.findByRole('dialog', { name: 'Schmerzen, Beweglichkeit und Kraft' });
    const art = screen.getByRole('group', {
      name: '4. Haben Sie: Ruheschmerzen, Nachtschmerzen, Dauerschmerzen?',
    });
    const wahl = (name: string) => within(art).getByRole('button', { name });
    await nutzer.click(wahl('Nachtschmerzen'));
    await nutzer.click(wahl('Ruheschmerzen'));
    expect(wahl('Nachtschmerzen')).toHaveAttribute('aria-pressed', 'true');
    await nutzer.click(wahl('nein'));
    expect(wahl('nein')).toHaveAttribute('aria-pressed', 'true');
    expect(wahl('Nachtschmerzen')).toHaveAttribute('aria-pressed', 'false');
    expect(wahl('Ruheschmerzen')).toHaveAttribute('aria-pressed', 'false');
    await nutzer.click(wahl('Dauerschmerzen'));
    expect(wahl('nein')).toHaveAttribute('aria-pressed', 'false');

    // „Sonstiges?“ öffnet ein Feld; gespeichert wird die Angabe mit der Wahl.
    for (let n = 0; n < 3; n += 1) await nutzer.click(knopf('Weiter'));
    const besser = screen.getByRole('group', { name: '12. a) Was verbessert Ihre Beschwerden' });
    await nutzer.click(within(besser).getByRole('button', { name: 'Sonstiges?' }));
    await nutzer.type(screen.getByLabelText('Angabe zu „Sonstiges?“'), 'Wärme');
    await nutzer.click(knopf('Weiter'));
    await waitFor(() =>
      expect(befundbogenSpeichern).toHaveBeenLastCalledWith(
        expect.objectContaining({
          antworten: expect.objectContaining({
            schmerzart: { auswahl: ['dauerschmerzen'] },
            verbessert_durch: { auswahl: ['sonstiges'], freitext: 'Wärme' },
          }) as unknown,
        }),
      ),
    );
  });

  it('zeigt ja/nein als Paar, andere Wahlen als Zeilen, die Skala mit dem Satz der Anker', async () => {
    ladeBefundbogen.mockResolvedValue([
      entwurf({
        beruf: { text: 'Lehrerin' },
        beschwerden_ort: { markierungen: [{ x: 0.726, y: 0.147, bereich: 'nacken' }] },
      }),
    ]);
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Ihre Schmerzen heute' });
    expect(
      within(fenster).getByRole('heading', { level: 3, name: '2. Haben Sie aktuell Schmerzen?' }),
    ).toBeInTheDocument();
    expect(
      within(fenster).getByText('0 heißt „kein Schmerz“, 10 heißt „maximaler Schmerz“.'),
    ).toBeInTheDocument();
    const skala = within(fenster).getByRole('group', { name: '3. Wie stark sind Ihre Schmerzen?' });
    expect(within(skala).getAllByRole('button')).toHaveLength(11);
    expect(within(skala).getByRole('button', { name: '0 – kein Schmerz' })).toBeInTheDocument();
    expect(
      within(skala)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(0);
    await pruefeBarrierefreiheit(document.body);
  });

  it('sagt, dass der Bogen vorliegt, statt ihn noch einmal zu zeigen', async () => {
    ladeBefundbogen.mockResolvedValue([
      {
        ...entwurf({}),
        status: 'abgeschlossen',
        source: 'practice',
        answers: null,
        completed_at: '2026-10-27T08:00:00.000Z',
      },
    ]);
    zeige();
    expect(await screen.findByText('Ihr Fragebogen liegt der Praxis vor')).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Seit 27\.\sOktober( 2026)?\. Hat sich etwas geändert, besprechen Sie es bitte beim Termin\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sagt einer Begleitung, dass die Person den Bogen selbst ausfuellt (ANN-248)', async () => {
    zeige({ ...ZUGANG, access_kind: 'companion', represented_name: 'Max Mustermann' });
    expect(await screen.findByText('Fragebogen für Max Mustermann')).toBeInTheDocument();
    expect(
      screen.getByText(/^Den Fragebogen füllt Max Mustermann selbst aus\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt im Training keinen Bogen', async () => {
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p/befundbogen?bereich=training');
    expect(await screen.findByText('Zurzeit kein Fragebogen')).toBeInTheDocument();
    expect(screen.getByText('Hier gibt es zurzeit nichts auszufüllen.')).toBeInTheDocument();
  });

  it('zeigt der rechtlichen Vertretung das Band unter dem Stand', async () => {
    zeige({ ...ZUGANG, access_kind: 'legal_representative', represented_name: 'Max Mustermann' });
    const fenster = await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    expect(within(fenster).getByText(/Sie handeln für/)).toHaveTextContent(
      'Sie handeln für Max Mustermann',
    );
  });

  it('zeigt einen Fehler beim Senden über dem Satz und bietet „Erneut senden“', async () => {
    const nutzer = userEvent.setup();
    ladeBefundbogen.mockResolvedValue([entwurf(beantwortet())]);
    befundbogenAbsenden.mockRejectedValueOnce(new Error(SPEICHERFEHLER));
    zeige();
    await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
    expect(screen.queryByRole('list', { name: 'Noch offen' })).toBeNull();
    await nutzer.click(knopf('Bogen senden'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SPEICHERFEHLER);
    await nutzer.click(knopf('Erneut senden'));
    await waitFor(() => expect(befundbogenAbsenden).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ort()).toHaveTextContent('/p?bereich=treatment&bogen=1'));
    // Ein Entwurf ohne Änderung wird nicht noch einmal gespeichert.
    expect(befundbogenSpeichern).not.toHaveBeenCalled();
  });

  it('sperrt „Bogen senden“ ohne Netz, mit Satz', async () => {
    const nutzer = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    ladeBefundbogen.mockResolvedValue([entwurf(beantwortet())]);
    zeige();
    await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
    const senden = knopf('Bogen senden');
    expect(senden).toHaveAttribute('aria-disabled', 'true');
    expect(senden).toHaveAccessibleDescription(
      'Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.',
    );
    await nutzer.click(senden);
    expect(befundbogenAbsenden).not.toHaveBeenCalled();
    expect(befundbogenSpeichern).not.toHaveBeenCalled();
  });

  it('verwirft die Antworten nach Rückfrage', async () => {
    const nutzer = userEvent.setup();
    ladeBefundbogen.mockResolvedValue([entwurf({ erwartungen_ziele: { text: 'Rad fahren' } })]);
    zeige();
    await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
    await nutzer.click(knopf('Antworten verwerfen'));
    expect(screen.getByText('Ihre gespeicherten Antworten werden gelöscht.')).toBeInTheDocument();
    await nutzer.click(knopf('Ja, verwerfen'));
    await waitFor(() =>
      expect(befundbogenVerwerfen).toHaveBeenCalledWith(ZUGANG.access_id, ENTWURF),
    );
    await waitFor(() => expect(ort()).toHaveTextContent(/^\/p\?bereich=treatment$/));
  });

  it('bietet ohne Entwurf nichts zum Verwerfen an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
    for (let n = 0; n < 14; n += 1) await nutzer.click(knopf('Weiter'));
    await screen.findByRole('dialog', { name: 'Ist alles richtig?' });
    expect(screen.queryByRole('button', { name: 'Antworten verwerfen' })).toBeNull();
  });

  describe('in der Lesefrist (ANN-810)', () => {
    const ENDE: Plattformzugang = {
      ...ZUGANG,
      writable: false,
      read_until: '2026-11-28T00:00:00+01:00',
    };

    it('zeigt keinen Ablauf mehr; einen eigenen Entwurf verwirft man nach Rückfrage', async () => {
      const nutzer = userEvent.setup();
      ladeBefundbogen.mockResolvedValue([entwurf(beantwortet())]);
      zeige(ENDE);
      // Derselbe Name wie die Zeile der Übersicht (ANN-821).
      expect(await screen.findByText('Angefangener Fragebogen')).toBeInTheDocument();
      expect(
        screen.getByText('Gesendet wurde er nicht. Sie können die Antworten verwerfen.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Kein Fragebogen mehr')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Bogen senden' })).toBeNull();
      await nutzer.click(knopf('Antworten verwerfen'));
      expect(
        screen.getByText(
          'Ihre gespeicherten Antworten werden gelöscht. Gesendet wurden sie nicht.',
        ),
      ).toBeInTheDocument();
      await nutzer.click(knopf('Ja, verwerfen'));
      await waitFor(() =>
        expect(befundbogenVerwerfen).toHaveBeenCalledWith(ZUGANG.access_id, ENTWURF),
      );
      expect(befundbogenSpeichern).not.toHaveBeenCalled();
      expect(befundbogenAbsenden).not.toHaveBeenCalled();
    });

    it('bietet ohne Entwurf und nach dem Senden nichts zum Verwerfen an', async () => {
      zeige(ENDE);
      expect(await screen.findByText('Kein Fragebogen mehr')).toBeInTheDocument();
      expect(
        screen.getByText('Ihre Behandlung ist beendet. Sie können hier noch bis 27.11.2026 lesen.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Antworten verwerfen' })).toBeNull();
    });

    it('nennt einer Vertretung die Person; eine Begleitung verwirft nichts', async () => {
      ladeBefundbogen.mockResolvedValue([entwurf(beantwortet())]);
      const vertretung = { ...ENDE, represented_name: 'Max Mustermann' };
      const { unmount } = zeige({ ...vertretung, access_kind: 'legal_representative' });
      expect(await screen.findByText('Angefangener Fragebogen')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Antworten verwerfen' })).toBeInTheDocument();
      unmount();
      zeige({ ...vertretung, access_kind: 'companion' });
      expect(await screen.findByText('Kein Fragebogen mehr')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Die Behandlung von Max Mustermann ist beendet. Sie können hier noch bis 27.11.2026 lesen.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Antworten verwerfen' })).toBeNull();
    });

    it('fragt nach dem Abo nur, wenn die Lesefrist gilt (ANN-274)', async () => {
      zeige();
      await screen.findByRole('dialog', { name: 'Zu Ihrer Person' });
      expect(ladeAbo).not.toHaveBeenCalled();
    });
  });
});
