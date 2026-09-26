import { expect, test, type Page } from '@playwright/test';

/**
 * Fotos in einem echten Browser (DOK-006, ADR-017 Abschnitt G).
 *
 * Die Komponententests bilden die Kamera nach. Hier läuft Chromium mit seiner
 * künstlichen Kamera (Testbild, ADR-017 Punkt 41 — nie eine Person) und prüft,
 * was jsdom nicht kann: dass der Kameradialog wirklich ein Bild aus dem
 * Kamerastrom rechnet, dass dieses Bild kein EXIF-Segment trägt (Punkt 34),
 * dass die Kamera beim Auslösen und Abbrechen wirklich endet (Punkt 33), dass
 * bereinigte Bilder noch Bilder sind und dass nichts bei 375 px waagerecht
 * überläuft.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/fotos.html';

test.use({
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Künstliche Kamera mit Testbild, Freigabe ohne Rückfrage.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera'],
});

/**
 * Merkt sich jeden Kamerastrom, den die Seite anfordert — damit der Test
 * sehen kann, ob seine Spuren beendet sind. Und jede Anfrage, damit er sieht,
 * dass nie Ton verlangt wird.
 */
async function kameraBeobachten(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const fenster = window as unknown as {
      __stroeme: MediaStream[];
      __anfragen: MediaStreamConstraints[];
    };
    fenster.__stroeme = [];
    fenster.__anfragen = [];
    navigator.mediaDevices.getUserMedia = async (anfrage) => {
      fenster.__anfragen.push(anfrage ?? {});
      const strom = await original(anfrage);
      fenster.__stroeme.push(strom);
      return strom;
    };
  });
}

async function laufendeSpuren(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __stroeme: MediaStream[] }).__stroeme
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length,
  );
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Fotos', () => {
  test('der Kameradialog rechnet ein JPEG ohne EXIF aus dem Kamerabild und beendet die Kamera', async ({
    page,
  }) => {
    await kameraBeobachten(page);
    await page.goto(`${PRUEFSEITE}?ansicht=fotos`);
    await expect(page.getByText(/Einwilligung erteilt am 27.08.2026/)).toBeVisible();

    await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Foto aufnehmen' });
    await expect(dialog.getByText(/Gesicht nur, wenn es selbst/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Auslösen' })).toBeVisible();
    // Das Kamerabild läuft, bevor ausgelöst wird.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.videoWidth ?? 0))
      .toBeGreaterThan(0);
    expect(await laufendeSpuren(page)).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: 'Auslösen' }).click();
    await expect(dialog.getByRole('img', { name: 'Aufgenommenes Foto' })).toBeVisible();
    // Punkt 33: Die Kamera endet mit dem Auslösen.
    expect(await laufendeSpuren(page)).toBe(0);

    // Punkt 34: Ein Bild aus dem Kameradialog trägt gar kein EXIF-Segment.
    const kopf = await dialog
      .getByRole('img', { name: 'Aufgenommenes Foto' })
      .evaluate(async (bild: HTMLImageElement) => {
        const bytes = new Uint8Array(await (await fetch(bild.src)).arrayBuffer());
        const marker: number[] = [];
        let i = 2;
        while (i + 4 <= bytes.length && bytes[i] === 0xff && bytes[i + 1] !== 0xda) {
          marker.push(bytes[i + 1]!);
          i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
        }
        return { jpeg: bytes[0] === 0xff && bytes[1] === 0xd8, marker };
      });
    expect(kopf.jpeg).toBe(true);
    expect(kopf.marker).not.toContain(0xe1);

    await dialog.getByRole('button', { name: 'Foto verwenden' }).click();
    await expect(page.getByText('Neues Foto')).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue(/^Foto vom \d{2}\.\d{2}\.\d{4}$/);

    // Nur Bild, nie Ton.
    const anfragen = await page.evaluate(
      () => (window as unknown as { __anfragen: MediaStreamConstraints[] }).__anfragen,
    );
    expect(anfragen.every((a) => a.audio === false && Boolean(a.video))).toBe(true);
    // Kein Dateiwähler im Abschnitt.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test('ohne Server bleibt das Foto stehen und wird zum erneuten Speichern angeboten', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=fotos`);
    await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
    await page.getByRole('button', { name: 'Auslösen' }).click();
    await page.getByRole('button', { name: 'Foto verwenden' }).click();
    await page.getByRole('button', { name: 'Foto speichern' }).click();

    await expect(page.getByText(/Das Foto ist noch da/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Foto speichern' })).toBeEnabled();
  });

  test('Abbrechen beendet die Kamera', async ({ page }) => {
    await kameraBeobachten(page);
    await page.goto(`${PRUEFSEITE}?ansicht=fotos`);
    await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
    await expect(page.getByRole('button', { name: 'Auslösen' })).toBeVisible();
    expect(await laufendeSpuren(page)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await laufendeSpuren(page)).toBe(0);
  });

  test('die Liste zeigt keine Vorschaubilder und läuft bei 375 px nicht über', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=fotos`);
    await expect(page.getByText('Testgegenstand, erste Aufnahme', { exact: true })).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('der Vergleich zeigt zwei Fotos gleich groß nebeneinander, auch bei 375 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=vergleich`);
    const region = page.getByRole('region', { name: 'Vergleich zweier Fotos' });
    const bilder = region.getByRole('img');
    await expect(bilder).toHaveCount(2);

    const [links, rechts] = [await bilder.nth(0).boundingBox(), await bilder.nth(1).boundingBox()];
    expect(links && rechts).toBeTruthy();
    expect(Math.abs(links!.width - rechts!.width)).toBeLessThan(1);
    expect(Math.abs(links!.height - rechts!.height)).toBeLessThan(1);
    expect(Math.abs(links!.y - rechts!.y)).toBeLessThan(1);
    expect(links!.x).toBeLessThan(rechts!.x);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('am Dokument steht „Foto aufnehmen“ neben dem Dateiwähler', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=dokument`);
    await expect(page.getByLabel('Datei')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Foto aufnehmen' })).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('bereinigte Bilder sind im echten Browser noch lesbar (Punkt 34: verlustfrei)', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=bereinigung`);
    for (const name of ['JPEG nach der Bereinigung', 'PNG nach der Bereinigung']) {
      const bild = page.getByRole('img', { name });
      await expect
        .poll(() => bild.evaluate((b: HTMLImageElement) => (b.complete ? b.naturalWidth : -1)))
        .toBe(2);
    }
  });
});
