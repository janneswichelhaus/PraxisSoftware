import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Foto und Video an der Rückfrage im echten Browser (KOM-EPIC-002, ADR-017
 * Abschnitt L).
 *
 * Was jsdom nicht kann: eine echte Aufnahme aus `MediaRecorder` mit der
 * künstlichen Kamera von Chromium (Testbild, nie eine Person, Punkt 41) - dass
 * sie nur Bild trägt, dass das Gerät die Programmangaben leert und der Server
 * sie danach annimmt (Punkte 63, 64); dass der Videodialog nie Ton anfragt und
 * die Kamera beim Anhalten endet (Punkt 62); dazu Tippziele, kein
 * waagerechtes Scrollen bei 375 px und axe.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/nachrichten.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

test.use({
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera'],
});

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof AxeCore }).axe;
    const ergebnis = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return ergebnis.violations.map(
      (v) => `${v.id}: ${v.help} – ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`,
    );
  });
}

/** Merkt sich Kameraströme und Anfragen, wie in `fotos.spec.ts`. */
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

test.describe('Foto und Video an der Rückfrage', () => {
  for (const breite of [375, 1280]) {
    test(`Verlauf mit Anhängen und Zeitmarke bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=verlauf`);
      const abschnitt = page.getByRole('region', { name: 'Fotos und Videos' });
      await expect(abschnitt).toContainText('Video, 0:12');
      await expect(abschnitt).toContainText('gelöscht');
      // Keine Vorschaubilder in der Liste (Punkt 40).
      await expect(abschnitt.locator('img, video')).toHaveCount(0);
      for (const name of ['Im Video bei 0:07 ansehen', 'Foto aufnehmen', 'Video aufnehmen']) {
        const knopf = page.getByRole('button', { name });
        await expect(knopf).toBeVisible();
        expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('Videodialog: nur Bild, Vorschau, die Kamera endet mit der Aufnahme', async ({ page }) => {
    await kameraBeobachten(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?seite=verlauf`);
    await page.getByRole('button', { name: 'Video aufnehmen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Video aufnehmen' });
    await expect(dialog).toContainText('keine anderen Personen');
    await dialog.getByRole('button', { name: 'Aufnahme starten' }).click();
    await expect(dialog.getByRole('status')).toContainText('Aufnahme läuft');
    await page.waitForTimeout(1500);
    await dialog.getByRole('button', { name: 'Aufnahme beenden' }).click();
    await expect(dialog.getByLabel('Aufgenommenes Video')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Video verwenden' })).toBeVisible();

    const { anfragen, laufend } = await page.evaluate(() => {
      const f = window as unknown as {
        __stroeme: MediaStream[];
        __anfragen: MediaStreamConstraints[];
      };
      return {
        anfragen: f.__anfragen.map((a) => Boolean(a.audio)),
        laufend: f.__stroeme.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live')
          .length,
      };
    });
    expect(anfragen).toEqual([false]);
    expect(laufend).toBe(0);
    expect(await ueberlaeuft(page)).toBe(false);

    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toBeHidden();
  });

  test('eine echte Aufnahme aus Chromium: Gerät leert, Server nimmt an (Punkte 63, 64)', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?seite=verlauf`);
    await expect(page.getByRole('region', { name: 'Fotos und Videos' })).toBeVisible();
    const befund = await page.evaluate(async () => {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const format = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((f) =>
        MediaRecorder.isTypeSupported(f),
      )!;
      const rekorder = new MediaRecorder(strom, {
        mimeType: format,
        videoBitsPerSecond: 2_000_000,
      });
      const teile: Blob[] = [];
      rekorder.ondataavailable = (e) => teile.push(e.data);
      const fertig = new Promise<void>((r) => (rekorder.onstop = () => r()));
      rekorder.start();
      await new Promise((r) => setTimeout(r, 1500));
      rekorder.stop();
      await fertig;
      strom.getTracks().forEach((t) => t.stop());
      const video = new Blob(teile, { type: rekorder.mimeType });
      return (
        window as unknown as { __videoPruefung: (v: Blob) => Promise<Record<string, unknown>> }
      ).__videoPruefung(video);
    });
    expect(befund).toMatchObject({
      typ: 'video/webm',
      // Chromium trägt sich als Programm in den Kopf ein - die Prüfung sähe es.
      vorher: { lesbar: true, ohneTon: true, ohneAngaben: false },
      programmVorher: true,
      bereinigt: true,
      nachher: { lesbar: true, ohneTon: true, ohneAngaben: true },
      gleicheLaenge: true,
      programmNachher: false,
    });
  });
});
