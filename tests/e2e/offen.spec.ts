import { expect, test, type Page } from '@playwright/test';

/**
 * Offene Punkte und Anrufliste im echten Browser (PRX-EPIC-003).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die Seiten bei 375 px ohne waagerechtes Scrollen auskommen,
 * die Anrufwege echte `tel:`-Verweise sind und die Tippziele reichen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/offen.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Offene Punkte', () => {
  for (const ansicht of ['liste', 'formular', 'anrufe']) {
    test(`${ansicht} laeuft bei 375 px nicht waagerecht ueber`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(page.locator('main')).not.toBeEmpty();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('die Liste zeigt alle Abschnitte der Praxisinhaberin', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=liste`);
    for (const titel of [
      'Aufgaben (3)',
      'Verordnungen zu erfassen (1)',
      'Erstaufnahme offen (2)',
      'Anrufe für morgen',
      'Verordnung endet (1)',
      'Versorgung abschließen? (1)',
    ]) {
      await expect(page.getByRole('heading', { name: titel })).toBeVisible();
    }
    await expect(page.getByText('Überfällig')).toBeVisible();
    await expect(page.getByText('2 von 3 Terminen noch nicht mitgeteilt.')).toBeVisible();
  });

  test('die Anrufliste bietet Anrufen als tel:-Verweis und 44 px hohe Knoepfe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=anrufe`);
    const max = page.getByRole('group', { name: 'Anruf bei Max Mustermann' });
    await expect(page.getByRole('link', { name: /\+49 7071 0000005/ })).toHaveAttribute(
      'href',
      /^tel:/,
    );
    const knopf = max.getByRole('button', { name: 'Nicht erreicht' });
    const box = await knopf.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText('Nachricht hinterlassen (2×)')).toBeVisible();
  });
});
