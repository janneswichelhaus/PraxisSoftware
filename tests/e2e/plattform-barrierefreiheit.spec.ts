import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Barrierefreiheit jeder Plattformansicht (POR-020, DSN-001 Abschnitt 7,
 * `IDEA-QSN-006`) im echten Browser.
 *
 * Die Prüfpunkte, die sich messen lassen:
 *   1. Schrift mindestens 18 px; bei 200 % Vergrößerung kein waagerechtes
 *      Scrollen bei 375 px - gemessen als Fenster von 188 px Breite, so
 *      breit ist 375 px bei 200 % in CSS-Pixeln.
 *   2. Berührflächen mindestens 44 px hoch (WCAG 2.5.5; DSN-001 nennt 48 als
 *      Ziel, die Knöpfe des Systems haben 48, Textlinks 44 - ANN-267).
 *   3. Kontrast mindestens 4,5 : 1 und
 *   5. Beschriftungen, Rollen, Namen - beides mit axe-core, anders als in den
 *      Komponententests MIT Kontrast, weil hier ein Renderer rechnet.
 * Punkte 4, 6, 7 und 8 (Sprache, Leerzustände, ein Hauptknopf, kein
 * Zeitdruck) prüft die Sichtung.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** Jede Ansicht der Plattform, die die Prüfseite kennt, mit einem Merkmal. */
const ANSICHTEN: { seite: string; merkmal: RegExp | string }[] = [
  { seite: 'geruest', merkmal: 'Guten Tag' },
  { seite: 'einstieg', merkmal: 'Willkommen' },
  { seite: 'termine', merkmal: 'Termine' },
  { seite: 'wunsch', merkmal: 'Termin wünschen' },
  { seite: 'termin', merkmal: /\d{4}/ },
  { seite: 'rechnungen', merkmal: 'Rechnungen' },
  { seite: 'rechnung', merkmal: 'Rechnung RG-2026-0007' },
  { seite: 'dokumente', merkmal: 'Dokumente' },
  { seite: 'befundbogen', merkmal: /Anamnesebogen/ },
  { seite: 'ich', merkmal: 'Ich' },
  { seite: 'einwilligungen', merkmal: 'Einwilligungen' },
  { seite: 'daten', merkmal: 'Meine Daten' },
  { seite: 'einstellungen', merkmal: 'Einstellungen' },
  { seite: 'handeln-fuer', merkmal: 'Guten Tag' },
  { seite: 'gesperrt', merkmal: 'Ihr Zugang ist gesperrt' },
  { seite: 'ende', merkmal: 'Ich' },
  // ANG-EPIC-001: das Nachsorge-Abo mit Kündigungsknopf und die Übersicht danach.
  { seite: 'abo', merkmal: 'Nachsorge-Abo' },
  { seite: 'abo-gekuendigt', merkmal: 'Guten Tag' },
  // ANG-EPIC-002: das eigene Trainingspaket mit Preisen, und die Preise ohne Paket.
  { seite: 'paket', merkmal: 'Trainingspaket' },
  { seite: 'preise', merkmal: 'Trainingspaket' },
];

async function oeffne(page: Page, seite: string, merkmal: RegExp | string) {
  await page.goto(`${PRUEFSEITE}?seite=${seite}`);
  await expect(page.getByRole('heading', { level: 1, name: merkmal }).first()).toBeVisible();
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Sichtbarer Text unter 18 px - ohne Inhalte nur für Bildschirmleser. */
async function kleineSchrift(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const gehen = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
      const text = knoten.textContent?.trim();
      const element = knoten.parentElement;
      if (!text || !element || element.closest('svg, .sr-only, [aria-hidden="true"]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const groesse = parseFloat(getComputedStyle(element).fontSize);
      if (groesse < 17.9) funde.push(`${groesse}px: ${text.slice(0, 40)}`);
    }
    return funde;
  });
}

/** Bedienelemente unter 44 px Höhe; ein Kästchen zählt mit seiner Zeile. */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main a, main button, main input, main select, main textarea, header a, header button, nav a',
    )) {
      const ziel = el.matches('input[type="radio"], input[type="checkbox"]')
        ? (el.closest('label') ?? el)
        : el;
      const box = ziel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5) {
        funde.push(
          `${Math.round(box.height)}px: ${(ziel.textContent ?? ziel.outerHTML).trim().slice(0, 40)}`,
        );
      }
    }
    return funde;
  });
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

test.describe('Plattform für 78-Jährige (POR-020, DSN-001 Abschnitt 7)', () => {
  for (const { seite, merkmal } of ANSICHTEN) {
    test(`${seite}: Schrift, Ziele, Kontrast und Beschriftung bei 375 px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await oeffne(page, seite, merkmal);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`${seite}: bei 200 % Vergrößerung kein waagerechtes Scrollen`, async ({ page }) => {
      await page.setViewportSize({ width: 188, height: 900 });
      await oeffne(page, seite, merkmal);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('die Schriftgröße „Sehr groß" gilt sofort und bleibt auf dem Gerät', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'einstellungen', 'Einstellungen');
    const vorher = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    await page.getByRole('radio', { name: 'Sehr groß' }).check();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.schrift))
      .toBe('sehr-gross');
    const text = page.getByText('Gilt nur auf diesem Gerät.', { exact: false });
    const groesse = await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(groesse).toBeGreaterThan(parseFloat(vorher) * 1.2);
    expect(await ueberlaeuft(page)).toBe(false);
    // Nach dem Neuladen gilt sie weiter.
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Sehr groß' })).toBeChecked();
  });
});
