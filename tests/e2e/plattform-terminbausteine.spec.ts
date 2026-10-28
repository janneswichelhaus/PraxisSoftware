import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Bausteine der Termine im Browser: was jsdom nicht misst, also Schrift und Ziele in Pixeln,
 * Wörter, die nie brechen, axe und kein waagerechtes Rollen bei 375, 1280, 188 px und „Sehr groß“.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-terminbausteine.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function oeffne(page: Page, breite: number, schrift?: 'sehr-gross') {
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(schrift ? `${PRUEFSEITE}?schrift=${schrift}` : PRUEFSEITE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bausteine der Termine' }),
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

/**
 * Bedienelemente unter 44 px Höhe. Der Titel der Hero-Karte zählt nicht
 * selbst: Sein `::after` deckt die ganze Karte (eigener Test).
 */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const ziel of document.querySelectorAll<HTMLElement>('main a, main button')) {
      if (ziel.classList.contains('hero-ziel')) continue;
      const box = ziel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5) {
        funde.push(`${Math.round(box.height)}px: ${(ziel.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return funde;
  });
}

/**
 * Wörter, die über zwei Zeilen brechen, in Statuszeichen, Knöpfen und den Zeilen mit Tag, Namen und
 * Anschrift; ein zusammengesetzter Name bricht höchstens nach seinem Bindestrich.
 */
async function gebrocheneWoerter(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const ziele = document.querySelectorAll<HTMLElement>(
      'main .rounded-pill, main button, main a, main li, main section[aria-label], [data-testid="enge-zeile"]',
    );
    for (const ziel of ziele) {
      const gehen = document.createTreeWalker(ziel, NodeFilter.SHOW_TEXT);
      for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
        const text = knoten.textContent ?? '';
        // Nach einem Bindestrich darf eine Zeile enden („Mustermann-“).
        for (const fund of text.matchAll(/[^\s-]+-?/g)) {
          const bereich = document.createRange();
          bereich.setStart(knoten, fund.index);
          bereich.setEnd(knoten, fund.index + fund[0].length);
          const zeilen = new Set([...bereich.getClientRects()].map((r) => Math.round(r.top)));
          if (zeilen.size > 1) funde.push(fund[0]);
        }
      }
    }
    return funde;
  });
}

/**
 * Text, der über den Rand eines Elements ohne sichtbaren Überlauf hinausragt, etwa eine Rufnummer
 * bei 200 %; ausgeblendete Zeichen wie das Laufrad der Hero-Karte dürfen angeschnitten sein.
 */
async function angeschnitten(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const gehen = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
    for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
      const text = knoten.textContent?.trim();
      const element = knoten.parentElement;
      if (!text || !element || element.closest('.sr-only, [aria-hidden="true"]')) continue;
      let rahmen = element.parentElement;
      while (rahmen && getComputedStyle(rahmen).overflowX === 'visible') {
        rahmen = rahmen.parentElement;
      }
      if (!rahmen || rahmen === document.body) continue;
      const grenze = rahmen.getBoundingClientRect();
      const bereich = document.createRange();
      bereich.selectNodeContents(knoten);
      for (const r of bereich.getClientRects()) {
        if (r.width > 0 && (r.right > grenze.right + 1 || r.left < grenze.left - 1)) {
          funde.push(`${text.slice(0, 40)} (${Math.round(r.right)} > ${Math.round(grenze.right)})`);
          break;
        }
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

test.describe('Bausteine der Termine (Schritt 3a)', () => {
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
    [188, undefined],
    [375, 'sehr-gross'],
  ] as const) {
    test(`bei ${breite} px${schrift ? ' und „Sehr groß“' : ' (200 %)'}: kein Rollen, kein Wort bricht in Zeichen und Knöpfen (BEF-220)`, async ({
      page,
    }) => {
      await oeffne(page, breite, schrift);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await gebrocheneWoerter(page)).toEqual([]);
      expect(await angeschnitten(page), 'angeschnitten').toEqual([]);
    });
  }

  test('Hero: die ganze Karte führt zum Termin, der Fokus umrandet sie', async ({ page }) => {
    await oeffne(page, 375);
    const titel = page.getByRole('link', { name: /^Besuch am / });
    const karte = page.getByRole('region', { name: /^Besuch am / });
    await expect(karte).toContainText('Testweg 7, 72072 Tübingen');
    // Unten rechts in der Karte, weit weg vom Titel.
    await karte.scrollIntoViewIfNeeded();
    const box = await karte.boundingBox();
    if (!box) throw new Error('Karte ohne Maße');
    await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
    await expect(page.getByTestId('ziel')).toHaveText(/^\/p\/termine\/cccccccc-/);

    await oeffne(page, 375);
    await page.keyboard.press('Tab');
    await expect(titel).toBeFocused();
    await expect(karte).toHaveCSS('outline-width', '3px');
  });

  test('Terminzeile: Name mit Zustand, gedämpft vorbei, bei „Sehr groß“ gestapelt', async ({
    page,
  }) => {
    await oeffne(page, 375);
    const kommende = page.getByRole('list', { name: 'Weitere Termine' });
    const erste = kommende.getByRole('link').first();
    await expect(erste).toHaveAccessibleName(/, Praxis · Jannes Test, Änderung angefragt$/);
    expect((await erste.boundingBox())?.height).toBeGreaterThanOrEqual(80);
    await expect(
      page
        .getByRole('list', { name: 'Vergangene Termine' })
        .getByText(/^Samstag|^Sonntag|^Montag|^Dienstag|^Mittwoch|^Donnerstag|^Freitag/)
        .first(),
    ).toHaveClass(/text-ink-muted/);

    await oeffne(page, 375, 'sehr-gross');
    const zeile = page.getByRole('list', { name: 'Weitere Termine' }).getByRole('link').first();
    const kreis = await zeile.locator('span[aria-hidden="true"]').first().boundingBox();
    const tag = await zeile
      .getByText(/, \d+\./)
      .first()
      .boundingBox();
    if (!kreis || !tag) throw new Error('Zeile ohne Maße');
    expect(kreis.y + kreis.height).toBeLessThanOrEqual(tag.y);
  });

  test('Tage: Montag bis Freitag in fünf Spalten, unter 23rem drei; Satz zählt mit', async ({
    page,
  }) => {
    await oeffne(page, 375);
    const tage = page.getByRole('group', { name: 'An welchen Tagen?' });
    const montag = tage.getByRole('button', { name: 'Montag' });
    expect((await montag.boundingBox())?.width).toBeGreaterThan(60);
    await montag.click();
    await tage.getByRole('button', { name: 'Mittwoch' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Montag oder Mittwoch – bis ' }),
    ).toBeVisible();

    await oeffne(page, 188);
    const schmal = page.getByRole('group', { name: 'An welchen Tagen?' }).getByRole('button');
    const erste = await schmal.nth(0).boundingBox();
    const vierte = await schmal.nth(3).boundingBox();
    if (!erste || !vierte) throw new Error('Tage ohne Maße');
    // Der vierte Tag beginnt eine neue Reihe.
    expect(vierte.y).toBeGreaterThan(erste.y);
  });

  test('Wahlflächen: „Egal“ nimmt die anderen zurück und umgekehrt, 64 hoch', async ({ page }) => {
    await oeffne(page, 375);
    const gruppe = page.getByRole('group', { name: 'Zu welcher Tageszeit?' });
    const vormittag = gruppe.getByRole('button', { name: 'Vormittag' });
    const egal = gruppe.getByRole('button', { name: 'Egal' });
    expect((await vormittag.boundingBox())?.height).toBeGreaterThanOrEqual(64);
    await vormittag.click();
    await expect(vormittag).toHaveAttribute('aria-pressed', 'true');
    await egal.click();
    await expect(egal).toHaveAttribute('aria-pressed', 'true');
    await expect(vormittag).toHaveAttribute('aria-pressed', 'false');
    await gruppe.getByRole('button', { name: 'Mittag', exact: true }).click();
    await expect(egal).toHaveAttribute('aria-pressed', 'false');
  });

  test('Fragen: „Praxis anrufen“ wählt die Nummer, am vergangenen Termin als Hauptknopf 60 hoch', async ({
    page,
  }) => {
    await oeffne(page, 375);
    const kommend = page.getByRole('group', { name: 'Kommend, mit Rufnummer' });
    await expect(kommend.getByRole('link', { name: /Praxis anrufen/ })).toHaveAttribute(
      'href',
      'tel:+4970710000000',
    );
    const vergangen = page.getByRole('group', { name: 'Vergangen, mit Rufnummer' });
    const hauptknopf = vergangen.getByRole('link', { name: /Praxis anrufen/ });
    expect((await hauptknopf.boundingBox())?.height).toBeGreaterThanOrEqual(60);
    await expect(vergangen.getByRole('listitem')).toHaveCount(1);
    const ohne = page.getByRole('group', { name: 'Ohne Rufnummer' });
    await expect(ohne.getByRole('link', { name: /Praxis anrufen/ })).toHaveCount(0);
    await expect(ohne.getByRole('link', { name: 'Der Praxis schreiben' })).toBeVisible();
  });
});
