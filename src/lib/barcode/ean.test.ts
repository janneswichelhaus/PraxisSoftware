import { describe, expect, it } from 'vitest';
import { eanAusBild, eanAusZeile } from './ean';
import { pruefziffer } from './gtin';
import { alsRgba, eanGraubild, eanModule, eanZeile } from './testbilder';

/** Ein fester Zufall, damit jeder Lauf dieselben Zeilen prüft. */
function zufall(start: number) {
  let s = start >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EAN13 = ['4006381333931', '2000000000008', '9783161484100', '0036000291452'];

describe('EAN lesen', () => {
  it('kennt die Module: 95 für EAN-13, 67 für EAN-8', () => {
    expect(eanModule('4006381333931')).toHaveLength(95);
    expect(eanModule('96385074')).toHaveLength(67);
    expect(() => eanModule('12345')).toThrow();
  });

  it('liest EAN-13, UPC-A als EAN-13 und EAN-8 aus einer sauberen Zeile', () => {
    for (const code of [...EAN13, '96385074']) {
      expect(eanAusZeile(eanZeile(code)), code).toBe(code);
    }
  });

  it('liest bei 1 bis 6 Pixeln je Modul, auch gebrochen', () => {
    for (const modul of [1, 1.5, 2, 2.7, 4, 6]) {
      expect(eanAusZeile(eanZeile('4006381333931', { modul })), String(modul)).toBe(
        '4006381333931',
      );
    }
  });

  it('liest unscharf, verrauscht und mit wenig Kontrast', () => {
    const z = zufall(7);
    for (const code of EAN13) {
      const zeile = eanZeile(code, {
        modul: 4,
        unschaerfe: 1,
        rauschen: 25,
        hell: 190,
        dunkel: 70,
        zufall: z,
      });
      expect(eanAusZeile(zeile), code).toBe(code);
    }
  });

  it('liest rückwärts, wenn der Barcode auf dem Kopf steht', () => {
    expect(eanAusZeile(eanZeile('4006381333931', { modul: 3 }).reverse())).toBe('4006381333931');
    expect(eanAusZeile(eanZeile('96385074', { modul: 2 }).reverse())).toBe('96385074');
  });

  it('liest je Zeile verlässlich bei Unschärfe, Rauschen und ungleichem Licht', () => {
    const z = zufall(3);
    const lagen = [
      { modul: 3, unschaerfe: 1, rauschen: 20, verlauf: 0 },
      { modul: 3, unschaerfe: 1, rauschen: 15, verlauf: 60 },
      { modul: 4, unschaerfe: 1, rauschen: 25, verlauf: 80 },
      { modul: 4, unschaerfe: 2, rauschen: 20, verlauf: 0 },
    ];
    for (const { verlauf, ...wahl } of lagen) {
      let gelesen = 0;
      for (let i = 0; i < 100; i += 1) {
        const ziffern = Array.from({ length: 12 }, () => Math.floor(z() * 10)).join('');
        const code = `${ziffern}${pruefziffer(ziffern)}`;
        const zeile = eanZeile(code, { ...wahl, hell: 200, dunkel: 60, zufall: z }).map((w, x, a) =>
          Math.max(0, Math.min(255, Math.round(w + (x / a.length - 0.5) * verlauf))),
        );
        if (eanAusZeile(zeile) === code) gelesen += 1;
      }
      expect(gelesen, JSON.stringify({ verlauf, ...wahl })).toBeGreaterThanOrEqual(85);
    }
  });

  it('liefert nichts bei falscher Prüfziffer, abgeschnittenem Rand, Rauschen, einer Fläche', () => {
    expect(eanAusZeile(eanZeile('4006381333932'))).toBeNull();
    expect(eanAusZeile(eanZeile('96385075'))).toBeNull();
    const ganz = eanZeile('4006381333931', { modul: 3 });
    expect(eanAusZeile(ganz.slice(0, ganz.length - 40))).toBeNull();
    expect(eanAusZeile(ganz.slice(40))).toBeNull();
    const z = zufall(11);
    for (let i = 0; i < 300; i += 1) {
      const rauschen = Array.from({ length: 400 }, () => Math.floor(z() * 256));
      expect(eanAusZeile(rauschen)).toBeNull();
    }
    expect(eanAusZeile(Array<number>(400).fill(200))).toBeNull();
  });

  it('liest ein ganzes Bild mehrfach aus der Mitte', () => {
    const grau = eanGraubild('2000000000008', 640, 480, { modul: 4, balken: 240 });
    const treffer = eanAusBild(alsRgba(grau, 640, 480));
    expect([...treffer.keys()]).toEqual(['2000000000008']);
    expect(treffer.get('2000000000008')).toBeGreaterThanOrEqual(2);
  });
});
