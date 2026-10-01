import { expect, test, type Page } from '@playwright/test';

/**
 * Warteliste, Terminsuche, Gebietstage und Nachrücken im echten Browser
 * (PRX-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die Seiten bei 375 px ohne waagerechtes Scrollen auskommen
 * und die Anrufwege echte `tel:`-Verweise sind.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/warteliste.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Warteliste und Terminsuche', () => {
  for (const ansicht of ['liste', 'formular', 'suche', 'gebiete', 'nachruecken']) {
    test(`${ansicht} laeuft bei 375 px nicht waagerecht ueber`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(page.locator('main')).not.toBeEmpty();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('die Liste bietet Anrufen als tel:-Verweis', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=liste`);
    await expect(page.getByRole('link', { name: 'Anrufen: +49 7071 0000005' })).toHaveAttribute(
      'href',
      'tel:+4970710000005',
    );
  });

  test('die Suche stellt einen knappen Fahrweg ans Ende', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=suche`);
    const zeilen = page.locator('li', { has: page.getByRole('link', { name: 'Übernehmen' }) });
    await expect(zeilen).toHaveCount(4);
    await expect(zeilen.last()).toContainText('Fahrweg knapp: 10 Min. zu wenig');
    // Nur Abweichungen tragen ein Kennzeichen (UX-005g): Der passende Fahrweg
    // und der Gebietstag stehen ohne Wort da, Außerhalb und Ungeprüft nicht.
    await expect(zeilen.first()).not.toContainText('Fahrweg');
    await expect(page.getByText('Fahrweg passt')).toHaveCount(0);
    await expect(page.getByText('Im Gebietstag')).toHaveCount(0);
    await expect(page.getByText('Außerhalb des Gebietstags')).toBeVisible();
    await expect(page.getByText('Fahrweg nicht geprüft')).toBeVisible();
  });

  test('das Formular fügt eine Wunschzeit hinzu und entfernt sie wieder', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=formular`);
    await page.getByRole('button', { name: 'Wunschzeit hinzufügen' }).click();
    await expect(page.getByLabel('Wochentag')).toHaveValue('1');
    await page.getByRole('button', { name: 'Wunschzeit 1 entfernen' }).click();
    await expect(page.getByLabel('Wochentag')).toHaveCount(0);
  });
});
