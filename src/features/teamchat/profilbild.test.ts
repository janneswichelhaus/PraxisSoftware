import { describe, expect, it } from 'vitest';
import { PROFILBILD_MAX_BYTES, alsBase64, ausBase64, kleinGenug, zuschnitt } from './profilbild';

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
