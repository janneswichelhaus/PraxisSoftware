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
 * Textbausteine; ohne eigene führt ein leiser Link zur Bausteinseite, neben
 * „+ Befund“, das bleibt, wie es ist. Geprüft auf der Prüfseite der
 * Schreibseite, am kleinen Telefon.
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
    await expect(page.getByRole('button', { name: /^\+ Befund/ })).toBeVisible();
  });

  test('führt ohne eigene Bausteine mit einem leisen Link zur Bausteinseite (375 px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${SCHREIBSEITE}&bausteine=keine`);
    const link = page.getByRole('link', { name: 'Eigene Bausteine anlegen' });
    const befund = page.getByRole('button', { name: /^\+ Befund/ });
    const querrollen = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    // Der Link ohne Wischen ganz im Bild, mit 44 px Tippziel, vor „+ Befund“
    // in derselben Zeile.
    await expect(link).toBeInViewport({ ratio: 1 });
    const linkBox = (await link.boundingBox())!;
    const befundBox = (await befund.boundingBox())!;
    expect(linkBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(linkBox.y + linkBox.height / 2 - (befundBox.y + befundBox.height / 2))).toBe(0);
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(befundBox.x);
    await expect(page.getByRole('group', { name: 'Textbausteine' })).toHaveCount(0);
    await expect(page.getByText('Eigenuebungen besprochen')).toHaveCount(0);
    expect(await querrollen()).toBe(false);

    // Mit „Wie zuletzt“ vorn (K6, ANN-502) ist die Zeile bei 375 px breiter
    // als das Bild und läuft waagerecht wie mit eigenen Bausteinen: „+ Befund“
    // ist mit einem Wischen in der Zeile ganz erreichbar, die Seite rollt
    // dabei nicht quer.
    await link.hover();
    await page.mouse.wheel(400, 0);
    await expect(befund).toBeInViewport({ ratio: 1 });
    expect(await querrollen()).toBe(false);

    await expect(link).toHaveAttribute('href', /^\/praxis\/textbausteine\?zurueck=%2Ftermine%2F/);
    await link.click();
    await expect(page.getByText('Ende der Prüfseite.')).toBeVisible();
  });
});
