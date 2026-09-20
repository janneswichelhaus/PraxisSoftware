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
 * Kennwort vergessen (STAFF-004a).
 *
 * Der einzige Teil des Epics, der ohne Anmeldung erreichbar ist - und damit
 * der einzige, der hier automatisiert laeuft. Die Vorgaenge hinter der
 * Anmeldung brauchen einen laufenden Anmeldedienst (docs/DEVELOPMENT.md).
 */
test.describe('Kennwort vergessen', () => {
  test('ist per Tastatur erreichbar und uebernimmt die getippte Adresse', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('E-Mail-Adresse', { exact: true }).fill('anna.beispiel@praxis.invalid');
    await page.getByRole('button', { name: 'Kennwort vergessen?' }).click();

    await expect(page.getByRole('heading', { name: 'Kennwort vergessen' })).toBeVisible();
    await expect(page.getByLabel('E-Mail-Adresse des Zugangs')).toHaveValue(
      'anna.beispiel@praxis.invalid',
    );
  });

  test('bestaetigt fuer jede Adresse gleich (kein Konto-Orakel)', async ({ page }) => {
    // Der Anmeldedienst antwortet - und zwar ablehnend, weil es die Adresse
    // nicht gibt. Genau dann darf die Bestaetigung nichts anderes sagen.
    // Die Antwort wird hier gesetzt statt dem fehlenden Dienst ueberlassen:
    // Seit R3-008 unterscheidet die Seite "abgelehnt" von "nicht erreichbar",
    // und der Test soll sagen, welchen Fall er prueft.
    await page.route('**/auth/v1/recover**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'user_not_found', message: 'User not found' }),
      }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Kennwort vergessen?' }).click();
    await page.getByLabel('E-Mail-Adresse des Zugangs').fill('gibt.es.nicht@praxis.invalid');
    await page.getByRole('button', { name: 'Link anfordern' }).click();

    await expect(page.getByText(/Falls für diese Adresse ein Zugang besteht/)).toBeVisible();
    await expect(page.getByText(/unbekannt|nicht gefunden|existiert/i)).toHaveCount(0);
  });

  test('nennt den nicht erreichbaren Dienst, ohne etwas zu verraten (R3-008)', async ({ page }) => {
    // Der andere Fall: Die Anfrage kommt gar nicht an. Dann ist die
    // Bestaetigung "eine Mail ist unterwegs" schlicht falsch - jemand wartet
    // auf Post, die nie kommt. Ueber das Konto wird trotzdem nichts gesagt.
    await page.route('**/auth/v1/recover**', (route) => route.abort('failed'));

    await page.goto('/');
    await page.getByRole('button', { name: 'Kennwort vergessen?' }).click();
    await page.getByLabel('E-Mail-Adresse des Zugangs').fill('anna.beispiel@praxis.invalid');
    await page.getByRole('button', { name: 'Link anfordern' }).click();

    await expect(page.getByText(/nicht erreichbar/)).toBeVisible();
    await expect(page.getByText(/Falls für diese Adresse ein Zugang besteht/)).toHaveCount(0);
    await expect(page.getByText(/unbekannt|nicht gefunden|existiert/i)).toHaveCount(0);
  });

  test('laeuft bei 375 px ohne horizontales Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Kennwort vergessen?' }).click();
    await expect(page.getByRole('heading', { name: 'Kennwort vergessen' })).toBeVisible();

    const ueberbreit = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(ueberbreit).toBe(false);

    const hoehe = await page
      .getByRole('button', { name: 'Link anfordern' })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(hoehe).toBeGreaterThanOrEqual(44);
  });
});

/**
 * Neues Kennwort ueber den Link aus der Mail (FIX-001).
 *
 * Die zweite Seite, die ohne Anmeldung erreichbar ist. Bis FIX-001 gab es sie
 * nicht: Die Mails verwiesen auf /kennwort-neu, und diese Adresse hatte keine
 * Route - wer den Link oeffnete, landete auf der Anmeldemaske zurueck.
 *
 * Der vollstaendige Durchlauf mit einem echten Link braucht GoTrue und den
 * Mailfaenger und steht deshalb als manueller Schritt in
 * docs/abnahme/etappe-g-betriebsreife.md. Was hier laeuft, ist der Teil, der
 * ohne Anmeldedienst aussagekraeftig ist - und das ist gerade der
 * Fehlerfall.
 */
test.describe('Neues Kennwort setzen', () => {
  test('ist ohne Anmeldung erreichbar und nicht die Anmeldemaske', async ({ page }) => {
    await page.goto('/kennwort-neu');

    await expect(page.getByRole('heading', { name: 'Neues Kennwort setzen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toHaveCount(0);
  });

  test('sagt bei einem Link ohne Kennung, was zu tun ist, statt ein Formular anzubieten', async ({
    page,
  }) => {
    await page.goto('/kennwort-neu');

    await expect(page.getByText('Dieser Link lässt sich nicht mehr verwenden.')).toBeVisible();
    await expect(page.getByLabel('Neues Kennwort', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zur Anmeldung' })).toBeVisible();
  });

  test('gibt bei einer unbrauchbaren Kennung kein Formular und keine Auskunft ueber das Konto', async ({
    page,
  }) => {
    // Diese Datei laeuft in BEIDEN E2E-Jobs - einmal ohne Anmeldedienst
    // ("End-to-End") und einmal mit laufendem Stack ("End-to-End hinter der
    // Anmeldung"). Der Fehlschlag hat deshalb je Job eine andere Ursache:
    // ohne Dienst einen Netzwerkfehler, mit Dienst eine saubere Ablehnung der
    // Kennung. Die Seite unterscheidet die beiden bewusst (FIX-007) - der
    // Test darf sich aber auf keine der beiden festlegen, sonst prueft er die
    // Umgebung und nicht die Anwendung.
    //
    // Geprueft wird hier also, was in beiden Faellen gelten MUSS. Dass die
    // Unterscheidung selbst stimmt, halten die Komponententests in beide
    // Richtungen fest (KennwortNeuPage.test.tsx, ZugangPage.test.tsx), und
    // am laufenden Stack prueft es Schritt 19 in
    // docs/abnahme/etappe-g-betriebsreife.md.
    await page.goto('/kennwort-neu?token_hash=unbrauchbar&type=recovery');

    // Einer der beiden Abbrueche steht da - und zwar genau einer.
    await expect(
      page.getByText(
        /Dieser Link lässt sich nicht mehr verwenden\.|Der Anmeldedienst ist gerade nicht erreichbar\./,
      ),
    ).toHaveCount(1);

    // Kein Formular: ohne eingeloesten Link wird kein Kennwort gesetzt.
    await expect(page.getByLabel('Neues Kennwort', { exact: true })).toHaveCount(0);

    // Und kein Wort darueber, ob es zu dieser Kennung ein Konto gibt.
    await expect(page.getByText(/unbekannt|nicht gefunden|existiert|kein Konto/i)).toHaveCount(0);
  });

  test('laeuft bei 375 px ohne horizontales Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto('/kennwort-neu');
    await expect(page.getByRole('heading', { name: 'Neues Kennwort setzen' })).toBeVisible();

    const ueberbreit = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(ueberbreit).toBe(false);

    const hoehe = await page
      .getByRole('button', { name: 'Zur Anmeldung' })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(hoehe).toBeGreaterThanOrEqual(44);
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
