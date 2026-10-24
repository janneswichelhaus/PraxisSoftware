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

/**
 * Jede Ansicht der Plattform, die die Prüfseite kennt, mit einem Merkmal: der
 * Seitentitel, bei einem geführten Ablauf (`fenster`) der Name des Fensters.
 */
const ANSICHTEN: { seite: string; merkmal: RegExp | string; fenster?: true }[] = [
  { seite: 'geruest', merkmal: 'Guten Tag' },
  // DRP-EPIC-005: Der Einstieg ist ein geführter Ablauf im Fenster.
  { seite: 'einstieg', merkmal: /^Willkommen/, fenster: true },
  { seite: 'einstieg-begleitung', merkmal: /^Willkommen/, fenster: true },
  { seite: 'termine', merkmal: 'Termine' },
  // Überholung 6 (G6): Wünschen, Ändern und Absagen sind geführte Abläufe im
  // Fenster - geprüft wird die erste Seite und die nach `?art=`; die übrigen
  // Seiten prüft `plattform-termine.spec.ts` im Ablauf.
  { seite: 'wunsch', merkmal: 'Wann passt es Ihnen?', fenster: true },
  { seite: 'termin', merkmal: 'Was möchten Sie?', fenster: true },
  { seite: 'termin-absagen', merkmal: 'Ausfallhonorar', fenster: true },
  { seite: 'termin-aendern', merkmal: 'Wann passt es Ihnen?', fenster: true },
  { seite: 'rechnungen', merkmal: 'Rechnungen' },
  { seite: 'rechnung', merkmal: 'Rechnung RG-2026-0007' },
  { seite: 'dokumente', merkmal: 'Dokumente' },
  { seite: 'befundbogen', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'ich', merkmal: 'Ich' },
  { seite: 'einwilligungen', merkmal: 'Einwilligungen' },
  { seite: 'daten', merkmal: 'Meine Daten' },
  { seite: 'einstellungen', merkmal: 'Einstellungen' },
  { seite: 'handeln-fuer', merkmal: 'Guten Tag' },
  { seite: 'gesperrt', merkmal: 'Ihr Zugang ist gesperrt' },
  { seite: 'ende', merkmal: 'Ich' },
  // Schritt 1c (Handoff 2026-10-22, 5.2): nach der Lesefrist auf der Übersicht.
  { seite: 'ende-uebersicht', merkmal: 'Ihr Zugang ist beendet' },
  // ANG-EPIC-001: das Nachsorge-Abo mit Kündigungsknopf und die Übersicht danach.
  { seite: 'abo', merkmal: 'Nachsorge-Abo' },
  { seite: 'abo-gekuendigt', merkmal: 'Guten Tag' },
  // ANG-EPIC-002: das eigene Trainingspaket mit Preisen, und die Preise ohne Paket.
  { seite: 'paket', merkmal: 'Trainingspaket' },
  { seite: 'preise', merkmal: 'Trainingspaket' },
  // KND-EPIC-001: Angebot der Praxis, früher Beginn, Wartezeit, Kachel, Vertrag.
  { seite: 'angebot', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-frueh', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-wartet', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-uebersicht', merkmal: 'Guten Tag' },
  { seite: 'vertrag', merkmal: 'Trainingsvertrag' },
  // ERN-002: Ernährung mit Gewicht, Zielwerten und den eingeklappten Einstellungen.
  { seite: 'ernaehrung', merkmal: 'Ernährung' },
  // Politurrunde 2026-10-20: Tagebuch und Lebensmittel, die täglichen Seiten.
  { seite: 'tagebuch', merkmal: 'Tagebuch' },
  { seite: 'lebensmittel', merkmal: 'Lebensmittel' },
  { seite: 'lebensmittel-neu', merkmal: /Lebensmittel/ },
];

async function oeffne(page: Page, seite: string, merkmal: RegExp | string, fenster = false) {
  await page.goto(`${PRUEFSEITE}?seite=${seite}`);
  await expect(
    fenster
      ? page.getByRole('dialog', { name: merkmal })
      : page.getByRole('heading', { level: 1, name: merkmal }).first(),
  ).toBeVisible();
  await bewegungAbwarten(page);
}

/**
 * Bis die Bewegung steht: Mitten in einer Einblendung mit Deckkraft rechnete
 * axe einen zu schwachen Kontrast, und ein Ziel stünde noch nicht an seinem
 * Platz. Endlose Bewegungen (der Puls des Skeletts) zählen nicht.
 */
async function bewegungAbwarten(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((bewegung) => bewegung.effect?.getTiming().iterations !== Infinity)
        .map((bewegung) => bewegung.finished.catch(() => undefined)),
    ),
  );
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

/**
 * Bedienelemente unter 44 px Höhe; ein Kästchen zählt mit seiner Zeile. Dazu
 * alles in einem Fenster - es liegt außerhalb von `main`.
 */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main a, main button, main input, main select, main textarea, header a, header button, nav a, ' +
        '[role="dialog"] a, [role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea',
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
  for (const { seite, merkmal, fenster } of ANSICHTEN) {
    test(`${seite}: Schrift, Ziele, Kontrast und Beschriftung bei 375 px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await oeffne(page, seite, merkmal, fenster);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`${seite}: bei 200 % Vergrößerung kein waagerechtes Scrollen`, async ({ page }) => {
      await page.setViewportSize({ width: 188, height: 900 });
      await oeffne(page, seite, merkmal, fenster);
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

/**
 * Das Gerüst in seinen Breiten (Handoff 2026-10-22, Abschnitte 3, 4 und 8):
 * die Reiterleiste in drei Stufen (ANN-679, ANN-682) und die Rechneransicht.
 * Gemessen wird hier, was jsdom nicht kann - Breiten, die Media Query unter
 * 23rem und die Schrift „Groß“ und „Sehr groß“.
 */
test.describe('Gerüst: Reiterleiste in drei Stufen und Rechneransicht', () => {
  const leiste = (page: Page) => page.locator('nav[data-stufe]');

  async function mitSchrift(page: Page, groesse: 'gross' | 'sehr-gross') {
    await page.addInitScript((wert) => {
      window.localStorage.setItem('plattform-schriftgroesse', wert);
    }, groesse);
  }

  /**
   * Ziele, deren Wort nicht ganz hineinpasst: Es läuft in den Innenrand des Ziels
   * oder darüber hinaus oder bricht in eine zweite Zeile („Nachrichte|n“).
   */
  async function gekappt(page: Page, auswahl: string): Promise<string[]> {
    return page.evaluate((sel) => {
      const funde: string[] = [];
      for (const ziel of document.querySelectorAll<HTMLElement>(sel)) {
        const box = ziel.getBoundingClientRect();
        if (box.width === 0) continue;
        // Die Fläche für das Wort: das Ziel ohne seinen Innenrand.
        const stil = getComputedStyle(ziel);
        const links = box.left + parseFloat(stil.paddingLeft);
        const rechts = box.right - parseFloat(stil.paddingRight);
        for (const knoten of ziel.childNodes) {
          const wort = knoten.textContent?.trim();
          if (knoten.nodeType !== Node.TEXT_NODE || !wort) continue;
          const bereich = document.createRange();
          bereich.selectNodeContents(knoten);
          const flaeche = bereich.getBoundingClientRect();
          const zeilen = bereich.getClientRects().length;
          if (zeilen > 1 || flaeche.left < links - 0.5 || flaeche.right > rechts + 0.5) {
            funde.push(`${wort}: ${zeilen} Zeilen, ${Math.round(flaeche.right - rechts)} px über`);
          }
        }
      }
      return funde;
    }, auswahl);
  }

  /** Jedes Ziel liegt im Bild und wird nicht verdeckt - es lässt sich antippen. */
  async function erreichbar(ziele: ReturnType<Page['locator']>) {
    for (const ziel of await ziele.all()) {
      await expect(ziel).toBeInViewport();
      const oben = await ziel.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const treffer = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return treffer !== null && el.contains(treffer);
      });
      expect(oben, (await ziel.textContent()) ?? '').toBe(true);
    }
  }

  test('375 px: eine Reihe, vier Wörter ungekappt, Ziele 68 hoch, Kopf 72', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'geruest', 'Guten Tag');
    await expect(leiste(page)).toHaveAttribute('data-stufe', '1');
    const ziele = leiste(page).getByRole('link');
    await expect(ziele).toHaveCount(4);
    for (const ziel of await ziele.all()) {
      expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(67.5);
    }
    expect(await gekappt(page, 'nav[data-stufe] a')).toEqual([]);
    await erreichbar(ziele);
    await expect(page.getByRole('button', { name: 'Menü' })).toBeHidden();
    const kopfzeile = page.locator('header > div').first();
    expect((await kopfzeile.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(71.5);
  });

  for (const { breite, groesse } of [
    { breite: 375, groesse: 'gross' },
    { breite: 375, groesse: 'sehr-gross' },
    // Die schmalste Breite mit Leiste: 23rem, darunter steht das Menü.
    { breite: 368, groesse: 'sehr-gross' },
  ] as const) {
    test(`${breite} px, „${groesse === 'gross' ? 'Groß' : 'Sehr groß'}“: zwei Reihen, alle vier Ziele erreichbar`, async ({
      page,
    }) => {
      await mitSchrift(page, groesse);
      await page.setViewportSize({ width: breite, height: 900 });
      await oeffne(page, 'geruest', 'Guten Tag');
      await expect(leiste(page)).toHaveAttribute('data-stufe', '2');
      const ziele = leiste(page).getByRole('link');
      await expect(ziele).toHaveCount(4);
      for (const ziel of await ziele.all()) {
        expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(55.5);
      }
      expect(await gekappt(page, 'nav[data-stufe] a')).toEqual([]);
      await erreichbar(ziele);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);
    });
  }

  for (const groesse of ['normal', 'sehr-gross'] as const) {
    test(`188 px (200 %), „${groesse === 'normal' ? 'Normal' : 'Sehr groß'}“: der Knopf „Menü“ statt der Leiste`, async ({
      page,
    }) => {
      if (groesse !== 'normal') await mitSchrift(page, groesse);
      await page.setViewportSize({ width: 188, height: 406 });
      await oeffne(page, 'geruest', 'Guten Tag');
      await expect(leiste(page)).toBeHidden();
      const menue = page.getByRole('button', { name: 'Menü' });
      await expect(menue).toBeVisible();
      await expect(menue).toHaveAttribute('aria-expanded', 'false');
      expect(await ueberlaeuft(page)).toBe(false);

      await menue.click();
      await expect(menue).toHaveAttribute('aria-expanded', 'true');
      const navigation = page.getByRole('navigation', { name: 'Plattform' });
      await expect(navigation).toBeVisible();
      const ziele = navigation.getByRole('link');
      await expect(ziele).toHaveText(['Übersicht', 'Termine', 'Übungen', 'Nachrichten', 'Ich']);
      for (const ziel of await ziele.all()) {
        expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(55.5);
      }
      await bewegungAbwarten(page);
      // Auch bei „Sehr groß“ bricht kein Wort - „Nachrichten“ bleibt ganz.
      expect(await gekappt(page, 'nav[aria-label="Plattform"]:not([hidden]) a')).toEqual([]);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page), 'axe').toEqual([]);

      await page.keyboard.press('Escape');
      await expect(menue).toHaveAttribute('aria-expanded', 'false');
      await expect(menue).toBeFocused();
      await expect(navigation).toBeHidden();
    });
  }

  test('375 px, „Sehr groß“: was den Fokus bekommt, liegt über der Leiste, nicht unter ihr', async ({
    page,
  }) => {
    await mitSchrift(page, 'sehr-gross');
    await page.setViewportSize({ width: 375, height: 700 });
    await oeffne(page, 'ich', 'Ich');
    await expect(leiste(page)).toHaveAttribute('data-stufe', '2');
    const zuletzt = page.locator('main a').last();
    await zuletzt.focus();
    await bewegungAbwarten(page);
    const verdeckt = await zuletzt.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const treffer = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return treffer === null || !el.contains(treffer);
    });
    expect(verdeckt).toBe(false);
  });

  test('1280 px: Navigation im Kopf, keine Leiste, der Inhalt an der Kante der Marke', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 840 });
    await oeffne(page, 'geruest', 'Guten Tag');
    await expect(leiste(page)).toHaveCount(0);
    const navigation = page.locator('header').getByRole('navigation', { name: 'Plattform' });
    const ziele = navigation.getByRole('link');
    await expect(ziele).toHaveText(['Übersicht', 'Termine', 'Übungen', 'Nachrichten']);
    await expect(navigation.getByRole('link', { name: 'Übersicht' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const ziel of await ziele.all()) {
      expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(47.5);
    }
    await expect(page.getByRole('button', { name: 'Menü' })).toBeHidden();
    const marke = await page.getByRole('link', { name: 'Übersicht' }).first().boundingBox();
    const titel = await page.getByRole('heading', { level: 1, name: 'Guten Tag' }).boundingBox();
    expect(Math.abs((titel?.x ?? 0) - (marke?.x ?? 0))).toBeLessThanOrEqual(1);
    // Einspaltig in `max-w-spalte` (48rem), nicht über die ganze Breite.
    const spalte = await page.locator('main > div').first().boundingBox();
    expect(spalte?.width ?? 0).toBeLessThanOrEqual(768.5);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
  });
});

/**
 * Seiten- und Abschnittstitel in der Skala der Plattform (Handoff 2026-10-22,
 * Abschnitt 2; ANN-683): in rem, damit sie mit „Groß“ und „Sehr groß“
 * wachsen; am Rechner der Seitentitel 32.
 */
test.describe('Titel der Plattform in rem', () => {
  async function titel(page: Page) {
    return page.evaluate(() => {
      const werte = (el: Element | null) => {
        if (!el) return null;
        const stil = getComputedStyle(el);
        return {
          groesse: parseFloat(stil.fontSize),
          gewicht: stil.fontWeight,
          laufweite: parseFloat(stil.letterSpacing) / parseFloat(stil.fontSize),
          versalien: stil.textTransform,
        };
      };
      return {
        seite: werte(document.querySelector('main h1')),
        abschnitt: werte(document.querySelector('main section h2')),
        // Der erste Abschnitt steht unter dem Seitenkopf, also mit Abstand.
        abstand: parseFloat(
          getComputedStyle(document.querySelector('main section') ?? document.body).marginTop,
        ),
      };
    });
  }

  for (const { name, breite, schrift, seite, abschnitt, abstand } of [
    { name: '375 px', breite: 375, schrift: null, seite: 28, abschnitt: 22, abstand: 40 },
    {
      name: '375 px „Sehr groß“',
      breite: 375,
      schrift: 'sehr-gross',
      seite: 35,
      abschnitt: 27.5,
      abstand: 50,
    },
    { name: '1280 px', breite: 1280, schrift: null, seite: 32, abschnitt: 22, abstand: 48 },
  ] as const) {
    test(`${name}: Seitentitel ${seite}/800, Abschnitt ${abschnitt}/700 ohne Versalien, ${abstand} dazwischen`, async ({
      page,
    }) => {
      if (schrift) {
        await page.addInitScript((wert) => {
          window.localStorage.setItem('plattform-schriftgroesse', wert);
        }, schrift);
      }
      await page.setViewportSize({ width: breite, height: 900 });
      await oeffne(page, 'ich', 'Ich');
      const { seite: h1, abschnitt: h2, abstand: zwischen } = await titel(page);
      expect(h1?.groesse).toBeCloseTo(seite, 1);
      expect(h1?.gewicht).toBe('800');
      expect(h1?.laufweite).toBeCloseTo(-0.03, 3);
      expect(h2?.groesse).toBeCloseTo(abschnitt, 1);
      expect(h2?.gewicht).toBe('700');
      expect(h2?.laufweite).toBeCloseTo(-0.01, 3);
      expect(h2?.versalien).toBe('none');
      expect(zwischen).toBeCloseTo(abstand, 0);
    });
  }
});

/**
 * Markenmoment B statt Startbild (Handoff 2026-10-22, Abschnitt 7; ANN-680):
 * beim ersten Erscheinen der Übersicht je Tab gestaffelt, nach 0,7 s steht
 * alles; nicht beim Neuladen im selben Tab, nicht bei „Bewegung reduzieren“.
 * Die Uhr der Seite steht, damit der Moment nicht vor der Prüfung endet.
 */
test.describe('Markenmoment B auf der Übersicht', () => {
  async function bewegungen(page: Page) {
    return page.evaluate(() =>
      document
        .getAnimations()
        .filter((bewegung) => (bewegung as CSSAnimation).animationName?.startsWith('markenmoment'))
        .map((bewegung) => Number(bewegung.effect?.getComputedTiming().endTime ?? 0)),
    );
  }

  test('staffelt Gruß und Abschnitte einmal je Tab, nach 0,7 s steht alles', async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=geruest`);
    await expect(page.getByRole('heading', { level: 1, name: 'Guten Tag' })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(1);
    const enden = await bewegungen(page);
    expect(enden.length).toBeGreaterThan(1);
    expect(Math.max(...enden)).toBeLessThanOrEqual(700);
    await page.clock.runFor(1000);
    await expect(page.locator('.markenmoment')).toHaveCount(0);

    // Neuladen im selben Tab: kein zweiter Moment.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Guten Tag' })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(0);
  });

  test('steht bei „Bewegung reduzieren“ sofort da', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=geruest`);
    await expect(page.getByRole('heading', { level: 1, name: 'Guten Tag' })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(0);
    expect(await bewegungen(page)).toEqual([]);
  });
});
