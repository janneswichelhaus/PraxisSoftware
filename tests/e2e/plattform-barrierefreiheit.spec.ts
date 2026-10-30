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
/** Der Gruß der Übersicht hängt an der Tageszeit (Handoff 2026-10-22, 5.1). */
const GRUSS = /^Guten (Morgen|Tag|Abend)/;
/** Der Titel der Seite eines Termins: der Tag in Worten. */
const TAG = /^(Heute|Morgen|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /;
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/**
 * Jede Ansicht der Plattform, die die Prüfseite kennt, mit einem Merkmal: der
 * Seitentitel, bei einem geführten Ablauf (`fenster`) der Name des Fensters.
 */
const ANSICHTEN: { seite: string; merkmal: RegExp | string; fenster?: true }[] = [
  { seite: 'geruest', merkmal: GRUSS },
  // Schritt 1e: die Übersicht im Training, in der Lesefrist, beim Laden und
  // mit Fehler - das Skelett hat keine Überschrift, nur seinen Satz.
  { seite: 'uebersicht-training', merkmal: GRUSS },
  { seite: 'uebersicht-lesefrist', merkmal: GRUSS },
  { seite: 'uebersicht-fehler', merkmal: GRUSS },
  // DRP-EPIC-005: Der Einstieg ist ein geführter Ablauf im Fenster.
  { seite: 'einstieg', merkmal: /^Willkommen/, fenster: true },
  { seite: 'einstieg-begleitung', merkmal: /^Willkommen/, fenster: true },
  { seite: 'termine', merkmal: 'Termine' },
  // Wünschen, Ändern und Absagen sind geführte Abläufe im Fenster: geprüft werden die erste
  // Seite und die nach `?art=`, die übrigen in `plattform-termine.spec.ts`. Ohne `?art=` ist
  // `/p/termine/<id>` die Seite des Termins, ihr Titel der Tag.
  { seite: 'wunsch', merkmal: 'Wann passt es Ihnen?', fenster: true },
  { seite: 'termin', merkmal: TAG },
  { seite: 'termin&kurzfristig', merkmal: TAG },
  { seite: 'termin-angefragt', merkmal: TAG },
  { seite: 'termin-vergangen', merkmal: TAG },
  { seite: 'termin-vergangen&ohne-nummer', merkmal: TAG },
  { seite: 'termin-abgesagt', merkmal: TAG },
  { seite: 'termin-absagen', merkmal: 'Ausfallhonorar', fenster: true },
  { seite: 'termin-aendern', merkmal: 'Wann passt es Ihnen?', fenster: true },
  { seite: 'rechnungen', merkmal: 'Rechnungen' },
  { seite: 'rechnung', merkmal: 'Rechnung RG-2026-0007' },
  { seite: 'dokumente', merkmal: 'Dokumente' },
  // Schritt 4c: der Fragebogen als geführter Ablauf - Thema 1, Thema 3 aus einem Entwurf, der
  // Abschluss, auch ohne Netz; dazu seine Lagen auf der Seite. Jedes Thema prüft der Block unten.
  { seite: 'befundbogen', merkmal: 'Zu Ihrer Person', fenster: true },
  { seite: 'fragebogen-thema', merkmal: 'Ihre Schmerzen heute', fenster: true },
  { seite: 'fragebogen-thema&thema=8', merkmal: 'Die vergangenen zwei Wochen', fenster: true },
  { seite: 'fragebogen-abschluss', merkmal: 'Ist alles richtig?', fenster: true },
  { seite: 'fragebogen-ohne-netz', merkmal: 'Ist alles richtig?', fenster: true },
  { seite: 'fragebogen-gesendet', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'fragebogen-training', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'fragebogen-begleitung', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'fragebogen-laden', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'fragebogen-ladefehler', merkmal: 'Fragebogen vor dem ersten Termin' },
  { seite: 'ich', merkmal: 'Ich' },
  { seite: 'einwilligungen', merkmal: 'Einwilligungen' },
  { seite: 'daten', merkmal: 'Meine Daten' },
  { seite: 'einstellungen', merkmal: 'Einstellungen' },
  { seite: 'handeln-fuer', merkmal: GRUSS },
  { seite: 'gesperrt', merkmal: 'Ihr Zugang ist gesperrt' },
  { seite: 'ende', merkmal: 'Ich' },
  // Schritt 1c (Handoff 2026-10-22, 5.2): nach der Lesefrist auf der Übersicht.
  { seite: 'ende-uebersicht', merkmal: 'Ihr Zugang ist beendet' },
  // ANG-EPIC-001: das Nachsorge-Abo mit Kündigungsknopf und die Übersicht danach.
  { seite: 'abo', merkmal: 'Nachsorge-Abo' },
  { seite: 'abo-gekuendigt', merkmal: GRUSS },
  // ANG-EPIC-002: das eigene Trainingspaket mit Preisen, und die Preise ohne Paket.
  { seite: 'paket', merkmal: 'Trainingspaket' },
  { seite: 'preise', merkmal: 'Trainingspaket' },
  // KND-EPIC-001: Angebot der Praxis, früher Beginn, Wartezeit, Kachel, Vertrag.
  { seite: 'angebot', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-frueh', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-wartet', merkmal: 'Training nach Ihrer Behandlung' },
  { seite: 'angebot-uebersicht', merkmal: GRUSS },
  { seite: 'vertrag', merkmal: 'Trainingsvertrag' },
  // ERN-002: Ernährung mit Gewicht, Zielwerten und den eingeklappten Einstellungen.
  { seite: 'ernaehrung', merkmal: 'Ernährung' },
  // Politurrunde 2026-10-20: Tagebuch und Lebensmittel, die täglichen Seiten.
  { seite: 'tagebuch', merkmal: 'Tagebuch' },
  // Schritt 4e: das Tagebuch beim Laden, mit Fehler und ohne Netz, dazu das Eintragen.
  { seite: 'tagebuch-laden', merkmal: 'Tagebuch' },
  { seite: 'tagebuch-fehler', merkmal: 'Tagebuch' },
  { seite: 'tagebuch-ohne-netz', merkmal: 'Tagebuch' },
  { seite: 'tagebuch-eintragen', merkmal: 'Mittagessen eintragen' },
  // Die Ernährung ohne Netz und das Eintragen bei ausgeschaltetem Tagebuch.
  { seite: 'ernaehrung-ohne-netz', merkmal: 'Ernährung' },
  { seite: 'tagebuch-eintragen-aus', merkmal: 'Mittagessen eintragen' },
  { seite: 'lebensmittel', merkmal: 'Lebensmittel' },
  { seite: 'lebensmittel-neu', merkmal: /Lebensmittel/ },
  // „Meine Angaben“ mit der Seite einer Frage und allen Antworten, leer; die Gewohnheiten.
  { seite: 'angaben', merkmal: 'Meine Angaben' },
  { seite: 'angaben-frage', merkmal: 'Schmerz in Ruhe' },
  { seite: 'angaben-frage-uebungen', merkmal: 'Anstrengung' },
  { seite: 'angaben-tabelle', merkmal: 'Alle Antworten' },
  { seite: 'angaben-leer', merkmal: 'Meine Angaben' },
  { seite: 'gewohnheiten', merkmal: 'Gewohnheiten' },
  { seite: 'gewohnheiten-pausiert', merkmal: 'Gewohnheiten' },
  { seite: 'gewohnheiten-leer', merkmal: 'Gewohnheiten' },
  // Schritt 4b: der Check-in als geführter Ablauf - das Fenster heißt nach der Frage - und seine
  // Zustände unter dem Titel „Check-in“.
  { seite: 'checkin-frage', merkmal: 'Wie stark sind Ihre Schmerzen in Ruhe?', fenster: true },
  {
    seite: 'checkin-letzte',
    merkmal: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
    fenster: true,
  },
  {
    seite: 'checkin-ohne-netz',
    merkmal: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
    fenster: true,
  },
  { seite: 'checkin-training', merkmal: 'Außerhalb der Übungen', fenster: true },
  { seite: 'checkin-leer', merkmal: 'Check-in' },
  { seite: 'checkin-einwilligung', merkmal: 'Check-in' },
  { seite: 'checkin-beantwortet', merkmal: 'Check-in' },
  { seite: 'checkin-lesefrist', merkmal: 'Check-in' },
  { seite: 'checkin-begleitung', merkmal: 'Check-in' },
  { seite: 'checkin-laden', merkmal: 'Check-in' },
  { seite: 'checkin-fehler', merkmal: 'Check-in' },
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
  // Abgefragt statt auf `finished` gewartet: Beginnt eine Einblendung erst
  // nach dem Laden (eine Meldung, die mit den Daten kommt), löste Chromium
  // dieses Versprechen ohne neues Bild nicht auf - die Bewegung stand längst,
  // die Prüfung wartete bis zum Abbruch.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((bewegung) => bewegung.effect?.getTiming().iterations !== Infinity)
          .every((bewegung) => !bewegung.pending && bewegung.playState !== 'running'),
      ),
    )
    .toBe(true);
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
      // Eine Checkbox trifft man über ihre Zeile; der Titel einer Hero-Karte mit Ziel deckt mit
      // seinem `::after` die ganze Karte.
      const ziel = el.matches('input[type="radio"], input[type="checkbox"]')
        ? (el.closest('label') ?? el)
        : el.matches('.hero-ziel')
          ? (el.closest('section') ?? el)
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
    await oeffne(page, 'geruest', GRUSS);
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
      await oeffne(page, 'geruest', GRUSS);
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
      await oeffne(page, 'geruest', GRUSS);
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
    await oeffne(page, 'geruest', GRUSS);
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
    const titel = await page.getByRole('heading', { level: 1, name: GRUSS }).boundingBox();
    expect(Math.abs((titel?.x ?? 0) - (marke?.x ?? 0))).toBeLessThanOrEqual(1);
    // Schritt 1e: Die Übersicht steht ab 900 px Inhaltsbreite in zwei
    // Spalten - links die Hauptsache, rechts der nächste Besuch - in
    // `max-w-inhalt` (1200 mit 40 Rand).
    const hauptsache = await page.getByRole('region', { name: /Fragebogen/ }).boundingBox();
    const besuch = await page
      .getByRole('heading', { level: 2, name: 'Nächster Besuch' })
      .boundingBox();
    expect(Math.abs((hauptsache?.x ?? 0) - (marke?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(besuch?.x ?? 0).toBeGreaterThan((hauptsache?.x ?? 0) + (hauptsache?.width ?? 0));
    expect(Math.abs((besuch?.y ?? 0) - (hauptsache?.y ?? 0))).toBeLessThanOrEqual(24);
    expect(
      (await page.locator('main > div').first().boundingBox())?.width ?? 0,
    ).toBeLessThanOrEqual(1120.5);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);

    // Jede andere Seite einspaltig in `max-w-spalte` (48rem) - außer
    // „Übungen“ und „Termine“ (ANN-724, ANN-775; `plattform-terminliste.spec.ts`).
    await oeffne(page, 'rechnungen', 'Rechnungen');
    const spalte = await page.locator('main > div').first().boundingBox();
    expect(spalte?.width ?? 0).toBeLessThanOrEqual(768.5);
  });

  test('188 px (200 %): jede Listenzeile in einer Spalte, auch mit Zeit, Titel und Zustand', async ({
    page,
  }) => {
    // Die Telefonregel für dreiteilige Zeilen darf die Regel unter 23rem nicht
    // überstimmen (`:where` in index.css); quer läuft dabei nichts über.
    await page.setViewportSize({ width: 188, height: 900 });
    await oeffne(page, 'rechnungen', 'Rechnungen');
    const spalten = await page
      .locator('.listenzeile')
      .evaluateAll((zeilen) =>
        zeilen.map((z) => getComputedStyle(z).gridTemplateColumns.split(' ').length),
      );
    expect(spalten.length).toBeGreaterThan(0);
    expect(spalten.every((anzahl) => anzahl === 1)).toBe(true);
  });

  test('375 px: die Übersicht einspaltig, Hauptsache vor „Heute“ vor Besuch vor „Neu für Sie“', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'geruest', GRUSS);
    const oben = async (name: string | RegExp) =>
      (await page.getByRole('heading', { level: 2, name }).first().boundingBox())?.y ?? 0;
    const folge = [
      await oben(/Fragebogen/),
      await oben('Heute'),
      await oben('Nächster Besuch'),
      await oben('Neu für Sie'),
    ];
    expect(folge).toEqual([...folge].sort((a, b) => a - b));
    // Höchstens drei Aufgabenkarten (PLATTFORM.md); hier zwei.
    await expect(
      page.getByRole('link', { name: /^(Ihre Übungen für heute|Eine kleine Gewohnheit)/ }),
    ).toHaveCount(2);
  });

  test('375 px: „Mitteilungen einschalten“ führt zu den Benachrichtigungen des Bereichs (ANN-702)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Im Training ist noch nichts gewählt, in der Behandlung schon.
    await oeffne(page, 'uebersicht-training', GRUSS);
    // Ohne vorher zu rollen: Die neue Seite begänne sonst zufällig auf derselben Höhe.
    await page.getByRole('link', { name: /^Mitteilungen einschalten/ }).dispatchEvent('click');
    const abschnitt = page.getByRole('heading', { level: 2, name: 'Benachrichtigungen' });
    await expect(abschnitt).toBeInViewport();
    // Oben im Fenster, nicht irgendwo darin: Die Schriftgröße steht darüber.
    expect((await abschnitt.boundingBox())?.y ?? 999).toBeLessThan(40);
    await expect(
      page.getByText('Für Ihr Training').locator('xpath=ancestor::details'),
    ).toHaveAttribute('open', '');
    await expect(
      page.getByText('Für Ihre Behandlung').locator('xpath=ancestor::details'),
    ).not.toHaveAttribute('open', '');
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
    await expect(page.getByRole('heading', { level: 1, name: GRUSS })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(1);
    const enden = await bewegungen(page);
    expect(enden.length).toBeGreaterThan(1);
    expect(Math.max(...enden)).toBeLessThanOrEqual(700);
    await page.clock.runFor(1000);
    await expect(page.locator('.markenmoment')).toHaveCount(0);

    // Neuladen im selben Tab: kein zweiter Moment.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: GRUSS })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(0);
  });

  test('steht bei „Bewegung reduzieren“ sofort da', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=geruest`);
    await expect(page.getByRole('heading', { level: 1, name: GRUSS })).toBeVisible();
    await expect(page.locator('.markenmoment')).toHaveCount(0);
    expect(await bewegungen(page)).toEqual([]);
  });
});

/**
 * Ernährung und Tagebuch (Handoff 2026-10-29, 5.6 bis 5.8): am Rechner das Tagebuch unter der
 * Tagesleiste zweispaltig, die Ernährung einspaltig; ohne Netz gesperrt, was schreibt.
 */
test.describe('Ernährung und Tagebuch', () => {
  async function box(page: Page, name: string) {
    const b = await page.getByRole('region', { name }).boundingBox();
    return { x: b?.x ?? 0, y: b?.y ?? 0, breite: b?.width ?? 0, hoehe: b?.height ?? 0 };
  }

  test('1280 px: Mahlzeiten links, rechts Wasser über Energie, 48 dazwischen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await oeffne(page, 'tagebuch', 'Tagebuch');
    const energie = await box(page, 'Energie und Nährstoffe');
    const wasser = await box(page, 'Wasser');
    const mahlzeiten = await box(page, 'Mahlzeiten');
    expect(Math.abs(wasser.y - mahlzeiten.y)).toBeLessThanOrEqual(1);
    expect(wasser.x - (mahlzeiten.x + mahlzeiten.breite)).toBeCloseTo(48, 0);
    expect(Math.abs(energie.x - wasser.x)).toBeLessThanOrEqual(1);
    expect(energie.y).toBeGreaterThan(wasser.y + wasser.hoehe);
    expect(
      (await page.locator('main > div').first().boundingBox())?.width ?? 0,
    ).toBeLessThanOrEqual(768.5);
    expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
    expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  // Praxis-Review Nr. 1 zu #333: Wer von „Heute eintragen“ kommt, sieht ohne Rollen, wo er einträgt.
  for (const groesse of [undefined, 'sehr-gross'] as const) {
    test(`375 × 812${groesse ? ' bei „Sehr groß“' : ''}: das Eintragen steht im ersten Bild`, async ({
      page,
    }) => {
      if (groesse) {
        await page.addInitScript((wert) => {
          window.localStorage.setItem('plattform-schriftgroesse', wert);
        }, groesse);
      }
      await page.setViewportSize({ width: 375, height: 812 });
      await oeffne(page, 'tagebuch', 'Tagebuch');
      const ziel = (await page
        .getByRole('link', { name: /eintragen$/ })
        .first()
        .boundingBox())!;
      // Die Reiterleiste klebt unten und deckt ab, was unter ihr liegt.
      const leiste = await page.locator('nav.reiterleiste').boundingBox();
      const unten = Math.min(812, leiste && leiste.height > 0 ? leiste.y : 812);
      expect(ziel.y).toBeGreaterThanOrEqual(0);
      expect(ziel.y + ziel.height).toBeLessThanOrEqual(unten);
    });
  }

  test('1280 px: die Ernährung einspaltig, die Hero-Karte „Heute“ zuerst', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await oeffne(page, 'ernaehrung', 'Ernährung');
    await expect(
      page.getByRole('region', { name: 'Heute' }).getByRole('link', { name: 'Heute eintragen' }),
    ).toBeVisible();
    const folge = [];
    for (const name of ['Heute', 'Gewicht', 'Ihre Zielwerte', 'Mehr']) {
      const abschnitt = await box(page, name);
      expect(abschnitt.breite).toBeLessThanOrEqual(768.5);
      folge.push(abschnitt.y);
    }
    expect(folge).toEqual([...folge].sort((a, b) => a - b));
    expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
    expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('375 px ohne Netz: alles lesbar, was schreibt, gestrichelt gesperrt mit Satz', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'tagebuch-ohne-netz', 'Tagebuch');
    await expect(page.getByText(/^Keine Verbindung\./)).toBeVisible();
    const satz = 'Eintragen geht wieder mit Verbindung.';
    for (const name of [
      /^\+ 1 Glas/,
      'Ein Glas weniger',
      'Frühstück eintragen',
      'Mittagessen eintragen',
      'Abendessen eintragen',
      'Snacks eintragen',
    ]) {
      const knopf = page.getByRole('button', { name });
      // `aria-disabled`: gesperrt, aber mit dem Fokus erreichbar, damit der Satz vorgelesen wird.
      await expect(knopf).toBeDisabled();
      await expect(knopf).toHaveAccessibleDescription(satz);
      await expect(knopf).toHaveCSS('border-style', 'dashed');
      await knopf.focus();
      await expect(knopf).toBeFocused();
    }
    await expect(page.getByText('Haferflocken')).toBeVisible();
    await expect(page.getByRole('button', { name: /Haferflocken/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /eintragen$/ })).toHaveCount(0);
  });

  test('375 px ohne Netz: die Ernährung lesbar, Eintragen und Speichern gestrichelt mit Satz', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'ernaehrung-ohne-netz', 'Ernährung');
    await expect(page.getByText(/^Keine Verbindung\./)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Ihr Gewichtsverlauf' })).toBeVisible();
    await page.getByText('Zielgewicht · 68,0 kg').click();
    for (const [name, satz] of [
      ['Eintragen', 'Eintragen geht wieder mit Verbindung.'],
      ['Speichern', 'Speichern geht wieder mit Verbindung.'],
    ] as const) {
      const knopf = page.getByRole('button', { name, exact: true });
      await expect(knopf).toBeDisabled();
      await expect(knopf).toHaveAccessibleDescription(satz);
      await expect(knopf).toHaveCSS('border-style', 'dashed');
      await knopf.focus();
      await expect(knopf).toBeFocused();
    }
    expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
    expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('Eintragen bei ausgeschaltetem Tagebuch: Markenform, Satz und der Weg zurück', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'tagebuch-eintragen-aus', 'Mittagessen eintragen');
    await expect(page.getByText('Hier lässt sich gerade nichts eintragen.')).toBeVisible();
    await expect(page.getByText('Ihr Tagebuch ist ausgeschaltet.')).toBeVisible();
    await page.getByRole('link', { name: 'Zum Tagebuch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tagebuch' })).toBeVisible();
  });

  test('der Rückweg führt vom Eintragen zum selben Tag und von dort zur Ernährung', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await oeffne(page, 'tagebuch-eintragen', 'Mittagessen eintragen');
    // Heute steht keine Zeile mit dem Tag unter dem Titel.
    await expect(page.getByText(/^(Heute|Gestern)$/)).toHaveCount(0);
    await page.getByRole('link', { name: '← Tagebuch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tagebuch' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← Ernährung' })).toBeVisible();
    await page.getByRole('link', { name: 'Snacks eintragen' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Snacks eintragen' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← Tagebuch' })).toBeVisible();
  });
});

/**
 * Der Fragebogen vor dem ersten Termin in jedem Thema und im Abschluss (Handoff Selbstauskunft,
 * Abschnitt 8): Schrift, Ziele, axe, kein Rollen und genau ein Hauptknopf bei 375 und 188 px, je
 * Thema ein Tipp. Was der Bogen sendet, beantwortet eine Nachbildung und zählt mit.
 */
test.describe('Fragebogen vor dem ersten Termin in jedem Thema', () => {
  async function nachbilden(page: Page, { sendenScheitert = false } = {}) {
    const aufrufe: { name: string; parameter: Record<string, unknown> }[] = [];
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/rpc/')[1] ?? '';
      const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      aufrufe.push({ name, parameter });
      if (name === 'save_platform_questionnaire_response') {
        await route.fulfill({ json: 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c4' });
      } else if (name === 'complete_platform_questionnaire_response') {
        await route.fulfill(
          sendenScheitert ? { status: 500, json: { message: 'kaputt' } } : { json: true },
        );
      } else {
        await route.fulfill({ json: [] });
      }
    });
    return aufrufe;
  }

  /** Tippt, sobald die Tippsperre nach dem Wechsel der Seite vorbei ist. */
  async function tippe(ziel: ReturnType<Page['getByRole']>) {
    await expect(ziel).toBeVisible();
    await expect(async () => {
      expect(await ziel.evaluate((el) => el.closest('.pointer-events-none') === null)).toBe(true);
    }).toPass();
    await ziel.click();
  }

  /** Die Hauptknöpfe im Fenster: gefüllte Knöpfe, ohne die gewählte Stufe einer Skala. */
  async function hauptknoepfe(page: Page): Promise<string[]> {
    return page
      .locator('[role="dialog"] button.bg-accent:not([aria-pressed])')
      .evaluateAll((knoepfe) => knoepfe.map((k) => (k.textContent ?? '').trim()));
  }

  /** Rollt eine Fläche im Fenster waagerecht - auch das ist Rollen, nicht nur die Seite. */
  async function rolltImFenster(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role="dialog"] *')]
        .filter((el) => {
          const quer = getComputedStyle(el).overflowX;
          return (quer === 'auto' || quer === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => el.className.toString().slice(0, 60)),
    );
  }

  async function pruefe(page: Page, name: string) {
    await bewegungAbwarten(page);
    expect(await kleineSchrift(page), `${name}: Schrift unter 18 px`).toEqual([]);
    expect(await kleineZiele(page), `${name}: Ziele unter 44 px`).toEqual([]);
    expect(await axeVerstoesse(page), `${name}: axe`).toEqual([]);
    expect(await ueberlaeuft(page), `${name}: waagerechtes Rollen`).toBe(false);
    expect(await rolltImFenster(page), `${name}: waagerechtes Rollen im Fenster`).toEqual([]);
    expect(await hauptknoepfe(page), `${name}: ein Hauptknopf`).toHaveLength(1);
  }

  for (const breite of [375, 188]) {
    test(`${breite} px: jedes der 14 Themen und der Abschluss, je Thema ein Tipp`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await nachbilden(page);
      await page.setViewportSize({ width: breite, height: 812 });
      await page.goto(`${PRUEFSEITE}?seite=befundbogen`);
      let tipps = 0;
      for (let nummer = 1; nummer <= 14; nummer += 1) {
        await expect(
          page.getByRole('dialog').getByText(`Thema ${nummer} von 14`, { exact: true }),
        ).toBeVisible();
        await pruefe(page, `Thema ${nummer}`);
        await tippe(page.getByRole('button', { name: 'Weiter', exact: true }));
        tipps += 1;
      }
      expect(tipps).toBe(14);
      const abschluss = page.getByRole('dialog', { name: 'Ist alles richtig?' });
      await expect(abschluss.getByText('Abschluss', { exact: true })).toBeVisible();
      await pruefe(page, 'Abschluss');
      expect(await hauptknoepfe(page)).toEqual(['Bogen senden']);
    });
  }

  test('375 px: „Ändern“ aus dem Abschluss bis zurück in zwei Tipps, gespeichert beim Wechsel', async ({
    page,
  }) => {
    const aufrufe = await nachbilden(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=fragebogen-abschluss`);
    const abschluss = page.getByRole('dialog', { name: 'Ist alles richtig?' });
    const offen = abschluss.getByRole('list', { name: 'Noch offen' });
    await expect(offen.getByRole('button')).toHaveCount(3);
    await tippe(offen.getByRole('button', { name: /^Medikamente/ }));
    const thema = page.getByRole('dialog', { name: /^30\. Nehmen Sie momentan Medikamente/ });
    await expect(thema.getByText('Thema 12 von 14', { exact: true })).toBeVisible();
    await tippe(thema.getByRole('button', { name: 'Schmerzmittel' }));
    await pruefe(page, 'Thema 12 aus dem Abschluss');
    await tippe(thema.getByRole('button', { name: 'Übernehmen' }));
    await expect(abschluss).toBeVisible();
    await expect(offen.getByRole('button')).toHaveCount(2);
    const gespeichert = aufrufe.filter((a) => a.name === 'save_platform_questionnaire_response');
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0]!.parameter).toMatchObject({
      p_response_id: 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c4',
      p_answers: { medikamente: { auswahl: ['schmerzmittel'] } },
    });
  });

  test('375 px: „Später“ speichert und führt zur Übersicht', async ({ page }) => {
    const aufrufe = await nachbilden(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=befundbogen`);
    const fenster = page.getByRole('dialog', { name: 'Zu Ihrer Person' });
    await fenster.getByLabel('Beruf').fill('Lehrerin');
    await tippe(fenster.getByRole('button', { name: 'Später' }));
    await expect(page.getByRole('heading', { level: 1, name: GRUSS })).toBeVisible();
    expect(aufrufe.find((a) => a.name === 'save_platform_questionnaire_response')).toMatchObject({
      parameter: { p_response_id: null, p_answers: { beruf: { text: 'Lehrerin' } } },
    });
  });

  test('375 px: scheitert das Senden, steht der Fehler über dem Satz, dann „Erneut senden“', async ({
    page,
  }) => {
    await nachbilden(page, { sendenScheitert: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=fragebogen-abschluss`);
    const abschluss = page.getByRole('dialog', { name: 'Ist alles richtig?' });
    await tippe(abschluss.getByRole('button', { name: 'Bogen senden' }));
    await expect(abschluss.getByRole('alert')).toHaveText(
      /Ihre Angaben konnten nicht gespeichert werden\. Bitte versuchen Sie es erneut\./,
    );
    await expect(abschluss.getByRole('button', { name: 'Erneut senden' })).toBeVisible();
    await pruefe(page, 'Senden gescheitert');
  });

  test('375 px: ohne Netz ist „Bogen senden“ gestrichelt gesperrt, mit Satz', async ({
    page,
    context,
  }) => {
    await nachbilden(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=fragebogen-abschluss`);
    const abschluss = page.getByRole('dialog', { name: 'Ist alles richtig?' });
    await expect(abschluss).toBeVisible();
    await context.setOffline(true);
    const senden = abschluss.getByRole('button', { name: 'Bogen senden' });
    await expect(senden).toHaveAttribute('aria-disabled', 'true');
    await expect(senden).toHaveAccessibleDescription(
      'Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.',
    );
    await expect(senden).toHaveCSS('border-style', 'dashed');
    await expect(abschluss.getByText(/^Keine Verbindung\./)).toBeVisible();
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
    await context.setOffline(false);
    await expect(senden).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('1280 px: Skala in einer Reihe, ja und nein je höchstens 15rem, „Weiter“ rechts', async ({
    page,
  }) => {
    await nachbilden(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=fragebogen-thema`);
    const thema = page.getByRole('dialog', { name: 'Ihre Schmerzen heute' });
    await expect(thema).toBeVisible();
    const stufen = await thema
      .getByRole('group', { name: '3. Wie stark sind Ihre Schmerzen?' })
      .getByRole('button')
      .evaluateAll((knoepfe) => knoepfe.map((k) => Math.round(k.getBoundingClientRect().top)));
    expect(new Set(stufen).size).toBe(1);
    const paar = thema.getByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
    for (const name of ['ja', 'nein']) {
      const flaeche = await paar.getByRole('button', { name }).boundingBox();
      expect(flaeche?.width ?? 999).toBeLessThanOrEqual(240.5);
    }
    const weiter = await thema.getByRole('button', { name: 'Weiter' }).boundingBox();
    const ja = await paar.getByRole('button', { name: 'ja' }).boundingBox();
    expect(weiter?.width ?? 0).toBeGreaterThanOrEqual(159.5);
    expect(weiter?.x ?? 0).toBeGreaterThan((ja?.x ?? 0) + 400);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);
  });
});

/**
 * Der Check-in (Handoff 2026-10-29, 5.1 und 8): genau ein Hauptknopf je Seite des Ablaufs, ohne
 * Netz gestrichelt gesperrt; in den Zuständen keiner neben dem Weg. Im Ablauf rollt bei 188 px
 * auch mit „Sehr groß“ nichts quer.
 */
test.describe('Check-in: ein Hauptknopf, 188 px und „Sehr groß“', () => {
  const ABLAUF = [
    {
      seite: 'checkin-frage',
      merkmal: 'Wie stark sind Ihre Schmerzen in Ruhe?',
      knopf: 'Weiter',
    },
    {
      seite: 'checkin-letzte',
      merkmal: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
      knopf: 'Angaben senden',
    },
    {
      seite: 'checkin-ohne-netz',
      merkmal: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
      knopf: null,
    },
    { seite: 'checkin-training', merkmal: 'Außerhalb der Übungen', knopf: 'Angaben senden' },
  ] as const;
  const ZUSTAENDE = [
    'checkin-leer',
    'checkin-einwilligung',
    'checkin-beantwortet',
    'checkin-lesefrist',
    'checkin-begleitung',
    'checkin-laden',
    'checkin-fehler',
  ];

  /** Knöpfe und Links auf der Hauptfarbe, ohne gewählte Stufen und ohne Gesperrtes darunter. */
  async function hauptknoepfe(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'bg-accent';
      document.body.append(probe);
      const hauptfarbe = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [...document.querySelectorAll<HTMLElement>('button:not([aria-pressed]), a')]
        .filter((el) => el.getBoundingClientRect().height > 0 && !el.closest('[inert]'))
        .filter((el) => getComputedStyle(el).backgroundColor === hauptfarbe)
        .map((el) => (el.textContent ?? '').trim());
    });
  }

  /** Eine Fläche im Fenster, die breiter ist als ihr Platz (rollte oder schnitte quer). */
  async function fensterRolltQuer(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="dialog"] *')]
        .filter(
          (el) =>
            !el.closest('.sr-only') &&
            getComputedStyle(el).overflowX !== 'visible' &&
            el.scrollWidth > el.clientWidth + 1,
        )
        .map((el) => `${el.tagName} ${el.scrollWidth}/${el.clientWidth}`),
    );
  }

  for (const { seite, merkmal, knopf } of ABLAUF) {
    test(`${seite}: genau ein Hauptknopf bei 375 und 1280 px`, async ({ page }) => {
      for (const breite of [375, 1280]) {
        await page.setViewportSize({ width: breite, height: 900 });
        await oeffne(page, seite, merkmal, true);
        if (knopf) {
          expect(await hauptknoepfe(page)).toEqual([knopf]);
        } else {
          expect(await hauptknoepfe(page)).toEqual([]);
          await expect(page.getByRole('button', { name: 'Angaben senden' })).toHaveAttribute(
            'aria-disabled',
            'true',
          );
        }
      }
    });

    for (const schrift of ['normal', 'sehr-gross'] as const) {
      test(`${seite}: bei 188 px, „${schrift === 'normal' ? 'Normal' : 'Sehr groß'}“, rollt nichts quer`, async ({
        page,
      }) => {
        if (schrift !== 'normal') {
          await page.addInitScript((wert) => {
            window.localStorage.setItem('plattform-schriftgroesse', wert);
          }, schrift);
        }
        await page.setViewportSize({ width: 188, height: 406 });
        await oeffne(page, seite, merkmal, true);
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await fensterRolltQuer(page)).toEqual([]);
        expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      });
    }
  }

  for (const seite of ZUSTAENDE) {
    test(`${seite}: kein Hauptknopf, der Weg ist ein Zweitknopf`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await oeffne(page, seite, 'Check-in');
      expect(await hauptknoepfe(page)).toEqual([]);
    });
  }
});
