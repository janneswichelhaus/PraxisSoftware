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

test('zeigt einem reinen Trainingskonto weder Organisatorisches noch Arbeitszeiten (BEF-034, TRN-003)', async ({
  page,
}) => {
  // Seit TRN-003 gehört Organisatorisches zur Behandlungsseite (`app.is_staff()`);
  // die Trainingsbetreuung hat dort nur leere Listen gesehen. Sie sieht
  // Übersicht und Training.
  await page.goto(`${PRUEFSEITE}?rolle=trainer`);
  await expect(page.getByRole('link', { name: 'Training' }).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Bereich Organisatorisches' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Arbeitszeiten' })).toHaveCount(0);
});
