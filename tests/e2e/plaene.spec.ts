import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Übungspläne im echten Browser (UEB-EPIC-002).
 *
 * Die Komponententests prüfen Inhalt, Rollen und Wege, `pnpm test:db` die
 * Regeln am Server. Hier geht es um das, was jsdom nicht misst: kein
 * waagerechtes Scrollen bei 375 px - mit langen Titeln und offenen
 * Formularen -, Tippziele von 44 px und die Prüfung mit axe.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plaene.html';
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

async function hoehe(page: Page, name: string): Promise<number> {
  const knopf = page.getByRole('button', { name, exact: true }).first();
  await expect(knopf).toBeVisible();
  return (await knopf.boundingBox())?.height ?? 0;
}

test.describe('Übungspläne', () => {
  for (const breite of [375, 1280]) {
    test(`Entwurf mit offenem Formular bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Heimprogramm Knie');
      for (const name of ['Übung hinzufügen', 'Ändern', 'Zuweisen']) {
        expect(await hoehe(page, name)).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'Übung hinzufügen' }).click();
      await page.getByRole('searchbox', { name: 'Übung suchen' }).fill('band');
      await expect(
        page.getByRole('button', { name: /Rudern im Sitzen, Theraband rot/ }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`zugewiesener Plan, läuft aus, in Alltagssprache bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zugewiesen`);
      await expect(page.getByText(/Bitte entscheiden/)).toBeVisible();
      for (const name of ['Verlängern', 'Plan beenden', 'In Alltagssprache']) {
        expect(await hoehe(page, name)).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'In Alltagssprache' }).click();
      await expect(page.getByText('Sie brauchen: Theraband gelb')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`neue Fassung mit Schritt bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=fassung`);
      await expect(
        page.getByText('Last: Rucksack mit 3 kg Wasserflaschen → Rucksack 5 kg'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Ändern' }).nth(1).click();
      await page.getByLabel('Schwerer').check();
      await page.getByLabel('Achse').selectOption('last');
      await expect(
        page.getByRole('button', { name: 'Rudern im Sitzen, Theraband rot' }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Abschnitt in der Akte und Wiedervorlage bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=akte`);
      await expect(page.getByRole('heading', { name: 'Übungspläne' })).toBeVisible();
      await expect(page.getByText('läuft aus')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await page.goto(`${PRUEFSEITE}?seite=offen`);
      await expect(page.getByRole('heading', { name: 'Pläne laufen aus (2)' })).toBeVisible();
      await expect(page.getByText('abgelaufen')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
