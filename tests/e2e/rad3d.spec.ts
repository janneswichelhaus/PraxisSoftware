import { expect, test, type Page } from '@playwright/test';

/**
 * Das 3D-Rad im echten Browser (Handoff Lastenrad 3D, Abschnitt 5; AC 1, 7
 * und 9): Antippen trifft ein Bauteil, die Nadeln sind gezeichnet, „Am Rad
 * zeigen“ hebt das Bauteil hervor, und ohne WebGL steht eine Meldung da,
 * während die Seite weiter bedienbar bleibt. WebGL kommt aus SwiftShader,
 * wie auf einem Rechner ohne Grafikkarte.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/rad3d.html';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({
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

/** Zwei Bilder des Rads im Abstand von 400 ms: gleich heißt, nichts bewegt sich. */
async function steht(page: Page) {
  const rad = page.getByRole('img', { name: /3D-Modell des Lastenrads/ });
  const vorher = await rad.screenshot();
  await page.waitForTimeout(400);
  return vorher.equals(await rad.screenshot());
}

async function transportboxWaehlen(page: Page) {
  const box = (await page.getByRole('img', { name: /3D-Modell des Lastenrads/ }).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(page.getByTestId('treffer')).toHaveText('transportbox');
}

test('bei reduzierter Bewegung kein Kameraflug und kein Pulsieren (AC 10)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bereit(page);
  await transportboxWaehlen(page);
  // Hervorgehoben, aber ruhig.
  expect(await steht(page)).toBe(true);
  // „Am Rad zeigen“ springt, statt zu fliegen: gleich danach steht das Bild.
  await page.getByRole('button', { name: 'Bremse vorne zeigen' }).click();
  await page.waitForTimeout(100);
  expect(await steht(page)).toBe(true);
});

test('ohne diese Einstellung pulsiert das gewählte Bauteil (Gegenprobe zu AC 10)', async ({
  page,
}) => {
  await bereit(page);
  await transportboxWaehlen(page);
  expect(await steht(page)).toBe(false);
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
    page.getByText('Das 3D-Modell lässt sich in diesem Browser nicht anzeigen.', { exact: false }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Bremse vorne zeigen' })).toBeEnabled();
});
