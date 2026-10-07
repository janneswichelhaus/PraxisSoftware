import { expect, test, type Page } from '@playwright/test';

/**
 * Das Nachsorge-Abo im echten Browser (ANG-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` Regeln, Beträge
 * und Rechte. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px und Tippziele von 44 px - in der Akte, bei den
 * Leistungen, auf dem Rechnungsblatt und auf der Plattform mit dem
 * Kündigungsknopf. Die Plattformansichten prüft zusätzlich
 * `plattform-barrierefreiheit.spec.ts` (Schrift, Kontrast, 200 %).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/nachsorge.html';
const PLATTFORM = '/tests/e2e/fixtures/plattform.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function mindestens44(page: Page, name: string) {
  const knopf = page.getByRole('button', { name }).first();
  await expect(knopf).toBeVisible();
  expect((await knopf.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test.describe('Nachsorge-Abo', () => {
  for (const breite of [375, 1280]) {
    test(`Akte, Leistungen und Blatt laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=akte`);
      await expect(page.getByText('Läuft seit 05.09.2026', { exact: false })).toBeVisible();
      await expect(
        page.getByText('Bernd Betreuer-Langenscheidt (rechtliche Vertretung)', { exact: false }),
      ).toBeVisible();
      await mindestens44(page, 'Kündigung eintragen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=anlegen`);
      await page.getByRole('button', { name: 'Abo anlegen' }).click();
      await expect(page.getByLabel('Beginn')).toHaveValue('2026-10-07');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=leistungen`);
      await expect(page.getByRole('heading', { name: 'Nachsorge-Abo' })).toBeVisible();
      await mindestens44(page, 'Abo-Monat erfassen');
      await expect(page.getByText('Die Behandlung läuft wieder', { exact: false })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=blatt`);
      await expect(
        page.getByText('Zeitraum: 05.09.2026 bis 04.10.2026', { exact: false }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=offen`);
      await expect(page.getByText('Nachsorge-Abo gekündigt (1)', { exact: false })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Kündigungsknopf der Plattform bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PLATTFORM}?seite=abo`);
      await expect(page.getByRole('heading', { level: 1, name: 'Nachsorge-Abo' })).toBeVisible();
      await mindestens44(page, 'Abo kündigen');
      await page.getByRole('button', { name: 'Abo kündigen' }).click();
      await expect(page.getByRole('heading', { name: 'Kündigung bestätigen' })).toBeVisible();
      await mindestens44(page, 'Jetzt kündigen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PLATTFORM}?seite=ich`);
      await expect(page.getByRole('link', { name: 'Abo ansehen oder kündigen' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
