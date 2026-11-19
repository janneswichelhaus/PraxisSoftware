import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Die 3D-Ansicht des Lastenrads in einem echten Browser, auf der Prüfseite `fixtures/lastenrad.html`.
 * jsdom hat kein WebGL: Ob gezeichnet wird, wann nicht, und ob nach dem Schließen nichts bleibt,
 * zeigt nur ein Renderer. Gezählt werden die Zeichenaufrufe des Grafikkontexts.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/lastenrad.html';

const rad = (page: Page) => page.getByRole('img', { name: '3D-Modell des Own Motion Lastenrads' });

/** Zählt jeden Zeichenaufruf, bevor die Seite lädt. */
async function zeichnungenZaehlen(page: Page) {
  await page.addInitScript(() => {
    const zaehler = { zeichnungen: 0 };
    (window as unknown as { __rad: typeof zaehler }).__rad = zaehler;
    const aufrufe = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
    for (const Kontext of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const prototyp = Kontext.prototype as unknown as Record<
        string,
        ((...argumente: unknown[]) => unknown) | undefined
      >;
      for (const name of aufrufe) {
        const original = prototyp[name];
        if (!original) continue;
        prototyp[name] = function (this: unknown, ...argumente: unknown[]) {
          zaehler.zeichnungen += 1;
          return original.apply(this, argumente);
        };
      }
    }
  });
}

const zeichnungen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __rad: { zeichnungen: number } }).__rad.zeichnungen);

/** Wartet, bis über `dauer` ms nichts mehr gezeichnet wird, und meldet den Stand. */
async function ruhe(page: Page, dauer = 500): Promise<number> {
  let stand = await zeichnungen(page);
  await expect
    .poll(
      async () => {
        const vorher = stand;
        await page.waitForTimeout(dauer);
        stand = await zeichnungen(page);
        return stand - vorher;
      },
      { timeout: 60_000, intervals: [0] },
    )
    .toBe(0);
  return stand;
}

// Ohne Grafikkarte liest Chromium jedes WebGL-Bild zurück und meldet das als Treiberhinweis, auch
// bei der Karte. Der Seitencode liest nie zurück; alles andere an Warnungen zählt.
const SOFTWARE_GRAFIK = /GL Driver Message \(OpenGL, Performance.*GPU stall due to ReadPixels/;

/** Warnungen und Fehler der Konsole samt Seitenfehlern; Hinweise des Entwicklungsservers zählen nicht. */
function meldungenSammeln(page: Page): string[] {
  const meldungen: string[] = [];
  page.on('console', (meldung: ConsoleMessage) => {
    if (meldung.type() !== 'warning' && meldung.type() !== 'error') return;
    if (!SOFTWARE_GRAFIK.test(meldung.text())) meldungen.push(meldung.text());
  });
  page.on('pageerror', (fehler) => meldungen.push(fehler.message));
  return meldungen;
}

/** Anteil der Bildpunkte: leere Bühne, der helle Deckel der Box oder das dunkle Rad. */
async function anteil(page: Page, passt: 'buehne' | 'box' | 'rad'): Promise<number> {
  const aufnahme = (await rad(page).screenshot()).toString('base64');
  return page.evaluate(
    async ([base64, art]) => {
      const rohdaten = Uint8Array.from(atob(base64), (zeichen) => zeichen.charCodeAt(0));
      const bild = await createImageBitmap(new Blob([rohdaten], { type: 'image/png' }));
      const flaeche = new OffscreenCanvas(bild.width, bild.height);
      const stift = flaeche.getContext('2d');
      if (stift === null) throw new Error('Kein 2D-Kontext für die Auswertung.');
      stift.drawImage(bild, 0, 0);
      const punkte = stift.getImageData(0, 0, bild.width, bild.height).data;
      let treffer = 0;
      for (let i = 0; i < punkte.length; i += 4) {
        const [r, g, b] = [punkte[i]!, punkte[i + 1]!, punkte[i + 2]!];
        // Die Bühne liegt bei 214/215/218: heller ist nur der Deckel, deutlich dunkler nur das Rad.
        const buehne = Math.abs(r - 214) < 3 && Math.abs(g - 215) < 3 && Math.abs(b - 218) < 3;
        const hell = Math.min(r, g, b) >= 224;
        const dunkel = Math.max(r, g, b) < 64;
        if (art === 'buehne' ? buehne : art === 'box' ? hell : dunkel) treffer += 1;
      }
      return treffer / (punkte.length / 4);
    },
    [aufnahme, passt] as const,
  );
}

test.describe('3D-Ansicht des Lastenrads', () => {
  test('zeichnet das Rad mit Wortmarke, ohne Konsolenmeldung und ohne fremde Server', async ({
    page,
    baseURL,
  }) => {
    const meldungen = meldungenSammeln(page);
    const anfragen: string[] = [];
    page.on('request', (anfrage) => anfragen.push(anfrage.url()));
    await zeichnungenZaehlen(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 800 });
    const wortmarke = page.waitForResponse(/\/marke\/own-motion-block-unterzeile-farbig\.svg$/);
    await page.goto(PRUEFSEITE);

    await expect(rad(page)).toBeVisible();
    expect((await wortmarke).status()).toBe(200);
    await ruhe(page);

    // Die Ansicht füllt die Bühne: volle Breite der Spalte, die feste Höhe von 256 px.
    const flaeche = await rad(page).boundingBox();
    expect(flaeche?.width).toBeCloseTo(375 - 32, 0);
    expect(flaeche?.height).toBeCloseTo(256, 0);
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);

    // Gemessen: 80 % Bühne, 1,5 % Deckel, 7 % Rad. Eine leere oder schwarze Bühne fiele auf.
    const leer = await anteil(page, 'buehne');
    expect(leer).toBeGreaterThan(0.6);
    expect(leer).toBeLessThan(0.9);
    expect(await anteil(page, 'box')).toBeGreaterThan(0.008);
    expect(await anteil(page, 'rad')).toBeGreaterThan(0.03);

    expect(meldungen).toEqual([]);
    const herkunft = new URL(baseURL!).origin;
    const fremd = anfragen.filter((url) => !url.startsWith(herkunft) && !/^(data|blob):/.test(url));
    expect(fremd).toEqual([]);
  });

  test('zeichnet bei „Bewegung reduzieren“ nur, wenn gedreht wird', async ({ page }) => {
    // Die Dämpfung läuft über gut hundert Bilder aus; ohne Grafikkarte dauert das.
    test.slow();
    await zeichnungenZaehlen(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PRUEFSEITE);
    await expect(rad(page)).toBeVisible();

    const inRuhe = await ruhe(page);
    expect(inRuhe).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    expect(await zeichnungen(page)).toBe(inRuhe);

    const flaeche = (await rad(page).boundingBox())!;
    const [x, y] = [flaeche.x + flaeche.width / 2, flaeche.y + flaeche.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => zeichnungen(page)).toBeGreaterThan(inRuhe);

    // Die Dämpfung läuft aus, danach ruht die Ansicht wieder.
    const danach = await ruhe(page);
    await page.waitForTimeout(700);
    expect(await zeichnungen(page)).toBe(danach);
  });

  test('dreht sich im Bild und ruht außerhalb des sichtbaren Bereichs', async ({ page }) => {
    await zeichnungenZaehlen(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PRUEFSEITE);
    await expect(rad(page)).toBeVisible();

    const anfang = await zeichnungen(page);
    await expect.poll(() => zeichnungen(page)).toBeGreaterThan(anfang + 20);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const draussen = await ruhe(page);
    await page.waitForTimeout(700);
    expect(await zeichnungen(page)).toBe(draussen);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => zeichnungen(page)).toBeGreaterThan(draussen + 20);
  });

  test('lädt three erst, wenn die Bühne ins Bild kommt', async ({ page }) => {
    const anfragen: string[] = [];
    page.on('request', (anfrage) => anfragen.push(anfrage.url()));
    const zuThree = () => anfragen.filter((url) => /three|lastenrad3d/.test(url));
    await page.goto(`${PRUEFSEITE}?unten`);
    await expect(page.getByRole('button', { name: 'Ansicht schließen' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(zuThree()).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);

    await page.locator('[data-lastenrad]').scrollIntoViewIfNeeded();
    await expect(rad(page)).toBeVisible();
    expect(zuThree().length).toBeGreaterThan(0);
  });

  test('lässt nach dem Schließen kein Canvas zurück, auch nach vielfachem Öffnen', async ({
    page,
  }) => {
    test.slow();
    const meldungen = meldungenSammeln(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PRUEFSEITE);
    await expect(rad(page)).toBeVisible();

    // Ab dem 17. offenen Kontext warnt Chromium; freigegebene zählen nicht.
    for (let runde = 0; runde < 17; runde += 1) {
      await page.getByRole('button', { name: 'Ansicht schließen' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Ansicht öffnen' }).click();
      await expect(rad(page)).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(1);
    }

    // Auch wer schließt, bevor die Ansicht steht, hinterlässt nichts.
    await page.getByRole('button', { name: 'Ansicht schließen' }).click();
    await page.getByRole('button', { name: 'Ansicht öffnen' }).click();
    await page.getByRole('button', { name: 'Ansicht schließen' }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('canvas')).toHaveCount(0);

    expect(meldungen).toEqual([]);
  });

  test('lässt Mausrad und senkrechtes Wischen der Seite', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PRUEFSEITE);
    await expect(rad(page)).toBeVisible();
    await expect(rad(page)).toHaveCSS('touch-action', 'pan-y');

    const flaeche = (await rad(page).boundingBox())!;
    await page.mouse.move(flaeche.x + flaeche.width / 2, flaeche.y + flaeche.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test('zeigt ohne WebGL einen ruhigen Hinweis und lässt kein Canvas zurück', async ({ page }) => {
    await page.addInitScript(() => {
      const prototyp = HTMLCanvasElement.prototype as unknown as Record<
        string,
        ((...argumente: unknown[]) => unknown) | undefined
      >;
      const original = prototyp.getContext;
      prototyp.getContext = function (this: unknown, art: unknown, ...rest: unknown[]) {
        if (typeof art === 'string' && art.startsWith('webgl')) return null;
        return original?.call(this, art, ...rest);
      };
    });
    await page.goto(PRUEFSEITE);

    await expect(page.getByText('3D-Ansicht nicht verfügbar')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
