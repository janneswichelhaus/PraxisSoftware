import { expect, test, type Page } from '@playwright/test';

/**
 * Trainingsleistung und Trainingsrechnung im echten Browser (TRN-EPIC-003).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` den
 * Nummernkreis und den Durchgriff. Hier geht es um das, was jsdom nicht misst:
 * kein waagerechtes Scrollen bei 375 px und Tippziele von 44 px - auf der
 * Leistungsseite, der Rechnungsliste, dem Entwurf und dem Blatt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/trainingsabrechnung.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Trainingsabrechnung', () => {
  for (const breite of [375, 1280]) {
    test(`Leistungen und Rechnungen laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=leistungen`);
      await expect(page.getByRole('heading', { name: 'Leistungen', level: 1 })).toBeVisible();
      await expect(page.getByText('Durchgeführt', { exact: true })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      const erfassen = page.getByRole('button', { name: 'Leistungen erfassen' }).first();
      expect((await erfassen.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await erfassen.click();
      const position = page.getByRole('checkbox', { name: /Personal Training/ });
      await expect(position).toBeVisible();
      await expect(position).not.toBeChecked();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=rechnungen`);
      await expect(page.getByRole('heading', { name: 'Rechnungen', level: 1 })).toBeVisible();
      await expect(page.getByText('TR-2026-0001').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Entwurf anlegen' })).toHaveCount(2);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Entwurf und Blatt der Trainingsrechnung laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=rechnung`);
      // Geht die Rechnung an die Person selbst, steht ihr Name nur einmal, als
      // Empfängerin - die Zeile „Leistung für“ entfällt (UX-005i).
      await expect(page.getByText('Tina Trainingskundin').first()).toBeVisible();
      await expect(page.getByText('Leistung für: Tina Trainingskundin')).toHaveCount(0);
      await expect(page.getByText(/geht an die Kund:in selbst/)).toBeVisible();
      await expect(page.getByLabel(/Rechnung geht an/)).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=blatt`);
      await expect(page.getByText('TR-2026-0001').first()).toBeVisible();
      await expect(page.getByText('Leistung für')).toBeVisible();
      await expect(page.getByText('Behandelte Person')).toHaveCount(0);
    });
  }
});
