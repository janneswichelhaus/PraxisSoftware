import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type AxeCore from 'axe-core';
import { naechsteWerktage } from '../../src/features/portal/platform/zeit';

/**
 * Ändern, Absagen und Wünschen im echten Browser bei 375 × 667 mit gezählten Tipps ab der Liste
 * (Budgets in `docs/product/kernablaeufe.md`; die Nachricht zählt als Text). Der Server ist eine
 * Nachbildung über abgefangene Anfragen, Rechte und Fristen prüft `pnpm test:db`.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const BILDER = '.tmp/screenshots';
/** Der Hausbesuch der Prüfseite (`fixtures/plattform.tsx`). */
const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f1';
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
/** Der Titel der Seite eines Termins: der Tag in Worten. */
const TAG = /^(Heute|Morgen|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /;
/** Wie viele Werktage „Wann passt es Ihnen?“ anbietet (`WUNSCHTAGE`). */
const WUNSCHTAGE = 14;

function inTagen(tage: number, stunde: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, minute, 0, 0);
  return d.toISOString();
}

/** Die Kalendertage der gewählten Wochentage, wie der Server sie bekommt. */
function tageAm(...wochentage: number[]): string[] {
  return naechsteWerktage(WUNSCHTAGE).filter((tag) =>
    wochentage.includes(new Date(`${tag}T12:00:00`).getDay()),
  );
}

/**
 * Die Nachbildung: nimmt die Wünsche an und liefert danach Termine und
 * Wünsche so, wie der Server sie dann zeigt.
 */
function nachbildung() {
  const aufrufe: Record<string, Record<string, unknown>[]> = {};
  let offen: 'change' | 'cancel' | null = null;

  function termine() {
    return [
      {
        id: TERMIN,
        starts_at: inTagen(3, 9, 30),
        ends_at: inTagen(3, 10, 30),
        appointment_type: 'home_visit',
        status: 'confirmed',
        staff_name: 'Anna Beispiel',
        location_name: null,
        visit_street: 'Testweg',
        visit_house_number: '7',
        visit_postal_code: '72072',
        visit_city: 'Tuebingen',
        late_notice: false,
        open_request_kind: offen,
      },
    ];
  }

  // Wie der Server: jeder gesendete Wunsch steht danach unter „Ihre Wünsche“ -
  // ein neuer ebenso wie ein Änderungs- oder Absagewunsch zum Termin.
  function wuensche() {
    const neu = aufrufe.request_platform_appointment?.at(-1);
    const zumTermin = aufrufe.request_platform_appointment_change?.at(-1);
    const offen = (id: string, kind: string, p: Record<string, unknown>) => ({
      id,
      kind,
      appointment_id: kind === 'new' ? null : p.p_appointment_id,
      preferred_days: p.p_days,
      preferred_times: p.p_times,
      note: p.p_note,
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      answer: null,
    });
    return [
      ...(neu ? [offen('dddddddd-dddd-4ddd-8ddd-0000000000b1', 'new', neu)] : []),
      ...(zumTermin
        ? [offen('dddddddd-dddd-4ddd-8ddd-0000000000a1', zumTermin.p_kind as string, zumTermin)]
        : []),
    ];
  }

  const antworten: Record<string, (p: Record<string, unknown>) => unknown> = {
    request_platform_appointment_change: (p) => {
      offen = p.p_kind as 'change' | 'cancel';
      return 'dddddddd-dddd-4ddd-8ddd-0000000000a1';
    },
    request_platform_appointment: () => 'dddddddd-dddd-4ddd-8ddd-0000000000b1',
    platform_appointments: () => termine(),
    platform_appointment_requests: () => wuensche(),
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

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

async function oeffne(page: Page, server: ReturnType<typeof nachbildung>, ansicht: string) {
  // Das kleinste übliche Telefon.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  await page.goto(`${PRUEFSEITE}?seite=${ansicht}`);
}

/** Das Fenster des geführten Ablaufs; sein Name ist die Frage der Seite. */
function fenster(page: Page, name: string) {
  return page.getByRole('dialog', { name });
}

/** Ob das Fenster ohne Rollen auskommt: weder Fenster noch Fläche laufen über. */
async function scrolltNicht(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return false;
    const flaechen = [dialog, ...dialog.querySelectorAll<HTMLElement>('.overflow-y-auto')];
    return flaechen.every((flaeche) => flaeche.scrollHeight <= flaeche.clientHeight + 1);
  });
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Sichtbarer Text im Fenster unter 18 px - ohne Inhalte nur für Bildschirmleser. */
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

/** Bedienelemente im Fenster unter 44 px Höhe; ein Kästchen zählt mit seiner Zeile. */
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
        funde.push(
          `${Math.round(box.height)}px: ${(ziel.textContent ?? ziel.outerHTML).trim().slice(0, 40)}`,
        );
      }
    }
    return funde;
  });
}

/** Text in Kopf und Inhalt des Fensters, der gekürzt („…“) statt umbrochen steht. */
async function gekuerzt(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"] :is(h2, p)')]
      .filter(
        (el) =>
          getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => (el.textContent ?? '').trim().slice(0, 40)),
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

/** Ein Bild der Seite bei 375 px, auf Wunsch dazu bei 1280 px. */
async function bild(page: Page, name: string, breit = false) {
  await page.screenshot({ path: `${BILDER}/${name}-375.png`, animations: 'disabled' });
  if (!breit) return;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${BILDER}/${name}-1280.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * Eine Frageseite: ohne Rollen bei 375 × 667, Schrift, Ziele und axe; dann das
 * Bild. Gewartet wird, bis die Tippsperre nach dem Seitenwechsel vorbei ist.
 */
async function pruefeSeite(page: Page, seite: Locator, name: string, breit = false) {
  await expect(seite).toBeVisible();
  expect(await scrolltNicht(page), `${name} ohne Rollen`).toBe(true);
  expect(await kleineSchrift(page), `${name}: Schrift unter 18 px`).toEqual([]);
  expect(await kleineZiele(page), `${name}: Ziele unter 44 px`).toEqual([]);
  expect(await axeVerstoesse(page), `${name}: axe`).toEqual([]);
  expect(await ueberlaeuft(page)).toBe(false);
  await bild(page, name, breit);
}

/**
 * Der Abschluss: Hauptknopf und der Satz darüber ganz im Bild, auch bei 200 %
 * Vergrößerung (188 px) kein waagerechtes Rollen. `rollt`: Unter 24 Stunden
 * steht die Warnung zusätzlich im festen Fuß - dann darf der Inhalt darüber
 * rollen; sonst passt die Zusammenfassung ganz auf 375 × 667.
 */
async function pruefeAbschluss(
  page: Page,
  ende: Locator,
  knopf: string,
  name: string,
  { breit = false, rollt = false }: { breit?: boolean; rollt?: boolean } = {},
) {
  await expect(ende).toBeVisible();
  // Die Frage bleibt oben stehen: Der Fokus am Anfang rollt nichts weg.
  await expect(ende.getByRole('heading', { name: 'Ist alles richtig?' })).toBeInViewport({
    ratio: 1,
  });
  if (!rollt) expect(await scrolltNicht(page), `${name} ohne Rollen`).toBe(true);
  await expect(ende.getByRole('button', { name: knopf })).toBeInViewport({ ratio: 1 });
  await expect(ende.getByRole('button', { name: 'Abbrechen' })).toBeInViewport({ ratio: 1 });
  expect(await kleineSchrift(page), `${name}: Schrift unter 18 px`).toEqual([]);
  expect(await kleineZiele(page), `${name}: Ziele unter 44 px`).toEqual([]);
  expect(await axeVerstoesse(page), `${name}: axe`).toEqual([]);
  expect(await ueberlaeuft(page)).toBe(false);
  await bild(page, name, breit);
  await page.setViewportSize({ width: 188, height: 667 });
  expect(await ueberlaeuft(page), `${name} bei 200 %`).toBe(false);
  // Der Kopf nennt Tag, Zeit und Art des Termins: bei 200 % umbrochen, nicht gekürzt.
  expect(await gekuerzt(page), `${name}: gekürzt bei 200 %`).toEqual([]);
  await page.setViewportSize({ width: 375, height: 667 });
}

/** Der Hausbesuch auf der Liste: der nächste Termin als Hero-Karte, die ganze Karte als Ziel. */
function terminzeile(page: Page) {
  return page.getByRole('region', { name: /^Besuch / }).getByRole('link');
}

/** Die Liste ist geladen: der nächste Termin steht als Karte. */
function liste(page: Page) {
  return page.getByRole('region', { name: /^Besuch / });
}

/** Die Wünsche unter „Ihre Wünsche“ - die Bestätigung nach dem Senden (Frage 3). */
function wuensche(page: Page) {
  return page.getByRole('list', { name: 'Ihre Wünsche' });
}

test.describe('Plattform: Termin ändern, absagen, wünschen (Überholung 6, G6)', () => {
  test('Absagen: höchstens 4 Tipps ab der Terminliste, jede Seite ohne Rollen', async ({
    page,
  }) => {
    const server = nachbildung();
    await oeffne(page, server, 'termine');
    await expect(liste(page)).toBeVisible();
    const z = zaehler();

    await z.tippe(terminzeile(page));
    await expect(page.getByRole('heading', { level: 1, name: TAG })).toBeVisible();
    await bild(page, 'b6-absagen-01-seite-des-termins', true);

    await z.tippe(page.getByRole('link', { name: 'Termin absagen' }));
    const hinweis = fenster(page, 'Ausfallhonorar');
    await expect(hinweis.getByText('Schritt 1 von 2', { exact: true })).toBeVisible();
    await expect(hinweis.getByText(/es entsteht kein Ausfallhonorar/)).toBeVisible();
    await pruefeSeite(page, hinweis, 'b6-absagen-02-ausfallhonorar');

    await z.tippe(hinweis.getByRole('button', { name: 'Verstanden, weiter' }));
    const ende = fenster(page, 'Ist alles richtig?');
    await expect(ende.getByText('Schritt 2 von 2', { exact: true })).toBeVisible();
    await expect(ende.getByText('Termin absagen', { exact: true })).toBeVisible();
    await expect(ende.getByText('Hausbesuch · Anna Beispiel', { exact: true })).toBeVisible();
    await expect(ende.getByText(/Als Eingang Ihrer Absage gilt der Zeitpunkt/)).toBeInViewport({
      ratio: 1,
    });
    await pruefeAbschluss(page, ende, 'Absage senden', 'b6-absagen-03-zusammenfassung', {
      breit: true,
    });

    await z.tippe(ende.getByRole('button', { name: 'Absage senden' }));
    await expect(page.getByText('Ihr Wunsch ist bei der Praxis angekommen.')).toBeVisible();
    await expect(wuensche(page)).toContainText(/Absage für .*angefragt/);
    await bild(page, 'b6-absagen-04-gesendet');
    expect(server.aufrufe.request_platform_appointment_change).toEqual([
      {
        p_access_id: ZUGANG,
        p_appointment_id: TERMIN,
        p_kind: 'cancel',
        p_days: [],
        p_times: [],
        p_note: null,
      },
    ]);
    test.info().annotations.push({
      type: 'G6 Absagen',
      description: `${z.tipps} Tipps in zwei Schritten ab der Seite des Termins`,
    });
    expect(z.tipps).toBeLessThanOrEqual(4);
  });

  test('Ändern: höchstens 6 Tipps und Text ab der Terminliste, „Wann passt es Ihnen?“ auf einer Seite', async ({
    page,
  }) => {
    const server = nachbildung();
    await oeffne(page, server, 'termine');
    await expect(liste(page)).toBeVisible();
    const z = zaehler();

    await z.tippe(terminzeile(page));
    await expect(page.getByRole('heading', { level: 1, name: TAG })).toBeVisible();
    await z.tippe(page.getByRole('link', { name: 'Termin ändern' }));
    const wann = fenster(page, 'Wann passt es Ihnen?');
    await expect(wann.getByText('Schritt 1 von 2', { exact: true })).toBeVisible();
    // Die Leiste der Tage, die Tageszeiten und „Egal“ zusammen auf einer Seite ohne Rollen.
    await pruefeSeite(page, wann, 'b6-aendern-02-wann-passt-es');

    await z.tippe(wann.getByRole('button', { name: 'Montag' }));
    await z.tippe(wann.getByRole('button', { name: 'Vormittag' }));
    await z.tippe(wann.getByRole('button', { name: 'Weiter' }));
    const ende = fenster(page, 'Ist alles richtig?');
    await expect(ende.getByText('Lieber am', { exact: true })).toBeVisible();
    await expect(ende.getByText('Montag, vormittags', { exact: true })).toBeVisible();
    // Was beim Freigeben gilt, steht fest über dem Knopf.
    const freigabe = ende.getByText(/es entsteht kein Ausfallhonorar/);
    await expect(freigabe).toBeInViewport({ ratio: 1 });
    await pruefeAbschluss(page, ende, 'Änderungswunsch senden', 'b6-aendern-03-zusammenfassung', {
      breit: true,
    });

    // Text: die Nachricht aufklappen und schreiben - das Feld hat gleich den Fokus.
    await ende.getByText('Nachricht an die Praxis (freiwillig)').click();
    await expect(ende.getByLabel('Was sollen wir noch wissen?')).toBeFocused();
    await page.keyboard.type('Bitte nicht vor 10 Uhr.');
    await expect(ende.getByRole('button', { name: 'Änderungswunsch senden' })).toBeInViewport({
      ratio: 1,
    });
    await bild(page, 'b6-aendern-04-nachricht');

    await z.tippe(ende.getByRole('button', { name: 'Änderungswunsch senden' }));
    await expect(page.getByText('Ihr Wunsch ist bei der Praxis angekommen.')).toBeVisible();
    await expect(wuensche(page)).toContainText(/Änderung für .*angefragt/);
    await bild(page, 'b6-aendern-05-gesendet');
    expect(server.aufrufe.request_platform_appointment_change).toEqual([
      {
        p_access_id: ZUGANG,
        p_appointment_id: TERMIN,
        p_kind: 'change',
        p_days: tageAm(1),
        p_times: ['morning'],
        p_note: 'Bitte nicht vor 10 Uhr.',
      },
    ]);
    test.info().annotations.push({
      type: 'G6 Ändern',
      description: `${z.tipps} Tipps + Text in zwei Schritten ab der Seite des Termins`,
    });
    expect(z.tipps).toBeLessThanOrEqual(6);
  });

  test('Absagen unter 24 Stunden: der Hinweis als Warnung, vor dem Knopf und in der Zusammenfassung', async ({
    page,
  }) => {
    const server = nachbildung();
    await oeffne(page, server, 'termin-absagen&kurzfristig');
    const hinweis = fenster(page, 'Ausfallhonorar');
    const warnung = hinweis.getByRole('alert');
    await expect(warnung).toContainText('weniger als 24 Stunden');
    await expect(warnung).toContainText('berechnen wir ein Ausfallhonorar');
    await expect(warnung).toBeInViewport({ ratio: 1 });
    // Die ganze Regel steht gleich offen darunter; es rollt nur der Inhalt, der Knopf bleibt.
    await expect(hinweis.getByText(/Genau 24 Stunden vorher genügt/)).toBeVisible();
    await expect(hinweis.getByRole('button', { name: 'Verstanden, weiter' })).toBeInViewport({
      ratio: 1,
    });
    await bild(page, 'b6-absagen-kurzfristig-01-ausfallhonorar');
    // Zugeklappt kommt die Seite ohne Rollen aus.
    await hinweis.getByText('Unsere Regel zum Ausfallhonorar').click();
    await expect(hinweis.getByText(/Genau 24 Stunden vorher genügt/)).toBeHidden();
    await pruefeSeite(page, hinweis, 'b6-absagen-kurzfristig-02-regel-zu');

    await hinweis.getByRole('button', { name: 'Verstanden, weiter' }).click();
    const ende = fenster(page, 'Ist alles richtig?');
    // Die Warnung noch einmal, fest direkt über „Absage senden“.
    const nochmal = ende.getByText(/weniger als 24 Stunden/);
    await expect(nochmal).toBeInViewport({ ratio: 1 });
    await pruefeAbschluss(
      page,
      ende,
      'Absage senden',
      'b6-absagen-kurzfristig-03-zusammenfassung',
      {
        rollt: true,
      },
    );
  });

  test('Ändern unter 24 Stunden: die Warnung zum Freigeben steht fest über dem Knopf', async ({
    page,
  }) => {
    const server = nachbildung();
    await oeffne(page, server, 'termin-aendern&kurzfristig');
    const wann = fenster(page, 'Wann passt es Ihnen?');
    // Schon auf Schritt 1 und zuerst vorgelesen, was eine Verlegung kostet (ANN-805); die Frage
    // passt trotzdem ohne Rollen, bis „Egal“.
    const verlegen = wann.getByText(
      'Ein anderer Tag kostet ein Ausfallhonorar nach unserer Preisliste.',
    );
    await expect(verlegen).toBeInViewport({ ratio: 1 });
    await expect(verlegen.locator('..')).toBeFocused();
    await expect(wann.getByRole('button', { name: 'Egal' })).toBeInViewport({ ratio: 1 });
    await pruefeSeite(page, wann, 'b6-aendern-kurzfristig-00-wann-passt-es');
    await wann.getByRole('button', { name: 'Dienstag' }).click();
    await wann.getByRole('button', { name: 'Donnerstag' }).click();
    await wann.getByRole('button', { name: 'Egal' }).click();
    await wann.getByRole('button', { name: 'Weiter' }).click();
    const ende = fenster(page, 'Ist alles richtig?');
    const warnung = ende.getByText(/wie eine kurzfristige Absage/);
    await expect(warnung).toBeInViewport({ ratio: 1 });
    await pruefeAbschluss(
      page,
      ende,
      'Änderungswunsch senden',
      'b6-aendern-kurzfristig-01-zusammenfassung',
      { rollt: true },
    );
  });

  test('Wünschen: 5 Tipps ab der Terminliste, „Ein vereinbarter Termin ist das noch nicht“ über dem Knopf', async ({
    page,
  }) => {
    const server = nachbildung();
    await oeffne(page, server, 'termine');
    await expect(liste(page)).toBeVisible();
    const z = zaehler();

    await z.tippe(page.getByRole('link', { name: 'Termin wünschen' }));
    const wann = fenster(page, 'Wann passt es Ihnen?');
    await expect(wann.getByText('Schritt 1 von 2', { exact: true })).toBeVisible();
    await pruefeSeite(page, wann, 'b6-wunsch-01-wann-passt-es', true);

    await z.tippe(wann.getByRole('button', { name: 'Mittwoch' }));
    await z.tippe(wann.getByRole('button', { name: 'Egal' }));
    await z.tippe(wann.getByRole('button', { name: 'Weiter' }));
    const ende = fenster(page, 'Ist alles richtig?');
    await expect(ende.getByText('Mittwoch, zu jeder Tageszeit', { exact: true })).toBeVisible();
    await expect(ende.getByText(/Ein vereinbarter Termin ist das noch nicht/)).toBeInViewport({
      ratio: 1,
    });
    await pruefeAbschluss(page, ende, 'Wunsch senden', 'b6-wunsch-02-zusammenfassung', {
      breit: true,
    });

    await z.tippe(ende.getByRole('button', { name: 'Wunsch senden' }));
    await expect(page.getByText('Ihr Wunsch ist bei der Praxis angekommen.')).toBeVisible();
    await expect(wuensche(page)).toContainText(/Terminwunsch.*angefragt.*Gesendet am /);
    await bild(page, 'b6-wunsch-03-gesendet');
    expect(server.aufrufe.request_platform_appointment).toEqual([
      { p_access_id: ZUGANG, p_days: tageAm(3), p_times: [], p_note: null },
    ]);
    test.info().annotations.push({
      type: 'G6 Wünschen',
      description: `${z.tipps} Tipps in zwei Schritten`,
    });
    expect(z.tipps).toBeLessThanOrEqual(5);
  });
});
