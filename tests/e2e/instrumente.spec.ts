import { expect, test } from '@playwright/test';

/**
 * Die Instrumentenbibliothek in einem echten Browser (FRB-010).
 *
 * Die Komponententests prüfen Inhalt und das, was nicht erscheint. Hier geht
 * es um das, was jsdom nicht misst: ob lange Quellenangaben und Anker bei
 * 375 px umbrechen, statt die Seite waagerecht scrollen zu lassen, und ob die
 * Liste ins Einzelne führt (Design-Rollout B4: Liste → Detail).
 */

const PRUEFSEITE = '/tests/e2e/fixtures/instrumente.html';

test.describe('Instrumente', () => {
  test('zeigt die vier Instrumente als Liste und eines mit aufklappbarem Wortlaut', async ({
    page,
  }) => {
    await page.goto(PRUEFSEITE);

    await expect(page.getByRole('heading', { level: 1, name: 'Instrumente' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(4);
    // Die drei freien bleiben ohne Vorlage inaktiv (ANN-099); der Anamnesebogen ist aktiv.
    await expect(page.getByRole('listitem').filter({ hasText: 'Inaktiv' })).toHaveCount(3);
    await expect(
      page.getByRole('link', { name: /Anamnesebogen Version 8 \(DIGOTOR\)/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Patientenspezifische Funktionsskala/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Patientenspezifische Funktionsskala',
    );
    await page.getByText('Wortlaut (6 Fragen)').click();
    await expect(page.getByText('Wie gut können Sie Aktivität 1 heute ausführen?')).toBeVisible();

    await page.getByRole('link', { name: /Zurück zu den Instrumenten/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Instrumente' })).toBeVisible();
  });

  for (const ansicht of ['', '?instrument=anamnese_v8', '?instrument=psfs']) {
    test(`laeuft bei 375 px nicht waagerecht ueber, auch aufgeklappt (${ansicht || 'Liste'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${PRUEFSEITE}${ansicht}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      for (const zusammenfassung of await page.locator('summary').all()) {
        await zusammenfassung.click();
      }

      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(ueberlauf).toBe(false);
    });
  }
});
