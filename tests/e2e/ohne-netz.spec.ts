import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Üben ohne Netz und die Freigabe per Passkey im echten Browser
 * (TRK-EPIC-003, ADR-024 Punkte 5 und 9, ADR-025 Punkt 16).
 *
 * Was jsdom nicht kann: eine echte WebAuthn-Zeremonie mit dem virtuellen
 * Authenticator von Chromium, die Prüfung der Signatur mit Web Crypto des
 * Browsers, IndexedDB als Ablage, und das alles bei 375 und 1280 px ohne
 * waagerechtes Scrollen. Passkeys verlangen einen Namen als Relying Party,
 * keine IP-Adresse - die Seite läuft deshalb unter `localhost`.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/ohne-netz.html';
const UEBUNGEN = '/tests/e2e/fixtures/plattform-uebungen.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

function unterLocalhost(baseURL: string | undefined, pfad: string): string {
  const url = new URL(pfad, baseURL);
  url.hostname = 'localhost';
  return url.toString();
}

/** Ein virtueller Authenticator; `pruefen(false)` lässt die Prüfung der Person scheitern. */
async function authenticator(page: Page): Promise<{ pruefen: (ja: boolean) => Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    pruefen: async (ja) => {
      await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: ja });
    },
  };
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof AxeCore }).axe;
    const ergebnis = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return ergebnis.violations.map(
      (v) => `${v.id}: ${v.help} – ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`,
    );
  });
}

test.describe('Freigabe ohne Netz per Passkey (TRK-009)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'virtueller Authenticator nur über CDP',
  );

  for (const breite of [375, 1280]) {
    test(`öffnet mit dem Passkey nur die Übungen auf dem Gerät (${breite} px)`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      const geraet = await authenticator(page);
      await page.goto(unterLocalhost(baseURL, `${PRUEFSEITE}?schluessel=1&wartend=1`));
      // Das Fenster öffnet sich von selbst; der virtuelle Authenticator bestätigt.
      await expect(
        page.getByText('Ohne Verbindung. Hier ist nur, was auf diesem Gerät liegt.'),
      ).toBeVisible();
      await expect(page.getByTestId('wartehinweis')).toHaveText(
        'Eine Einheit liegt noch auf diesem Gerät und ist noch nicht übertragen.',
      );
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      // Üben ohne Netz: der Haken von vorhin steht, ein neuer kommt dazu.
      await page.getByRole('button', { name: 'Jetzt üben' }).click();
      const erster = page.getByRole('button', { name: /^1\. Durchgang/ });
      await expect(erster).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: /^2\. Durchgang/ }).click();
      // Der Fuß der Durchführung (ANN-710), mit dem Zusatz der gesperrten Anwendung.
      await expect(
        page.getByText(/sobald Verbindung besteht und Sie die Anwendung entsperrt haben/),
      ).toBeVisible();
      expect((await erster.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      expect(await ueberlaeuft(page)).toBe(false);

      // Nach dem Neuladen liegt alles noch da (IndexedDB), hinter der Sperre.
      await page.reload();
      await expect(page.getByText('Ohne Verbindung. Hier ist nur')).toBeVisible();
      await page.getByRole('button', { name: 'Jetzt üben' }).click();
      await expect(page.getByRole('button', { name: /^2\. Durchgang/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      // „Später weiter“ führt zur Auswahl zurück, die Einheit bleibt offen.
      await page.getByRole('button', { name: 'Später weiter' }).click();
      await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible();

      // Sperren schließt die Ansicht. Das Passkey-Fenster öffnet sich wieder
      // von selbst; diesmal scheitert die Prüfung der Person.
      await geraet.pruefen(false);
      await page.getByRole('button', { name: 'Sperren' }).click();
      await expect(page.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeVisible();
    });
  }

  test('ohne Prüfung der Person am Gerät öffnet der Passkey nichts (UV, ADR-025 Punkt 10)', async ({
    page,
    baseURL,
  }) => {
    const geraet = await authenticator(page);
    await page.goto(unterLocalhost(baseURL, `${PRUEFSEITE}?schluessel=1`));
    await expect(page.getByText('Ohne Verbindung. Hier ist nur')).toBeVisible();
    // Derselbe Passkey, aber Gesicht, Finger oder Geräte-PIN bestätigen nicht.
    await geraet.pruefen(false);
    await page.goto(unterLocalhost(baseURL, PRUEFSEITE));
    await expect(page.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeVisible();
    await page.getByRole('button', { name: 'Mit Passkey öffnen' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Ohne Verbindung. Hier ist nur')).toHaveCount(0);
  });

  test('ohne abgelegten Schlüssel: sagt es, öffnet nichts', async ({ page, baseURL }) => {
    await authenticator(page);
    await page.goto(unterLocalhost(baseURL, PRUEFSEITE));
    await page.getByRole('button', { name: 'Mit Passkey öffnen' }).click();
    await expect(page.getByText(/kein Passkey für die Freigabe ohne Verbindung/)).toBeVisible();
    await expect(page.getByText('Ohne Verbindung. Hier ist nur')).toHaveCount(0);
  });

  test('die Sperrseite ohne Netz passt bei 375 px und besteht axe', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(unterLocalhost(baseURL, PRUEFSEITE));
    await expect(page.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeVisible();
    await expect(page.getByLabel('PIN', { exact: true })).toHaveCount(0);
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
  });
});

test.describe('Durchführung über die Warteschlange (TRK-008)', () => {
  test('überträgt jeden Haken und sagt „Übertragen an die Praxis"', async ({ page }) => {
    const gesendet: unknown[] = [];
    await page.route('**/rest/v1/rpc/sync_platform_exercise_session', async (route) => {
      const daten = route.request().postDataJSON() as { p_session_id: string };
      gesendet.push(daten);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: daten.p_session_id, status: 'ok', note_dropped: false }),
      });
    });
    await page.goto(`${UEBUNGEN}?seite=einheit`);
    await page.getByRole('button', { name: /^2\. Durchgang/ }).click();
    await expect.poll(() => gesendet.length).toBe(1);
    await expect(page.getByText('Übertragen an die Praxis')).toBeVisible();
    expect(gesendet[0]).toMatchObject({
      p_session_id: 'cccccccc-0000-4000-8000-000000000001',
      p_events: [{ kind: 'set', set_number: 2, done: true }],
    });
  });

  for (const breite of [375, 1280]) {
    test(`ohne Verbindung bleibt der Haken stehen und wartet (${breite} px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.route('**/rest/v1/rpc/sync_platform_exercise_session', (route) => route.abort());
      await page.goto(`${UEBUNGEN}?seite=einheit`);
      const zweiter = page.getByRole('button', { name: /^2\. Durchgang/ });
      await zweiter.click();
      await expect(zweiter).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Auf diesem Gerät, noch nicht übertragen')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
