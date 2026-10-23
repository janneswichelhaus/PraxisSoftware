import { expect, test, type Page } from '@playwright/test';

/**
 * Anmeldung ohne Kennwort im Browser (SEC-EPIC-002, ADR-025 Fassung 2).
 *
 * Geprüft wird, was jsdom nicht misst: Bei 375 px passen die Einrichtung und
 * die Abschnitte aus „Mein Konto“ ohne Querrollen, die PIN-Felder öffnen den
 * Ziffernblock, und der Sichtbar-Schalter heißt „PIN“, nicht „Kennwort“.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/anmeldung.html';

async function ohneQuerrollen(page: Page): Promise<void> {
  const quer = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(quer).toBe(false);
}

for (const breite of [375, 1280]) {
  test(`Einrichtung: erst Passkey, dann PIN (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=einrichten`);
    // Geführter Ablauf (Handoff 2026-10-22, Abschnitt 5.2): eine Frage je Seite.
    await expect(
      page.getByRole('heading', { name: 'Mit Gesicht oder Finger anmelden' }),
    ).toBeVisible();
    await expect(page.getByText(/Own Motion bekommt sie nie/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jetzt einrichten' })).toBeVisible();
    await expect(page.getByLabel('PIN', { exact: true })).toHaveCount(0);
    await ohneQuerrollen(page);

    await page.goto(`${PRUEFSEITE}?seite=pin`);
    await expect(page.getByRole('heading', { name: 'Eine PIN festlegen' })).toBeVisible();
    const pin = page.getByLabel('PIN', { exact: true });
    await expect(pin).toHaveAttribute('inputmode', 'numeric');
    await expect(pin).toHaveAttribute('autocomplete', 'new-password');
    // 56 hoch, Ziffern groß (Handoff Abschnitt 5.2).
    expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(page.getByRole('button', { name: 'PIN anzeigen' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kennwort anzeigen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'PIN speichern' })).toBeVisible();
    // Nur Ziffern kommen ins Feld.
    await pin.fill('48 3a9');
    await expect(pin).toHaveValue('4839');
    await ohneQuerrollen(page);
  });

  test(`Mein Konto: Passkeys und PIN (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=verwalten`);
    await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
    await expect(page.getByText('iPhone')).toBeVisible();
    await expect(page.getByText(/Nur ein Passkey/)).toBeVisible();
    await expect(page.getByText('Eine PIN ist festgelegt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'PIN ändern' })).toBeVisible();
    await ohneQuerrollen(page);
  });
}
