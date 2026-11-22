import { expect, test } from '@playwright/test';

/**
 * Befund aus Bausteinen in einem echten Browser (FRB-EPIC-003, Seitenwahl
 * nach ANN-129, Textform nach ANN-130).
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
    // Die Region mit den längsten Bezeichnungen, im Seitenvergleich — dort
    // stehen je Test zwei Zeilen mit Schaltflächen.
    await page.getByRole('button', { name: 'Ellenbogen' }).click();
    await page
      .getByRole('group', { name: 'Seite Ellenbogen' })
      .getByRole('button', { name: 'beidseits' })
      .click();
    for (const zusammenfassung of await page.locator('details details > summary').all()) {
      await zusammenfassung.click();
    }
    const les = page.getByRole('group', { name: /Table-op relocation Test.*, links$/ });
    await les.getByRole('button', { name: 'nicht getestet' }).click();
    await les.getByRole('button', { name: 'Notiz' }).click();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test('bringt einen Test mit drei Tipps und einer Übernahme in den Text', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await page.getByText('Befund aus Bausteinen').click();
    await page.getByRole('button', { name: 'Knie' }).click();
    await page
      .getByRole('group', { name: 'Seite Knie' })
      .getByRole('button', { name: 'rechts' })
      .click();
    await page.getByText('Weiterführende Untersuchung').click();
    const lachmann = page.getByRole('group', { name: 'Lachman-Test' });
    await lachmann.getByRole('button', { name: 'positiv' }).click();
    await page.getByRole('button', { name: 'In den Text übernehmen' }).click();

    await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue(
      'Synthetisch: Erstbefund Knie rechts.\n\n' +
        'Knie rechts – Weiterführende Untersuchung\n❗ Lachman-Test: positiv',
    );
  });
});

// BEF-057 Option 2: Bei 375 px stehen die drei Ergebnisse eines Tests in einer
// Reihe, die Seite steht darüber, und kein Block hat einen eigenen Rahmen.
test('stellt die Ergebnisse eines Tests bei 375 px in eine Reihe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  await page.getByText('Befund aus Bausteinen').click();
  await page.getByRole('button', { name: 'Ellenbogen' }).click();
  await page
    .getByRole('group', { name: 'Seite Ellenbogen' })
    .getByRole('button', { name: 'beidseits' })
    .click();
  for (const zusammenfassung of await page.locator('details details > summary').all()) {
    await zusammenfassung.click();
  }
  const reihen = await page
    .getByTestId('ergebnis-knoepfe')
    .evaluateAll((gruppen) =>
      gruppen.map(
        (g) =>
          new Set(
            [...g.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)),
          ).size,
      ),
    );
  expect(reihen.length).toBeGreaterThan(0);
  for (const r of reihen) expect(r).toBe(1);
  const gerahmt = await page
    .locator('details details')
    .evaluateAll(
      (bloecke) => bloecke.filter((b) => getComputedStyle(b).borderLeftWidth !== '0px').length,
    );
  expect(gerahmt).toBe(0);
});

/**
 * B5 (ANN-531): In der Chipzeile der Schreibseite stehen nur die eigenen
 * Textbausteine; ohne eigene führt ein leiser Link zur Bausteinseite, hinter
 * „+ Befund“, das bleibt, wie es ist. „+ Befund“ steht gleich nach „Wie
 * zuletzt“ und damit bei 375 px ohne Wischen im Bild. Geprüft auf der
 * Prüfseite der Schreibseite, am kleinen Telefon.
 */
const SCHREIBSEITE = '/tests/e2e/fixtures/schreibseite.html?ansicht=neu';

test.describe('Textbausteine in der Chipzeile (B5)', () => {
  test('zeigt nur die eigenen Bausteine, keine der Praxis (375 px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(SCHREIBSEITE);
    const leiste = page.getByRole('group', { name: 'Textbausteine' });
    await expect(leiste.getByRole('button')).toHaveText([
      'Hausbesuch',
      'Heimprogramm',
      'Schmerz unverändert',
    ]);
    await expect(page.getByText('Eigenuebungen besprochen')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Eigene Bausteine anlegen' })).toHaveCount(0);
    // „Wie zuletzt“ | „+ Befund“ | eigene Bausteine: „+ Befund“ ohne Wischen
    // ganz im Bild, die Bausteine dahinter.
    const befund = page.getByRole('button', { name: /^\+ Befund/ });
    await expect(befund).toBeInViewport({ ratio: 1 });
    const zuletztBox = (await page.getByRole('button', { name: 'Wie zuletzt' }).boundingBox())!;
    const befundBox = (await befund.boundingBox())!;
    const leisteBox = (await leiste.boundingBox())!;
    expect(zuletztBox.x + zuletztBox.width).toBeLessThanOrEqual(befundBox.x);
    expect(befundBox.x + befundBox.width).toBeLessThanOrEqual(leisteBox.x);
  });

  test('lässt die Chipzeile ohne eigene Bausteine bei „Wie zuletzt“ und „+ Befund“ (375 px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${SCHREIBSEITE}&bausteine=keine`);
    const befund = page.getByRole('button', { name: /^\+ Befund/ });

    // Weniger Auswahl auf der Schreibseite (Jannes 2026-11-22): kein Weg zur
    // Bausteinseite, keine Gruppe, die Seite rollt nicht quer.
    await expect(befund).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('link', { name: 'Eigene Bausteine anlegen' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Textbausteine' })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
