import { expect, test, type Page } from '@playwright/test';

/**
 * Bereich Training im echten Browser (TRN-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: kein waagerechtes Scrollen bei 375 px, auch mit langen Namen
 * und Adressen, und Tippziele von 44 px.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/training.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Training', () => {
  for (const breite of [375, 1280]) {
    test(`Liste, Anlegen und Detail laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=liste`);
      await expect(
        page.getByRole('heading', { name: 'Trainingskund:innen', level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /Tina Trainingskundin/ })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=neu`);
      await expect(page.getByLabel('Vorname *')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=detail`);
      await expect(page.getByRole('heading', { name: 'Tina Trainingskundin' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Vertrag beenden' }).click();
      await expect(page.getByLabel('Letzter Vertragstag')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('Listenzeilen und Knöpfe sind mindestens 44 px hoch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=liste`);
    const zeile = await page.getByRole('link', { name: /Tina Trainingskundin/ }).boundingBox();
    expect(zeile!.height).toBeGreaterThanOrEqual(44);
    const anlegen = await page
      .getByRole('link', { name: 'Trainingskund:in anlegen' })
      .boundingBox();
    expect(anlegen!.height).toBeGreaterThanOrEqual(44);

    await page.goto(`${PRUEFSEITE}?seite=detail`);
    const beenden = await page.getByRole('button', { name: 'Vertrag beenden' }).boundingBox();
    expect(beenden!.height).toBeGreaterThanOrEqual(44);
  });
});
