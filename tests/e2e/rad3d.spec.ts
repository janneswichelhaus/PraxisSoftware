import { expect, test, type Page } from '@playwright/test';

/**
 * Das 3D-Rad im echten Browser (Handoff Lastenrad 3D, Abschnitt 5; AC 1, 7
 * und 9): Antippen trifft ein Bauteil, die Nadeln sind gezeichnet, „Am Rad
 * zeigen“ hebt das Bauteil hervor, und ohne WebGL oder ohne ladbares Modul
 * steht je eine eigene Meldung da, während die Seite weiter bedienbar bleibt. WebGL kommt aus SwiftShader,
 * wie auf einem Rechner ohne Grafikkarte.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/rad3d.html';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({
  // Ein Bildpunkt je CSS-Pixel: SwiftShader zeichnet in Software, und bei der
  // Dichte des Pixel 7 dauert ein Bild in der CI Sekunden. Tipps, Layout und
  // axe hängen an CSS-Pixeln, nicht an der Dichte.
  deviceScaleFactor: 1,
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  },
});

async function bereit(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PRUEFSEITE);
  await expect(page.getByText('Ziehen dreht das Rad · Antippen wählt ein Bauteil')).toBeVisible({
    timeout: 20_000,
  });
}

test('Antippen trifft das Bauteil unter dem Finger (AC 1)', async ({ page }) => {
  await bereit(page);
  const rad = page.getByRole('img', { name: /3D-Modell des Lastenrads/ });
  await expect(rad).toHaveAccessibleName(/3 Stellen markiert/);
  const box = (await rad.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(page.getByTestId('treffer')).toHaveText('transportbox');
  // Ein Ziehen ist kein Antippen: Es dreht das Rad und wählt nichts.
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('treffer')).toHaveText('transportbox');
  // Nach dem Drehen gilt keine der festen Ansichten mehr.
  await expect(page.getByRole('button', { name: 'Schräg' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

/**
 * Zählt, wie oft das Rad neu gezeichnet wird: three.js leert vor jedem Bild
 * die Fläche. Ein Bildvergleich wartet dagegen auf ein ruhiges Element und
 * hängt auf einem langsamen Rechner, solange das Rad pulsiert.
 */
async function bilderZaehlen(page: Page) {
  await page.addInitScript(() => {
    const fenster = window as unknown as { __bilder: number };
    fenster.__bilder = 0;
    for (const typ of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototyp = typ.prototype as unknown as {
        clear: (this: unknown, maske: number) => void;
      };
      const original = prototyp.clear;
      prototyp.clear = function (this: unknown, maske: number) {
        fenster.__bilder += 1;
        original.call(this, maske);
      };
    }
  });
}

function bilder(page: Page) {
  return page.evaluate(() => (window as unknown as { __bilder: number }).__bilder);
}

/** Ob das Rad binnen `frist` ms zur Ruhe kommt: zwei Sekunden ohne neues Bild. */
async function wirdRuhig(page: Page, frist: number) {
  const ende = Date.now() + frist;
  let vorher = await bilder(page);
  while (Date.now() < ende) {
    await page.waitForTimeout(2000);
    const jetzt = await bilder(page);
    if (jetzt === vorher) return true;
    vorher = jetzt;
  }
  return false;
}

async function transportboxWaehlen(page: Page) {
  const box = (await page.getByRole('img', { name: /3D-Modell des Lastenrads/ }).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(page.getByTestId('treffer')).toHaveText('transportbox');
}

test('bei reduzierter Bewegung kein Kameraflug und kein Pulsieren (AC 10)', async ({ page }) => {
  test.setTimeout(90_000);
  await bilderZaehlen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bereit(page);
  await transportboxWaehlen(page);
  // Hervorgehoben, aber ruhig: kein Pulsieren.
  expect(await wirdRuhig(page, 20_000)).toBe(true);
  // „Am Rad zeigen“ springt, statt zu fliegen: ein, zwei neue Bilder, kein Flug.
  const vorher = await bilder(page);
  await page.getByRole('button', { name: 'Bremse vorne zeigen' }).click();
  expect(await wirdRuhig(page, 20_000)).toBe(true);
  expect((await bilder(page)) - vorher).toBeLessThanOrEqual(3);
});

test('ohne diese Einstellung pulsiert das gewählte Bauteil (Gegenprobe zu AC 10)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await bilderZaehlen(page);
  await bereit(page);
  await transportboxWaehlen(page);
  // Nach dem Antippen zeichnet das Rad ohnehin ein paar Bilder; danach zählt nur
  // das Pulsieren.
  await page.waitForTimeout(2000);
  const vorher = await bilder(page);
  await expect
    .poll(async () => (await bilder(page)) - vorher, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(3);
});

test('senkrechtes Wischen über dem Rad scrollt die Seite, waagrechtes dreht es', async ({
  page,
}) => {
  await bereit(page);
  // Der Browser übernimmt senkrechtes Wischen, das Rad bekommt nur das
  // waagrechte Ziehen: Die Fläche fängt den Daumen beim Scrollen nicht ab.
  const rad = page.getByRole('img', { name: /3D-Modell des Lastenrads/ });
  expect(await rad.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
});

test('Zoom und Ansichten sind Knöpfe mit 44 px und Namen (AC 9)', async ({ page }) => {
  await bereit(page);
  for (const name of ['Vergrößern', 'Verkleinern', 'Schräg', 'Rechts', 'Links', 'Hinten']) {
    const knopf = page.getByRole('button', { name });
    await expect(knopf).toBeVisible();
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Links' }).click();
  await expect(page.getByRole('button', { name: 'Links' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});

test('ohne WebGL eine Meldung, und die Seite bleibt bedienbar (AC 7)', async ({ page }) => {
  await page.addInitScript(() => {
    // Wie ein Browser ohne WebGL: Jeder 3D-Kontext fehlt, 2D bleibt.
    const prototyp = HTMLCanvasElement.prototype as unknown as {
      getContext: (this: HTMLCanvasElement, art: string, ...rest: unknown[]) => unknown;
    };
    const original = prototyp.getContext;
    prototyp.getContext = function (this: HTMLCanvasElement, art: string, ...rest: unknown[]) {
      if (art === 'webgl' || art === 'webgl2' || art === 'experimental-webgl') return null;
      return original.call(this, art, ...rest);
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PRUEFSEITE);
  await expect(
    page.getByText('Dieser Browser zeigt kein 3D (WebGL 2 fehlt).', { exact: false }),
  ).toBeVisible({ timeout: 20_000 });
  // Am Browser liegt es hier; Neuladen hilft nicht und steht nicht da.
  await expect(page.getByRole('button', { name: 'Neu laden' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bremse vorne zeigen' })).toBeEnabled();
});

test('ohne ladbares Modul „nicht laden“ mit Neu laden, nicht der Browser (FLT-006, BEF-172)', async ({
  page,
}) => {
  // Wie eine vor der Auslieferung geöffnete Seite: Die Datei des 3D-Moduls
  // gibt es nicht mehr.
  await page.route('**/bike3d/viewer.ts*', (route) => route.fulfill({ status: 404, body: '' }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PRUEFSEITE);
  await expect(
    page.getByText('Das 3D-Modell ließ sich nicht laden.', { exact: false }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/WebGL/)).toHaveCount(0);
  await mindestens44(page.getByRole('button', { name: 'Neu laden' }));
  await expect(page.getByRole('button', { name: 'Bremse vorne zeigen' })).toBeEnabled();
});

async function mindestens44(ziel: ReturnType<Page['getByRole']>) {
  await expect(ziel).toBeVisible();
  expect((await ziel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}
