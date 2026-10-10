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

    test(`Korrekturweg, Rückfrage und Empfängerpflege bei ${breite} px (UX-EPIC-008)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      // BEF-062: Die Zeile aus einer stornierten Rechnung führt nur zur Korrektur.
      await page.goto(`${PRUEFSEITE}?seite=rechnungen`);
      await expect(page.getByRole('link', { name: 'RG-2026-0009' })).toBeVisible();
      const korrektur = page.getByRole('button', { name: 'Korrekturrechnung erstellen' });
      expect((await korrektur.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.screenshot({
        path: `.tmp/screenshots/ux008-abzurechnen-${breite}.png`,
        fullPage: true,
      });

      // BEF-063: Rückfrage mit Empfänger, Betrag und Kreis vor dem Ausstellen.
      await page.goto(`${PRUEFSEITE}?seite=entwurf`);
      await page.getByRole('button', { name: 'Rechnung ausstellen' }).click();
      const kasten = page.getByRole('group', { name: 'Rechnung ausstellen – Rückfrage' });
      await expect(kasten).toContainText('Beihilfestelle Testland (Beihilfestelle)');
      await expect(kasten).toContainText('420,00 €');
      await expect(kasten).toContainText('aus dem Kreis Behandlung');
      await expect(kasten.getByRole('button', { name: 'Ja, Rechnung ausstellen' })).toBeFocused();
      expect(await ueberlaeuft(page)).toBe(false);
      await kasten.screenshot({ path: `.tmp/screenshots/ux008-rueckfrage-${breite}.png` });
      await kasten.getByRole('button', { name: 'Abbrechen' }).click();

      // BEF-062 Teil 2: der gewählte Empfänger lässt sich korrigieren.
      await expect(page.getByRole('option', { name: /· Standard/ })).toBeAttached();
      await page.getByRole('button', { name: 'Empfänger bearbeiten' }).click();
      await expect(page.getByLabel('PLZ')).toHaveValue('72072');
      const aenderung = page.getByRole('button', { name: 'Änderung speichern' });
      expect((await aenderung.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.screenshot({
        path: `.tmp/screenshots/ux008-empfaenger-${breite}.png`,
        fullPage: true,
      });
    });
  }
});
