import { expect, test, type Page } from '@playwright/test';

/**
 * Terminhonorar und Rechnung je Verordnung im echten Browser (ABR-EPIC-007).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` Betrag,
 * Aufteilung und Bündelung. Hier geht es um das, was jsdom nicht misst: kein
 * waagerechtes Scrollen bei 375 px und Tippziele von 44 px - an Preisliste,
 * Akte, Arbeitsliste und Rechnungsblatt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/terminhonorar.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Terminhonorar', () => {
  for (const breite of [375, 1280]) {
    test(`Preisliste und Akte laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=katalog`);
      await expect(page.getByLabel('Terminhonorar je Behandlungstermin')).toHaveValue('145,00');
      const speichern = page.getByRole('button', { name: 'Terminhonorar speichern' });
      expect((await speichern.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=akte`);
      await expect(page.getByText('vereinbart ab 01.05.2026', { exact: false })).toBeVisible();
      const vereinbaren = page.getByRole('button', { name: 'Honorar vereinbaren' });
      expect((await vereinbaren.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await vereinbaren.click();
      await expect(page.getByLabel('Gilt ab')).toHaveValue('2026-10-05');
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Arbeitsliste und Blatt je Verordnung laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=rechnungen`);
      await expect(page.getByText('Folgeverordnung vom 15.07.2026')).toBeVisible();
      await expect(page.getByText('22.07.2026 bis 27.08.2026')).toBeVisible();
      await expect(page.getByText(/Erstverordnung vom 01.07.2026/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=blatt`);
      await expect(page.getByText(/Leistungen vom 22.07.2026 bis 27.08.2026/)).toBeVisible();
      await expect(
        page.getByText('Behandlungstage: 22.07.2026, 29.07.2026, 27.08.2026'),
      ).toHaveCount(3);
      await expect(page.getByText('420,00 €').first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
