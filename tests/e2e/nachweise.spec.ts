import { expect, test, type Page } from '@playwright/test';

/**
 * Die Nachweisseiten für die Praxisleitung (UX-009b, BEF-065): Protokoll und
 * Aufbewahrung am Telefon und am Rechner. Was jsdom nicht misst: ob die
 * Arbeit oben steht, ob die Filter am Telefon zugeklappt sind und ob nichts
 * waagerecht überläuft.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/nachweise.html';

async function ohneUeberlauf(page: Page) {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

test('Protokoll: Filter am Telefon zugeklappt, die Liste auf dem ersten Bildschirm', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(PRUEFSEITE);
  await expect(page.getByRole('heading', { level: 1, name: 'Protokoll' })).toBeVisible();
  await expect(page.getByLabel('Aktion')).toBeHidden();
  const ersteZeile = page.getByRole('listitem').filter({ hasText: 'Tom Training' });
  await expect(ersteZeile).toBeInViewport();
  // Die Abweisung als kritisches Abzeichen.
  await expect(ersteZeile.locator('.rounded-pill', { hasText: 'Abgewiesen' })).toBeVisible();
  await ohneUeberlauf(page);

  await page.getByText('Filter', { exact: true }).click();
  await expect(page.getByLabel('Aktion')).toBeVisible();
  await ohneUeberlauf(page);
});

test('Protokoll: Filter ab 1024 px offen, Stand und „Neu laden“ an der Blätterleiste', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PRUEFSEITE);
  await expect(page.getByLabel('Aktion')).toBeVisible();
  await expect(page.getByText(/^1–25 von 40 · Stand \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neu laden' })).toBeVisible();
  await ohneUeberlauf(page);
});

for (const breite of [375, 1280]) {
  test(`Aufbewahrung: nichts offen als eine Zeile vor dem Plan (${breite} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: breite, height: 740 });
    await page.goto(`${PRUEFSEITE}?seite=aufbewahrung`);
    const zeile = page.getByText('Nichts offen, beide Speicher deckungsgleich.');
    await expect(zeile).toBeInViewport();
    await expect(
      page.locator('.rounded-pill', { hasText: 'Annahme – Prüfung offen' }),
    ).toBeVisible();
    await expect(page.getByText(/ADR-017 Punkte 25 und 27/)).toBeHidden();
    await ohneUeberlauf(page);
  });

  test(`Aufbewahrung: ein offener Auftrag steht oben (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 740 });
    await page.goto(`${PRUEFSEITE}?seite=aufbewahrung&offen=ja`);
    await expect(
      page.getByRole('button', { name: 'Alle 1 ausführen und quittieren' }),
    ).toBeInViewport();
    await ohneUeberlauf(page);
  });
}
