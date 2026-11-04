import { eanAusBild } from './ean';
import { gtinGueltig, upcEZuUpcA } from './gtin';

/** Liest Nummern aus dem laufenden Kamerabild, im Arbeitsspeicher; `beenden` gibt ihn frei. */
export interface Barcodeleser {
  lesen: (video: HTMLVideoElement) => Promise<string[]>;
  beenden: () => void;
}

interface Erkannt {
  rawValue: string;
  format: string;
}

interface DetektorKlasse {
  new (wahl: { formats: string[] }): { detect: (quelle: HTMLVideoElement) => Promise<Erkannt[]> };
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATE = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Eine Nummer des eingebauten Lesers als GTIN mit gültiger Prüfziffer; UPC-E wird gestreckt. */
export function alsGtin({ rawValue, format }: Erkannt): string | null {
  const code = format === 'upc_e' ? upcEZuUpcA(rawValue) : rawValue;
  return code && FORMATE.includes(format) && gtinGueltig(code) ? code : null;
}

/** Der eigene Leser: ein Bild aus dem Video, davon nur das mittlere Band in die Hand nehmen. */
export function eigenerLeser(): Barcodeleser {
  let leinwand: HTMLCanvasElement | null = document.createElement('canvas');
  return {
    lesen(video) {
      const kontext = leinwand?.getContext('2d', { willReadFrequently: true });
      if (!leinwand || !kontext || video.videoWidth === 0) return Promise.resolve([]);
      const massstab = Math.min(1, 1280 / video.videoWidth);
      const breite = Math.round(video.videoWidth * massstab);
      const hoehe = Math.round(video.videoHeight * massstab);
      if (leinwand.width !== breite) leinwand.width = breite;
      if (leinwand.height !== hoehe) leinwand.height = hoehe;
      kontext.drawImage(video, 0, 0, breite, hoehe);
      const band = Math.round(hoehe * 0.6);
      const bild = kontext.getImageData(0, Math.round((hoehe - band) / 2), breite, band);
      const treffer = eanAusBild(bild, 24, 1);
      return Promise.resolve([...treffer].flatMap(([code, n]) => Array<string>(n).fill(code)));
    },
    beenden() {
      if (leinwand) {
        leinwand.width = 0;
        leinwand.height = 0;
      }
      leinwand = null;
    },
  };
}

/** Der Leser des Browsers, wo er EAN kennt (etwa Chrome unter Android); sonst der eigene. */
export async function barcodeleser(): Promise<Barcodeleser> {
  const Klasse = (globalThis as { BarcodeDetector?: DetektorKlasse }).BarcodeDetector;
  if (Klasse) {
    try {
      const bekannt = (await Klasse.getSupportedFormats?.()) ?? [];
      const formate = FORMATE.filter((f) => bekannt.includes(f));
      if (formate.includes('ean_13')) {
        const detektor = new Klasse({ formats: formate });
        return {
          lesen: async (video) =>
            (await detektor.detect(video)).map(alsGtin).filter((c): c is string => c !== null),
          beenden: () => undefined,
        };
      }
    } catch {
      // Ein Browser, der den Leser anbietet, aber nicht starten kann: der eigene übernimmt.
    }
  }
  return eigenerLeser();
}
