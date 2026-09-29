import { expect, test, type Page } from '@playwright/test';

/**
 * Dublette übernehmen im echten Browser (PRX-EPIC-003b).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die Vorschau bei 375 px ohne waagerechtes Scrollen auskommt,
 * die beiden Akten am Telefon untereinander stehen und die Tippziele reichen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/dublette.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function waehleDublette(page: Page) {
  await page.getByRole('button', { name: /Petra Platzhalter/ }).click();
  await expect(page.getByText('Bleibt', { exact: true })).toBeVisible();
}

test.describe('Dublette übernehmen', () => {
  for (const breite of [375, 1280]) {
    test(`Auswahl und Vorschau laufen bei ${breite} px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('heading', { name: 'Dublette übernehmen' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      await waehleDublette(page);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('am Telefon steht die bleibende Akte über der Dublette', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    await waehleDublette(page);
    const bleibt = await page.getByText('Bleibt', { exact: true }).boundingBox();
    const geht = await page.getByText('Geht darin auf', { exact: true }).boundingBox();
    expect(geht!.y).toBeGreaterThan(bleibt!.y);
  });

  test('Zusammenführen erst nach dem Haken, mit 44 px hohem Kästchen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    await waehleDublette(page);
    const knopf = page.getByRole('button', { name: 'Zusammenführen' });
    await expect(knopf).toBeDisabled();
    const haken = page.getByText('Beide Akten betreffen dieselbe Person.');
    const box = await haken.locator('xpath=ancestor::label').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await haken.click();
    await expect(knopf).toBeEnabled();
  });

  test('ein Sperrgrund ersetzt den Knopf', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?sperre=1`);
    await waehleDublette(page);
    await expect(page.getByText(/Rechnungsentwurf für denselben Monat/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zusammenführen' })).toHaveCount(0);
  });
});
