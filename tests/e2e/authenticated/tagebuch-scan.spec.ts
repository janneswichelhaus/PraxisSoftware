import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pruefziffer } from '../../../src/lib/barcode/gtin';
import { eanGraubild } from '../../../src/lib/barcode/testbilder';
import { TESTKENNWORT } from './helpers';

// Barcode im Tagebuch gegen den echten Stack, bei 375 px (ADR-027 Punkt 10, ANN-841, ANN-842).
// Budget „Produkt per Scan in ≤ 3 Tipps“, gezählt wie im Tagebuch ab der Tagesansicht und zurück;
// die künstliche Kamera zeigt den gerechneten Barcode des Seed-Produkts Nr. 8 (Präfix 200).
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 812 };
const TAGEBUCH = '/p/ernaehrung/tagebuch?bereich=treatment';
const SCHOKOKEKS = '2000000000008';
const BREITE = 640;
const HOEHE = 480;

function video(datei: string) {
  const grau = eanGraubild(SCHOKOKEKS, BREITE, HOEHE, {
    modul: 4,
    balken: 200,
    hell: 235,
    dunkel: 16,
  });
  const bild = Buffer.concat([
    Buffer.from('FRAME\n'),
    Buffer.from(grau),
    Buffer.alloc((BREITE / 2) * (HOEHE / 2) * 2, 128),
  ]);
  const kopf = Buffer.from(`YUV4MPEG2 W${BREITE} H${HOEHE} F30:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(datei, Buffer.concat([kopf, bild, bild, bild]));
}

const VIDEO = join(tmpdir(), `tagebuch-scan-${process.pid}.y4m`);
video(VIDEO);

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

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

async function zumTagebuch(page: Page) {
  await page.setViewportSize(TELEFON);
  await page.addInitScript(() => window.sessionStorage.setItem('startbild-gezeigt', '1'));
  await page.goto('/');
  await page.getByText('Testkonten', { exact: true }).click();
  await page.getByLabel('E-Mail-Adresse').fill('erika.plattform@patient.invalid');
  await page.getByLabel('Kennwort', { exact: true }).fill(TESTKENNWORT);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/p(\?|$|\/)/);
  await page.goto(TAGEBUCH);
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
}

/** Statt der Kamera eine weiße Fläche: Hier wird getippt, nicht gelesen. */
async function ohneBarcodeImBild(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const leinwand = document.createElement('canvas');
      leinwand.width = 640;
      leinwand.height = 480;
      const kontext = leinwand.getContext('2d')!;
      kontext.fillStyle = '#fff';
      kontext.fillRect(0, 0, 640, 480);
      return Promise.resolve(leinwand.captureStream(10));
    };
  });
}

async function eintippen(page: Page, code: string) {
  await page.getByRole('button', { name: 'Barcode scannen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Nummer eintippen' }).click();
  await page.getByLabel('Nummer unter dem Barcode').fill(code);
  await page.getByRole('button', { name: 'Nachschlagen' }).click();
}

async function eintragLoeschen(page: Page, eintrag: Locator) {
  await eintrag.first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(eintrag).toHaveCount(0);
}

test('per Scan in höchstens drei Tipps; die Mahlzeit steht im Fenster', async ({ page }) => {
  await zumTagebuch(page);
  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Barcode scannen' }));
  const fenster = page.getByRole('dialog', { name: 'Schokokeks klassisch' });
  await expect(fenster).toBeVisible({ timeout: 15_000 });
  await expect(fenster.getByRole('group', { name: 'Mahlzeit' })).toBeVisible();
  await expect(fenster.getByText(/^\d+\skcal$/)).toBeVisible();
  await z.tippe(fenster.getByRole('button', { name: 'Eintragen' }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('„Schokokeks klassisch“ eingetragen.')).toHaveClass(/sr-only/);
  const eintrag = page.getByRole('button', { name: /^Schokokeks klassisch/ });
  await expect(eintrag.first()).toBeVisible();
  test.info().annotations.push({ type: 'Scan', description: `${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(3);
  expect(page.url()).not.toContain(SCHOKOKEKS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await eintragLoeschen(page, eintrag);
});

test('unbekannt: eigenes Lebensmittel mit dem Barcode, der nächste Scan findet es', async ({
  page,
}) => {
  const ziffern = `200${String(Date.now()).slice(-9)}`;
  const code = `${ziffern}${pruefziffer(ziffern)}`;
  const name = `Bäckerbrot ${code.slice(-5)}`;
  await ohneBarcodeImBild(page);
  await zumTagebuch(page);
  await eintippen(page, code);
  const fenster = page.getByRole('dialog', { name: 'Nicht im Verzeichnis' });
  await expect(fenster).toContainText(`Barcode ${code}`);
  await fenster.getByRole('button', { name: 'Eigenes anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Eigenes Lebensmittel', level: 1 })).toBeVisible();
  expect(page.url()).not.toContain(code);
  await expect(page.getByLabel('Barcode behalten')).toBeChecked();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Energie (kcal)').fill('240');
  await page.getByLabel('Eiweiß (g)').fill('9');
  await page.getByLabel('Fett (g)').fill('2');
  await page.getByLabel('Kohlenhydrate (g)').fill('44');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  // Zurück im Tagebuch; der nächste Scan findet das eigene Lebensmittel.
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
  await eintippen(page, code);
  const menge = page.getByRole('dialog', { name });
  await expect(menge).toBeVisible();
  await menge.getByRole('button', { name: 'Eintragen' }).click();
  const eintrag = page.getByRole('button', { name });
  await expect(eintrag.first()).toBeVisible();

  await eintragLoeschen(page, eintrag);
  await page.goto('/p/ernaehrung/lebensmittel?bereich=treatment');
  await page.getByRole('link', { name }).click();
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});
