// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alsGtin, barcodeleser } from './erkennung';

// Der Leser des Browsers ist nachgebildet (jsdom und Chromium unter Linux haben keinen):
// Nummern nur mit gültiger Prüfziffer, UPC-E gestreckt, ohne EAN der eigene Leser.

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'BarcodeDetector');
});

function detektorMit(formate: string[], treffer: { rawValue: string; format: string }[]) {
  const detect = vi.fn(() => Promise.resolve(treffer));
  const Klasse = vi.fn(function (this: unknown) {
    return { detect };
  });
  Object.assign(Klasse, { getSupportedFormats: () => Promise.resolve(formate) });
  Object.defineProperty(globalThis, 'BarcodeDetector', { value: Klasse, configurable: true });
  return { Klasse, detect };
}

describe('Barcode erkennen', () => {
  it('nimmt vom Leser des Browsers nur gültige EAN und UPC, UPC-E als UPC-A', () => {
    expect(alsGtin({ rawValue: '4006381333931', format: 'ean_13' })).toBe('4006381333931');
    expect(alsGtin({ rawValue: '4006381333932', format: 'ean_13' })).toBeNull();
    expect(alsGtin({ rawValue: '04252614', format: 'upc_e' })).toBe('042100005264');
    expect(alsGtin({ rawValue: 'https://beispiel.invalid', format: 'qr_code' })).toBeNull();
  });

  it('nutzt den Leser des Browsers, wo er EAN kennt, nur mit diesen Formaten', async () => {
    const { Klasse } = detektorMit(
      ['qr_code', 'ean_13', 'ean_8', 'upc_a'],
      [
        { rawValue: '4006381333931', format: 'ean_13' },
        { rawValue: '4006381333932', format: 'ean_13' },
      ],
    );
    const leser = await barcodeleser();
    expect(Klasse).toHaveBeenCalledWith({ formats: ['ean_13', 'ean_8', 'upc_a'] });
    expect(await leser.lesen(document.createElement('video'))).toEqual(['4006381333931']);
  });

  it('ohne EAN im Leser des Browsers: der eigene Leser', async () => {
    const { Klasse } = detektorMit(['qr_code'], []);
    const leser = await barcodeleser();
    expect(Klasse).not.toHaveBeenCalled();
    // Ein Video ohne Bild liefert dem eigenen Leser nichts.
    expect(await leser.lesen(document.createElement('video'))).toEqual([]);
    leser.beenden();
  });
});
