import type { Page } from '@playwright/test';

/**
 * Mikrofon, Recorder und Gateway für Ablauftests mit Diktat (ANN-520,
 * ANN-840): Gesprochen wird mit keinem Server, der Gateway antwortet über
 * die Route mit einem festen, satzgetreuen Vorschlag.
 */
export function mikrofonNachbilden() {
  class Recorder extends EventTarget {
    static isTypeSupported(typ: string) {
      return typ.startsWith('audio/webm');
    }
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;
    constructor(_strom: unknown, optionen: { mimeType?: string } = {}) {
      super();
      this.mimeType = optionen.mimeType ?? 'audio/webm';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      const daten = Object.assign(new Event('dataavailable'), {
        data: new Blob([new Uint8Array(64)], { type: this.mimeType }),
      });
      this.dispatchEvent(daten);
      this.dispatchEvent(new Event('stop'));
    }
  }
  const spur = { kind: 'audio', stop() {}, addEventListener() {} };
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () =>
        Promise.resolve({ getTracks: () => [spur], getAudioTracks: () => [spur] }),
    },
  });
}

export const DIKTAT = {
  ok: true,
  transkript:
    'Patientin berichtet, das rechte Knie sei besser, Schmerz drei von zehn. Keine Schwellung. Eigenübungen weiter, vielleicht Treppe [unverständlich].',
  abschnitte: [
    {
      titel: 'Angaben der Patient:in',
      text: 'Patientin berichtet, das rechte Knie sei besser, Schmerz drei von zehn.',
    },
    { titel: 'Befund', text: 'Keine Schwellung.' },
    { titel: 'Plan', text: 'Eigenübungen weiter, vielleicht Treppe [unverständlich].' },
  ],
  quelle: 'nachbildung',
};

/** Der Gateway: GET meldet das Diktat als eingerichtet, POST liefert `DIKTAT`. */
export async function diktatAnbieten(page: Page) {
  await page.addInitScript(mikrofonNachbilden);
  await page.route(/\/functions\/v1\/ai-gateway(\?|$)/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { ok: true, verfuegbar: true } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', json: DIKTAT });
  });
}
