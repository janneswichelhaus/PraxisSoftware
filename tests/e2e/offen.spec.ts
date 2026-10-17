import { expect, test, type Page } from '@playwright/test';

/**
 * Offene Punkte und Anrufliste im echten Browser (PRX-EPIC-003).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: ob die Seiten bei 375 px ohne waagerechtes Scrollen auskommen,
 * die Anrufwege echte `tel:`-Verweise sind und die Tippziele reichen. Seit dem
 * Design-Rollout B5 (ANN-450) ist „Offene Punkte" ein Eingang: Gruppen nur mit
 * Einträgen, das Dringlichste zuerst, und leer einmal „Nichts offen".
 */
const PRUEFSEITE = '/tests/e2e/fixtures/offen.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Offene Punkte', () => {
  for (const ansicht of ['liste', 'leer', 'formular', 'anrufe']) {
    test(`${ansicht} laeuft bei 375 px nicht waagerecht ueber`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(page.locator('main')).not.toBeEmpty();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('der Eingang zeigt die Gruppen mit Eintraegen, das Dringlichste zuerst', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=liste`);
    await expect(page.getByRole('heading', { name: 'Aufgaben (3)' })).toBeVisible();
    const gruppen = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(gruppen).toEqual([
      'Rückfragen von der Plattform (1)',
      'Terminwünsche (2)',
      'Urlaubsanträge (1)',
      'Arbeitszeitänderungen (1)',
      'Erstattungen (1)',
      'Auszuzahlen (1)',
      'Aufgaben (3)',
      'Anrufe für morgen (2)',
      'Verordnungen zu erfassen (1)',
      'Erstaufnahme offen (2)',
      'Verordnung endet (1)',
      'Warteliste prüfen (1)',
      'Verordnung offen (1)',
      'Akte ohne Behandlung (1)',
    ]);
    const aufgaben = page.locator('section', {
      has: page.getByRole('heading', { name: 'Aufgaben (3)' }),
    });
    await expect(aufgaben.getByText('Überfällig')).toBeVisible();
    await expect(page.getByText('2 von 3 Terminen noch nicht mitgeteilt.')).toBeVisible();
    await expect(page.getByText('Nichts offen')).toHaveCount(0);
  });

  test('Zeilen sind ganze Ziele, die Arbeit steht daneben (375 px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=liste`);
    // Der Name ist die ganze Zeile: mindestens 56 px hoch.
    const zeile = page.getByRole('link', { name: /^Platzhalter, Petra\s*Foto vom/ });
    expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    const erfassen = page.getByRole('link', { name: /^Grundlage erfassen/ });
    expect((await erfassen.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const haken = page.getByRole('button', { name: /^Erledigt: / }).first();
    const box = (await haken.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });

  test('ohne Offenes sagt der Eingang einmal „Nichts offen"', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=leer`);
    await expect(page.getByText('Nichts offen')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Anrufliste' })).toBeVisible();
  });

  test('die Anrufliste bietet Anrufen als tel:-Verweis und 44 px hohe Knoepfe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=anrufe`);
    const anruf = page.getByRole('link', { name: /\+49 7071 0000005/ });
    await expect(anruf).toHaveAttribute('href', /^tel:/);
    expect((await anruf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Anruf vermerken: Max Mustermann' }).click();
    const max = page.getByRole('group', { name: 'Anruf bei Max Mustermann' });
    const knopf = max.getByRole('button', { name: 'Nicht erreicht' });
    const box = await knopf.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText('Nachricht hinterlassen (2×)')).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
  });
});
