import { expect, test, type Page } from '@playwright/test';

/**
 * Statistiken im echten Browser (STA-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die fünf Karten bei 375 px ohne waagerechtes Scrollen
 * untereinander stehen, am Rechner nebeneinander, und die Tippziele reichen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/statistik.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Statistiken', () => {
  for (const breite of [375, 1280]) {
    test(`fünf Karten laufen bei ${breite} px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('heading', { name: 'Statistiken', level: 1 })).toBeVisible();
      await expect(page.getByRole('region')).toHaveCount(8);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('region', { name: 'Umsatz', exact: true }).getByText('Ändern').click();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('am Telefon stehen die Karten untereinander, am Rechner nebeneinander', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('region')).toHaveCount(8);
    const umsatz = await page.getByRole('region', { name: 'Umsatz', exact: true }).boundingBox();
    const posten = await page.getByRole('region', { name: 'Offene Posten' }).boundingBox();
    // Untereinander: dieselbe Spalte, die zweite Karte tiefer.
    expect(Math.abs(posten!.x - umsatz!.x)).toBeLessThan(2);
    expect(posten!.y).toBeGreaterThan(umsatz!.y);

    await page.setViewportSize({ width: 1280, height: 900 });
    const umsatzBreit = await page
      .getByRole('region', { name: 'Umsatz', exact: true })
      .boundingBox();
    const postenBreit = await page.getByRole('region', { name: 'Offene Posten' }).boundingBox();
    expect(Math.abs(postenBreit!.y - umsatzBreit!.y)).toBeLessThan(2);
  });

  test('Handlungen und Zielknopf sind 44 px hoch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    const handlung = await page.getByRole('link', { name: 'Anrufliste für morgen' }).boundingBox();
    expect(handlung!.height).toBeGreaterThanOrEqual(44);
    const ziel = await page
      .getByRole('region', { name: 'Ausfälle' })
      .locator('summary')
      .boundingBox();
    expect(ziel!.height).toBeGreaterThanOrEqual(44);
  });

  test('zeigt den Zielstand mit Zeichen und Wort', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await expect(
      page.getByRole('region', { name: 'Umsatz', exact: true }).getByText('Ziel verfehlt'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Offene Posten' }).getByText('Ziel erreicht'),
    ).toBeVisible();
  });

  test('die Grafiken füllen die Breite, am Telefon ohne Überlauf', async ({ page }) => {
    for (const breite of [375, 1280]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      const flaeche = page.getByRole('region', { name: 'Umsatz der letzten 12 Monate' });
      const grafik = flaeche.getByRole('group', { name: /^Umsatz und Zahlungseingang/ });
      await expect(grafik).toBeVisible();
      const aussen = await flaeche.boundingBox();
      const innen = await grafik.boundingBox();
      expect(innen!.width).toBeLessThanOrEqual(aussen!.width);
      expect(innen!.width).toBeGreaterThan(aussen!.width * 0.8);
      expect(await ueberlaeuft(page)).toBe(false);
    }
  });

  test('ein Monat zeigt beim Zeigen Umsatz und Eingang', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PRUEFSEITE);
    const flaeche = page.getByRole('region', { name: 'Umsatz der letzten 12 Monate' });
    await flaeche
      .getByRole('group', { name: /^Umsatz und Zahlungseingang/ })
      .locator('rect[tabindex="0"]')
      .last()
      .hover();
    const hinweis = flaeche.getByRole('tooltip');
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toContainText('Zahlungseingang');
  });
});
