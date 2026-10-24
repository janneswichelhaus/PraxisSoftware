import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Bausteine der Übungen im echten Browser (Schritt 2a, Handoff
 * 2026-10-24; `docs/design/PLATTFORM.md`).
 *
 * Die Komponententests prüfen Rollen, Namen, Wortlaute und die Uhr der Pause.
 * Hier geht es um das, was jsdom nicht misst: Schrift und Ziele in Pixeln,
 * die Wochenleiste ohne Abstand und unter 23rem als Raster, der Ring ohne
 * Zahl und bei „Bewegung reduzieren“ still, die Trennung nur unter 23rem,
 * axe und kein waagerechtes Rollen bei 375, 1280 und 188 px (200 %) und bei
 * „Sehr groß“.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-uebungsbausteine.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function oeffne(page: Page, breite: number, schrift?: 'sehr-gross') {
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(schrift ? `${PRUEFSEITE}?schrift=${schrift}` : PRUEFSEITE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bausteine der Übungen' }),
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

async function box(ort: Locator) {
  const masse = await ort.boundingBox();
  if (!masse) throw new Error('Kein Kasten: Element nicht sichtbar.');
  return masse;
}

const wochenleiste = (page: Page) =>
  page.getByRole('group', { name: 'Ihre Übungstage' }).first().getByRole('button');

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
  // Name und Hauptzahl der Bühne wachsen mit (rem): 26 wird 32,5, 48 wird 60.
  const name = page.getByRole('heading', { level: 2, name: 'Mit Halt leicht in die Knie gehen' });
  expect(await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(
    32,
  );
  const zahl = page.getByText('8 bis 12', { exact: true });
  expect(await zahl.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(
    59,
  );
  // Die Wochenleiste bleibt bei „Sehr groß“ eine Reihe.
  const tage = wochenleiste(page);
  expect((await box(tage.nth(0))).y).toBeCloseTo((await box(tage.nth(6))).y, 0);
});

test('hält die Ziele groß: Durchgänge, Hauptknopf, Kopf, Wochenleiste ohne Abstand', async ({
  page,
}) => {
  await oeffne(page, 375);
  expect(
    (await box(page.getByRole('button', { name: /^1\. Durchgang/ }))).height,
  ).toBeGreaterThanOrEqual(64);
  expect(
    (await box(page.getByRole('button', { name: /^2\. Durchgang Pause/ }))).height,
  ).toBeGreaterThanOrEqual(76);
  expect(
    (await box(page.getByRole('button', { name: 'Nächste Übung' }).first())).height,
  ).toBeGreaterThanOrEqual(56);
  for (const name of ['Zurück', 'Später weiter']) {
    expect((await box(page.getByRole('button', { name }).first())).height).toBeGreaterThanOrEqual(
      48,
    );
  }
  const tage = wochenleiste(page);
  for (let i = 0; i < 7; i += 1) {
    const zelle = await box(tage.nth(i));
    expect(zelle.height, `Tag ${i + 1}`).toBeGreaterThanOrEqual(56);
    expect(zelle.width, `Tag ${i + 1}`).toBeGreaterThanOrEqual(44);
    if (i > 0) {
      // Aneinander: Jede Zelle beginnt, wo die vorige endet (ANN-708).
      const vorige = await box(tage.nth(i - 1));
      expect(Math.abs(zelle.x - (vorige.x + vorige.width))).toBeLessThan(1.5);
    }
  }
});

test('wird unter 23rem ein Raster mit Abstand und trennt nur dort Namen (ANN-707, ANN-708)', async ({
  page,
}) => {
  await oeffne(page, 375);
  const name = page.getByRole('heading', { name: 'Kniebeuge mit Halt am Treppengeländer' });
  expect(await name.evaluate((el) => getComputedStyle(el).hyphens)).toBe('manual');

  await oeffne(page, 188);
  expect(await name.evaluate((el) => getComputedStyle(el).hyphens)).toBe('auto');
  // Knöpfe trennen nie.
  const knopf = page.getByRole('button', { name: 'Nächste Übung' }).first();
  expect(await knopf.evaluate((el) => getComputedStyle(el).hyphens)).toBe('manual');
  const tage = wochenleiste(page);
  const erster = await box(tage.nth(0));
  const zweiter = await box(tage.nth(1));
  const vierter = await box(tage.nth(3));
  expect(erster.height).toBeGreaterThanOrEqual(48);
  expect(erster.width).toBeGreaterThanOrEqual(48);
  expect(zweiter.x - (erster.x + erster.width)).toBeGreaterThanOrEqual(7.5);
  // Drei Spalten: Donnerstag beginnt die zweite Reihe.
  expect(vierter.y).toBeGreaterThan(erster.y + erster.height);
  expect(vierter.x).toBeCloseTo(erster.x, 0);
});

test('füllt den Ring ohne Zahl - bei „Bewegung reduzieren“ steht er gestrichelt still', async ({
  page,
}) => {
  await oeffne(page, 375);
  const zeile = page.getByRole('button', { name: /^2\. Durchgang Pause/ });
  const fuellung = zeile.locator('[data-pausenring] .pausenring-fuellung');
  await expect(fuellung).toHaveCount(1);
  expect(await fuellung.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'pausenring-fuellen',
  );
  // Keine Ziffer zählt herunter: In der Zeile steht nur die Pause selbst.
  await expect(zeile).toHaveText(/^2\. Durchgang\s*Pause · 600 Sekunden\s*$/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await oeffne(page, 375);
  const still = page
    .getByRole('button', { name: /^2\. Durchgang Pause/ })
    .locator('[data-pausenring] .pausenring-fuellung');
  expect(await still.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await still.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toMatch(/^119/);
});

test('hält Abstände und Fokus, die das Design-Review gemessen hat', async ({ page }) => {
  await oeffne(page, 375);
  // Zwischen Hauptknopf und leisem Zweitweg mindestens 8 px (PLATTFORM.md, Ziele).
  const gespeichert = page.getByRole('group', { name: 'Gespeichert', exact: true });
  const haupt = await box(gespeichert.getByRole('link', { name: 'Zur Übersicht' }));
  const leise = await box(gespeichert.getByRole('link', { name: 'Zu den Übungen' }));
  expect(leise.y - (haupt.y + haupt.height)).toBeGreaterThanOrEqual(7.5);

  // Ohne Stand beginnt der Knopf 12 px unter der Linie des Fußes, nicht 24.
  const abstand = await page
    .getByRole('group', { name: 'Abschluss' })
    .getByRole('button', { name: 'Einheit beenden' })
    .evaluate((knopf) => {
      let fuss: HTMLElement | null = knopf.parentElement;
      while (fuss && parseFloat(getComputedStyle(fuss).borderTopWidth) === 0) {
        fuss = fuss.parentElement;
      }
      if (!fuss) return -1;
      return knopf.getBoundingClientRect().top - fuss.getBoundingClientRect().top;
    });
  expect(abstand).toBeGreaterThan(11);
  expect(abstand).toBeLessThan(14);

  // Auf einem gewählten Tag ist der Fokusring Papier, nicht Tinte auf der Hauptfarbe.
  const montag = wochenleiste(page).nth(0);
  await montag.focus();
  // Papier ist oklch(100% 0 0); Chromium schreibt den Ring als oklab oder rgb aus.
  expect(await montag.evaluate((el) => getComputedStyle(el).outlineColor)).toMatch(
    /^(?:okl(?:ab|ch)\(1 0 0\)|rgb\(255, 255, 255\))$/,
  );
});

test('stellt den Kopf am Rechner in eine Reihe: Zurück, Balken, Später weiter', async ({
  page,
}) => {
  await oeffne(page, 1280);
  const rahmen = page.getByRole('group', { name: 'Übung 2 von 3, übertragen' });
  const zurueck = await box(rahmen.getByRole('button', { name: 'Zurück' }));
  const spaeter = await box(rahmen.getByRole('button', { name: 'Später weiter' }));
  const stand = await box(rahmen.getByText('Übung 2 von 3'));
  const mitte = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(mitte(stand) - mitte(zurueck))).toBeLessThan(8);
  expect(Math.abs(mitte(spaeter) - mitte(zurueck))).toBeLessThan(8);
  expect(stand.x).toBeGreaterThan(zurueck.x + zurueck.width);
  expect(spaeter.x).toBeGreaterThan(stand.x + stand.width);
});
