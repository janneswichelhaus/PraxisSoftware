import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Der Einstieg nach der ersten Anmeldung im Browser (DRP-EPIC-005; Handoff
 * 2026-10-22, Abschnitte 5.3, 6 und 8): vier Seiten mit einem Hauptknopf,
 * Schrift, Ziele, Kontrast und axe je Seite, 200 % ohne waagerechtes Rollen
 * und mit dem Fuß im Fluss, „Sehr groß“, der Rechner und die Begleitung.
 *
 * Die Prüfseite spricht mit keinem Server; was der Einstieg sendet, beantwortet
 * hier eine Nachbildung und zählt mit. Alles synthetisch.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

function nachbildung() {
  const aufrufe: Record<string, Record<string, unknown>[]> = {};
  let erteilt = false;
  let mail: string[] = [];
  const antworten: Record<string, (p: Record<string, unknown>) => unknown> = {
    record_platform_consent: (p) => {
      if (p.p_purpose === 'email_contact') erteilt = p.p_grant === true;
      return null;
    },
    platform_consents: () => [
      {
        purpose: 'email_contact',
        state: erteilt ? 'granted' : 'open',
        occurred_on: null,
        source: erteilt ? 'platform' : null,
        can_grant: true,
      },
      {
        purpose: 'prescriber_report',
        state: 'open',
        occurred_on: null,
        source: null,
        can_grant: true,
      },
    ],
    set_platform_notification_settings: (p) => {
      mail = p.p_email_kinds as string[];
      return null;
    },
    platform_notification_settings: () => [
      {
        email_kinds: mail,
        push_kinds: [],
        quiet_from: 20,
        quiet_until: 8,
        chosen_at: null,
        disabled_kinds: ['plan_assigned'],
        device_registered: false,
      },
    ],
    finish_platform_onboarding: () => null,
    platform_onboarding: () => [{ pending: false, finished_at: null, skipped_at: null }],
  };

  async function beantworte(route: Route) {
    const name = new URL(route.request().url()).pathname.split('/rpc/')[1] ?? '';
    const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (aufrufe[name] ??= []).push(parameter);
    const antwort = antworten[name];
    if (antwort) await route.fulfill({ json: antwort(parameter) });
    else await route.fulfill({ status: 404, json: { message: 'nicht nachgebildet' } });
  }

  return { aufrufe, beantworte };
}

async function oeffne(
  page: Page,
  ansicht: string,
  breite = 375,
  hoehe = 812,
): Promise<ReturnType<typeof nachbildung>> {
  const server = nachbildung();
  await page.setViewportSize({ width: breite, height: hoehe });
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  await page.goto(`${PRUEFSEITE}?seite=${ansicht}`);
  return server;
}

/** Das Fenster des Einstiegs; sein Name ist die Frage der Seite. */
function fenster(page: Page, name: string | RegExp): Locator {
  return page.getByRole('dialog', { name });
}

/** Tippt, sobald die Tippsperre nach dem Seitenwechsel vorbei ist. */
async function tippe(ziel: Locator) {
  await expect(ziel).toBeVisible();
  await expect(async () => {
    const gesperrt = await ziel.evaluate((el) => el.closest('.pointer-events-none') !== null);
    expect(gesperrt).toBe(false);
  }).toPass();
  await ziel.click();
}

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

/** Sichtbarer Text im Fenster unter 18 px - ohne Inhalte nur für Vorlesesoftware. */
async function kleineSchrift(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return ['kein Fenster'];
    const gehen = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
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

/** Bedienelemente im Fenster unter 44 px Höhe; eine Wahl zählt mit ihrer Fläche. */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      '[role="dialog"] :is(a, button, input, select, textarea, summary)',
    )) {
      const ziel = el.matches('input[type="radio"], input[type="checkbox"]')
        ? (el.closest('label') ?? el)
        : el;
      const box = ziel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5) {
        funde.push(`${Math.round(box.height)}px: ${(ziel.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return funde;
  });
}

/** Steht ein Wort in einer Zeile - oder bricht es mitten darin um? */
async function wortGanz(ort: Locator, wort: string): Promise<boolean> {
  return ort.evaluate((element, gesucht) => {
    const gehen = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
      const stelle = knoten.textContent?.indexOf(gesucht) ?? -1;
      if (stelle < 0) continue;
      const bereich = document.createRange();
      bereich.setStart(knoten, stelle);
      bereich.setEnd(knoten, stelle + gesucht.length);
      const zeilen = new Set(Array.from(bereich.getClientRects(), (r) => Math.round(r.top)));
      return zeilen.size === 1;
    }
    return false;
  }, wort);
}

/** Muss eine Fläche der Seite rollen? Bei „Sehr groß“ rollt die Seite samt Fuß (ANN-816). */
async function rollt(seite: Locator): Promise<boolean> {
  return seite.evaluate((fenster) =>
    [fenster, ...fenster.querySelectorAll<HTMLElement>('*')].some(
      (flaeche) =>
        ['auto', 'scroll'].includes(getComputedStyle(flaeche).overflowY) &&
        flaeche.scrollHeight > flaeche.clientHeight + 1,
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

async function pruefeSeite(page: Page, seite: Locator, name: string) {
  await expect(seite).toBeVisible();
  await bewegungAbwarten(page);
  expect(await kleineSchrift(page), `${name}: Schrift unter 18 px`).toEqual([]);
  expect(await kleineZiele(page), `${name}: Ziele unter 44 px`).toEqual([]);
  expect(await axeVerstoesse(page), `${name}: axe`).toEqual([]);
  expect(await ueberlaeuft(page), `${name}: waagerechtes Rollen`).toBe(false);
}

test.describe('Einstieg als geführter Ablauf (DRP-EPIC-005)', () => {
  test('375 px: vier Seiten, je ein Hauptknopf; ganz eingerichtet in sieben Tipps', async ({
    page,
  }) => {
    const server = await oeffne(page, 'einstieg');
    let tipps = 0;
    const tippeGezaehlt = async (ziel: Locator) => {
      tipps += 1;
      await tippe(ziel);
    };

    const willkommen = fenster(page, /^Willkommen,\s+Erika Beispiel$/);
    await pruefeSeite(page, willkommen, 'Willkommen');
    await expect(willkommen.getByText('Schritt 1 von 3', { exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Willkommen – Own Motion');
    await tippeGezaehlt(willkommen.getByRole('button', { name: 'Weiter' }));

    const daten = fenster(page, 'Zwei Fragen zu Ihren Daten');
    await pruefeSeite(page, daten, 'Einwilligungen');
    const mail = daten.getByRole('group', { name: 'Nachrichten per E-Mail' });
    // Gleich gewichtet nebeneinander, solange beide Wörter passen.
    const [jaBox, neinBox] = await Promise.all(
      ['Ja, erlauben', 'Nein'].map((name) => mail.getByRole('button', { name }).boundingBox()),
    );
    expect(Math.abs((jaBox?.y ?? 0) - (neinBox?.y ?? 1))).toBeLessThan(1);
    expect(Math.abs((jaBox?.width ?? 0) - (neinBox?.width ?? 0))).toBeLessThan(1);
    await tippeGezaehlt(mail.getByText('Ja, erlauben'));
    await expect(mail.getByText('Gespeichert.')).toBeVisible();
    expect(server.aufrufe['record_platform_consent']).toEqual([
      expect.objectContaining({
        p_purpose: 'email_contact',
        p_grant: true,
        p_wording_version: expect.any(String),
      }),
    ]);
    const bericht = daten.getByRole('group', { name: 'Bericht an Ihre Ärztin oder Ihren Arzt' });
    await tippeGezaehlt(bericht.getByText('Ja, erlauben'));
    await expect(bericht.getByText('Gespeichert.')).toBeVisible();
    await tippeGezaehlt(daten.getByRole('button', { name: 'Weiter' }));

    const mitteilungen = fenster(page, 'Sollen wir Ihnen Bescheid geben?');
    await pruefeSeite(page, mitteilungen, 'Mitteilungen');
    // Im Prüfbrowser gibt es keinen Push-Schlüssel: der Schalter für die E-Mail.
    const schalter = mitteilungen.getByRole('switch', { name: 'Mitteilungen per E-Mail' });
    await expect(schalter).toHaveAttribute('aria-checked', 'false');
    await tippeGezaehlt(schalter);
    await expect(schalter).toHaveAttribute('aria-checked', 'true');
    expect(server.aufrufe['set_platform_notification_settings']?.at(-1)).toMatchObject({
      p_email_kinds: [
        'appointment_reminder',
        'appointment_changed',
        'appointment_cancelled',
        'message_answered',
        'request_answered',
      ],
    });
    await tippeGezaehlt(mitteilungen.getByRole('button', { name: 'Weiter' }));

    const bereit = fenster(page, 'Alles bereit');
    await pruefeSeite(page, bereit, 'Alles bereit');
    await expect(
      bereit.getByText(
        'Als Nächstes: Ihr Fragebogen vor dem ersten Termin. Er dauert etwa 10 Minuten.',
      ),
    ).toBeVisible();
    await expect(bereit.getByRole('button', { name: 'Später' })).toHaveCount(0);
    await tippeGezaehlt(bereit.getByRole('button', { name: 'Zur Übersicht' }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(server.aufrufe['finish_platform_onboarding']).toHaveLength(1);
    // Vorher: je Einwilligung „Einwilligen“ und „Ja, ich willige ein“, je Art
    // ein Kästchen und „Speichern“ - 10 Tipps für eine Art und zwei Ja.
    expect(tipps).toBe(7);
  });

  test('188 px (200 %): kein Wort gebrochen, kein Bild, der Fuß rollt mit', async ({ page }) => {
    await oeffne(page, 'einstieg', 188, 406);
    const willkommen = fenster(page, /^Willkommen/);
    await expect(willkommen).toBeVisible();
    await expect(page.locator('[data-willkommensbild]')).toBeHidden();
    expect(await ueberlaeuft(page)).toBe(false);
    await tippe(willkommen.getByRole('button', { name: 'Weiter' }));

    const daten = fenster(page, 'Zwei Fragen zu Ihren Daten');
    await expect(daten).toBeVisible();
    await bewegungAbwarten(page);
    // „← Zurück“ und „Später“ stehen je in einer Zeile, zur Not untereinander.
    for (const name of ['← Zurück', 'Später']) {
      const box = await daten.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0, name).toBeLessThan(60);
    }
    // Kopf, Inhalt und Fuß liegen in einer Rollfläche: Nichts steht fest und
    // nimmt ein Drittel der Höhe.
    const flaeche = daten.locator('[class*="max-[23rem]:overflow-y-auto"]');
    expect(await flaeche.evaluate((f) => getComputedStyle(f).overflowY)).toBe('auto');
    for (const name of ['Später', 'Weiter']) {
      await expect(flaeche.getByRole('button', { name })).toHaveCount(1);
    }
    // Die neue Seite beginnt oben, obwohl auf der vorigen unten getippt wurde.
    expect(await flaeche.evaluate((f) => f.scrollTop)).toBe(0);
    await expect(daten.getByRole('heading', { level: 2 })).toBeInViewport();
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await axeVerstoesse(page), 'axe').toEqual([]);

    // Der Schalter: Zustand und Spur rücken unter die Beschriftung, statt sie
    // Buchstabe für Buchstabe umzubrechen (ohne das 1550 px hoch).
    await tippe(daten.getByRole('button', { name: 'Weiter' }));
    const schalter = fenster(page, 'Sollen wir Ihnen Bescheid geben?').getByRole('switch');
    await schalter.scrollIntoViewIfNeeded();
    expect((await schalter.boundingBox())?.height ?? 0).toBeLessThan(320);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('188 px (200 %): Ein langer Name bricht nur am Bindestrich (DR-114)', async ({ page }) => {
    await oeffne(page, 'einstieg-begleitung', 188, 406);
    const willkommen = fenster(page, /^Willkommen,\s+Paula Mustermann-Langenscheidt$/);
    await expect(willkommen).toBeVisible();
    const titel = willkommen.getByRole('heading', { level: 2 });
    for (const wort of ['Willkommen,', 'Paula', 'Mustermann-', 'Langenscheidt']) {
      expect(await wortGanz(titel, wort), wort).toBe(true);
    }
    // Im Satz darunter trennt der Browser den Namen auch nicht mit Trennstrich.
    const satz = willkommen.getByText(/^Hier sehen Sie/);
    expect(await wortGanz(satz, 'Langenscheidt'), 'im Satz').toBe(true);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('„Sehr groß“: die Wahl bleibt gleich gewichtet, nichts läuft über', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg');
    await tippe(fenster(page, /^Willkommen/).getByRole('button', { name: 'Weiter' }));
    const daten = fenster(page, 'Zwei Fragen zu Ihren Daten');
    await pruefeSeite(page, daten, 'Einwilligungen, Sehr groß');
    const mail = daten.getByRole('group', { name: 'Nachrichten per E-Mail' });
    const ja = await mail.getByRole('button', { name: 'Ja, erlauben' }).boundingBox();
    const nein = await mail.getByRole('button', { name: 'Nein' }).boundingBox();
    expect(ja?.height ?? 0).toBeGreaterThanOrEqual(47.5);
    expect(Math.abs((ja?.width ?? 0) - (nein?.width ?? 0))).toBeLessThan(1);
    // Wird es eng, steht jede Wahl in einer Zeile - kein Wort bricht im Knopf.
    expect(await wortGanz(mail.getByRole('button', { name: 'Ja, erlauben' }), 'Ja, erlauben')).toBe(
      true,
    );
  });

  test('„Sehr groß“: „Willkommen“ ohne Bild und ohne Rollen, der Fuß unten (ANN-816)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg-eingerichtet');
    const willkommen = fenster(page, /^Willkommen/);
    await pruefeSeite(page, willkommen, 'Willkommen, Sehr groß');
    await expect(page.locator('[data-willkommensbild]')).toBeHidden();
    expect(await rollt(willkommen)).toBe(false);
    // Passt alles, steht der Fuß unten im Daumenbereich wie ohne „Sehr groß“.
    const weiter = await willkommen.getByRole('button', { name: 'Weiter' }).boundingBox();
    expect((weiter?.y ?? 0) + (weiter?.height ?? 0)).toBeGreaterThan(812 - 40);
  });

  test('„Sehr groß“ bei 375 × 667: der Fuß folgt dem Inhalt und deckt nichts ab (ANN-816)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg', 375, 667);
    await tippe(fenster(page, /^Willkommen/).getByRole('button', { name: 'Weiter' }));
    const daten = fenster(page, 'Zwei Fragen zu Ihren Daten');
    await expect(daten).toBeVisible();
    expect(await rollt(daten)).toBe(true);
    // Die letzte Wahl liegt über dem Fuß, nicht unter ihm.
    const letzte = await daten.getByRole('button', { name: 'Nein' }).last().boundingBox();
    const weiter = daten.getByRole('button', { name: 'Weiter' });
    expect((await weiter.boundingBox())?.y ?? 0).toBeGreaterThan(
      (letzte?.y ?? 0) + (letzte?.height ?? 0),
    );
    await weiter.scrollIntoViewIfNeeded();
    await expect(weiter).toBeInViewport({ ratio: 1 });
    expect(await ueberlaeuft(page)).toBe(false);
  });

  // Seiten ohne Auswahl behalten bei „Sehr groß“ den festen Fuß (ANN-819): Der Gruß einer
  // Begleitung mit langem Namen passt bei 667 nicht, „Weiter“ stand erst nach Rollen im Bild.
  test('„Sehr groß“ bei 375 × 667, Begleitung: „Weiter“ steht fest im Bild, nur der Inhalt rollt (ANN-819)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg-begleitung', 375, 667);
    const willkommen = fenster(page, /^Willkommen/);
    await expect(willkommen).toBeVisible();
    const weiter = willkommen.getByRole('button', { name: 'Weiter' });
    await expect(weiter).toBeInViewport({ ratio: 1 });
    expect(await rollt(willkommen)).toBe(true);
    const inhalt = willkommen
      .getByRole('heading', { level: 2 })
      .locator('xpath=ancestor::*[@tabindex="0"][1]');
    await inhalt.evaluate((flaeche) => flaeche.scrollTo(0, flaeche.scrollHeight));
    await expect(weiter).toBeInViewport({ ratio: 1 });
    expect(await ueberlaeuft(page)).toBe(false);
  });

  // Unter 40rem Höhe fände der feste Fuß keinen Platz: Dort rollt er wieder mit (ANN-819).
  test('„Sehr groß“ im Querformat 667 × 375: „Weiter“ ist mit dem Finger zu erreichen (ANN-819)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg-begleitung', 667, 375);
    const willkommen = fenster(page, /^Willkommen/);
    await expect(willkommen).toBeVisible();
    // Gerollt wird unter dem festen Kopf, dort, wo der Daumen den Inhalt schiebt.
    const box = (await willkommen.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 24);
    await page.mouse.wheel(0, 2000);
    await expect(willkommen.getByRole('button', { name: 'Weiter' })).toBeInViewport({ ratio: 1 });
  });

  test('1280 px: Titel in der Stufe des Rechners, der Kopf an der Kante des Inhalts', async ({
    page,
  }) => {
    await oeffne(page, 'einstieg', 1280, 800);
    const willkommen = fenster(page, /^Willkommen/);
    await expect(willkommen).toBeVisible();
    const gruss = willkommen.getByRole('heading', { level: 2 });
    expect(await gruss.evaluate((el) => getComputedStyle(el).fontSize)).toBe('40px');
    const spalte = await gruss.boundingBox();
    const spaeter = await willkommen.getByRole('button', { name: 'Später' }).boundingBox();
    // „Später“ steht an der rechten Kante der Spalte, nicht am Rand des Fensters.
    expect(
      Math.abs(
        (spaeter?.x ?? 0) + (spaeter?.width ?? 0) - ((spalte?.x ?? 0) + (spalte?.width ?? 0)),
      ),
    ).toBeLessThan(16);
    // Das Bild bleibt 4:3 und passt mit dem Text ohne Rollen ins Fenster.
    const bild = await willkommen.locator('[data-willkommensbild] > div').boundingBox();
    expect((bild?.width ?? 0) / (bild?.height ?? 1)).toBeCloseTo(4 / 3, 1);
    expect(await rollt(willkommen)).toBe(false);
    await tippe(willkommen.getByRole('button', { name: 'Weiter' }));
    const titel = fenster(page, 'Zwei Fragen zu Ihren Daten').getByRole('heading', { level: 2 });
    expect(await titel.evaluate((el) => getComputedStyle(el).fontSize)).toBe('32px');
  });

  test('Begleitung: zwei Seiten mit dem Band, keine Einwilligungen, zur Übersicht', async ({
    page,
  }) => {
    await oeffne(page, 'einstieg-begleitung');
    const willkommen = fenster(page, /^Willkommen,\s+Paula Mustermann-Langenscheidt$/);
    await pruefeSeite(page, willkommen, 'Willkommen, Begleitung');
    await expect(willkommen.getByText('Schritt 1 von 2', { exact: true })).toBeVisible();
    await expect(willkommen.getByRole('status')).toContainText(
      'Sie handeln für Maximilian Mustermann-Langenscheidt',
    );
    expect(await rollt(willkommen)).toBe(false);
    await tippe(willkommen.getByRole('button', { name: 'Weiter' }));
    const mitteilungen = fenster(page, 'Sollen wir Ihnen Bescheid geben?');
    await pruefeSeite(page, mitteilungen, 'Mitteilungen, Begleitung');
    await expect(mitteilungen.getByText('Schritt 2 von 2', { exact: true })).toBeVisible();
    await tippe(mitteilungen.getByRole('button', { name: 'Weiter' }));
    const bereit = fenster(page, 'Alles bereit');
    await expect(
      bereit.getByText('Die Übersicht zeigt, was für Maximilian Mustermann-Langenscheidt ansteht.'),
    ).toBeVisible();
    await expect(bereit.getByRole('button')).toHaveText(['← Zurück', 'Zur Übersicht']);
  });

  test('„Sehr groß“, Begleitung: Den Namen im Satz trennt der Browser nicht (DR-114)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
    });
    await oeffne(page, 'einstieg-begleitung');
    // Der lange Name steht in 22 wie unter 23rem: So bleibt „Weiter“ bei 375 × 812 im Bild (ANN-816).
    const weiter = fenster(page, /^Willkommen/).getByRole('button', { name: 'Weiter' });
    await expect(weiter).toBeInViewport({ ratio: 1 });
    await tippe(weiter);
    const mitteilungen = fenster(page, 'Sollen wir Ihnen Bescheid geben?');
    await tippe(mitteilungen.getByRole('button', { name: 'Weiter' }));
    const satz = fenster(page, 'Alles bereit').getByText(/^Die Übersicht zeigt/);
    await expect(satz).toBeVisible();
    expect(await wortGanz(satz, 'Langenscheidt')).toBe(true);
    // Wo der Name in die Zeile fällt, hängt an Breite und Schrift - deshalb der
    // Stil selbst: Der Satz trennt lange Wörter, der Name darin nie.
    const trennung = await satz.evaluate((p) => {
      const name = Array.from(p.querySelectorAll('span')).find((s) =>
        s.textContent?.includes('Langenscheidt'),
      );
      return [getComputedStyle(p).hyphens, name ? getComputedStyle(name).hyphens : 'fehlt'];
    });
    expect(trennung).toEqual(['auto', 'manual']);
  });

  test('1280 px, Begleitung: das Band reicht über die ganze Breite des Fensters', async ({
    page,
  }) => {
    await oeffne(page, 'einstieg-begleitung', 1280, 800);
    const willkommen = fenster(page, /^Willkommen/);
    await pruefeSeite(page, willkommen, 'Willkommen, Begleitung, Rechner');
    const band = await willkommen.getByRole('status').boundingBox();
    const rahmen = await willkommen.boundingBox();
    expect(Math.abs((band?.width ?? 0) - (rahmen?.width ?? 0))).toBeLessThan(6);
    expect(await rollt(willkommen)).toBe(false);
  });

  test('nach der Einrichtung einmal „Anmeldung eingerichtet“, der Parameter geht', async ({
    page,
  }) => {
    await oeffne(page, 'einstieg-eingerichtet');
    const willkommen = fenster(page, /^Willkommen/);
    await expect(willkommen.getByText('Anmeldung eingerichtet')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('eingerichtet')).toBe(false);
    await pruefeSeite(page, willkommen, 'Willkommen nach der Einrichtung');
  });
});
