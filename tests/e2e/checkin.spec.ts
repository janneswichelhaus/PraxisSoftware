import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Check-in und Angaben im echten Browser (TRK-EPIC-001).
 *
 * Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier: kein waagerechtes Scrollen bei 375 px, Stufen der Skala
 * mindestens 44 × 44 px (am Handy zwei Reihen), axe ohne Verstoß, und keine
 * Farbe als Bewertung an einem Wert (ADR-006 Punkt 11).
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

test.describe('Check-in (TRK-EPIC-001)', () => {
  for (const breite of [375, 1280]) {
    test(`Fragen mit Skala bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin`);
      const ruhe = page.getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
      await expect(ruhe).toBeVisible();
      await expect(ruhe.getByText('Ihre letzte Angabe: 3')).toBeVisible();
      // Jede Stufe ein eigenes Ziel von mindestens 44 × 44 px.
      const stufen = ruhe.locator('label');
      await expect(stufen).toHaveCount(11);
      for (const stufe of await stufen.all()) {
        const box = (await stufe.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await stufen.nth(4).click();
      await expect(ruhe.getByText('gewählt: 4')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Kachel, Dank und Meine Angaben bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin-uebersicht`);
      await expect(page.getByText('3 kurze Fragen')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Jetzt beantworten →' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=checkin-danke`);
      await expect(page.getByText(/sieht Ihre Angaben beim nächsten Termin/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Jetzt beantworten →' })).toHaveCount(0);

      await page.goto(`${PRUEFSEITE}?seite=angaben`);
      await expect(page.getByRole('heading', { name: 'Meine Angaben' })).toBeVisible();
      await expect(
        page.getByText('Schmerz in Ruhe 3 · Schmerz bei Belastung 6 · Einschränkung im Alltag 4'),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Zwischen den Terminen in der Praxis bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zwischen`);
      await expect(page.getByText('Check-in: alle 7 Tage')).toBeVisible();
      const liste = page.getByRole('list', { name: 'Beantwortete Check-ins' });
      await expect(liste.getByRole('listitem')).toHaveCount(2);
      // Ein hoher Wert sieht aus wie ein niedriger: keine Farbe als Bewertung.
      const farben = await liste
        .getByRole('listitem')
        .evaluateAll((zeilen) => zeilen.map((z) => getComputedStyle(z).backgroundColor));
      expect(new Set(farben).size).toBe(1);
      await page.getByRole('button', { name: 'Check-in ändern' }).click();
      await expect(page.getByLabel('Wie oft?')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
