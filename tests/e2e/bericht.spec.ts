import { expect, test, type Page } from '@playwright/test';

/**
 * Therapiebericht in einem echten Browser (DOK-005).
 *
 * Die Komponententests prüfen Inhalt, Auswahl und Reihenfolge von Vermerk und
 * Druck. Hier geht es um das, was jsdom nicht misst: ob Formular und Blatt bei
 * 375 px ohne waagerechtes Scrollen auskommen und ob das Druckbild die
 * Bedienelemente weglässt, den Bericht aber vollständig zeigt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/bericht.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Therapiebericht', () => {
  test('das Formular laeuft bei 375 px nicht waagerecht ueber, auch aufgeklappt', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=formular`);
    await expect(page.getByRole('heading', { name: 'Therapiebericht', level: 1 })).toBeVisible();
    await page.getByText(/Weitere Einträge der Akte/).click();
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('das Formular waehlt nichts vor, was nicht gespeichert ist', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=formular`);
    // Im gespeicherten Entwurf ist genau ein Eintrag angekreuzt.
    await expect(page.getByRole('checkbox', { name: /22\.06\.2026/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /03\.08\.2026/ })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Kein Körperschema' })).toBeChecked();
  });

  test('das Blatt laeuft bei 375 px nicht waagerecht ueber', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=blatt`);
    await expect(page.getByText('Empfehlung der Therapeut:in zum Verordnungsende')).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('das Druckbild zeigt den Bericht ohne Bedienelemente', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=blatt`);
    await expect(page.getByRole('button', { name: 'Bericht drucken' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Bericht drucken' })).toBeHidden();
    await expect(page.getByText('Zurück zur Verordnung')).toBeHidden();
    await expect(page.getByText(/Synthetischer Befund Schulter rechts/)).toBeVisible();
    await expect(page.locator('svg circle')).toHaveCount(2);
    await expect(page.getByText('Abgeschlossen am 21.09.2026 von Anna Beispiel.')).toBeVisible();
  });
});
