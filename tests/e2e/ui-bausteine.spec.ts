import { expect, test } from '@playwright/test';

/**
 * Die Bausteine aus dem Design-Handoff vom 2026-10-01 in einem echten Browser
 * (UI-Redesign, Schritt 2).
 *
 * Die Komponententests prüfen Klassen, Texte und Rechnung. Hier geht es um
 * das, was jsdom nicht misst: ob bei 375 px nichts waagerecht überläuft, ob
 * die Legende des Wegbalkens in einer Zeile bleibt, ob die Fahrt mittig auf
 * der Spur liegt, ob Zeilen und Aufklapper ein Tippziel von 44 px sind und ob
 * `offenAb="lg"` der Fensterbreite folgt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/ui-bausteine.html';

for (const breite of [375, 1280]) {
  test(`laeuft bei ${breite} px nicht waagerecht ueber`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('heading', { name: 'Oberflächen-Bausteine' })).toBeVisible();
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('haelt die Legende des Wegbalkens bei 375 px in einer Zeile und die Fahrt mittig', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);

  const karte = page.getByRole('region', { name: 'Nächster Weg' }).first();
  const oben = async (text: string) => (await karte.getByText(text).boundingBox())!.y;
  const puffer = await oben('28 min Puffer');
  expect(Math.abs((await oben('≈ 12 min Rad')) - puffer)).toBeLessThan(2);
  expect(Math.abs((await oben('40 min eingeplant')) - puffer)).toBeLessThan(2);

  // Die Fahrt liegt mittig auf der Spur: gleich viel Puffer links wie rechts.
  const masse = await karte.evaluate((element) => {
    const fahrt = element.querySelector<HTMLElement>('[style]')!;
    const spur = fahrt.previousElementSibling!;
    const f = fahrt.getBoundingClientRect();
    const s = spur.getBoundingClientRect();
    return { links: f.left - s.left, rechts: s.right - f.right, spur: s.height, fahrt: f.height };
  });
  expect(Math.abs(masse.links - masse.rechts)).toBeLessThan(1.5);
  expect(masse.links).toBeGreaterThan(8);
  // Spur 6 px, Fahrt 10 px.
  expect(masse.spur).toBeCloseTo(6, 0);
  expect(masse.fahrt).toBeCloseTo(10, 0);
});

test('laesst dem Balken auch mit langen Namen Platz und kuerzt die Namen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const karte = page.getByRole('region').filter({ hasText: 'Zu spät, Abfahrt sofort' });
  const spur = (await karte.locator('[aria-hidden="true"] > div').first().boundingBox())!;
  expect(spur.width).toBeGreaterThanOrEqual(48);
  const name = karte.getByText('Ende Carl Muster mit einem sehr langen Namen');
  const gekuerzt = await name.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(gekuerzt).toBe(true);
});

test('macht Zeilen und Aufklapper zu Tippzielen von mindestens 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);

  const zeile = page.getByRole('link', { name: /Max Mustermann/ });
  const kasten = (await zeile.boundingBox())!;
  expect(kasten.height).toBeGreaterThanOrEqual(56);
  // Die Zeile reicht über die ganze Breite ihrer Karte.
  const karte = (await zeile.locator('xpath=ancestor::ul').boundingBox())!;
  expect(kasten.width).toBeGreaterThanOrEqual(karte.width - 2.5);

  const knopf = page.getByRole('button', { name: /Berta Bestand/ });
  expect((await knopf.boundingBox())!.width).toBeGreaterThanOrEqual(karte.width - 2.5);

  for (const titel of ['Erledigt heute (3)', 'Tagesplan des Teams (4)', 'Alle Angaben']) {
    const kopf = page.locator('summary', { hasText: titel });
    expect((await kopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // In der Karte ist der zugeklappte Aufklapper 52 px hoch (plus Rahmen).
  const zu = (await page.locator('details', { hasText: 'Alle Angaben' }).boundingBox())!;
  expect(zu.height).toBeGreaterThanOrEqual(52);
  expect(zu.height).toBeLessThanOrEqual(56);
});

test('haelt Kacheln einer Reihe gleich hoch und mindestens 72 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const wann = (await page.getByText('Wann', { exact: true }).locator('..').boundingBox())!;
  const anschrift = (await page
    .getByText('Anschrift', { exact: true })
    .locator('..')
    .boundingBox())!;
  // Bei 375 px stehen zwei nebeneinander.
  expect(Math.abs(wann.y - anschrift.y)).toBeLessThan(1);
  expect(Math.abs(wann.height - anschrift.height)).toBeLessThan(1);
  expect(wann.height).toBeGreaterThanOrEqual(72);
});

test('oeffnet „Alle Angaben" am Rechner von Anfang an, am Telefon nicht', async ({ page }) => {
  const text = page.getByText('Am Rechner von Anfang an offen, am Telefon zu.');

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(text).toBeHidden();
  await page.locator('summary', { hasText: 'Alle Angaben' }).click();
  await expect(text).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(text).toBeVisible();
});

test('setzt die Jetzt-Marke auf die Schiene des Zeitstrahls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const marke = page.locator('[data-jetzt]');
  await expect(marke.getByText('Jetzt, 09:42 Uhr')).toBeAttached();
  const mitten = await page.evaluate(() => {
    const mitte = (element: Element) => {
      const kasten = element.getBoundingClientRect();
      return kasten.left + kasten.width / 2;
    };
    const jetzt = document.querySelector('[data-jetzt]')!;
    const punktJetzt = jetzt.querySelector('.bg-accent')!;
    const schiene = jetzt.querySelector('.bg-line')!;
    const punktTermin = document.querySelector('ol > li:not([data-jetzt]) .border-line-strong')!;
    return { jetzt: mitte(punktJetzt), schiene: mitte(schiene), termin: mitte(punktTermin) };
  });
  // Punkt der Marke, Schiene und Punkt eines Termins liegen auf einer Achse.
  expect(Math.abs(mitten.jetzt - mitten.schiene)).toBeLessThan(1);
  expect(Math.abs(mitten.termin - mitten.schiene)).toBeLessThan(1);
});
