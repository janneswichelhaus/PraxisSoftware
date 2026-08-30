import { expect, test } from '@playwright/test';

/**
 * End-to-End-Abdeckung des nicht angemeldeten Zustands.
 *
 * Abläufe hinter der Anmeldung benötigen einen laufenden Supabase-Stack und
 * sind derzeit nicht automatisiert - siehe docs/DEVELOPMENT.md, Abschnitt
 * "Bekannte Einschränkungen".
 */
test.describe('Anmeldung', () => {
  test('zeigt eine bedienbare Anmeldemaske', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
    // exact: true grenzt das Feld selbst gegen den Sichtbar-Schalter ab, dessen
    // Beschriftung ("Kennwort anzeigen") den Feldnamen enthaelt.
    await expect(page.getByLabel('Kennwort', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kennwort anzeigen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeEnabled();
  });

  test('ist vollstaendig mit der Tastatur bedienbar', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('E-Mail-Adresse').focus();
    await page.keyboard.type('jannes.test@praxis.invalid');
    await page.keyboard.press('Tab');
    await page.keyboard.type('LokalerTestzugang!2026');

    // Der Sichtbar-Schalter liegt in der Tabreihenfolge zwischen Kennwort und
    // Anmeldeknopf. Er ist bewusst per Tastatur erreichbar: ein interaktives
    // Element aus der Tabreihenfolge zu nehmen, waere ein Barrierefreiheits-
    // fehler (WCAG 2.1.1).
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Kennwort anzeigen' })).toBeFocused();

    // Und er laesst sich mit der Tastatur ausloesen.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Kennwort verbergen' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /Anmelden/ })).toBeFocused();
  });

  test('zeigt ohne Anmeldung keine Patientendaten', async ({ page }) => {
    await page.goto('/patienten');

    // Der geschuetzte Bereich wird gar nicht erst gerendert.
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Patient:innen' })).toHaveCount(0);

    // Und es ist kein einziger Datensatz aus dem Seed sichtbar.
    await expect(page.getByText(/Mustermann|Beispiel|Platzhalter/)).toHaveCount(0);
  });

  test('laeuft auf schmalen Displays ohne horizontales Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();

    const ueberbreit = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(ueberbreit).toBe(false);
  });
});

test.describe('Geschuetzte Sonderbereiche', () => {
  test('gibt das Anlageformular ohne Anmeldung nicht preis', async ({ page }) => {
    await page.goto('/patienten/neu');

    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Neue:r Patient:in' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Patient anlegen' })).toHaveCount(0);
  });

  test('gibt den Auditbereich ohne Anmeldung nicht preis', async ({ page }) => {
    await page.goto('/praxis/sicherheit/audit');

    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sicherheit' })).toHaveCount(0);
  });
});
