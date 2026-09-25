import { expect, test } from '@playwright/test';

/**
 * Die Instrumentenbibliothek in einem echten Browser (FRB-010).
 *
 * Die Komponententests prüfen Inhalt und das, was nicht erscheint. Hier geht
 * es um das, was jsdom nicht misst: ob lange Quellenangaben und Anker bei
 * 375 px umbrechen, statt die Seite waagerecht scrollen zu lassen.
 */

const PRUEFSEITE = '/tests/e2e/fixtures/instrumente.html';

test.describe('Instrumente', () => {
  test('zeigt die drei freien Instrumente mit aufklappbarem Wortlaut', async ({ page }) => {
    await page.goto(PRUEFSEITE);

    await expect(page.getByRole('heading', { level: 1, name: 'Instrumente' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
    await expect(page.getByText('inaktiv · Wortlaut vorläufig')).toHaveCount(3);

    await page.getByText('Wortlaut (6 Items)').click();
    await expect(page.getByText('Wie gut können Sie Aktivität 1 heute ausführen?')).toBeVisible();
  });

  test('laeuft bei 375 px nicht waagerecht ueber, auch aufgeklappt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PRUEFSEITE);

    for (const zusammenfassung of await page.locator('summary').all()) {
      await zusammenfassung.click();
    }

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
});
