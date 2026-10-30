import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Liste und Seite des Termins im echten Browser: jede Lage bei 375 px mit Schrift, Zielen, axe und
 * höchstens einem Hauptknopf; bei 188 px (200 %) und „Sehr groß“ ohne Rollen, ohne Bruch im Wort,
 * nichts angeschnitten; am Rechner zwei Spalten bzw. die Knöpfe nebeneinander.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
/**
 * Feste Uhr: Die Prüfseite rechnet die Termine ab heute, sonst wechseln Tag und Zeilenbruch täglich.
 * An diesem Tag lief „Freitag, 28. August“ in der CI über die Karte.
 */
const HEUTE = new Date('2026-10-30T08:00:00Z');
/** Der Titel der Seite eines Termins: der Tag in Worten. */
const TAG = /^(Heute|Morgen|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /;

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

/** Jede Lage der Seite eines Termins mit ihrem Hauptknopf - nur vergangen mit Nummer einer. */
const SEITEN: { seite: string; hauptknopf: RegExp | null }[] = [
  { seite: 'termin', hauptknopf: null },
  { seite: 'termin&kurzfristig', hauptknopf: null },
  { seite: 'termin-angefragt', hauptknopf: null },
  { seite: 'termin-vergangen', hauptknopf: /^Praxis anrufen\s+\+49 7071 0000000$/ },
  { seite: 'termin-vergangen&ohne-nummer', hauptknopf: null },
  { seite: 'termin-abgesagt', hauptknopf: null },
];

/** Die Seite eines Termins: Der Tag steht als Titel. */
async function oeffneTermin(page: Page, seite: string, breite: number, schrift?: 'sehr-gross') {
  await oeffne(page, seite, breite, schrift, TAG);
}

async function oeffne(
  page: Page,
  seite: string,
  breite: number,
  schrift?: 'sehr-gross',
  titel: string | RegExp = 'Termine',
) {
  if (schrift) {
    await page.addInitScript((wert) => {
      window.localStorage.setItem('plattform-schriftgroesse', wert);
    }, schrift);
  }
  await page.clock.setFixedTime(HEUTE);
  await page.setViewportSize({ width: breite, height: 900 });
  await page.goto(`${PRUEFSEITE}?seite=${seite}`);
  await expect(page.getByRole('heading', { level: 1, name: titel })).toBeVisible();
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
 * Wörter, die über zwei Zeilen brechen, in Statuszeichen, Knöpfen und den Zeilen der Listen
 * (ANN-765). Nach einem Bindestrich darf eine Zeile enden („Mustermann-“).
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

/**
 * Statuszeichen breiter als der Inhalt ihrer Zeile (ANN-765): Sonst wächst die Spalte darüber hinaus,
 * und je nach Schriftmaßen reicht der Tag in einer Zeile über die Karte.
 */
async function breiterAlsDieZeile(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const zeichen of document.querySelectorAll<HTMLElement>('main li .rounded-pill')) {
      const box = zeichen.getBoundingClientRect();
      if (box.width === 0) continue;
      const zeile = zeichen.closest('li > a, li')!;
      const stil = getComputedStyle(zeile);
      const rand = zeile.getBoundingClientRect();
      const links = rand.left + parseFloat(stil.paddingLeft);
      const rechts = rand.right - parseFloat(stil.paddingRight);
      if (box.left < links - 1 || box.right > rechts + 1) {
        funde.push(`${(zeichen.textContent ?? '').trim()}: ${Math.round(box.width)} px`);
      }
    }
    return funde;
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

/**
 * Steht das Ziel bei 375 px ganz im ersten Bild? Die Reiterleiste klebt unten und deckt ab, was
 * unter ihr liegt (Handlung vor Inhalt, ANN-804).
 */
async function imErstenBild(page: Page, name: string, hoehe = 667): Promise<boolean> {
  await page.setViewportSize({ width: 375, height: hoehe });
  await page.evaluate(() => window.scrollTo(0, 0));
  const ziel = await page.locator('main').getByRole('link', { name, exact: true }).boundingBox();
  const leiste = await page.locator('nav.reiterleiste').boundingBox();
  const unten = Math.min(hoehe, leiste && leiste.height > 0 ? leiste.y : hoehe);
  return ziel !== null && ziel.y >= 0 && ziel.y + ziel.height <= unten;
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
        expect(await breiterAlsDieZeile(page), 'Statuszeichen breiter als die Zeile').toEqual([]);
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
    // Unten rechts in der Karte, weit weg vom Titel.
    await page.mouse.click(box.x + box.width - 16, box.y + box.height - 16);
    await expect(page.getByRole('heading', { level: 1, name: TAG })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Termine' })).toBeVisible();
  });

  test('„Weitere Termine“ mit Zustand, Vergangenes gedämpft auf Abruf, jede Zeile mit Ziel', async ({
    page,
  }) => {
    await oeffne(page, 'termine', 375);
    const weitere = page.getByRole('list', { name: 'Weitere Termine' });
    await expect(weitere.getByRole('link')).toHaveCount(1);
    await expect(weitere.getByRole('link')).toHaveAccessibleName(/, Änderung angefragt$/);
    expect((await weitere.getByRole('link').boundingBox())?.height).toBeGreaterThanOrEqual(80);
    // Die Handlung vor dem Inhalt: der Knopf direkt unter der Hero-Karte, vor den Weiteren (ANN-804).
    const knopf = page.getByRole('link', { name: 'Termin wünschen' });
    const hero = page.getByRole('region', { name: /^Besuch / });
    expect((await knopf.boundingBox())?.y ?? 0).toBeLessThan((await weitere.boundingBox())?.y ?? 0);
    expect((await knopf.boundingBox())?.y ?? 0).toBeGreaterThan((await hero.boundingBox())?.y ?? 0);
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
    await expect(satz).toContainText(
      'Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.',
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Vergangene Termine' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Vergangene Termine' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Termin wünschen/ })).toHaveCount(0);
    // Der Satz verweist auf die Praxis: Der Anruf steht vor dem Vergangenen, ohne Rollen bei
    // 375 × 667; Schreiben nimmt die Praxis in der Lesefrist nicht mehr an (ANN-780, ANN-313).
    await page.setViewportSize({ width: 375, height: 667 });
    const anrufen = page.getByRole('link', { name: /^Praxis anrufen/ });
    await expect(anrufen).toHaveAttribute('href', 'tel:+4970710000000');
    await expect(anrufen).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Der Praxis schreiben' })).toHaveCount(0);
    const weg = await page
      .getByRole('heading', { level: 2, name: 'Die Praxis erreichen' })
      .boundingBox();
    const vergangen = await page
      .getByRole('heading', { level: 2, name: 'Vergangene Termine' })
      .boundingBox();
    expect(weg!.y).toBeLessThan(vergangen!.y);
  });

  test('Fehler: neben „Termin wünschen“ der Weg zur Praxis, etwa für eine kurzfristige Absage', async ({
    page,
  }) => {
    await oeffne(page, 'termine-fehler', 375);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Die Praxis erreichen' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /^Praxis anrufen/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Der Praxis schreiben' })).toBeVisible();
    expect(await hauptknoepfe(page)).toEqual(['Termin wünschen']);
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

  // Ein Aufklapper oder Abschnitt mit eigenem Rand zählte im Stapel doppelt (Design-Review 3b).
  // In rem, weil der Rhythmus mit „Sehr groß“ wächst: 40 und 48 px bei 16 px Schrift.
  for (const [breite, schrift, abstand] of [
    [375, undefined, 2.5],
    [1280, undefined, 3],
    [1024, 'sehr-gross', 3],
  ] as const) {
    test(`Abstand zwischen den Abschnitten bei ${breite} px${schrift ? ' und „Sehr groß“' : ''}: ${abstand}rem`, async ({
      page,
    }) => {
      await oeffne(page, 'termine', breite, schrift);
      const abstaende = await page
        .getByRole('heading', { level: 2, name: 'Weitere Termine' })
        .evaluate((titel) => {
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
          // Sichtbar ist der Inhalt einer Hülle, nicht die Hülle: ihr Rand stünde innen.
          const kante = (k: Element) =>
            (k.tagName === 'DIV' && k.children.length === 1
              ? k.children[0]!
              : k
            ).getBoundingClientRect();
          const luecken = (stapel: Element) => {
            const kinder = [...stapel.children].map(kante);
            return kinder
              .slice(1)
              .map((k, i) => Math.round(((k.top - kinder[i]!.bottom) / rem) * 100) / 100);
          };
          // Der Stapel der Listen, dazu am Rechner der Abstand zwischen Karte und Listen.
          const stapel = titel.closest('section')!.parentElement!.parentElement!;
          const raster = stapel.closest('[data-spalten="zwei"]');
          const untereinander =
            raster && getComputedStyle(raster).display === 'flex' ? luecken(raster) : [];
          return [...luecken(stapel), ...untereinander];
        });
      expect(abstaende.length).toBeGreaterThan(1);
      expect(new Set(abstaende)).toEqual(new Set([abstand]));
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

  // Mit einem Bereich bei 375 × 667, mit Bereichsschalter bei 375 × 812. Als Begleitung (Schalter,
  // Band und Name in drei Zeilen) steht der Knopf auch bei 812 erst nach kurzem Rollen.
  for (const [seite, hoehe] of [
    ['termine&ein-bereich', 667],
    ['termine-heute&ein-bereich', 667],
    ['termine-absage-angefragt&ein-bereich', 667],
    ['termine-leer&ein-bereich', 667],
    ['termine-leer', 667],
    ['termine', 812],
    ['termine-training', 812],
  ] as const) {
    test(`${seite}: „Termin wünschen“ steht bei 375 × ${hoehe} ohne Rollen unter der Hauptsache (ANN-804)`, async ({
      page,
    }) => {
      await oeffne(page, seite, 375);
      expect(await imErstenBild(page, 'Termin wünschen', hoehe)).toBe(true);
    });
  }

  test('Absage zum nächsten Termin angefragt: die Karte bleibt, der Wunsch steht darunter', async ({
    page,
  }) => {
    await oeffne(page, 'termine-absage-angefragt', 375);
    await expect(page.getByRole('region', { name: /^Besuch / })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Ihre Wünsche' })).toContainText(
      /Absage für .*angefragt/,
    );
  });

  test('bei 188 px fließt ein Statuszeichen wie Text: „… Absage“, darunter „angefragt“ (ANN-765)', async ({
    page,
  }) => {
    await oeffne(page, 'termine-absage-angefragt', 188);
    const zeilen = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main .rounded-pill')]
        .filter((p) => /^\S\s*\S+ angefragt$/.test(p.textContent ?? ''))
        .map((pille) => {
          const zeichen = pille.querySelector('[aria-hidden="true"]')!.getBoundingClientRect();
          const text = [...pille.childNodes].find((k) => /\w/.test(k.textContent ?? ''))!;
          const wort = document.createRange();
          wort.setStart(text, 0);
          wort.setEnd(text, (text.textContent ?? '').indexOf(' '));
          return Math.abs(wort.getBoundingClientRect().top - zeichen.top) < 2;
        }),
    );
    // „… Absage angefragt“ in der Hero-Karte, „… Änderung angefragt“ unter „Weitere Termine“.
    expect(zeilen).toHaveLength(2);
    expect(zeilen.every(Boolean), 'Zeichen mit dem ersten Wort in einer Zeile').toBe(true);
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

test.describe('Seite des Termins (Schritt 3c)', () => {
  for (const { seite, hauptknopf } of SEITEN) {
    test(`${seite} bei 375 px: Schrift, Ziele, axe, höchstens ein Hauptknopf`, async ({ page }) => {
      await oeffneTermin(page, seite, 375);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      const knoepfe = await hauptknoepfe(page);
      if (hauptknopf) {
        expect(knoepfe).toHaveLength(1);
        expect(knoepfe[0]).toMatch(hauptknopf);
      } else {
        expect(knoepfe).toEqual([]);
      }
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
        await oeffneTermin(page, seite, breite, schrift);
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await gebrocheneWoerter(page), 'gebrochene Wörter').toEqual([]);
        expect(await angeschnitten(page), 'angeschnitten').toEqual([]);
      });
    }
  }

  test('kommend: der Rückweg „Termine“, Ändern und Absagen führen in den Ablauf', async ({
    page,
  }) => {
    await oeffneTermin(page, 'termin', 375);
    const zurueck = page.locator('main').getByRole('link', { name: 'Termine' });
    expect((await zurueck.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText('Ändern und Absagen sind Wünsche an die Praxis.')).toBeVisible();
    await page.getByRole('link', { name: 'Termin ändern' }).click();
    await expect(page.getByRole('dialog', { name: 'Wann passt es Ihnen?' })).toBeVisible();
  });

  for (const seite of ['termin', 'termin&kurzfristig']) {
    test(`${seite}: Ändern und Absagen stehen bei 375 × 667 ohne Rollen vor „Wer und wo“ (ANN-804)`, async ({
      page,
    }) => {
      await oeffneTermin(page, seite, 375);
      expect(await imErstenBild(page, 'Termin ändern'), 'Termin ändern').toBe(true);
      expect(await imErstenBild(page, 'Termin absagen'), 'Termin absagen').toBe(true);
      const absagen = (await page.getByRole('link', { name: 'Termin absagen' }).boundingBox())!;
      const werUndWo = (await page
        .locator('main')
        .getByText('Anna Beispiel')
        .first()
        .boundingBox())!;
      expect(absagen.y).toBeLessThan(werUndWo.y);
    });
  }

  test('unter 24 Stunden: die Warnung über den Knöpfen, fett, mit Zeichen', async ({ page }) => {
    await oeffneTermin(page, 'termin&kurzfristig', 375);
    const warnung = page.locator('main').getByRole('status').filter({ hasText: 'Ausfallhonorar' });
    await expect(warnung).toBeVisible();
    await expect(warnung).toHaveCSS('font-weight', '600');
    const knopf = await page.getByRole('link', { name: 'Termin ändern' }).boundingBox();
    expect((await warnung.boundingBox())?.y ?? 0).toBeLessThan(knopf?.y ?? 0);
  });

  test('vergangen: „Praxis anrufen“ als Hauptknopf, 60 hoch, wählt die Nummer', async ({
    page,
  }) => {
    await oeffneTermin(page, 'termin-vergangen', 375);
    const anrufen = page.getByRole('link', { name: /Praxis anrufen/ });
    await expect(anrufen).toHaveAttribute('href', 'tel:+4970710000000');
    expect((await anrufen.boundingBox())?.height).toBeGreaterThanOrEqual(59.5);
    await oeffneTermin(page, 'termin-vergangen&ohne-nummer', 375);
    await expect(page.getByRole('link', { name: /Praxis anrufen/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Der Praxis schreiben' })).toBeVisible();
  });

  test('Laden: Skelett in der Form des Kopfs, ohne Knopf; Fehler mit „Erneut versuchen“', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=termin-laden`);
    const skelett = page.locator('main [aria-busy="true"]');
    await expect(skelett).toContainText('Termin wird geladen');
    await expect(page.locator('main button')).toHaveCount(0);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);

    await page.goto(`${PRUEFSEITE}?seite=termin-fehler`);
    await expect(page.getByText('Ihr Termin lässt sich gerade nicht laden.')).toBeVisible();
    await expect(page.getByRole('button', { name: /erneut/i })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Termine' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Die Praxis erreichen' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /^Praxis anrufen/ })).toBeVisible();
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
  });

  test('ohne Netz: Ändern und Absagen gesperrt mit Satz, „Praxis anrufen“ bleibt (Frage 4)', async ({
    page,
    context,
  }) => {
    await oeffneTermin(page, 'termin', 375);
    await context.setOffline(true);
    for (const name of ['Termin ändern', 'Termin absagen']) {
      const knopf = page.getByRole('button', { name });
      await expect(knopf).toBeDisabled();
      await expect(knopf).toHaveAccessibleDescription(
        'Wünschen, Ändern und Absagen gehen wieder mit Verbindung.',
      );
      await expect(knopf).toHaveCSS('border-style', 'dashed');
    }
    await expect(page.getByRole('link', { name: /Praxis anrufen/ })).toBeVisible();
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    await context.setOffline(false);
    await expect(page.getByRole('link', { name: 'Termin absagen' })).toBeVisible();
  });

  test('am Rechner: in einer Spalte, Ändern und Absagen nebeneinander, so breit wie ihr Text', async ({
    page,
  }) => {
    await oeffneTermin(page, 'termin', 1280);
    const aendern = await page.getByRole('link', { name: 'Termin ändern' }).boundingBox();
    const absagen = await page.getByRole('link', { name: 'Termin absagen' }).boundingBox();
    const kopf = await page.locator('main header').boundingBox();
    if (!aendern || !absagen || !kopf) throw new Error('ohne Maße');
    expect(Math.abs(aendern.y - absagen.y)).toBeLessThanOrEqual(1);
    expect(aendern.width).toBeLessThan(300);
    const wer = await page.getByRole('region', { name: 'Wer und wo' }).boundingBox();
    expect(wer?.width ?? 0).toBeLessThanOrEqual(768.5);
    // Der Titel in der Stufe des Rechners (32).
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '32px');
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
  });
});
