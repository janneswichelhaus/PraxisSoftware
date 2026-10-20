import { describe, expect, it } from 'vitest';
import {
  PROFILBILD_MAX_BYTES,
  VERGROESSERUNG_MAX,
  alsBase64,
  ausBase64,
  ausschnitt,
  begrenzt,
  kleinGenug,
  startStand,
  zuschnitt,
} from './profilbild';

/**
 * Das Profilbild auf dem Gerät (TEAM-007, ADR-017 Abschnitt O): Zuschnitt,
 * Größe und die Form, in der es zum Server geht. Dass das Bild keine
 * Metadaten trägt, prüft `entferneMetadaten` (`files/metadaten.test.ts`) und
 * am Inhalt der Server (`supabase/tests/teamchat-profil.test.ts`).
 */

describe('zuschnitt', () => {
  it('nimmt aus dem Querformat das Quadrat in der Mitte', () => {
    expect(zuschnitt(4000, 3000)).toEqual({ x: 500, y: 0, seite: 3000 });
  });

  it('nimmt aus dem Hochformat das Quadrat aus dem oberen Teil', () => {
    expect(zuschnitt(3000, 4000)).toEqual({ x: 0, y: 250, seite: 3000 });
  });

  it('lässt ein Quadrat, wie es ist', () => {
    expect(zuschnitt(256, 256)).toEqual({ x: 0, y: 0, seite: 256 });
  });
});

/** BEF-190 (ADR-017 Fassung 11): den Ausschnitt verschieben und vergrößern. */
describe('Ausschnitt wählen', () => {
  it('beginnt beim festen Ausschnitt von bisher', () => {
    const stand = startStand(3000, 4000);
    expect(stand).toEqual({ mitteX: 1500, mitteY: 1750, vergroesserung: 1 });
    expect(ausschnitt(3000, 4000, stand)).toEqual(zuschnitt(3000, 4000));
  });

  it('vergrößert um die Mitte und bleibt dabei im Foto', () => {
    expect(ausschnitt(4000, 3000, { mitteX: 2000, mitteY: 1500, vergroesserung: 2 })).toEqual({
      x: 1250,
      y: 750,
      seite: 1500,
    });
    // An den Rand geschoben: Das Quadrat endet am Rand, nicht dahinter.
    expect(ausschnitt(4000, 3000, { mitteX: 3990, mitteY: 10, vergroesserung: 2 })).toEqual({
      x: 2500,
      y: 0,
      seite: 1500,
    });
  });

  it('hält Vergrößerung und Mitte in den Grenzen', () => {
    expect(begrenzt(4000, 3000, { mitteX: -500, mitteY: 9000, vergroesserung: 9 })).toEqual({
      mitteX: 500,
      mitteY: 2500,
      vergroesserung: VERGROESSERUNG_MAX,
    });
    expect(begrenzt(4000, 3000, { mitteX: 2000, mitteY: 1500, vergroesserung: 0.2 })).toEqual({
      mitteX: 2000,
      mitteY: 1500,
      vergroesserung: 1,
    });
  });
});

describe('kleinGenug', () => {
  it('nimmt die beste Qualität, die unter 64 KiB passt', async () => {
    const versucht: number[] = [];
    const bild = await kleinGenug((q) => {
      versucht.push(q);
      return Promise.resolve(new Blob([new Uint8Array(q > 0.7 ? 70_000 : 40_000)]));
    });
    expect(bild.size).toBe(40_000);
    expect(versucht).toEqual([0.86, 0.75, 0.62]);
  });

  it('gibt auf, wenn nichts passt - mit einem Satz für die Person', async () => {
    await expect(
      kleinGenug(() => Promise.resolve(new Blob([new Uint8Array(PROFILBILD_MAX_BYTES + 1)]))),
    ).rejects.toThrow('Das Foto ist zu groß. Bitte ein kleineres wählen.');
  });
});

describe('Base64', () => {
  it('bringt die Bytes unverändert hin und zurück, auch über 32 KiB', async () => {
    const bytes = Uint8Array.from({ length: 50_000 }, (_, i) => (i * 31) % 256);
    const text = alsBase64(bytes);
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const zurueck = ausBase64(text);
    expect(zurueck.type).toBe('image/jpeg');
    expect(new Uint8Array(await zurueck.arrayBuffer())).toEqual(bytes);
  });
});
