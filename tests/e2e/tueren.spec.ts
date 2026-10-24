import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Türen der Plattform im Browser (Handoff 2026-10-22, Abschnitte 5.2 und
 * 8): Einladung, Einrichtung und Sperre in jedem neuen Zustand mit axe, mit
 * Zielen ab 44 px und ohne waagerechtes Rollen bei 375 px und bei 200 %
 * (188 px). Dazu die offene Tastatur auf der Einladung: Titel, Feld und
 * „Weiter“ bleiben, die Schritte treten zurück - und „Weiter“ trifft.
 */
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

const TUEREN: {
  name: string;
  pfad: string;
  titel: string;
  dann?: (page: Page) => Promise<void>;
}[] = [
  { name: 'Einladung', pfad: `/einladung#code=${CODE}`, titel: 'Own Motion lädt Sie ein' },
  {
    name: 'Einladung ungültig',
    pfad: '/einladung',
    titel: 'Diese Einladung lässt sich nicht verwenden',
  },
  {
    name: 'Einrichtung Passkey',
    pfad: '/tests/e2e/fixtures/anmeldung.html?seite=einrichten',
    titel: 'Mit Gesicht oder Finger anmelden',
  },
  {
    name: 'Einrichtung PIN',
    pfad: '/tests/e2e/fixtures/anmeldung.html?seite=pin',
    titel: 'Eine PIN festlegen',
  },
  {
    name: 'Sperre',
    pfad: '/tests/e2e/fixtures/sperre.html?grund=inaktiv&fassung=plattform',
    titel: 'Zum Schutz gesperrt',
  },
  {
    name: 'Sperre mit PIN',
    pfad: '/tests/e2e/fixtures/sperre.html?grund=inaktiv&fassung=plattform',
    titel: 'Zum Schutz gesperrt',
    dann: async (page) => {
      await page.getByRole('button', { name: 'Mit PIN entsperren' }).click();
      await expect(page.getByRole('heading', { name: 'Mit PIN entsperren' })).toBeVisible();
    },
  },
  {
    name: 'Sperre mit festgehaltener Eingabe',
    pfad: '/tests/e2e/fixtures/sperre.html?grund=inaktiv&fassung=plattform&halten=1',
    titel: 'Zum Schutz gesperrt',
    dann: async (page) => {
      await page.getByRole('button', { name: 'Mit anderem Zugang anmelden' }).click();
      await expect(page.getByText(/geht dabei verloren/)).toBeVisible();
    },
  },
  {
    name: 'Sperre zu viele Versuche',
    pfad: '/tests/e2e/fixtures/sperre.html?grund=verbraucht&fassung=plattform',
    titel: 'Bitte neu anmelden',
  },
];

async function oeffne(page: Page, tuer: (typeof TUEREN)[number]) {
  await page.route('**/rest/v1/rpc/own_pin_status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
  await page.goto(tuer.pfad);
  await expect(page.getByRole('heading', { name: tuer.titel }).first()).toBeVisible();
  await tuer.dann?.(page);
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'main a, main button, main input, [role="dialog"] button, [role="dialog"] input',
      ),
    ]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && box.height < 43.5)
      .map(
        ({ el, box }) =>
          `${Math.round(box.height)}px: ${(el.textContent ?? '').trim().slice(0, 40)}`,
      ),
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

for (const tuer of TUEREN) {
  test(`${tuer.name}: axe, Ziele und kein Querrollen bei 375 px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await oeffne(page, tuer);
    expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test(`${tuer.name}: bei 200 % kein waagerechtes Rollen`, async ({ page }) => {
    await page.setViewportSize({ width: 188, height: 406 });
    await oeffne(page, tuer);
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

test('Zugang gesperrt: „Praxis anrufen“ bricht bei 200 % nie mitten im Wort (Handoff 6)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 188, height: 406 });
  await page.goto('/tests/e2e/fixtures/plattform.html?seite=gesperrt');
  const knopf = page.getByRole('link', { name: /Praxis anrufen/ });
  await expect(knopf).toBeVisible();
  // Je Wort und je Ziffergruppe ein einziges Rechteck: Ein Wort, das über
  // zwei Zeilen bricht, hätte zwei.
  const gebrochen = await knopf.evaluate((a) => {
    const funde: string[] = [];
    const gehen = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
      const text = knoten.textContent ?? '';
      for (const treffer of text.matchAll(/\S+/g)) {
        const bereich = document.createRange();
        bereich.setStart(knoten, treffer.index);
        bereich.setEnd(knoten, treffer.index + treffer[0].length);
        if (bereich.getClientRects().length > 1) funde.push(treffer[0]);
      }
    }
    return funde;
  });
  expect(gebrochen).toEqual([]);
  expect(await ueberlaeuft(page)).toBe(false);
});

test('Einrichtung: Passkey-Seite rollt nicht; die Abfrage entfällt unter 48rem Höhe (ANN-682)', async ({
  page,
}) => {
  // Wie in Produktion, ohne „Später einrichten (nur Test-Umgebung)“.
  const seite = '/tests/e2e/fixtures/anmeldung.html?seite=einrichten&ohne-spaeter';
  const ueberstand = () =>
    page.evaluate(() => {
      const flaeche = [...document.querySelectorAll('[role="dialog"] [tabindex="0"]')].find(
        (element) => element.scrollHeight > 0,
      );
      return flaeche ? flaeche.scrollHeight - flaeche.clientHeight : Number.NaN;
    });
  for (const hoehe of [812, 790, 768, 740, 667]) {
    await page.setViewportSize({ width: 375, height: hoehe });
    await page.goto(seite);
    await expect(
      page.getByRole('heading', { name: 'Mit Gesicht oder Finger anmelden' }),
    ).toBeVisible();
    const abfrage = page.getByTestId('gezeichnete-abfrage');
    // `max-height: 48rem` schließt 768 px ein.
    if (hoehe > 768) await expect(abfrage).toBeVisible();
    else await expect(abfrage).toBeHidden();
    // Keine Unterschrift unter der Zeichnung (Jannes 24.10.2026).
    await expect(page.getByText(/So etwa sieht/)).toHaveCount(0);
    expect(await ueberstand(), `${hoehe} px`).toBeLessThanOrEqual(0);
  }
});

test.describe('Einladung bei offener Tastatur (ANN-681)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Titel, Feld und „Weiter“ bleiben, die Schritte treten zurück, „Weiter“ trifft', async ({
    page,
  }) => {
    await page.route('**/functions/v1/platform-access', (route) =>
      route.fulfill({
        status: 409,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'email_taken' }),
      }),
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/einladung#code=${CODE}`);
    const schritte = page.getByRole('heading', { name: 'Drei Schritte, etwa 2 Minuten' });
    await expect(schritte).toBeVisible();
    await page.getByLabel('E-Mail-Adresse').tap();
    await expect(schritte).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Own Motion lädt Sie ein' })).toBeVisible();
    await page.getByLabel('E-Mail-Adresse').fill('erika@beispiel.de');
    await page.getByRole('button', { name: 'Weiter' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Für diese Adresse gibt es schon einen Zugang' }),
    ).toBeVisible();
  });
});
