import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as TeamchatApi from './api';

/**
 * „Bearbeiten“ im Ausgang (ANN-654): Zurück ins Feld geht nur, was nicht
 * gerade zum Server geht - sonst stünde die Nachricht danach zweimal da
 * (Zweitreview TEAM-005, Runde 3, V1). Die Oberfläche bietet es nur dann an;
 * der Ausgang verlässt sich nicht darauf.
 */

const senden = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamchatApi>()),
  sendeNachricht: (...a: unknown[]): unknown => senden(...a),
}));

const { TeamchatFehler } = await import('./api');
const { ausgangLeeren, ausgangZurueckInsFeld, einreihen, offeneImAusgang } =
  await import('./ausgang');

function gesendet(): string {
  const id = crypto.randomUUID();
  einreihen('anna', null, {
    id,
    kanalId: 'k-allgemein',
    threadId: null,
    text: 'Rad 3 ist frei',
    erwaehnt: [],
    anhaenge: [],
    alle: false,
    auchImKanal: false,
    um: null,
  });
  return id;
}

afterEach(() => {
  ausgangLeeren();
  senden.mockReset();
});

describe('Bearbeiten im Ausgang', () => {
  it('holt eine Nachricht nicht zurück, während sie zum Server geht', () => {
    senden.mockReturnValue(new Promise(() => undefined));
    const id = gesendet();
    expect(ausgangZurueckInsFeld(id)).toBeUndefined();
    expect(offeneImAusgang('anna')).toBe(1);
  });

  it('holt eine Nachricht ohne Netz nicht zurück - sie kann schon angekommen sein', async () => {
    senden.mockRejectedValue(new TeamchatFehler('Kein Netz', true));
    const id = gesendet();
    await vi.waitFor(() => expect(senden).toHaveBeenCalledTimes(1));
    await new Promise((weiter) => setTimeout(weiter, 0));
    expect(ausgangZurueckInsFeld(id)).toBeUndefined();
    expect(offeneImAusgang('anna')).toBe(1);
  });

  it('holt eine abgelehnte Nachricht mit ihrem Text zurück', async () => {
    senden.mockRejectedValue(new TeamchatFehler('Der Server hat abgelehnt.', false));
    const id = gesendet();
    await vi.waitFor(() => expect(senden).toHaveBeenCalledTimes(1));
    await new Promise((weiter) => setTimeout(weiter, 0));
    expect(ausgangZurueckInsFeld(id)?.text).toBe('Rad 3 ist frei');
    expect(offeneImAusgang('anna')).toBe(0);
  });
});
