import { expect, test, type Page } from '@playwright/test';

/**
 * Der Übergang aus der Behandlung ins Training im echten Browser
 * (KND-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` Regeln und
 * Rechte. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px und Tippziele von 44 px – am Angebot in der Akte, beim
 * Buchen im Konto, am Widerrufsknopf, an den Voraussetzungen und in Offene
 * Punkte. Schrift, Kontrast und 200 % prüft `plattform-barrierefreiheit.spec.ts`.
 */

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

test.describe('Übergang ins Training', () => {
  for (const breite of [375, 1280]) {
    test(`Akte, Konto, Vertrag, Profil und Offene Punkte laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto('/tests/e2e/fixtures/akte.html?bereich=stammdaten&angebot=offen');
      const gruppe = page.getByRole('group', { name: 'Training nach der Behandlung' });
      await expect(gruppe.getByText(/Zur Übernahme angeboten: Belastungsgrenzen/)).toBeVisible();
      await mindestens44(page, 'Zurückziehen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/akte.html?bereich=stammdaten');
      await page.getByRole('button', { name: 'Training anbieten' }).click();
      await page.getByRole('button', { name: 'Angabe hinzufügen' }).click();
      await expect(page.getByLabel('Überschrift 1')).toBeVisible();
      await mindestens44(page, 'Angebot festhalten');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/plattform.html?seite=angebot-frueh');
      await expect(
        page.getByRole('heading', { name: 'Training nach Ihrer Behandlung' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Zahlungspflichtig buchen' }).click();
      await expect(page.getByText(/innerhalb der Widerrufsfrist. Bitte bestätigen/)).toBeVisible();
      await mindestens44(page, 'Zahlungspflichtig buchen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/plattform.html?seite=vertrag');
      await page.getByRole('button', { name: 'Vertrag widerrufen' }).click();
      await mindestens44(page, 'Widerruf bestätigen');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/training.html?seite=detail');
      await expect(page.getByText('Aus der Behandlung übernommen')).toBeVisible();
      await page
        .getByRole('region', { name: /Voraussetzungen/ })
        .or(page.locator('section', { hasText: 'Voraussetzungen' }))
        .getByRole('button', { name: 'Bearbeiten' })
        .first()
        .click();
      await expect(page.getByLabel('Belastungsgrenzen')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/offen.html?ansicht=widerruf');
      await expect(page.getByText(/Trainingsvertrag widerrufen \(1\)/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto('/tests/e2e/fixtures/termin.html?abschluss');
      await expect(page.getByRole('link', { name: 'Training in der Akte anbieten' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
