import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Alltag als Kontext im echten Browser (ALT-EPIC-001).
 *
 * Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier: kein waagerechtes Scrollen bei 375 px, Ziele mindestens
 * 44 px hoch, axe ohne Verstoß – und nirgends ein Zählwerk (Serie, Quote),
 * keine Farbe als Bewertung (IDEA-ALT-002, ADR-006 Punkt 11).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
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

test.describe('Alltag als Kontext (ALT-EPIC-001)', () => {
  for (const breite of [375, 1280]) {
    test(`Schlaf, Schmerzmittel und Belastung im Check-in bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin-alltag`);
      // Der Check-in als geführter Ablauf (Handoff 5.1): je Frage eine Seite, die Belastung auf einer.
      const erste = page.getByRole('dialog', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
      await expect(erste.getByText('Frage 1 von 4', { exact: true })).toBeVisible();
      await erste.getByRole('button', { name: 'Weiter' }).click();
      const schlaf = 'Wie viele Stunden haben Sie letzte Nacht ungefähr geschlafen?';
      const zweite = page.getByRole('dialog', { name: schlaf });
      await expect(zweite.getByRole('spinbutton', { name: schlaf })).toBeVisible();
      await zweite.getByRole('button', { name: 'Weiter' }).click();
      const dritte = page.getByRole('dialog', {
        name: 'An wie vielen der letzten 7 Tage haben Sie Schmerzmittel bei Bedarf genommen?',
      });
      await expect(dritte.getByText('von 7 Tagen', { exact: true })).toBeVisible();
      await dritte.getByRole('button', { name: 'Weiter' }).click();
      const belastung = page.getByRole('dialog', { name: 'Außerhalb der Übungen' });
      await expect(
        belastung.getByRole('heading', { name: 'Außerhalb der Übungen', exact: true }),
      ).toBeVisible();
      const art = belastung.getByRole('group', {
        name: 'Was war seit dem letzten Check-in Ihre größte körperliche Belastung außerhalb der Übungen?',
      });
      const schwer = art.getByRole('button', {
        name: 'schwere körperliche Arbeit (etwa Umzug, Heben)',
      });
      await schwer.click();
      await expect(schwer).toHaveAttribute('aria-pressed', 'true');
      // Jede Wahl eine ganze Zeile, mindestens 44 hoch.
      for (const ziel of await art.getByRole('button').all()) {
        expect((await ziel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(
        belastung.getByRole('spinbutton', {
          name: 'Wie lange hat diese Belastung ungefähr gedauert?',
        }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Gewohnheiten der Person bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      const vermerkt: unknown[] = [];
      await page.route('**/rest/v1/rpc/mark_platform_habit', async (route) => {
        vermerkt.push(route.request().postDataJSON());
        await route.fulfill({ json: null });
      });
      // Das Neuladen danach bleibt offen: So steht der Tipp, wie er getippt wurde.
      await page.route('**/rest/v1/rpc/platform_habits', () => undefined);
      await page.goto(`${PRUEFSEITE}?seite=gewohnheiten`);
      await expect(page.getByRole('heading', { level: 1, name: 'Gewohnheiten' })).toBeVisible();
      const tage = page.getByRole('group', {
        name: 'Nach dem Zähneputzen: zwei Minuten Mobilität',
      });
      const knoepfe = tage.getByRole('button');
      await expect(knoepfe).toHaveCount(7);
      for (const knopf of await knoepfe.all()) {
        const box = (await knopf.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(72);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await expect(tage.getByRole('button', { name: /^heute, / })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByText('Pausiert. Setzen Sie fort, wenn es wieder geht.')).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/in Folge|Tage am Stück|%|geschafft/);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      // Vermerken ist ein Tipp auf den Tag, ohne Rückfrage.
      const aeltester = knoepfe.first();
      await expect(aeltester).toHaveAttribute('aria-pressed', 'false');
      await aeltester.click();
      await expect(aeltester).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => vermerkt).toEqual([expect.objectContaining({ p_done: true })]);
    });

    test(`Gewohnheiten in „Zwischen den Terminen“ bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zwischen`);
      const abschnitt = page.getByRole('region', { name: 'Gewohnheiten' });
      await expect(abschnitt).toBeVisible();
      await expect(abschnitt.getByText('pausiert seit', { exact: false })).toBeVisible();
      await expect(
        abschnitt.getByRole('list', { name: 'Tage bis heute, höchstens 28' }).first(),
      ).toBeVisible();
      await expect(abschnitt).not.toContainText(/in Folge|Tage am Stück|%|geschafft/);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
