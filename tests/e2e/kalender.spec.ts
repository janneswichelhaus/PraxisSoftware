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

const annaSpalte = (page: Page) => page.locator('[role=group][aria-label^="Anna Beispiel"]');

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

  test('reicht am breiten Bildschirm bis an den Rand, ohne Zeile ueber dem Raster', async ({
    page,
  }) => {
    // BEF-043, BEF-044: kein Kasten, keine Kappung, kein „Kalender · Touren".
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto(PRUEFSEITE);
    await expect(annaSpalte(page)).toBeVisible();

    const inhalt = (await page.getByRole('main').boundingBox())!;
    const raster = (await page
      .getByRole('region', { name: /ansicht/ })
      .first()
      .boundingBox())!;
    // Die Seitenleiste nimmt 248 px; der Rest gehört dem Raster bis auf den Rand.
    expect(inhalt.width).toBeGreaterThan(1920 - 248 - 2);
    expect(raster.width).toBeGreaterThan(inhalt.width - 32);
    await expect(page.getByRole('navigation', { name: /^Bereich / })).toHaveCount(0);
  });

  // Runde 3 (Handoff Kalender und Tour, Abschnitt 6): Ein Tipp im unteren
  // Drittel lag hinter der Leiste. Jetzt rollt das Raster selbst - der Test
  // rollt nicht.
  test('rollt eine Auswahl im unteren Drittel ueber die Leiste, mit Platz fuer den zweiten Tipp', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(PRUEFSEITE);
    const spalte = annaSpalte(page);
    await expect(spalte).toBeVisible();
    const rahmen = (await spalte.boundingBox())!;
    const x = rahmen.x + 20;

    // Eine freie Stelle im unteren Drittel des Fensters: die Spalte selbst,
    // keine Kachel und kein Fahrweg.
    const y = await page.evaluate(
      ({ x, oben }) => {
        for (let y = Math.round((740 * 2) / 3); y < 740 - 90; y += 8) {
          const el = document.elementFromPoint(x, y);
          if (
            el?.closest('[role=group]')?.getAttribute('aria-label')?.startsWith('Anna') &&
            !el.closest('a, button, [data-testid]')
          ) {
            if (y > oben) return y;
          }
        }
        return null;
      },
      { x, oben: rahmen.y },
    );
    expect(y, 'freie Stelle im unteren Drittel').not.toBeNull();
    const vorher = await page.evaluate(() => window.scrollY);
    await page.mouse.click(x, y!);

    const flaeche = page.getByTestId('auswahl-flaeche');
    const leiste = page.getByRole('group', { name: 'Was soll hier entstehen?' });
    await expect(leiste).toBeVisible();
    await expect
      .poll(async () => {
        const a = (await flaeche.boundingBox())!;
        const l = (await leiste.boundingBox())!;
        return a.y + a.height <= l.y;
      })
      .toBe(true);
    // Das Rollen ist animiert; gemessen wird, wenn es steht.
    await page.waitForFunction(
      () =>
        new Promise<boolean>((fertig) => {
          const y = window.scrollY;
          setTimeout(() => fertig(window.scrollY === y), 150);
        }),
    );
    const stand = await page.evaluate(() => ({
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(stand.y).toBeGreaterThan(vorher);
    const a = (await flaeche.boundingBox())!;
    const l = (await leiste.boundingBox())!;
    // Im oberen Teil des freien Bereichs, darunter Platz fuer den zweiten Tipp.
    expect(a.y, JSON.stringify({ stand, a, l })).toBeLessThan(l.y / 2);
    expect(l.y - (a.y + a.height)).toBeGreaterThanOrEqual(96);
  });

  // Runde 3: „Tour" steht im Kopf neben „Tag | Team" bzw. „Woche | Team",
  // auf jeder Breite sichtbar, ohne „Ansicht und Filter" zu öffnen.
  for (const breite of [375, 834, 1280]) {
    test(`fuehrt ueber „Tour" im Kopf mit Tag auf die Tourenseite (${breite} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('group', { name: 'Ansicht', exact: true })).toBeVisible();

      const tour = page.getByRole('link', { name: 'Tour', exact: true });
      await expect(tour).toBeVisible();
      await expect(tour).toHaveAttribute('href', /^\/touren\?tag=\d{4}-\d{2}-\d{2}/);
      const hoehe = (await tour.boundingBox())!.height;
      expect(hoehe).toBeGreaterThanOrEqual(44);
    });
  }

  // TRN-006: Die Trainingsbetreuung sieht ihre Trainingstermine und sonst nichts.
  for (const breite of [375, 1280]) {
    test(`zeigt der Trainingsbetreuung ihre Termine bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?rolle=trainer`);
      // Die Kachel öffnet das Terminpanel; der Weg in den Trainingsbereich
      // steht dort (Design-Handoff 2026-10-01, Abschnitt 7a).
      const kachel = page.getByRole('button', { name: /Tina Trainingskundin/ });
      await expect(kachel).toBeVisible();
      await expect(page.getByRole('button', { name: /Berta Bestand/ })).toHaveCount(0);
      await kachel.click();
      await expect(page.getByRole('link', { name: 'Training →' })).toHaveAttribute(
        'href',
        /^\/training\/termine\//,
      );
      await page.getByRole('button', { name: 'Terminpanel schließen' }).click();
      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(ueberlauf).toBe(false);

      // Ein Tipp auf freie Zeit bietet nur den Trainingstermin an.
      const spalte = page.locator('[role=group][aria-label^="Tom Trainingsbetreuung"]');
      const kasten = (await spalte.boundingBox())!;
      await page.mouse.click(kasten.x + kasten.width / 2, kasten.y + 20);
      const menue = page.getByRole('group', { name: 'Was soll hier entstehen?' });
      await expect(menue.getByRole('button', { name: /^Trainingstermin/ })).toBeVisible();
      await expect(menue.getByRole('button', { name: /^Neuer Termin/ })).toHaveCount(0);
    });
  }

  for (const breite of [375, 1280]) {
    test(`zeichnet Fahrwege als Bloecke vor den Hausbesuchen (${breite} px, UBK-005)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 740 });
      await page.goto(PRUEFSEITE);
      const spalte = annaSpalte(page);
      await expect(spalte).toBeVisible();

      const wege = spalte.getByTestId('fahrweg');
      // Vier Wege zu den Besuchen und der Rückweg zur Praxis (UBK-015).
      await expect(wege).toHaveCount(5);
      await expect(wege.nth(0)).toContainText('Weg ≈ 15 min');
      await expect(wege.nth(4)).toContainText('Rückweg ≈ 16 min');
      // Der Block endet an der Oberkante des Besuchs, zu dem gefahren wird.
      const weg = (await wege.nth(1).boundingBox())!;
      const carl = spalte.getByRole('button', { name: /^Carl Muster/ });
      // UBK-017: Auf der Kachel steht der Ort des Hausbesuchs.
      await expect(carl.getByTestId('kachel-ort')).toHaveText(/^Beispielweg \d+$/);
      const kachel = (await carl.boundingBox())!;
      expect(Math.abs(weg.y + weg.height - kachel.y)).toBeLessThanOrEqual(2);
      // Die Fehlzeit hat keinen Ort und damit keinen Weg; Tims Spalte hat drei
      // und den Rückweg.
      await expect(
        page.locator('[role=group][aria-label^="Tim Teamleitung"]').getByTestId('fahrweg'),
      ).toHaveCount(4);
      // UBK-016: Ein Tipp markiert den ganzen Weg und öffnet das Menü daneben -
      // ohne Anlegen-Leiste und ohne waagerechten Bildlauf.
      await wege.nth(1).click();
      const menue = page.getByRole('group', { name: 'Fahrweg' });
      await expect(menue).toBeVisible();
      await expect(menue).toContainText('≈ 20 Min.');
      await expect(menue.getByRole('link', { name: 'Zur Tour' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Was soll hier entstehen?' })).toHaveCount(0);
      // Ragt ein Weg in den Termin davor, liegt die Kachel oben: Der Tipp auf
      // ihr Ende gehört dem Termin, nicht dem Weg (Zweitreview S2).
      const tim = page.locator('[role=group][aria-label^="Tim Teamleitung"]');
      const frida = (await tim.getByRole('button', { name: /^Frida Test/ }).boundingBox())!;
      const oben = await page.evaluate(
        ([x, y]) =>
          document
            .elementFromPoint(x!, y!)
            ?.closest('[data-testid]')
            ?.getAttribute('data-testid') ?? null,
        [frida.x + frida.width / 2, frida.y + frida.height - 2],
      );
      expect(oben).not.toBe('fahrweg');
      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(ueberlauf).toBe(false);
    });
  }
});
