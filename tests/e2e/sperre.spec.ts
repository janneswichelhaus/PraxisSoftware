import { expect, test } from '@playwright/test';

/**
 * Die Sperrseite der Sitzungssperre im Browser (SEC-002, ADR-025 Punkt 3).
 *
 * Geprüft wird, was jsdom nicht misst: Bei 375 px passt die Seite ohne
 * Querrollen, das Kennwortfeld hat den Fokus, und weder Name noch
 * E-Mail-Adresse sind zu sehen. Das Konto steht nur als verborgenes Feld für
 * Passwortmanager da.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/sperre.html';

for (const breite of [375, 1280]) {
  test(`zeigt die Sperrseite ohne Namen und mit Fokus im Kennwort (${breite} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: breite, height: 760 });
    await page.goto(`${PRUEFSEITE}?grund=inaktiv`);
    await expect(page.getByRole('heading', { name: 'Gesperrt' })).toBeVisible();
    await expect(page.getByText(/30 Minuten ohne Bedienung/)).toBeVisible();
    await expect(page.getByLabel('Kennwort', { exact: true })).toBeFocused();
    await expect(page.getByText('anna.beispiel@example.test')).toHaveCount(0);
    await expect(page.locator('input[name=email]')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Entsperren' })).toBeDisabled();

    const quer = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(quer).toBe(false);
    await expect(page).toHaveTitle(/Anmelden/);
  });
}

test('nennt eine festgehaltene Eingabe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(`${PRUEFSEITE}?grund=hoechstdauer&halten=1`);
  await expect(page.getByText(/Nach 60 Minuten ist eine erneute Anmeldung nötig/)).toBeVisible();
  await expect(page.getByText(/ließ sich nicht sichern/)).toBeVisible();
});
