import { expect, test } from '@playwright/test';

/**
 * Der Tagesstart in einem echten Browser (UX-EPIC-003).
 *
 * Die Komponententests prüfen Zählung und Wege. Hier geht es um das, was
 * jsdom nicht misst: ob die Liege und der erste Weg bei 375 px auf dem ersten
 * Bildschirm stehen, ob der Hauptknopf ein Tippziel von 44 px ist und ob die
 * Seite ohne waagerechtes Scrollen auskommt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/uebersicht.html';

for (const breite of [375, 1280]) {
  test(`zeigt Liege und ersten Weg auf dem ersten Bildschirm (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 740 });
    await page.goto(PRUEFSEITE);

    const liege = page.getByText('Liege heute:');
    await expect(liege.locator('..')).toContainText('ja, ab 2. Besuch (10:00 Uhr)');
    await expect(page.getByText('Erster Weg')).toBeVisible();

    const navigation = page.getByRole('button', { name: 'Navigation starten' }).first();
    await expect(navigation).toBeVisible();
    const kasten = (await navigation.boundingBox())!;
    expect(kasten.height).toBeGreaterThanOrEqual(44);
    expect(kasten.y + kasten.height).toBeLessThanOrEqual(740);

    await expect(page.getByText('Danach')).toBeVisible();
    await expect(page.getByText('Weitere offene heute (2)')).toBeVisible();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('zeigt in der Akte, dass die Liege mit muss, mit einem Knopf zum Umstellen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(`${PRUEFSEITE}?ansicht=akte`);
  await expect(page.getByText('Behandlungsliege', { exact: true })).toBeVisible();
  await expect(page.getByText('Mitnehmen', { exact: true })).toBeVisible();
  const knopf = page.getByRole('button', { name: 'Liege nicht mehr nötig' });
  expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
