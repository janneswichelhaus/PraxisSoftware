import { expect, test, type Page } from '@playwright/test';

/**
 * Der Kalender in einem echten Browser (UX-EPIC-002, BEF-035 bis BEF-039).
 *
 * Die Komponententests prüfen Zustände und Wege. Hier geht es um das, was
 * jsdom nicht misst: ob das Raster bei 375 px auf dem ersten Bildschirm
 * beginnt, ob die Anlegen-Leiste die Spalte frei lässt und ob zwei Finger
 * wirklich das Raster zoomen statt der Seite.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/kalender.html';

const annaSpalte = (page: Page) => page.locator('[role=gridcell][aria-label="Anna Beispiel"]');

test.describe('Kalender', () => {
  test('beginnt das Raster bei 375 px auf dem ersten Bildschirm', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(PRUEFSEITE);
    const spalte = annaSpalte(page);
    await expect(spalte).toBeVisible();

    const oben = (await spalte.boundingBox())!.y;
    expect(oben).toBeLessThan(740 / 2);
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test('zieht mit zwei Tipps eine Spanne auf, die Leiste steht unter dem Raster', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(PRUEFSEITE);
    const spalte = annaSpalte(page);
    await expect(spalte).toBeVisible();

    // 12:00 ist frei (Fensterbeginn 07:00, 96 px je Stunde).
    const y = await spalte.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY + 5 * 96,
    );
    await page.evaluate((ziel) => window.scrollTo(0, ziel - 250), y);
    const rahmen = (await spalte.boundingBox())!;
    await page.mouse.click(rahmen.x + 40, rahmen.y + 5 * 96 + 1);
    await page.mouse.click(rahmen.x + 40, rahmen.y + 5 * 96 + 64);

    const flaeche = page.getByTestId('auswahl-flaeche');
    await expect(flaeche).toHaveText('12:00–12:40');
    const leiste = page.getByRole('group', { name: 'Was soll hier entstehen?' });
    await expect(leiste).toBeVisible();
    // Die Leiste deckt die Auswahl nicht zu.
    const a = (await flaeche.boundingBox())!;
    const l = (await leiste.boundingBox())!;
    expect(a.y + a.height).toBeLessThanOrEqual(l.y);
    // Die Uhrzeit sitzt im Rahmen (BEF-037).
    expect(a.height).toBeGreaterThanOrEqual(28);
  });

  test('zoomt das Raster mit zwei Fingern', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || !info.project.use.hasTouch, 'Mehrfingergeste über CDP');
    await page.goto(PRUEFSEITE);
    const spalte = annaSpalte(page);
    await expect(spalte).toBeVisible();
    const vorher = (await spalte.boundingBox())!.height;

    const r = (await spalte.boundingBox())!;
    const x = r.x + r.width / 2;
    const y = Math.max(r.y, 0) + 150;
    const cdp = await page.context().newCDPSession(page);
    const punkte = (abstand: number) => [
      { x, y: y - abstand, id: 0 },
      { x, y: y + abstand, id: 1 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkte(30) });
    for (const abstand of [40, 50, 60, 70]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: punkte(abstand),
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(async () => (await spalte.boundingBox())!.height).toBeGreaterThan(vorher);
    // Die Seite selbst ist nicht gezoomt.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });
});
