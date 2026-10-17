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
  test(`öffnet auf den Mitarbeitenden, alle Punkte angebunden (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);

    const menue = page.getByRole('navigation', { name: 'Bereich Organisatorisches' });
    await expect(menue.getByRole('link', { name: 'Mitarbeitende' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { name: 'Mitarbeitende' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' })).toBeVisible();
    // Seit FLT-EPIC-001 ist die Radflotte echt, seit URL-001 der Urlaub, seit
    // AZ-001 die Arbeitszeit, seit ZK-001 das Zeitkonto, seit ERS-001 die
    // Erstattungen - Organisatorisches hat keine Vorschau mehr.
    for (const punkt of ['Radflotte', 'Urlaub', 'Zeitkonto', 'Erstattungen']) {
      await expect(menue.getByRole('link', { name: punkt })).toHaveCount(1);
    }
    await expect(menue.getByRole('link', { name: 'Arbeitszeit', exact: true })).toHaveCount(1);
    await expect(menue.getByRole('button', { name: /^Vorschau/ })).toHaveCount(0);
    await expect(menue.getByText('Vorschau')).toHaveCount(0);
    const erstattungen = menue.getByRole('link', { name: 'Erstattungen' });
    expect((await erstattungen.boundingBox())!.height).toBeGreaterThanOrEqual(44);

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
