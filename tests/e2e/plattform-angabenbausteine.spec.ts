import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Bausteine der Selbstauskunft im Browser: Skala in gleich langen Reihen bei 375, 188 px und
 * „Sehr groß“, eine Reihe am Rechner; dazu Schrift, Ziele, axe und kein waagerechtes Rollen.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-angabenbausteine.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function oeffne(page: Page, breite: number, schrift?: 'sehr-gross') {
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(schrift ? `${PRUEFSEITE}?schrift=${schrift}` : PRUEFSEITE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bausteine der Selbstauskunft' }),
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

async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const ziel of document.querySelectorAll<HTMLElement>('main a, main button')) {
      const box = ziel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5 || box.width < 43.5) {
        funde.push(
          `${Math.round(box.width)}×${Math.round(box.height)}: ${ziel.textContent?.trim()}`,
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

/** Die Kästen der elf Stufen der ersten Skala. */
async function stufen(page: Page) {
  const gruppe = page.getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
  const boxen = [];
  for (const knopf of await gruppe.getByRole('button').all()) {
    const box = await knopf.boundingBox();
    if (!box) throw new Error('Stufe ohne Maße');
    boxen.push(box);
  }
  return boxen;
}

const rechts = (b: { x: number; width: number }) => b.x + b.width;

/** „heute“ steht mittig unter dem heutigen Tag, bei 188 px in dessen Spalte des Rasters aus drei. */
async function mitteUnterHeute(page: Page) {
  const tag = await page
    .getByRole('button', { name: 'heute, Donnerstag, 29. Oktober' })
    .boundingBox();
  const marke = page.locator('[aria-hidden="true"] span:visible', { hasText: 'heute' });
  await expect(marke).toHaveCount(1);
  const box = await marke.boundingBox();
  expect(box!.y).toBeGreaterThan(tag!.y + tag!.height);
  expect(Math.abs(box!.x + box!.width / 2 - (tag!.x + tag!.width / 2))).toBeLessThan(2);
}

test.describe('Bausteine der Selbstauskunft (Schritt 4a)', () => {
  for (const breite of [375, 1280]) {
    test(`bei ${breite} px: Schrift, Ziele, axe, kein waagerechtes Rollen`, async ({ page }) => {
      await oeffne(page, breite);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);
    });
  }

  for (const [breite, schrift] of [
    [375, undefined],
    [375, 'sehr-gross'],
  ] as const) {
    test(`Skala bei ${breite} px${schrift ? ' und „Sehr groß“' : ''}: zwei gleich lange Reihen 0–5 und 6–10`, async ({
      page,
    }) => {
      await oeffne(page, breite, schrift);
      const b = await stufen(page);
      expect(b).toHaveLength(11);
      expect(new Set(b.slice(0, 6).map((s) => Math.round(s.y))).size).toBe(1);
      expect(new Set(b.slice(6).map((s) => Math.round(s.y))).size).toBe(1);
      expect(b[6]!.y).toBeGreaterThan(b[0]!.y);
      expect(Math.abs(b[0]!.x - b[6]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(rechts(b[5]!) - rechts(b[10]!))).toBeLessThanOrEqual(1);
      for (const s of b) expect(s.height).toBeGreaterThanOrEqual(schrift ? 69 : 55);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('Skala bei 188 px (200 %): drei je Reihe, 9 und 10 zusammen, Abstand 8', async ({
    page,
  }) => {
    await oeffne(page, 188);
    const b = await stufen(page);
    const reihen = new Set(b.map((s) => Math.round(s.y)));
    expect(reihen.size).toBe(4);
    expect(Math.abs(rechts(b[2]!) - rechts(b[10]!))).toBeLessThanOrEqual(1);
    expect(Math.round(b[1]!.x - rechts(b[0]!))).toBeGreaterThanOrEqual(8);
    for (const s of b) expect(s.width).toBeGreaterThanOrEqual(44);
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await kleineSchrift(page)).toEqual([]);
  });

  test('Skala am Rechner: eine Reihe', async ({ page }) => {
    await oeffne(page, 1280);
    const b = await stufen(page);
    expect(new Set(b.map((s) => Math.round(s.y))).size).toBe(1);
  });

  test('ein zweiter Tipp nimmt zurück; ja und nein bleiben bei „Sehr groß“ nebeneinander', async ({
    page,
  }) => {
    await oeffne(page, 375, 'sehr-gross');
    const vier = page
      .getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' })
      .getByRole('button', { name: '4' });
    await vier.click();
    await expect(vier).toHaveAttribute('aria-pressed', 'true');
    await vier.click();
    await expect(vier).toHaveAttribute('aria-pressed', 'false');
    const ja = await page.getByRole('button', { name: 'ja', exact: true }).boundingBox();
    const nein = await page.getByRole('button', { name: 'nein', exact: true }).boundingBox();
    expect(Math.round(ja!.y)).toBe(Math.round(nein!.y));
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('Tage einer Gewohnheit: Datum, Haken, „heute“ unter dem letzten Tag', async ({ page }) => {
    await oeffne(page, 375);
    const gruppe = page.getByRole('group', {
      name: 'Nach dem Zähneputzen: zwei Minuten Mobilität',
    });
    const freitag = gruppe.getByRole('button', { name: 'Freitag, 23. Oktober' });
    await expect(freitag).toHaveAttribute('aria-pressed', 'false');
    await expect(freitag).toContainText('23');
    expect((await freitag.boundingBox())!.height).toBeGreaterThanOrEqual(72);
    await freitag.click();
    await expect(freitag).toHaveAttribute('aria-pressed', 'true');
    await mitteUnterHeute(page);
    await page.setViewportSize({ width: 188, height: 900 });
    await mitteUnterHeute(page);
    expect(await ueberlaeuft(page)).toBe(false);
  });
});
