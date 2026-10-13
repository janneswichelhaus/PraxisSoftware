import { expect, test, type Page } from '@playwright/test';

/**
 * Die Seiten der Abrechnung nach dem Design-Rollout B6 im echten Browser.
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: kein waagerechtes Scrollen bei 375 und 1280 px, Tippziele von
 * 44 px - an der Rechnung mit ihren Reitern, am Katalog mit Bearbeiten auf
 * Abruf, an Leistungen, Zahlungen, Auswertung, Stammdaten und den
 * Druckblättern. Die Prüfseite hat Inhalt, den der Seed nicht hat (keine
 * Rechnung, keine Zahlung).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/abrechnung.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function mindestens44(page: Page, rolle: 'button' | 'link', name: string | RegExp) {
  const ziel = page.getByRole(rolle, { name }).first();
  await expect(ziel).toBeVisible();
  expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test.describe('Abrechnung (Design-Rollout B6)', () => {
  for (const breite of [375, 1280]) {
    test(`Rechnung mit Reitern läuft bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=rechnung`);
      await expect(
        page.getByRole('heading', { name: 'RG-2026-0012 · Erika Beispiel', level: 1 }),
      ).toBeVisible();
      const reiter = page.getByRole('navigation', { name: 'Teile der Rechnung' });
      await expect(reiter.getByRole('link', { name: 'Zahlungen' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await mindestens44(page, 'link', 'Positionen');
      await mindestens44(page, 'button', 'Zahlung stornieren');
      await mindestens44(page, 'button', 'Rechnung stornieren');
      expect(await ueberlaeuft(page)).toBe(false);

      await reiter.getByRole('link', { name: 'Positionen' }).click();
      await expect(page.getByRole('list', { name: 'Leistungen der Rechnung' })).toBeVisible();
      await expect(page.getByText('Gesamtbetrag')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=guthaben`);
      await expect(page.getByText(/Stornodokument RG-2026-0010/)).toBeVisible();
      await mindestens44(page, 'link', 'Stornodokument öffnen');
      await mindestens44(page, 'button', 'Rückzahlung buchen');
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Katalog öffnet eine Position auf Abruf, bei ${breite} px ohne Überlauf`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=katalog`);
      const zeile = page.getByRole('button', { name: /^Krankengymnastik/ });
      await expect(zeile).toHaveAttribute('aria-expanded', 'false');
      expect((await zeile.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(page.getByLabel('Kürzel')).toHaveCount(0);
      await zeile.click();
      await expect(zeile).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByLabel('Kürzel')).toHaveValue('KG');
      expect(await ueberlaeuft(page)).toBe(false);

      // Die gültige Liste: dieselben Zeilen, ohne etwas zum Ändern.
      await page.getByRole('button', { name: /Preisliste 2026/ }).click();
      await expect(
        page.getByText('In Kraft und damit unveränderlich', { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Entwurf speichern' })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Leistungen, Zahlungen und Auswertung laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=leistungen`);
      await mindestens44(page, 'button', 'Leistungen erfassen');
      await mindestens44(page, 'button', 'Erfassung zurücknehmen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=zahlungen`);
      await mindestens44(page, 'link', 'RG-2026-0012');
      await expect(page.getByText('−48,00 €')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=auswertung`);
      await page.getByLabel('Grundlage').selectOption('accrual');
      await expect(page.getByText('Summe Behandlung · Rechnungsstellung')).toBeVisible();
      await expect(page.getByText('Summe Training · Rechnungsstellung')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=stammdaten`);
      await mindestens44(page, 'button', 'Speichern');
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Druckblätter laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      for (const [seite, knopf] of [
        ['blatt', 'Rechnung drucken'],
        ['storno', 'Stornodokument drucken'],
        ['erinnerung', 'Zahlungserinnerung drucken'],
      ] as const) {
        await page.goto(`${PRUEFSEITE}?seite=${seite}`);
        await mindestens44(page, 'button', knopf);
        expect(await ueberlaeuft(page)).toBe(false);
      }
    });
  }
});
