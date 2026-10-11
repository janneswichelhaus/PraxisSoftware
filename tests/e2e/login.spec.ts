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
    // Der Testzugang liegt zugeklappt hinter „Testkonten".
    await expect(page.getByLabel('E-Mail-Adresse')).toBeHidden();
    await page.getByText('Testkonten', { exact: true }).click();
    await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
    // exact: true grenzt das Feld selbst gegen den Sichtbar-Schalter ab, dessen
    // Beschriftung ("Kennwort anzeigen") den Feldnamen enthaelt.
    await expect(page.getByLabel('Kennwort', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kennwort anzeigen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeEnabled();
  });

  test('bietet zuerst den Passkey an und kein Kennwort vergessen (ADR-025 Fassung 2)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Mit Passkey anmelden' })).toBeVisible();
    await expect(page.getByText(/Die Praxis gibt Ihnen eine neue Einladung/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kennwort vergessen?' })).toHaveCount(0);
  });

  test('ist vollstaendig mit der Tastatur bedienbar', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Testkonten', { exact: true }).click();

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
    await expect(page.getByRole('navigation', { name: 'Arbeitsbereiche' })).toHaveCount(0);
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

/**
 * Testzugang mit Kennwort (ADR-025 Punkt 15).
 *
 * Nur ausserhalb der Produktion: Der Entwicklungsserver gilt als Entwicklung
 * (ANN-326), deshalb steht der Testzugang hier. Ein Kennwort vergessen gibt
 * es nicht mehr - wer den Passkey verliert, bekommt eine neue Einladung.
 */
test.describe('Testzugang', () => {
  test('sagt im Funkloch „keine Verbindung" statt „Kennwort pruefen" (BEF-047)', async ({
    page,
  }) => {
    // Die Anfrage kommt nicht an: Der Anmeldedienst gibt dann einen eigenen
    // Fehler zurueck, statt zu werfen. Bis UX-006c stand hier derselbe Satz
    // wie bei einem falschen Kennwort.
    await page.route('**/auth/v1/token**', (route) => route.abort('failed'));
    for (const breite of [375, 1280]) {
      await page.setViewportSize({ width: breite, height: 780 });
      await page.goto('/');
      await page.getByText('Testkonten', { exact: true }).click();
      await page.getByLabel('E-Mail-Adresse').fill('anna.beispiel@praxis.invalid');
      await page.getByLabel('Kennwort', { exact: true }).fill('LokalerTestzugang!2026');
      await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

      await expect(page.getByRole('alert')).toHaveText(
        'Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.',
      );
      await expect(page.getByText(/Kennwort prüfen/)).toHaveCount(0);
      const ueberbreit = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(ueberbreit).toBe(false);
    }
  });

  test('nennt zu viele Versuche und verraet bei 400 nichts (BEF-047)', async ({ page }) => {
    let antwort = { status: 429, code: 'over_request_rate_limit' };
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: antwort.status,
        contentType: 'application/json',
        body: JSON.stringify({ code: antwort.status, error_code: antwort.code, msg: 'x' }),
      }),
    );
    await page.goto('/');
    await page.getByText('Testkonten', { exact: true }).click();
    await page.getByLabel('E-Mail-Adresse').fill('anna.beispiel@praxis.invalid');
    await page.getByLabel('Kennwort', { exact: true }).fill('falsch-falsch-falsch');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.',
    );

    antwort = { status: 400, code: 'invalid_credentials' };
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Anmeldung nicht möglich. Bitte E-Mail-Adresse und Kennwort prüfen.',
    );
  });
});

/**
 * Kein Kennwort setzen (ADR-025 Punkt 9): `/kennwort-neu` gibt es seit
 * SEC-EPIC-002 nicht mehr. Ein alter Link führt auf die Anmeldemaske und löst
 * nichts ein.
 */
test('fuehrt einen alten Link zum Kennwort auf die Anmeldemaske', async ({ page }) => {
  let eingeloest = false;
  await page.route('**/auth/v1/verify**', (route) => {
    eingeloest = true;
    return route.abort('failed');
  });
  await page.goto('/kennwort-neu#token_hash=alt&type=recovery');
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Neues Kennwort setzen' })).toHaveCount(0);
  expect(eingeloest).toBe(false);
});

test.describe('Geschuetzte Sonderbereiche', () => {
  test('gibt das Anlageformular ohne Anmeldung nicht preis', async ({ page }) => {
    await page.goto('/patienten/neu');

    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Patient:in anlegen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Patient anlegen' })).toHaveCount(0);
  });

  test('gibt den Auditbereich ohne Anmeldung nicht preis', async ({ page }) => {
    await page.goto('/praxis/sicherheit/audit');

    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sicherheit' })).toHaveCount(0);
  });
});
