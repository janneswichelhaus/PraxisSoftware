import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Dokumentieren ohne Empfang im echten Browser (OFF-EPIC-001, ADR-024
 * Punkte 6 bis 9, ADR-025 Punkt 16).
 *
 * Was jsdom nicht kann: die Freigabe per Passkey mit dem virtuellen
 * Authenticator und Web Crypto, IndexedDB über ein Neuladen hinweg, die
 * Übertragung über den abgefangenen RPC und das alles bei 375 und 1280 px
 * ohne waagerechtes Scrollen. Passkeys verlangen einen Namen als Relying
 * Party - die Seite läuft deshalb unter `localhost`.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/ohne-empfang.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const SYNC = '**/rest/v1/rpc/sync_offline_treatment_note';

function unterLocalhost(baseURL: string | undefined, pfad: string): string {
  const url = new URL(pfad, baseURL);
  url.hostname = 'localhost';
  return url.toString();
}

async function authenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
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

test.describe('Ohne Empfang dokumentieren (OFF-003)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'virtueller Authenticator nur über CDP',
  );

  for (const breite of [375, 1280]) {
    test(`der Passkey öffnet Tagesplan und Schreibfeld, der Entwurf übersteht das Neuladen (${breite} px)`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await authenticator(page);
      await page.goto(unterLocalhost(baseURL, `${PRUEFSEITE}?schluessel=1`));
      await expect(
        page.getByText('Ohne Verbindung. Hier ist nur, was auf diesem Gerät liegt.'),
      ).toBeVisible();
      await expect(page.getByText('Hinterhofgasse 12b, 72070 Tübingen').first()).toBeVisible();
      // Die Feldliste: kein Zugangshinweis auf dem Gerät.
      await expect(page.getByText('Klingel defekt')).toHaveCount(0);
      // Abgesagt und Teamrunde: kein Schreibfeld.
      await expect(page.getByRole('button', { name: 'Ohne Verbindung schreiben' })).toHaveCount(2);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await page.getByRole('button', { name: 'Ohne Verbindung schreiben' }).first().click();
      await page
        .getByLabel('Behandlungsdokumentation')
        .fill('Synthetisch: Gangschule ohne Empfang im Hinterhof.');
      await expect(
        page.getByText('Auf dem Gerät gespeichert, noch nicht übertragen.'),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Fertig' }).click();
      await expect(page.getByText(/Noch nicht übertragen: ein Entwurf/)).toBeVisible();

      // Neuladen: hinter der Sperre, und der Entwurf liegt noch da (IndexedDB).
      await page.reload();
      await expect(page.getByText('Ohne Verbindung. Hier ist nur')).toBeVisible();
      await expect(
        page.getByText('Synthetisch: Gangschule ohne Empfang im Hinterhof.'),
      ).toBeVisible();
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('die Sperrseite sagt, was sich für ein Praxiskonto öffnet', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(unterLocalhost(baseURL, PRUEFSEITE));
    await expect(page.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeVisible();
    await expect(page.getByText(/Ihren Tagesplan von heute und Ihre Entwürfe/)).toBeVisible();
    await expect(page.getByLabel('PIN', { exact: true })).toHaveCount(0);
    expect(await ueberlaeuft(page)).toBe(false);
  });
});

test.describe('Übertragung in offener Sitzung (OFF-002)', () => {
  test('ein wartender Entwurf geht hinaus und fällt vom Gerät', async ({ page }) => {
    const gesendet: Record<string, unknown>[] = [];
    await page.route(SYNC, async (route) => {
      gesendet.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'created',
          note_id: 'dddddddd-0000-4000-8000-000000000001',
        }),
      });
    });
    await page.goto(`${PRUEFSEITE}?seite=geraet&entwurf=1`);
    await expect(
      page.getByText('Alles übertragen. Auf dem Gerät liegt kein Entwurf.'),
    ).toBeVisible();
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]).toMatchObject({
      p_appointment_id: 'aaaaaaaa-0000-4000-8000-000000000101',
      p_content: 'Synthetisch: Gangschule im Treppenhaus, 3 x 10 Stufen mit Geländer.',
    });
    await expect(page.getByRole('link', { name: 'Auf dem Gerät ansehen' })).toHaveCount(0);
  });

  for (const breite of [375, 1280]) {
    test(`Konflikt: nichts eingemischt, beide Wege angeboten (${breite} px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.route(SYNC, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'conflict',
            note_id: 'dddddddd-0000-4000-8000-000000000002',
            note_status: 'final',
          }),
        }),
      );
      await page.goto(`${PRUEFSEITE}?seite=geraet&entwurf=1`);
      await expect(page.getByText(/schon eine finalisierte Dokumentation/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Als Nachtrag übernehmen' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'In Korrektur übernehmen' })).toBeVisible();
      await expect(page.getByText('Noch nicht übertragen:')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('Funkloch: der Entwurf bleibt und wartet', async ({ page }) => {
    await page.route(SYNC, (route) => route.abort());
    await page.goto(`${PRUEFSEITE}?seite=geraet&entwurf=1`);
    await expect(page.getByText(/Noch nicht übertragen: ein Entwurf/).first()).toBeVisible();
    await expect(page.getByText('Auf dem Gerät gespeichert, noch nicht übertragen.')).toBeVisible();
  });
});

test.describe('Einrichtung unter „Mein Konto" (OFF-001)', () => {
  test('erst mit der ganzen Gerätevorgabe, bei 375 px ohne Überlauf', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=einrichtung`);
    const knopf = page.getByRole('button', { name: 'Auf diesem Gerät einschalten' });
    await expect(knopf).toBeDisabled();
    for (const kasten of await page.getByRole('checkbox').all()) {
      await kasten.check();
      expect(
        (await kasten.locator('xpath=ancestor::label').boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
    await knopf.click();
    await expect(page.getByText(/Auf diesem Gerät eingeschaltet seit/)).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
  });
});
