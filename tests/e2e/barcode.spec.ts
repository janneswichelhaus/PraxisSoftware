import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { eanGraubild } from '../../src/lib/barcode/testbilder';

// Der Barcodedialog im echten Browser (ADR-027 Punkt 10): Chromiums künstliche Kamera zeigt einen
// gerechneten Barcode (Y4M, nie ein Foto). Geprüft wird, was jsdom nicht kann: lesen aus dem
// Kamerastrom, nur Bild, Kamera aus nach dem Lesen und Abbrechen, kein Querrollen bei 375 px.
const PRUEFSEITE = '/tests/e2e/fixtures/barcode.html';
const CODE = '2000000000008';
const BREITE = 640;
const HOEHE = 480;

function y4m(datei: string) {
  const grau = eanGraubild(CODE, BREITE, HOEHE, { modul: 4, balken: 200, hell: 235, dunkel: 16 });
  const farbe = Buffer.alloc((BREITE / 2) * (HOEHE / 2) * 2, 128);
  const bild = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(grau), farbe]);
  const kopf = Buffer.from(`YUV4MPEG2 W${BREITE} H${HOEHE} F30:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(datei, Buffer.concat([kopf, bild, bild, bild]));
}

const VIDEO = join(tmpdir(), `barcode-${process.pid}.y4m`);
y4m(VIDEO);

test.use({
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${VIDEO}`,
    ],
  },
  permissions: ['camera'],
});

/** Merkt sich jeden Strom und jede Anfrage; `leer` gibt statt der Kamera eine weiße Fläche. */
async function kameraBeobachten(page: Page, leer = false) {
  await page.addInitScript((leer) => {
    const flaeche = () => {
      const leinwand = document.createElement('canvas');
      leinwand.width = 640;
      leinwand.height = 480;
      const kontext = leinwand.getContext('2d')!;
      kontext.fillStyle = '#fff';
      kontext.fillRect(0, 0, 640, 480);
      return Promise.resolve(leinwand.captureStream(10));
    };
    const original = leer
      ? flaeche
      : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const fenster = window as unknown as { __stroeme: MediaStream[]; __anfragen: unknown[] };
    fenster.__stroeme = [];
    fenster.__anfragen = [];
    navigator.mediaDevices.getUserMedia = async (anfrage) => {
      fenster.__anfragen.push(anfrage ?? {});
      const strom = await original(anfrage);
      fenster.__stroeme.push(strom);
      return strom;
    };
  }, leer);
}

function laufendeSpuren(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __stroeme: MediaStream[] }).__stroeme
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length,
  );
}

test('liest den Barcode aus dem Kamerabild, nur Bild, und beendet die Kamera', async ({ page }) => {
  await kameraBeobachten(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PRUEFSEITE);
  await page.getByRole('button', { name: 'Barcode scannen' }).click();
  await expect(page.getByRole('dialog', { name: 'Barcode scannen' })).toBeVisible();
  await expect(page.getByText(`Gelesen: ${CODE}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await laufendeSpuren(page)).toBe(0);
  const anfragen = await page.evaluate(
    () => (window as unknown as { __anfragen: MediaStreamConstraints[] }).__anfragen,
  );
  expect(anfragen.length).toBeGreaterThan(0);
  for (const a of anfragen) expect(a.audio).toBe(false);
});

test('„Abbrechen“ beendet die Kamera; bei 375 px rollt nichts quer', async ({ page }) => {
  await kameraBeobachten(page, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PRUEFSEITE);
  await page.getByRole('button', { name: 'Barcode scannen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Barcode scannen' });
  await expect(dialog.getByLabel('Kamerabild')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await laufendeSpuren(page)).toBe(0);
  await expect(page.getByText('Noch nichts gelesen.')).toBeVisible();
});
