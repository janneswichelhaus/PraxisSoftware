import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Bausteine der Plattform im echten Browser (Schritt 1a, Handoff
 * 2026-10-22; `docs/design/PLATTFORM.md`).
 *
 * Die Komponententests prüfen Rollen, Namen und Klassen. Hier geht es um das,
 * was jsdom nicht misst: Schrift und Ziele in Pixeln, Kontrast, kein
 * waagerechtes Rollen bei 375, 1280 und 188 px (200 %) und bei „Sehr groß“,
 * der Schatten nur an den Karten zum Antippen, keine Versalien - und ob eine
 * Karte beim Drücken nachgibt, aber bei „Bewegung reduzieren“ nicht.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-bausteine.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function oeffne(page: Page, breite: number, schrift?: 'sehr-gross') {
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(schrift ? `${PRUEFSEITE}?schrift=${schrift}` : PRUEFSEITE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bausteine der Plattform' }),
  ).toBeVisible();
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Sichtbarer Text unter 18 px - ohne Inhalte nur für Vorlesesoftware. */
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

const schatten = (ort: Locator) => ort.evaluate((el) => getComputedStyle(el).boxShadow);

for (const breite of [375, 1280]) {
  test(`Schrift, Kontrast und Breite bei ${breite} px`, async ({ page }) => {
    await oeffne(page, breite);
    expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

test('bleibt bei 200 % (188 px) und bei „Sehr groß“ ohne waagerechtes Rollen', async ({ page }) => {
  await oeffne(page, 188);
  expect(await ueberlaeuft(page)).toBe(false);
  await oeffne(page, 375, 'sehr-gross');
  expect(await ueberlaeuft(page)).toBe(false);
  // Die Titel wachsen mit (rem): Hero 26 px wird 32,5.
  const hero = page.getByRole('heading', { level: 2, name: 'Fragebogen vor Ihrem ersten Termin' });
  expect(await hero.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(
    32,
  );
  // Bei „Sehr groß“ fällt der Pfeil der Aufgabenkarte weg (Handoff, Abschnitt 0).
  const pfeil = page.getByRole('link', { name: /^Eine kleine Gewohnheit/ }).locator('[data-pfeil]');
  await expect(pfeil).toBeHidden();
});

test('gibt nur den Karten zum Antippen Tiefe, Ziele groß genug, ohne Versalien', async ({
  page,
}) => {
  await oeffne(page, 375);
  const hero = page.getByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
  const aufgabe = page.getByRole('link', { name: /^Eine kleine Gewohnheit/ });
  const besuch = page.getByRole('link', { name: /kommt zu Ihnen/ });
  for (const karte of [hero, aufgabe, besuch]) expect(await schatten(karte)).not.toBe('none');
  // Listen bleiben Linie, die Notfallkarte ist eine ruhige Fläche.
  expect(await schatten(page.getByRole('list').first())).toBe('none');
  expect(await schatten(page.getByRole('note'))).toBe('none');

  expect((await aufgabe.boundingBox())!.height).toBeGreaterThanOrEqual(80);
  const marke = page.getByRole('link', { name: 'Übungen beginnen' });
  expect((await marke.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  const abschnitt = page.getByRole('heading', { level: 2, name: 'Heute' });
  expect(await abschnitt.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
});

async function gedrueckt(page: Page, ziel: Locator): Promise<string> {
  // `hover` rollt das Ziel ins Bild und stellt die Maus in seine Mitte.
  await ziel.hover();
  await page.mouse.down();
  // Die Bewegung dauert 120 ms.
  await page.waitForTimeout(250);
  const masstab = await ziel.evaluate((el) => getComputedStyle(el).scale);
  await page.mouse.up();
  return masstab;
}

test('gibt beim Drücken nach - bei „Bewegung reduzieren“ nur die Fläche (DR-117)', async ({
  page,
}) => {
  await oeffne(page, 375);
  const aufgabe = page.getByRole('link', { name: /^Eine kleine Gewohnheit/ });
  expect(await gedrueckt(page, aufgabe)).toBe('0.98');
  const zeile = page.getByRole('link', { name: /^Antwort der Praxis/ });
  expect(await gedrueckt(page, zeile)).toBe('0.98');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await oeffne(page, 375);
  expect(['none', '1']).toContain(await gedrueckt(page, aufgabe));
});
