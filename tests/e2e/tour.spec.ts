import { expect, test } from '@playwright/test';

/**
 * Die Tour in einem echten Browser (UBK-009).
 *
 * jsdom misst keine Höhen. Hier geht es darum, ob am Telefon (375 px) der
 * erste Besuch ohne Scrollen im Blick steht und zwei Termine am selben Ort
 * „Gleicher Ort" sagen statt einer Fahrzeit.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/tour.html';

test.describe('Tour', () => {
  test('zeigt bei 375 px den ersten Besuch auf dem ersten Bildschirm', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(PRUEFSEITE);
    const erster = page.getByRole('link', { name: 'Ben Beispielsohn' });
    await expect(erster).toBeVisible();
    expect((await erster.boundingBox())!.y).toBeLessThan(740 - 100);
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test('sagt bei zwei Terminen am selben Ort „Gleicher Ort"', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await expect(page.getByText('Gleicher Ort – keine Fahrt')).toBeVisible();
    await expect(page.getByText(/unter 1 Min/)).toHaveCount(0);
  });
});
