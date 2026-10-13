import { expect, test, type Page } from '@playwright/test';

/**
 * Statistiken im echten Browser (STA-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die fünf Kennzahlen bei 375 px ohne waagerechtes Scrollen
 * in einer Karte untereinander stehen, der Name über dem Wert, am Rechner
 * links daneben (ANN-494), und die Tippziele reichen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/statistik.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Statistiken', () => {
  for (const breite of [375, 1280]) {
    test(`fünf Kennzahlen laufen bei ${breite} px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('heading', { name: 'Statistiken', level: 1 })).toBeVisible();
      await expect(page.getByRole('region')).toHaveCount(8);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('region', { name: 'Umsatz', exact: true }).getByText('Ändern').click();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('eine Karte, die Kennzahlen untereinander; der Name am Telefon darüber, am Rechner daneben', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('region')).toHaveCount(8);
    const umsatz = page.getByRole('region', { name: 'Umsatz', exact: true });
    const posten = page.getByRole('region', { name: 'Offene Posten' });
    // Alle fünf in derselben Liste - eine Karte, kein Kasten je Kennzahl.
    const liste = page.locator('dl').filter({ has: umsatz });
    await expect(liste).toHaveCount(1);
    await expect(liste.locator('dt')).toHaveText([
      'Umsatz',
      'Offene Posten',
      'Auslastung',
      'Verordnungen ohne Anschluss',
      'Ausfälle',
    ]);
    const name = liste.locator('dt', { hasText: 'Offene Posten' });

    // Untereinander: dieselbe Spalte, die zweite Kennzahl tiefer; der Name
    // über dem Wert.
    const u = await umsatz.boundingBox();
    const p = await posten.boundingBox();
    const n = await name.boundingBox();
    expect(Math.abs(p!.x - u!.x)).toBeLessThan(2);
    expect(p!.y).toBeGreaterThan(u!.y);
    expect(n!.y + n!.height).toBeLessThanOrEqual(p!.y + 1);

    // Am Rechner steht der Name links neben dem Wert, in derselben Zeile.
    await page.setViewportSize({ width: 1280, height: 900 });
    const pBreit = await posten.boundingBox();
    const nBreit = await name.boundingBox();
    expect(nBreit!.x + nBreit!.width).toBeLessThanOrEqual(pBreit!.x);
    expect(Math.abs(nBreit!.y - pBreit!.y)).toBeLessThan(16);
  });

  test('Handlungen und Zielknopf sind 44 px hoch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    const handlung = await page.getByRole('link', { name: 'Anrufliste für morgen' }).boundingBox();
    expect(handlung!.height).toBeGreaterThanOrEqual(44);
    // Seit dem Design-Rollout B6 trägt eine Kennzahl zwei Aufklapper:
    // „Aufschlüsselung“ und das Ziel. Geprüft wird der des Ziels.
    const ziel = await page
      .getByRole('region', { name: 'Ausfälle' })
      .locator('summary', { hasText: 'Ziel' })
      .boundingBox();
    expect(ziel!.height).toBeGreaterThanOrEqual(44);
  });

  test('zeigt den Zielstand mit Zeichen und Wort', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await expect(
      page.getByRole('region', { name: 'Umsatz', exact: true }).getByText('Ziel verfehlt'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Offene Posten' }).getByText('Ziel erreicht'),
    ).toBeVisible();
  });

  test('die Grafiken füllen die Breite, am Telefon ohne Überlauf', async ({ page }) => {
    for (const breite of [375, 1280]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      const flaeche = page.getByRole('region', { name: 'Umsatz der letzten 12 Monate' });
      const grafik = flaeche.getByRole('group', { name: /^Umsatz und Zahlungseingang/ });
      await expect(grafik).toBeVisible();
      const aussen = await flaeche.boundingBox();
      const innen = await grafik.boundingBox();
      expect(innen!.width).toBeLessThanOrEqual(aussen!.width);
      expect(innen!.width).toBeGreaterThan(aussen!.width * 0.8);
      expect(await ueberlaeuft(page)).toBe(false);
    }
  });

  test('ein Monat zeigt beim Zeigen Umsatz und Eingang', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PRUEFSEITE);
    const flaeche = page.getByRole('region', { name: 'Umsatz der letzten 12 Monate' });
    await flaeche
      .getByRole('group', { name: /^Umsatz und Zahlungseingang/ })
      .locator('rect[tabindex="0"]')
      .last()
      .hover();
    const hinweis = flaeche.getByRole('tooltip');
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toContainText('Zahlungseingang');
  });
});
