import { expect, test, type Page } from '@playwright/test';

/**
 * Die eine Schreibseite in einem echten Browser (Design-Handoff 2026-10-01,
 * Abschnitt 6a).
 *
 * Die Komponententests prüfen Wege, Texte und Schreibvorgänge. Hier geht es um
 * das, was jsdom nicht misst: ob das Feld die Höhe füllt, ob die Fußleiste mit
 * „Festschreiben" am Telefon über der Tableiste im Bild steht, ob die
 * Chipzeile waagerecht läuft statt die Seite zu verbreitern, und ob der
 * Verlauf am Telefon ein Blatt und ab 640 px eine Spalte ist.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/schreibseite.html';

async function oeffne(page: Page, breite: number, ansicht = 'neu') {
  await page.setViewportSize({ width: breite, height: 760 });
  await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
}

async function ohneUeberlauf(page: Page) {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

for (const breite of [375, 1280]) {
  test(`füllt die Höhe und hält Festschreiben im Bild (${breite} px)`, async ({ page }) => {
    await oeffne(page, breite);
    const fest = page.getByRole('button', { name: 'Festschreiben' });
    await expect(fest).toBeInViewport();
    const knopf = (await fest.boundingBox())!;
    // Kompakt, aber nie unter dem Tippziel (ANN-199).
    expect(knopf.height).toBeGreaterThanOrEqual(44);
    if (breite < 640) {
      // Über der Tableiste (56 px), nicht von ihr verdeckt.
      expect(knopf.y + knopf.height).toBeLessThanOrEqual(760 - 56);
    }
    const feld = (await page.getByLabel('Eintrag zur Behandlung').boundingBox())!;
    expect(feld.height).toBeGreaterThanOrEqual(160);
    await ohneUeberlauf(page);
  });
}

test('lässt die Chipzeile waagerecht laufen statt umzubrechen (375 px)', async ({ page }) => {
  await oeffne(page, 375);
  const zeile = page.getByRole('group', { name: 'Textbausteine' });
  const hoehe = (await zeile.boundingBox())!.height;
  expect(hoehe).toBeLessThanOrEqual(48);
  await ohneUeberlauf(page);
});

test('zeigt den Verlauf am Telefon als Blatt über dem Feld', async ({ page }) => {
  await oeffne(page, 375, 'entwurf');
  await page.getByRole('button', { name: /^Verlauf/ }).click();
  const blatt = page.getByRole('region', { name: /Bisherige Einträge/ });
  await expect(blatt.getByText('28.09.2026')).toBeVisible();
  const box = (await blatt.boundingBox())!;
  // Höchstens 62 % der Höhe: das Feld bleibt darüber sichtbar.
  expect(box.height).toBeLessThanOrEqual(760 * 0.62 + 1);
  await expect(page.getByLabel('Eintrag zur Behandlung')).toBeInViewport();
  await page.getByRole('button', { name: 'Bisherige Einträge schließen' }).click();
  await expect(blatt).toHaveCount(0);
});

test('zeigt den Verlauf ab 640 px als Spalte neben dem Feld', async ({ page }) => {
  await oeffne(page, 1280, 'entwurf');
  await page.getByRole('button', { name: /^Verlauf/ }).click();
  const spalte = (await page.getByRole('region', { name: /Bisherige Einträge/ }).boundingBox())!;
  const feld = (await page.getByLabel('Eintrag zur Behandlung').boundingBox())!;
  expect(spalte.x).toBeGreaterThanOrEqual(feld.x + feld.width - 1);
  expect(spalte.width).toBeGreaterThanOrEqual(240);
  expect(spalte.width).toBeLessThanOrEqual(320);
});

test('fragt beim Zurückgehen mit ungespeichertem Text in einer Zeile nach', async ({ page }) => {
  await oeffne(page, 375, 'entwurf');
  await page.getByLabel('Eintrag zur Behandlung').fill('Geändert');
  await page.getByRole('link', { name: 'Zurück' }).click();
  await expect(page.getByText('Text noch nicht gespeichert.')).toBeVisible();
  await page.getByRole('button', { name: 'Weiterschreiben' }).click();
  await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue('Geändert');
});

test('beginnt das Feld am kleinen Telefon in der oberen Hälfte (BEF-001)', async ({ page }) => {
  // 375 × 667 ist das Maß der Messungen in BEF-001 (458 px am 2026-09-27).
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${PRUEFSEITE}?ansicht=neu`);
  await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
  const feld = (await page.getByLabel('Eintrag zur Behandlung').boundingBox())!;
  expect(feld.y).toBeLessThanOrEqual(200);
  expect(feld.y + feld.height).toBeLessThanOrEqual(667);
});

// Design-Rollout B4: Nachtrag, Nachtrag bearbeiten, Korrektur und Verlauf
// stehen in derselben Hülle wie die Schreibseite - Pfeil und Name im Kopf,
// die Knöpfe in der Aktionsleiste über der Tableiste.
for (const [ansicht, knopf] of [
  ['nachtrag', 'Festschreiben'],
  ['nachtrag-entwurf', 'Festschreiben'],
  ['korrektur', 'Korrektur festschreiben'],
] as const) {
  for (const breite of [375, 1280]) {
    test(`hält in der Hülle (${ansicht}) den Hauptknopf im Bild (${breite} px)`, async ({
      page,
    }) => {
      await oeffne(page, breite, ansicht);
      const haupt = page.getByRole('button', { name: knopf, exact: true });
      await expect(haupt).toBeInViewport();
      const box = (await haupt.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      if (breite < 640) expect(box.y + box.height).toBeLessThanOrEqual(760 - 56);
      await expect(page.getByRole('link', { name: /^Zurück/ })).toBeInViewport();
      await ohneUeberlauf(page);
    });
  }
}

test('zeigt den Änderungsverlauf in der Hülle, jede Version für sich (375 px)', async ({
  page,
}) => {
  await oeffne(page, 375, 'verlauf');
  await expect(page.getByText(/^Änderungsverlauf · Eintrag · /)).toBeVisible();
  await expect(page.getByLabel('Version 2').getByText('Geltende Fassung')).toBeVisible();
  await ohneUeberlauf(page);
});

/**
 * Spracheingabe (BEF-153, KI-EPIC-001) im echten Browser bei 375 px: „Sprechen“
 * im Daumenbereich, 48 px, in voller Breite; Aufnahme mit Zeichen und Uhr;
 * Vorschlag über dem Feld; Übernahme ins Feld - nirgends Querrollen. Mikrofon
 * und Recorder sind nachgebildet, der Gateway antwortet über die Route wie die
 * Nachbildung. Gesprochen wird mit keinem Server.
 */
function mikrofonNachbilden() {
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

const DIKTAT = {
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

test('spricht am Telefon: Sprechen im Daumenbereich, Aufnahme, Vorschlag, Übernahme (375 px)', async ({
  page,
}) => {
  await page.addInitScript(mikrofonNachbilden);
  let anfrage = '';
  await page.route('**/functions/v1/ai-gateway', async (route) => {
    anfrage = route.request().postDataBuffer()?.toString('latin1') ?? '';
    await route.fulfill({ status: 200, contentType: 'application/json', json: DIKTAT });
  });
  await oeffne(page, 375);

  const sprechen = page.getByRole('button', { name: 'Sprechen' });
  await expect(sprechen).toBeInViewport();
  const knopf = (await sprechen.boundingBox())!;
  expect(knopf.height).toBeGreaterThanOrEqual(48);
  // In voller Breite der Zeile und über der Tableiste (56 px).
  expect(knopf.width).toBeGreaterThanOrEqual(375 - 2 * 16);
  expect(knopf.y + knopf.height).toBeLessThanOrEqual(760 - 56);
  await ohneUeberlauf(page);

  await sprechen.click();
  const fertig = page.getByRole('button', { name: 'Fertig' });
  await expect(fertig).toBeInViewport();
  await expect(page.getByText(/^Aufnahme\s*0:0\d$/)).toBeVisible();
  expect((await fertig.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole('button', { name: 'Festschreiben' })).toBeDisabled();
  await ohneUeberlauf(page);

  await fertig.click();
  await expect(
    page.getByRole('heading', { name: 'Vorschlag aus der Aufnahme – bitte prüfen' }),
  ).toBeVisible();
  await expect(page.getByText('1 Stelle unverständlich')).toBeVisible();
  // Hinaus gingen Zweck, Termin, Dauer und Aufnahme - kein Name.
  for (const feld of ['zweck', 'termin', 'dauer_s', 'audio']) {
    expect(anfrage).toContain(`name="${feld}"`);
  }
  expect(anfrage).toContain('dokumentation.diktat');
  expect(anfrage).not.toContain('Mustermann');
  await ohneUeberlauf(page);

  await page.getByRole('button', { name: 'In die Doku übernehmen' }).click();
  await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue(/^Angaben der Patient:in\n/);
  await expect(page.getByRole('button', { name: 'Festschreiben' })).toBeInViewport();
  await ohneUeberlauf(page);
});
