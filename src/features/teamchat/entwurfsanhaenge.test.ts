import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TeamchatApi from './api';

/**
 * Anhänge im Entwurf (TEAM-003, ADR-017 Punkt 74): je Konto, Gespräch und
 * Thread, nur im Arbeitsspeicher; Hochladen im Hintergrund, Entfernen auch am
 * Server, beim Abmelden fällt alles.
 */

const ladeAnhangHoch = vi.fn();
const verwirfAnhang = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamchatApi>()),
  ladeAnhangHoch: (...a: unknown[]) => ladeAnhangHoch(...a) as unknown,
  verwirfAnhang: (...a: unknown[]) => verwirfAnhang(...a) as unknown,
}));

const { TeamchatFehler } = await import('./api');
const {
  anhaengeAbgeben,
  anhaengeLeeren,
  anhaengeVon,
  anhaengeWiederholen,
  anhaengen,
  anhangEntfernen,
  anhangErneut,
  anhangName,
  fotoName,
} = await import('./entwurfsanhaenge');

const datei = (name: string, typ = 'application/pdf') => ({
  datei: new Blob(['x'], { type: typ }),
  name,
});

function fertig(name: string) {
  return { id: `server-${name}`, name, mime_type: 'application/pdf', byte_size: 1 };
}

beforeEach(() => {
  anhaengeLeeren();
  ladeAnhangHoch.mockReset();
  verwirfAnhang.mockReset();
  verwirfAnhang.mockResolvedValue(undefined);
  ladeAnhangHoch.mockImplementation((_kanal: string, _datei: Blob, name: string) =>
    Promise.resolve(fertig(name)),
  );
});

describe('Anhänge im Entwurf (TEAM-003)', () => {
  it('hält Anhänge je Konto, Gespräch und Thread getrennt - beim Wechsel wandert nichts mit', async () => {
    anhaengen('anna', 'k1', null, [datei('Plan.pdf')]);
    anhaengen('anna', 'k1', 't1', [datei('Antwort.pdf')]);
    anhaengen('tim', 'k1', null, [datei('Tims.pdf')]);
    await vi.waitFor(() =>
      expect(anhaengeVon('anna', 'k1', null).every((a) => a.zustand === 'bereit')).toBe(true),
    );
    expect(anhaengeVon('anna', 'k1', null).map((a) => a.name)).toEqual(['Plan.pdf']);
    expect(anhaengeVon('anna', 'k1', 't1').map((a) => a.name)).toEqual(['Antwort.pdf']);
    expect(anhaengeVon('anna', 'k2', null)).toEqual([]);
    expect(ladeAnhangHoch).toHaveBeenCalledWith('k1', expect.any(Blob), 'Plan.pdf');
  });

  it('nimmt höchstens fünf und meldet, wie viele darüber lagen', () => {
    const ueber = anhaengen(
      'anna',
      'k1',
      null,
      [1, 2, 3, 4, 5, 6, 7].map((n) => datei(`${n}.pdf`)),
    );
    expect(ueber).toBe(2);
    expect(anhaengeVon('anna', 'k1', null)).toHaveLength(5);
    expect(anhaengen('anna', 'k1', null, [datei('8.pdf')])).toBe(1);
  });

  it('gibt nur fertige Anhänge ab und leert den Entwurf ohne zu verwerfen', async () => {
    anhaengen('anna', 'k1', null, [datei('a.pdf'), datei('b.pdf')]);
    await vi.waitFor(() =>
      expect(anhaengeVon('anna', 'k1', null).every((a) => a.zustand === 'bereit')).toBe(true),
    );
    expect(anhaengeAbgeben('anna', 'k1', null).map((a) => a.id)).toEqual([
      'server-a.pdf',
      'server-b.pdf',
    ]);
    expect(anhaengeVon('anna', 'k1', null)).toEqual([]);
    expect(verwirfAnhang).not.toHaveBeenCalled();
  });

  it('verwirft am Server, was entfernt wird - auch wenn das Hochladen erst danach fertig ist', async () => {
    let fertigMelden: (wert: unknown) => void = () => undefined;
    ladeAnhangHoch.mockReturnValueOnce(new Promise((aufloesen) => (fertigMelden = aufloesen)));
    anhaengen('anna', 'k1', null, [datei('spaet.pdf'), datei('frueh.pdf')]);
    await vi.waitFor(() =>
      expect(anhaengeVon('anna', 'k1', null).find((a) => a.name === 'frueh.pdf')?.zustand).toBe(
        'bereit',
      ),
    );
    const [spaet, frueh] = anhaengeVon('anna', 'k1', null);
    anhangEntfernen(frueh!.lokalId);
    expect(verwirfAnhang).toHaveBeenCalledWith('server-frueh.pdf');
    anhangEntfernen(spaet!.lokalId);
    expect(verwirfAnhang).toHaveBeenCalledTimes(1);
    fertigMelden(fertig('spaet.pdf'));
    await vi.waitFor(() => expect(verwirfAnhang).toHaveBeenCalledWith('server-spaet.pdf'));
    expect(anhaengeVon('anna', 'k1', null)).toEqual([]);
  });

  it('bietet nach fehlendem Netz einen neuen Versuch an, nach falschem Format nicht', async () => {
    ladeAnhangHoch
      .mockRejectedValueOnce(
        new TeamchatFehler('Nicht hochgeladen – kein Netz? Bitte noch einmal.', true),
      )
      .mockRejectedValueOnce(new TeamchatFehler('Nur Fotos (JPEG, PNG) und PDF.', false));
    anhaengen('anna', 'k1', null, [datei('netz.pdf'), datei('format.pdf')]);
    await vi.waitFor(() =>
      expect(anhaengeVon('anna', 'k1', null).every((a) => a.zustand === 'fehler')).toBe(true),
    );
    const [netz, format] = anhaengeVon('anna', 'k1', null);
    expect(netz).toMatchObject({
      erneut: true,
      fehler: 'Nicht hochgeladen – kein Netz? Bitte noch einmal.',
    });
    expect(format).toMatchObject({ erneut: false, fehler: 'Nur Fotos (JPEG, PNG) und PDF.' });
    anhangErneut(netz!.lokalId);
    await vi.waitFor(() => expect(anhaengeVon('anna', 'k1', null)[0]?.zustand).toBe('bereit'));
  });

  it('versucht es von selbst noch einmal - mit dem Netz und im Takt wie der Ausgang', async () => {
    ladeAnhangHoch.mockRejectedValueOnce(
      new TeamchatFehler('Nicht hochgeladen – kein Netz? Bitte noch einmal.', true),
    );
    anhaengen('anna', 'k1', null, [datei('funkloch.pdf')]);
    await vi.waitFor(() => expect(anhaengeVon('anna', 'k1', null)[0]?.zustand).toBe('fehler'));
    // Das rufen das Ereignis „online“ und der Takt von 15 Sekunden auf.
    anhaengeWiederholen();
    await vi.waitFor(() => expect(anhaengeVon('anna', 'k1', null)[0]?.zustand).toBe('bereit'));
    expect(ladeAnhangHoch).toHaveBeenCalledTimes(2);
  });

  it('räumt beim Abmelden alles ab', () => {
    anhaengen('anna', 'k1', null, [datei('a.pdf')]);
    anhaengen('tim', 'k2', null, [datei('b.pdf')]);
    anhaengeLeeren();
    expect(anhaengeVon('anna', 'k1', null)).toEqual([]);
    expect(anhaengeVon('tim', 'k2', null)).toEqual([]);
  });

  it('zählt Fotos aus derselben Minute, damit sie sich ohne Vorschaubild unterscheiden', () => {
    const jetzt = new Date('2026-10-18T17:34:20Z');
    expect(fotoName('Europe/Berlin', [], jetzt)).toBe('Foto 18.10., 19:34');
    expect(fotoName('Europe/Berlin', ['Foto 18.10., 19:34'], jetzt)).toBe('Foto 18.10., 19:34 (2)');
    expect(fotoName('Europe/Berlin', ['Foto 18.10., 19:34', 'Foto 18.10., 19:34 (2)'], jetzt)).toBe(
      'Foto 18.10., 19:34 (3)',
    );
  });

  it('nimmt den Namen ohne Steuerzeichen, höchstens 120 Zeichen', () => {
    expect(anhangName('  Plan\nKW 43.pdf ')).toBe('Plan KW 43.pdf');
    expect(anhangName('')).toBe('Datei');
    expect(anhangName('a'.repeat(200))).toHaveLength(120);
  });
});
