import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Rückfragen über die Plattform im echten Browser (KOM-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px mit langen Texten, Tippziele von mindestens 48 px auf
 * der Plattform (DSN-001 Abschnitt 7), der Notfallhinweis sichtbar über dem
 * Eingabefeld und die Prüfung mit axe.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/nachrichten.html';
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

test.describe('Nachrichten auf der Plattform und Rückfragen in der Praxis', () => {
  for (const breite of [375, 1280]) {
    test(`Reiter Nachrichten mit Hinweis bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=liste`);
      await expect(page.getByRole('heading', { level: 1, name: 'Nachrichten' })).toBeVisible();
      const hinweis = page.getByRole('note', { name: 'Hinweis zu Antwortzeit und Notfällen' });
      await expect(hinweis).toContainText('116117');
      await expect(page.getByRole('link', { name: 'Nachrichten' }).last()).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Neue Nachricht: große Ziele, Hinweis über dem Feld bei ${breite} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=neu`);
      const thema = page.getByText('Beschwerden', { exact: true });
      expect((await thema.locator('xpath=..').boundingBox())!.height).toBeGreaterThanOrEqual(48);
      const hinweis = page.getByRole('note', { name: 'Hinweis zu Antwortzeit und Notfällen' });
      const feld = page.getByLabel('Text');
      expect((await hinweis.boundingBox())!.y).toBeLessThan((await feld.boundingBox())!.y);
      expect(
        (await page.getByRole('button', { name: 'Nachricht senden' }).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(48);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Verlauf mit langer Frage und Antwort bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=verlauf`);
      await expect(page.getByRole('list', { name: 'Verlauf' })).toContainText('Praxis');
      await expect(page.getByLabel('Noch etwas ergänzen')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Praxis: Rückfragen mit Frist und überfällig bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=praxisliste`);
      await expect(page.getByRole('heading', { level: 1, name: 'Rückfragen' })).toBeVisible();
      await expect(page.getByText(/überfällig/).first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Praxis: eine Rückfrage beantworten und in die Akte bei ${breite} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=praxisverlauf`);
      await expect(page.getByRole('button', { name: 'In die Akte übernehmen' })).toBeVisible();
      await expect(page.getByLabel('Antwort an die Person')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
