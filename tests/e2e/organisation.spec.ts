import { expect, test } from '@playwright/test';

/**
 * Das Untermenü von Organisatorisches in einem echten Browser (UX-002h).
 *
 * Die Komponententests prüfen, was eingeklappt ist. Hier geht es um das, was
 * jsdom nicht misst: ob die Leiste bei 375 px ohne waagerechtes Scrollen der
 * Seite auskommt und der Knopf „Vorschau" ein Tippziel von 44 px ist.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/organisation.html';

for (const breite of [375, 1280]) {
  test(`öffnet auf den Mitarbeitenden, Vorschauen eingeklappt (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);

    const menue = page.getByRole('navigation', { name: 'Bereich Organisatorisches' });
    await expect(menue.getByRole('link', { name: 'Mitarbeitende' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { name: 'Mitarbeitende' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' })).toBeVisible();
    await expect(menue.getByRole('link', { name: /Radflotte/ })).toHaveCount(0);

    const knopf = menue.getByRole('button', { name: 'Vorschau (4)' });
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await knopf.click();
    await expect(menue.getByRole('link', { name: /Radflotte/ })).toContainText('Vorschau');

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('zeigt trainer die Arbeitszeiten nicht (BEF-034)', async ({ page }) => {
  await page.goto(`${PRUEFSEITE}?rolle=trainer`);
  const menue = page.getByRole('navigation', { name: 'Bereich Organisatorisches' });
  await expect(menue.getByRole('link', { name: 'Mitarbeitende' })).toBeVisible();
  await expect(menue.getByRole('link', { name: 'Arbeitszeiten' })).toHaveCount(0);
});
