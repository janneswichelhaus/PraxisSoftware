import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';
import { KATALOG } from '../../src/features/exercises/katalog';

/**
 * Der Kontaktbogen des Übungskatalogs im echten Browser (UEB-012, ANN-381).
 *
 * Die Geometrie prüft `src/features/exercises/bild/bild.test.ts`, die Inhalte
 * `katalog.test.ts`. Hier: Jeder Eintrag erscheint, jeder mit Bild zeichnet
 * Start, Ende und Bewegung, nichts scrollt bei 375 px quer, axe findet nichts,
 * und abgespielt wird nur auf Tippen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/uebungsbilder.html';
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

const KNIE = KATALOG.filter((e) => e.schluessel.startsWith('KN-'));

test.describe('Übungsbilder', () => {
  test('zeigt jeden Eintrag des Katalogs, jeden mit Bild in allen Darstellungen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('heading', { level: 1, name: 'Übungsbilder' })).toBeVisible();
    await expect(page.locator('article[data-eintrag]')).toHaveCount(KATALOG.length);
    for (const e of KATALOG) {
      const eintrag = page.locator(`article[data-eintrag="${e.schluessel}"]`);
      if (e.bild) {
        // Start, Ende, Bewegung - beschrieben; die Vorschau ist stumm.
        await expect(eintrag.locator('svg[role="img"]')).toHaveCount(3);
        await expect(eintrag.locator('svg[aria-hidden="true"]').first()).toBeAttached();
      } else {
        await expect(eintrag.getByText('Ohne Bild – die Übung steht als Text.')).toBeVisible();
      }
    }
    expect(await ueberlaeuft(page)).toBe(false);
  });

  for (const breite of [375, 1280]) {
    test(`Gruppe Knie bei ${breite} px: kein Querscrollen, axe ohne Befund`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?gruppe=kn`);
      await expect(page.locator('article[data-eintrag]')).toHaveCount(KNIE.length);
      await expect(page.getByRole('status')).toContainText(`${KNIE.length} Einträge der Gruppe KN`);
      // Jedes Bild hat Fläche - eine leere Zeichnung fiele hier auf.
      for (const svg of await page.locator('svg[role="img"]').all()) {
        const box = await svg.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(100);
        expect(box?.height ?? 0).toBeGreaterThan(70);
        expect(await svg.locator('path').count()).toBeGreaterThan(10);
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('spielt die Bewegung erst auf Tippen ab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?gruppe=kn`);
    const eintrag = page.locator('article[data-eintrag="KN-01"]');
    const knopf = eintrag.getByRole('button', { name: 'Bewegung abspielen' });
    await expect(knopf).toHaveAttribute('aria-pressed', 'false');
    expect((await knopf.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await knopf.click();
    await expect(eintrag.getByRole('button', { name: 'Anhalten' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(eintrag.getByRole('img', { name: /Bewegung von der Ausgangs/ })).toHaveCount(2);
  });

  test('zeigt den Kontaktbogen dicht und ohne Querscrollen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?gruppe=kn&ansicht=bogen`);
    await expect(page.locator('figure[data-eintrag]')).toHaveCount(KNIE.length);
    expect(await ueberlaeuft(page)).toBe(false);
  });
});
