import { expect, test } from '@playwright/test';

/**
 * Das Startbild „Speiche wird O" in einem echten Browser (RAH-009).
 *
 * Die Komponententests prüfen Szenenfolge, Merker und Überspringen mit
 * gestellter Uhr. Hier geht es um das, was jsdom nicht misst: ob Rad, Marke
 * und Knopf bei 375, 834 und 1280 px an ihrem Platz stehen, ob das Intro von
 * selbst endet und die Seite freigibt - und ob nichts waagerecht überläuft.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/startbild.html';

const GERAETE = [
  { breite: 375, hoehe: 812, marke: 300 },
  { breite: 834, hoehe: 1112, marke: 420 },
  { breite: 1280, hoehe: 800, marke: 640 },
];

for (const { breite, hoehe, marke } of GERAETE) {
  test(`zeigt Rad, Marke und Überspringen an ihrem Platz (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: hoehe });

    // Bild 2: das Laufrad mit 14 Speichen, der Knopf oben rechts, 44 hoch.
    await page.goto(`${PRUEFSEITE}?uhrzeit=0.4`);
    const huelle = page.locator('[data-startbild]');
    await expect(huelle).toHaveAttribute('data-bild', '2');
    await expect(huelle.locator('svg[data-rad] line')).toHaveCount(14);
    const knopf = page.getByRole('button', { name: 'Überspringen', includeHidden: true });
    const kasten = (await knopf.boundingBox())!;
    expect(kasten.height).toBeGreaterThanOrEqual(44);
    expect(kasten.x + kasten.width).toBeCloseTo(breite - 16, 0);
    expect(kasten.y).toBe(16);

    // Bild 5: die unveränderte Markendatei, mittig, in der Breite des Geräts.
    await page.goto(`${PRUEFSEITE}?uhrzeit=1.4`);
    await expect(huelle).toHaveAttribute('data-bild', '5');
    const voll = huelle.locator('img[data-marke="voll"]');
    await expect(voll).toHaveAttribute('src', '/marke/own-motion-block-farbig.svg');
    const lage = (await voll.boundingBox())!;
    expect(Math.round(lage.width)).toBe(marke);
    expect(Math.round(lage.x + lage.width / 2)).toBe(Math.round(breite / 2));

    // Bild 6: der Abgang, die Fläche gibt die Seite frei.
    await page.goto(`${PRUEFSEITE}?uhrzeit=1.7`);
    await expect(huelle).toHaveAttribute('data-bild', '6');

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('läuft von selbst durch und gibt die Seite nach 1,8 s frei', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(page.locator('[data-startbild]')).toHaveCount(1);
  await expect(page.locator('[data-startbild]')).toHaveCount(0, { timeout: 4000 });
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  // Die Marke des Rahmens steht an ihrem Platz, wo das Intro gelandet ist.
  await expect(page.getByRole('img', { name: 'Own Motion' }).first()).toBeVisible();
  // Der Merker der Sitzung ist gesetzt - ein Neuladen zeigt kein Intro mehr
  // (das entscheidet die Anwendung, nicht die Prüfseite; hier nur der Wert).
  expect(await page.evaluate(() => sessionStorage.getItem('startbild-gezeigt'))).toBe('1');
});
