import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Der Plan dort, wo trainiert wird, im echten Browser (UEB-EPIC-003).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px mit langen Namen, große Tippziele in der
 * Durchführungsansicht („ein Finger, verschwitzt", IDEA-ORG-003), die
 * Prüfung mit axe und das Druckbild des Blatts ohne Bedienelemente.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-uebungen.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

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

test.describe('Übungen auf der Plattform', () => {
  for (const breite of [375, 1280]) {
    test(`Reiter Übungen mit Plan und Übungstagen bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebungen`);
      await expect(page.getByRole('heading', { level: 1, name: 'Übungen' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Weiter üben' })).toBeVisible();
      const tag = page.getByRole('button', { name: 'Dienstag' });
      expect((await tag.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Durchführungsansicht mit großen Zielen bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=einheit`);
      const erster = page.getByRole('button', { name: '1. Durchgang' });
      await expect(erster).toHaveAttribute('aria-pressed', 'true');
      expect((await erster.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      // Weiterblättern in Knopfhöhe des Designsystems (48 px), über dem Mindestziel.
      expect(
        (await page.getByRole('button', { name: 'Nächste Übung' }).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(48);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Diese Woche: Termine und Übungstage bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=woche`);
      await expect(page.getByRole('heading', { name: 'Diese Woche' })).toBeVisible();
      await expect(page.getByText('Übungstag').first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Plan als Blatt auf der Plattform und in der Praxis bei ${breite} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      for (const art of ['blatt', 'praxisblatt']) {
        await page.goto(`${PRUEFSEITE}?seite=${art}`);
        await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await axeVerstoesse(page)).toEqual([]);
      }
    });
  }

  test('Reiter heißt im Training „Training"', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=training`);
    await expect(page.getByRole('heading', { level: 1, name: 'Training' })).toBeVisible();
    await expect(
      page.getByText('Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'),
    ).toBeVisible();
  });

  test('das Blatt druckt ohne Bedienelemente und ohne Reiterleiste', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Drucken oder als PDF sichern' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Plattform' })).toBeHidden();
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
  });
});
