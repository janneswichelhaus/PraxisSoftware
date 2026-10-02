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
