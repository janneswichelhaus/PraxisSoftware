import { expect, test } from '@playwright/test';

/**
 * Befund aus Bausteinen in einem echten Browser (FRB-EPIC-003).
 *
 * Die Komponententests prüfen Text und Regeln. Hier geht es um das, was jsdom
 * nicht misst: ob die aufgeklappten Blöcke bei 375 px ohne waagerechtes
 * Scrollen auskommen und ob der Weg vom Antippen in den Text trägt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/bausteine.html';

test.describe('Bausteine', () => {
  test('laeuft bei 375 px nicht waagerecht ueber, auch aufgeklappt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(PRUEFSEITE);
    await page.getByText('Befund aus Bausteinen').click();
    // Die Region mit den längsten Bezeichnungen.
    await page.getByRole('button', { name: 'Ellenbogen' }).click();
    for (const zusammenfassung of await page.locator('details details > summary').all()) {
      await zusammenfassung.click();
    }
    const les = page.getByRole('group', { name: /Table-op relocation Test/ });
    await les.getByRole('button', { name: 'nicht beurteilbar' }).click();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test('bringt einen Test mit zwei Tipps und einer Übernahme in den Text', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await page.getByText('Befund aus Bausteinen').click();
    await page.getByRole('button', { name: 'Knie' }).click();
    await page.getByText('Weiterführende Untersuchung').click();
    const lachmann = page.getByRole('group', { name: 'Lachmann-Test' });
    await lachmann.getByRole('button', { name: 'positiv' }).click();
    await lachmann.getByRole('button', { name: 'rechts' }).click();
    await page.getByRole('button', { name: 'In den Text übernehmen' }).click();

    await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue(
      'Synthetisch: Erstbefund Knie rechts.\n\n' +
        'Knie – Weiterführende Untersuchung\nLachmann-Test, rechts: positiv.',
    );
  });
});
