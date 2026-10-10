import { expect, test, type Page } from '@playwright/test';

/**
 * Die Sperrseite der Sitzungssperre im Browser (SEC-002, ADR-025 Fassung 2).
 *
 * Geprüft wird, was jsdom nicht misst: Bei 375 px passt die Seite ohne
 * Querrollen, der Passkey-Knopf hat den Fokus, ein Kennwortfeld gibt es
 * nicht, und weder Name noch E-Mail-Adresse sind zu sehen. Die App-PIN
 * erscheint erst auf „Passkey klappt nicht?“.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/sperre.html';

async function mitPin(page: Page, da: boolean): Promise<void> {
  await page.route('**/rest/v1/rpc/own_pin_status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(da) }),
  );
}

async function ohneQuerrollen(page: Page): Promise<void> {
  const quer = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(quer).toBe(false);
}

for (const breite of [375, 1280]) {
  test(`zeigt die Sperrseite ohne Namen, Passkey zuerst (${breite} px)`, async ({ page }) => {
    await mitPin(page, true);
    await page.setViewportSize({ width: breite, height: 760 });
    await page.goto(`${PRUEFSEITE}?grund=inaktiv`);
    await expect(page.getByRole('heading', { name: 'Gesperrt' })).toBeVisible();
    await expect(page.getByText(/30 Minuten ohne Bedienung/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mit Passkey entsperren' })).toBeFocused();
    await expect(page.getByLabel('Kennwort', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/@/)).toHaveCount(0);
    await ohneQuerrollen(page);
    await expect(page).toHaveTitle(/Anmelden/);

    await page.getByRole('button', { name: 'Passkey klappt nicht?' }).click();
    const feld = page.getByLabel('PIN', { exact: true });
    await expect(feld).toBeFocused();
    await expect(feld).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByRole('button', { name: 'Mit PIN entsperren' })).toBeDisabled();
    await feld.fill('483920');
    await expect(page.getByRole('button', { name: 'Mit PIN entsperren' })).toBeEnabled();
    await ohneQuerrollen(page);
  });
}

test('bietet ohne App-PIN keinen Rückweg an', async ({ page }) => {
  await mitPin(page, false);
  await page.goto(`${PRUEFSEITE}?grund=inaktiv`);
  await expect(page.getByRole('button', { name: 'Mit Passkey entsperren' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Passkey klappt nicht?' })).toHaveCount(0);
});

test('nennt eine festgehaltene Eingabe', async ({ page }) => {
  await mitPin(page, true);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(`${PRUEFSEITE}?grund=hoechstdauer&halten=1`);
  await expect(page.getByText(/Nach 60 Minuten ist eine erneute Freigabe nötig/)).toBeVisible();
  await expect(page.getByText(/ließ sich nicht sichern/)).toBeVisible();
});

test('zeigt eine verbrauchte Sitzung als beendet (375 px)', async ({ page }) => {
  await mitPin(page, true);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(`${PRUEFSEITE}?grund=verbraucht`);
  await expect(page.getByText('Zu viele falsche PINs. Die Sitzung ist beendet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zur Anmeldung' })).toBeVisible();
  await ohneQuerrollen(page);
});
