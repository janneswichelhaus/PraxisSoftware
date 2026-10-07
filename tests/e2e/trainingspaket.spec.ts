import { expect, test, type Page } from '@playwright/test';

/**
 * Das Trainingspaket im echten Browser (ANG-EPIC-002).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` Regeln, Beträge
 * und Rechte. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px und Tippziele von 44 px - am Trainingsverhältnis, in der
 * Preisliste und auf dem Rechnungsblatt. Die Plattformansichten prüft
 * `plattform-barrierefreiheit.spec.ts` (Schrift, Kontrast, 200 %).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/trainingspaket.html';

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

test.describe('Trainingspaket', () => {
  for (const breite of [375, 1280]) {
    test(`Verhältnis, Preisliste und Blatt laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=verhaeltnis`);
      await expect(page.getByText('01.10.2026 bis 31.03.2027', { exact: false })).toBeVisible();
      await expect(page.getByText('Steht auf einer Rechnung.')).toBeVisible();
      await mindestens44(page, 'Paket anlegen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=anlegen`);
      await page.getByRole('button', { name: 'Paket anlegen' }).click();
      await expect(page.getByLabel('Beginn')).toHaveValue('2026-10-07');
      await page
        .getByLabel('Paket', { exact: true })
        .selectOption('cccccccc-cccc-4ccc-8ccc-000000000015');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=behandlung`);
      await expect(page.getByText('noch in Behandlung', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Paket anlegen' })).toHaveCount(0);

      await page.goto(`${PRUEFSEITE}?seite=blatt`);
      await expect(
        page.getByText('Zeitraum: 01.10.2026 bis 31.03.2027', { exact: false }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=preisliste`);
      await expect(page.getByLabel('Laufzeit')).toHaveValue('3');
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
