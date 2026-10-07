import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Übungsbibliothek im echten Browser (UEB-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt, Rollen und Wege, `pnpm test:db` die
 * Regeln am Server. Hier geht es um das, was jsdom nicht misst: kein
 * waagerechtes Scrollen bei 375 px - auch aufgeklappt und mit langen
 * Bezeichnungen -, Tippziele von 44 px und die Prüfung mit axe.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/uebungen.html';
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

test.describe('Übungsbibliothek', () => {
  for (const breite of [375, 1280]) {
    test(`Liste mit Suche und Filter bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);

      await expect(page.getByRole('heading', { level: 1, name: 'Übungen' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Kniebeuge/ })).toBeVisible();

      await page.getByRole('searchbox', { name: 'Suche' }).fill('halb in die hocke');
      await expect(page.getByRole('status')).toHaveText('1 von 5 Übungen');
      await expect(
        page.getByText(
          'Gefunden in: Kniebeuge am Geländer, halbe Tiefe, Kniebeuge freistehend, halbe Tiefe',
        ),
      ).toBeVisible();

      await page.getByRole('searchbox', { name: 'Suche' }).fill('');
      await page.getByText('Filter', { exact: true }).click();
      await page.getByLabel('Ausrüstung').selectOption('Theraband gelb');
      await expect(page.getByRole('status')).toHaveText('2 von 5 Übungen');
      for (const zusammenfassung of await page.locator('summary').all()) {
        if ((await zusammenfassung.locator('..').getAttribute('open')) === null) {
          await zusammenfassung.click();
        }
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Übung mit Varianten und Verbindungen bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebung&rolle=owner`);

      await expect(page.getByRole('heading', { level: 1, name: 'Kniebeuge' })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Kniebeuge freistehend, halbe Tiefe' }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Ausfallschritt: Ausfallschritt am Stuhl' }),
      ).toBeVisible();

      // Pflege: Tippziele mindestens 44 px (Oberflächen-Checkliste Punkt 1).
      for (const name of ['Bearbeiten', 'Variante anlegen', 'Verbinden', 'Archivieren']) {
        expect(await hoehe(page, name)).toBeGreaterThanOrEqual(44);
      }

      // Alles aufgeklappt, das Formular zum Verbinden offen - nichts läuft über.
      await page.getByRole('button', { name: 'Verbinden', exact: true }).first().click();
      await expect(page.getByLabel('Achse *')).toBeVisible();
      for (const zusammenfassung of await page.locator('summary').all()) {
        await zusammenfassung.click();
      }
      await expect(
        page.getByText('Mit beiden Händen am Geländer festhalten.').last(),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('springt von einer Verbindung zur Karte der anderen Variante', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${PRUEFSEITE}?seite=uebung`);
    await page.getByRole('link', { name: 'Ausfallschritt: Ausfallschritt am Stuhl' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ausfallschritt' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Kniebeuge: Kniebeuge freistehend, volle Tiefe' }),
    ).toBeVisible();
  });
});
