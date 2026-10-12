import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ablageLeeren, speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { EntwurfAbgewiesen, ENTWURF_ABWEISUNG, type EntwurfAntwort } from './api';
import {
  entwuerfeLesen,
  entwuerfeUebertragen,
  entwuerfeZuruecksetzen,
  entwurfAmTermin,
  entwurfSchreiben,
  entwurfVerwerfen,
  type Entwurf,
  type EntwurfSender,
} from './entwuerfe';

/** OFF-002: Offline-Entwürfe fallen nie von selbst und kommen additiv an (ADR-024 Punkte 6 bis 8). */

const ANNA = 'konto-anna';
const KOPF = {
  beginn: '2026-10-12T08:00:00Z',
  ende: '2026-10-12T08:45:00Z',
  zeitzone: 'Europe/Berlin',
  name: 'Erika Beispiel',
  terminart: 'home_visit',
};

function sender(antworten: (e: Entwurf) => Promise<EntwurfAntwort>): EntwurfSender & {
  mock: ReturnType<typeof vi.fn>;
} {
  const mock = vi.fn(antworten);
  return Object.assign((e: Entwurf) => mock(e), { mock }) as never;
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  entwuerfeZuruecksetzen();
});

describe('Entwürfe auf dem Gerät (OFF-002)', () => {
  it('schreibt am Termin in einen Entwurf und fällt nicht mit dem Abmelden', async () => {
    const erst = await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: Gangschule.');
    const zweit = await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: Gangschule, Treppe.');
    expect(zweit?.id).toBe(erst?.id);
    await ablageLeeren();
    expect((await entwuerfeLesen(ANNA)).map((e) => e.text)).toEqual([
      'Synthetisch: Gangschule, Treppe.',
    ]);
    expect(await entwuerfeLesen('konto-ben')).toEqual([]);
  });

  it('ein geleertes Feld lässt den Entwurf fallen, Verwerfen ebenso', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch.');
    await entwurfSchreiben(ANNA, 't1', KOPF, '  \n');
    expect(await entwuerfeLesen(ANNA)).toEqual([]);
    const e = await entwurfSchreiben(ANNA, 't2', KOPF, 'Synthetisch.');
    await entwurfVerwerfen(ANNA, e!.id);
    expect(await entwuerfeLesen(ANNA)).toEqual([]);
  });

  it('nimmt nicht mehr an, als die Dokumentation erlaubt', async () => {
    await expect(entwurfSchreiben(ANNA, 't1', KOPF, 'x'.repeat(20_001))).rejects.toThrow();
  });
});

describe('Übertragung (OFF-002)', () => {
  it('angenommen (created oder known) fällt der Entwurf vom Gerät', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: eins.');
    await entwurfSchreiben(ANNA, 't2', KOPF, 'Synthetisch: zwei.');
    const s = sender((e) =>
      Promise.resolve({ status: e.terminId === 't1' ? 'created' : 'known', note_id: 'n' }),
    );
    expect(await entwuerfeUebertragen(ANNA, s)).toEqual({ angekommen: 2, unterbrochen: false });
    expect(await entwuerfeLesen(ANNA)).toEqual([]);
    expect(s.mock.mock.calls[0]![0]).toMatchObject({ terminId: 't1', text: 'Synthetisch: eins.' });
  });

  it('Konflikt: nichts eingemischt, der Text bleibt mit der vorhandenen Dokumentation stehen', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: offline.');
    const s = sender(() =>
      Promise.resolve({ status: 'conflict', note_id: 'n-final', note_status: 'final' }),
    );
    await entwuerfeUebertragen(ANNA, s);
    const [e] = await entwuerfeLesen(ANNA);
    expect(e).toMatchObject({
      zustand: 'konflikt',
      text: 'Synthetisch: offline.',
      vorhanden: { id: 'n-final', status: 'final' },
    });
    // Nicht mehr wartend: kein zweites Senden, kein Weiterschreiben.
    expect(await entwurfAmTermin(ANNA, 't1')).toBeUndefined();
    await entwuerfeUebertragen(ANNA, s);
    expect(s.mock).toHaveBeenCalledTimes(1);
  });

  it('abgewiesen: der Text bleibt mit dem Grund stehen, bis die Person ihn verwirft', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: abgesagt.');
    const s = sender(() => Promise.reject(new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.abgesagt)));
    await entwuerfeUebertragen(ANNA, s);
    const [e] = await entwuerfeLesen(ANNA);
    expect(e).toMatchObject({ zustand: 'abgewiesen', grund: ENTWURF_ABWEISUNG.abgesagt });
    expect(e!.text).toBe('Synthetisch: abgesagt.');
  });

  it('Funkloch oder gesperrte Sitzung: alles bleibt, wie es ist', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: eins.');
    await entwurfSchreiben(ANNA, 't2', KOPF, 'Synthetisch: zwei.');
    const s = sender(() => Promise.reject(new Error('Netz')));
    expect(await entwuerfeUebertragen(ANNA, s)).toEqual({ angekommen: 0, unterbrochen: true });
    expect(s.mock).toHaveBeenCalledTimes(1);
    expect((await entwuerfeLesen(ANNA)).every((e) => e.zustand === 'wartet')).toBe(true);
  });

  it('während der Übertragung weitergeschrieben: der neue Text fällt nicht still', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: alt.');
    const s = sender(async () => {
      await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: alt, neu.');
      return { status: 'created', note_id: 'n-1' };
    });
    await entwuerfeUebertragen(ANNA, s);
    const [e] = await entwuerfeLesen(ANNA);
    expect(e).toMatchObject({
      zustand: 'konflikt',
      text: 'Synthetisch: alt, neu.',
      vorhanden: { id: 'n-1', status: 'draft' },
    });
  });

  it('eine Übertragung zur Zeit; wer währenddessen anstößt, bekommt eine zweite', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: eins.');
    let freigeben: () => void = () => undefined;
    const s = sender(
      () =>
        new Promise<EntwurfAntwort>((fertig) => {
          freigeben = () => fertig({ status: 'created', note_id: 'n' });
        }),
    );
    const erste = entwuerfeUebertragen(ANNA, s);
    await vi.waitFor(() => expect(s.mock).toHaveBeenCalledTimes(1));
    const zweite = entwuerfeUebertragen(ANNA, s);
    expect(zweite).toBe(erste);
    freigeben();
    await erste;
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
});
