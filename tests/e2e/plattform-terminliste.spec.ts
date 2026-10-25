import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Liste der Termine im echten Browser (Schritt 3b; Handoff 2026-10-24
 * „Termine“, 5.1, 5.5, 5.6 und 8): jede Lage bei 375 px mit Schrift, Zielen,
 * axe und höchstens einem Hauptknopf; bei 188 px (200 %) und „Sehr groß“
 * ohne Rollen, ohne Bruch im Wort und ohne angeschnittenen Text; am Rechner
 * zwei Spalten. Die Wörter prüfen die Komponententests (`Termine.test.tsx`).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** Jede Lage der Liste mit ihrem Hauptknopf - in der Lesefrist und mit Wunsch keiner. */
const LAGEN: { seite: string; hauptknopf: string | null }[] = [
  { seite: 'termine', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-heute', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-absage-angefragt', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-leer', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-nur-wunsch', hauptknopf: null },
  { seite: 'termine-lesefrist', hauptknopf: null },
  { seite: 'termine-fehler', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-training', hauptknopf: 'Termin wünschen' },
  { seite: 'termine-begleitung', hauptknopf: 'Termin wünschen' },
];

async function oeffne(page: Page, seite: string, breite: number, schrift?: 'sehr-gross') {
  if (schrift) {
    await page.addInitScript((wert) => {
      window.localStorage.setItem('plattform-schriftgroesse', wert);
    }, schrift);
  }
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(`${PRUEFSEITE}?seite=${seite}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Termine' })).toBeVisible();
  // Liste oder Fehler stehen - das Skelett ist eine eigene Prüfung.
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
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
    const gehen = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
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

/** Bedienelemente unter 44 px Höhe; der Titel der Hero-Karte deckt die ganze Karte. */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const ziel of document.querySelectorAll<HTMLElement>(
      'main a, main button, main summary',
    )) {
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

/** Die Hauptknöpfe (`primary`) im Inhalt - je Ansicht höchstens einer (Handoff 8). */
async function hauptknoepfe(page: Page): Promise<string[]> {
  return page
    .locator('main a.bg-accent, main button.bg-accent')
    .evaluateAll((knoepfe) => knoepfe.map((k) => (k.textContent ?? '').trim()));
}

/**
 * Wörter, die über zwei Zeilen brechen - in Statuszeichen, Knöpfen und den
 * Zeilen der Listen (BEF-220, DR-114). Nach einem Bindestrich darf eine
 * Zeile enden („Mustermann-“).
 */
async function gebrocheneWoerter(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const ziele = document.querySelectorAll<HTMLElement>(
      'main .rounded-pill, main button, main a, main li, main summary',
    );
    for (const ziel of ziele) {
      const gehen = document.createTreeWalker(ziel, NodeFilter.SHOW_TEXT);
      for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
        if (knoten.parentElement?.closest('.sr-only')) continue;
        const text = knoten.textContent ?? '';
        for (const fund of text.matchAll(/[^\s-]+-?/g)) {
          const bereich = document.createRange();
          bereich.setStart(knoten, fund.index);
          bereich.setEnd(knoten, fund.index + fund[0].length);
          const zeilen = new Set([...bereich.getClientRects()].map((r) => Math.round(r.top)));
          if (zeilen.size > 1) funde.push(fund[0]);
        }
      }
    }
    return [...new Set(funde)];
  });
}

/** Text, der über den Rand eines Elements ragt, das nicht überlaufen darf. */
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
          funde.push(text.slice(0, 40));
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

test.describe('Liste der Termine (Schritt 3b)', () => {
  for (const { seite, hauptknopf } of LAGEN) {
    test(`${seite} bei 375 px: Schrift, Ziele, axe, höchstens ein Hauptknopf`, async ({ page }) => {
      await oeffne(page, seite, 375);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      expect(await hauptknoepfe(page)).toEqual(hauptknopf ? [hauptknopf] : []);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);
    });

    for (const [breite, schrift] of [
      [188, undefined],
      [375, 'sehr-gross'],
    ] as const) {
      test(`${seite} bei ${breite} px${schrift ? ' und „Sehr groß“' : ' (200 %)'}: kein Rollen, kein Bruch im Wort, nichts angeschnitten`, async ({
        page,
      }) => {
        await oeffne(page, seite, breite, schrift);
        // Auch das Vergangene: aufgeklappt, wo es auf Abruf steht.
        const vergangen = page.locator('main summary', { hasText: 'Vergangene Termine' });
        if ((await vergangen.count()) > 0) await vergangen.click();
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await gebrocheneWoerter(page), 'gebrochene Wörter').toEqual([]);
        expect(await angeschnitten(page), 'angeschnitten').toEqual([]);
      });
    }
  }

  test('Laden: Skelett ohne bedienbaren Knopf, für Vorlesesoftware ein Satz (DR-136)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=termine-laden`);
    await expect(page.getByRole('heading', { level: 1, name: 'Termine' })).toBeVisible();
    const skelett = page.locator('main [aria-busy="true"]');
    await expect(skelett).toContainText('Termine werden geladen');
    await expect(skelett.locator('[data-skelett="hero-termin"]')).toBeVisible();
    expect((await skelett.locator('[data-skelett="hero-termin"]').boundingBox())?.height).toBe(300);
    await expect(page.locator('main a, main button')).toHaveCount(0);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
  });

  test('der nächste Termin führt als ganze Karte zur Seite des Termins', async ({ page }) => {
    await oeffne(page, 'termine', 375);
    const karte = page.getByRole('region', { name: /^Besuch / });
    await expect(karte).toContainText('Ihr nächster Besuch');
    await expect(karte).toContainText('Testweg 7, 72072 Tuebingen');
    const box = await karte.boundingBox();
    if (!box) throw new Error('Karte ohne Maße');
    // Unten rechts in der Karte, weit weg vom Titel. Die Prüfseite führt im
    // Speicher; bis zur Seite des Termins (3c) öffnet dort der Ablauf.
    await page.mouse.click(box.x + box.width - 16, box.y + box.height - 16);
    await expect(page.getByRole('dialog', { name: 'Was möchten Sie?' })).toBeVisible();
  });

  test('„Weitere Termine“ mit Zustand, Vergangenes gedämpft auf Abruf, jede Zeile mit Ziel', async ({
    page,
  }) => {
    await oeffne(page, 'termine', 375);
    const weitere = page.getByRole('list', { name: 'Weitere Termine' });
    await expect(weitere.getByRole('link')).toHaveCount(1);
    await expect(weitere.getByRole('link')).toHaveAccessibleName(/, Änderung angefragt$/);
    expect((await weitere.getByRole('link').boundingBox())?.height).toBeGreaterThanOrEqual(80);
    // Der Knopf unter den kommenden Terminen, mit dem Daumen erreichbar.
    const knopf = page.getByRole('link', { name: 'Termin wünschen' });
    expect((await knopf.boundingBox())?.y ?? 0).toBeGreaterThan(
      (await weitere.boundingBox())?.y ?? 0,
    );
    await page.locator('main summary', { hasText: 'Vergangene Termine' }).click();
    const vergangene = page.getByRole('list', { name: 'Vergangene Termine' });
    await expect(vergangene.getByRole('link')).toHaveCount(2);
    await expect(vergangene).toContainText('durchgeführt');
    await expect(vergangene).toContainText('abgesagt');
  });

  test('ohne Netz bleibt alles lesbar, „Termin wünschen“ ist gesperrt, mit Satz (Frage 4)', async ({
    page,
    context,
  }) => {
    await oeffne(page, 'termine', 375);
    await context.setOffline(true);
    const knopf = page.getByRole('button', { name: 'Termin wünschen' });
    await expect(knopf).toBeDisabled();
    await expect(knopf).toHaveAccessibleDescription(
      'Wünschen, Ändern und Absagen gehen wieder mit Verbindung.',
    );
    await expect(knopf).toHaveCSS('border-style', 'dashed');
    // Auch Zurückziehen wartet auf die Verbindung - mit demselben Satz.
    const zurueck = page.getByRole('button', { name: 'Wunsch zurückziehen' });
    await expect(zurueck).toBeDisabled();
    await expect(zurueck).toHaveAccessibleDescription(
      'Wünschen, Ändern und Absagen gehen wieder mit Verbindung.',
    );
    await expect(page.getByRole('list', { name: 'Weitere Termine' })).toBeVisible();
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    await context.setOffline(false);
    await expect(page.getByRole('link', { name: 'Termin wünschen' })).toBeVisible();
  });

  test('Lesefrist: der Satz über dem Titel, das Vergangene offen, kein Knopf (Frage 5)', async ({
    page,
  }) => {
    await oeffne(page, 'termine-lesefrist', 375);
    const satz = page.getByRole('status').filter({ hasText: 'Sie können hier noch bis' });
    const titel = page.getByRole('heading', { level: 1, name: 'Termine' });
    expect((await satz.boundingBox())?.y ?? 0).toBeLessThan((await titel.boundingBox())?.y ?? 0);
    await expect(
      page.getByText('Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Vergangene Termine' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Vergangene Termine' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Termin wünschen/ })).toHaveCount(0);
  });

  for (const schrift of [undefined, 'sehr-gross'] as const) {
    test(`bei 1024 px${schrift ? ' und „Sehr groß“ eine Spalte' : ' zwei Spalten, die Liste geht vor'}: ohne Rollen, ohne Bruch im Wort (H2)`, async ({
      page,
    }) => {
      await oeffne(page, 'termine', 1024, schrift);
      await page.locator('main summary', { hasText: 'Vergangene Termine' }).click();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await gebrocheneWoerter(page), 'gebrochene Wörter').toEqual([]);
      expect(await angeschnitten(page), 'angeschnitten').toEqual([]);
      const karte = await page.getByRole('region', { name: /^Besuch / }).boundingBox();
      const liste = await page.getByRole('list', { name: 'Weitere Termine' }).boundingBox();
      if (!karte || !liste) throw new Error('ohne Maße');
      if (schrift) {
        // Untereinander: erst die Karte, dann die Listen, beide gleich breit.
        expect(liste.y).toBeGreaterThan(karte.y + karte.height);
        expect(Math.abs(liste.width - karte.width)).toBeLessThanOrEqual(1);
      } else {
        // Nebeneinander, die Liste mindestens 520 breit (32.5rem).
        expect(karte.x).toBeGreaterThan(liste.x + liste.width);
        expect(liste.width).toBeGreaterThanOrEqual(519.5);
      }
    });
  }

  test('über zwei Spalten reicht die Rückmeldung nach dem Senden über beide (H8)', async ({
    page,
  }) => {
    await oeffne(page, 'termine-gesendet', 1280);
    const meldung = await page
      .getByText('Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.')
      .boundingBox();
    const raster = await page.locator('[data-spalten="zwei"]').boundingBox();
    if (!meldung || !raster) throw new Error('ohne Maße');
    expect(meldung.x + meldung.width).toBeGreaterThan(raster.x + raster.width - 48);
  });

  test('Begleitung: die Anschrift der Person; Training: Zeilen mit Hantel und Video', async ({
    page,
  }) => {
    await oeffne(page, 'termine-begleitung', 375);
    await expect(page.getByRole('region', { name: /^Besuch / })).toContainText(
      'Lindenweg 3, 72070 Tübingen',
    );
    await oeffne(page, 'termine-training', 375);
    const weitere = page.getByRole('list', { name: 'Weitere Termine' });
    await expect(weitere.getByRole('link')).toHaveCount(2);
    await expect(weitere.getByRole('link').first()).toHaveAccessibleName(/Video/);
    await expect(weitere.getByRole('link').last()).toHaveAccessibleName(/Training/);
  });

  test('Absage zum nächsten Termin angefragt: die Karte bleibt, der Wunsch steht darunter', async ({
    page,
  }) => {
    await oeffne(page, 'termine-absage-angefragt', 375);
    await expect(page.getByRole('region', { name: /^Besuch / })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Ihre Wünsche' })).toContainText(
      /Absage für .*angefragt/,
    );
  });

  test('am Rechner: Hero und Knopf rechts, die Listen links; ohne Termin eine Spalte', async ({
    page,
  }) => {
    await oeffne(page, 'termine', 1280);
    const karte = await page.getByRole('region', { name: /^Besuch / }).boundingBox();
    const weitere = await page.getByRole('heading', { name: 'Weitere Termine' }).boundingBox();
    const knopf = await page.getByRole('link', { name: 'Termin wünschen' }).boundingBox();
    if (!karte || !weitere || !knopf) throw new Error('ohne Maße');
    expect(karte.x).toBeGreaterThan(weitere.x + 400);
    expect(Math.abs(karte.y - weitere.y)).toBeLessThanOrEqual(24);
    expect(karte.width).toBeGreaterThanOrEqual(339.5);
    expect(karte.width).toBeLessThanOrEqual(460.5);
    // Der Knopf unter der Karte in ihrer ganzen Breite.
    expect(Math.abs(knopf.width - karte.width)).toBeLessThanOrEqual(1);
    expect(knopf.y).toBeGreaterThan(karte.y + karte.height);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);

    await oeffne(page, 'termine-leer', 1280);
    await expect(page.getByText('Zurzeit ist kein Termin vereinbart.')).toBeVisible();
    const spalte = await page.locator('main .max-w-spalte').first().boundingBox();
    const knopfLeer = await page.getByRole('link', { name: 'Termin wünschen' }).boundingBox();
    expect(spalte?.width ?? 0).toBeLessThanOrEqual(768.5);
    // In einer Spalte so breit wie sein Text.
    expect(knopfLeer?.width ?? 0).toBeLessThan(400);
  });
});
