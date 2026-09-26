import { expect, test } from '@playwright/test';

/**
 * Befund und Erhebung in einem echten Browser (FRB-EPIC-002).
 *
 * Die Komponententests prüfen Inhalt und Regeln. Hier geht es um das, was
 * jsdom nicht misst: ob der Bogen, das Körperschema und der Verlauf bei 375 px
 * ohne waagerechtes Scrollen auskommen und ob das Antippen der Figur trifft.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/befund.html';

test.describe('Befund', () => {
  test('laeuft bei 375 px nicht waagerecht ueber, auch aufgeklappt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByText('Hervorgehobene Angaben').first()).toBeVisible();

    for (const zusammenfassung of await page.locator('summary').all()) {
      await zusammenfassung.click();
    }
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test('setzt beim Antippen der Figur einen Kreis an der Stelle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(PRUEFSEITE);
    const figur = page.locator('fieldset svg').first();
    await figur.scrollIntoViewIfNeeded();
    const rahmen = (await figur.boundingBox())!;
    const vorher = await figur.locator('circle').count();
    // Das linke Knie der Vorderansicht liegt bei 270 × 505 von 820 × 749.
    await figur.click({
      position: { x: (rahmen.width * 270) / 820, y: (rahmen.height * 505) / 749 },
    });
    await expect(figur.locator('circle')).toHaveCount(vorher + 1);
    await expect(page.getByText(/Markiert: .*Knie links/)).toBeVisible();
  });

  test('zeigt die Werte als Punkte ohne Linie', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await expect(
      page.getByText('Werte: 03.08.2026: 7 · 01.09.2026: 6 · 22.09.2026: 4'),
    ).toBeVisible();
    await expect(page.locator('figure svg polyline, figure svg path')).toHaveCount(0);
  });
});
