import { expect, test } from '@playwright/test';
import { anmelden, KONTEN } from './helpers';

type Fenster = { startbildGesehen?: boolean };

// Einmal je Tab beim Öffnen, nicht nach der Anmeldung (ANN-243 Fassung 2).
test('zeigt nach der Anmeldung beim Neuladen kein zweites Startbild', async ({ page }) => {
  // Hält fest, ob das Startbild nach einem Laden überhaupt erscheint, auch nur kurz.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('[data-startbild]')) (window as Fenster).startbildGesehen = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await anmelden(page, KONTEN.therapist);
  expect(await page.evaluate(() => sessionStorage.getItem('startbild-gezeigt'))).toBe('1');

  await page.reload();

  await expect(page.getByRole('button', { name: 'Abmelden', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Fenster).startbildGesehen)).toBeUndefined();
});
