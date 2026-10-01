import { expect, test, type Page } from '@playwright/test';

/**
 * Plattformzugang im echten Browser (POR-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: kein waagerechtes Scrollen bei 375 px, auch mit langen
 * Adressen, ein QR-Code, der ganz auf den Schirm passt, und Tippziele von
 * 44 px im Gerüst.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Plattform', () => {
  for (const breite of [375, 1280]) {
    test(`Abschnitt "Plattform" und QR laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=abschnitt`);
      await expect(page.getByText('Kein Zugang')).toBeVisible();
      await page.getByRole('button', { name: 'Per Mail einladen' }).click();
      await expect(
        page.getByRole('checkbox', { name: 'Die Person hat mir diese Adresse selbst bestätigt.' }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=abschnitt-aktiv`);
      await expect(page.getByText('Eingerichtet')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sperren' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=qr`);
      const code = page.getByRole('img', { name: 'Code zum Einlösen der Einladung' });
      await expect(code).toBeVisible();
      const box = await code.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(breite);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Einlöseseite und Gerüst laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=einladung#code=AbCdEfGhIjKlMnOpQrStUvWxYz012345`);
      await expect(page.getByRole('heading', { name: 'Ihr Zugang', level: 1 })).toBeVisible();
      await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
      // Der Code verlässt die Adresszeile sofort.
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=geruest`);
      await expect(page.getByRole('heading', { name: 'Guten Tag' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Bereich' })).toBeVisible();
      for (const name of ['Behandlung', 'Training', 'Ich', 'Übersicht']) {
        const ziel = await page.getByRole('link', { name, exact: true }).boundingBox();
        expect(ziel!.height, name).toBeGreaterThanOrEqual(44);
      }
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=ich`);
      await expect(page.getByRole('button', { name: 'Überall abmelden' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=gesperrt`);
      await expect(page.getByRole('heading', { name: 'Ihr Zugang ist gesperrt' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
