import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type AxeCore from 'axe-core';
import { testFlotte } from '../../src/features/fleet/testdaten';

/**
 * „Neue:n Mitarbeiter:in einrichten“ (Überholung 6, G5) im echten Browser
 * auf dem kleinsten üblichen Telefon (375 × 667), mit gezählten Tipps:
 *
 *   * **Inhaber:in:** Name und Kontakt → Rolle → Wochenplan aus Vorlage →
 *     Schlüssel eines Rads → Einladung → Abschluss, ≤ 8 Tipps + Felder mit
 *     dem Einstieg „Mitarbeiter:in anlegen“ (vorher über drei Seiten verteilt);
 *   * **Büro:** Name und Kontakt → Rad → Abschluss;
 *   * die **Ergebnisseite**, wenn ein späterer Schritt scheitert.
 *
 * Je Seite: kein Scrollen (im Abschluss rollt nur die Zusammenfassung über dem
 * festen Fuß), Ziele ≥ 44 px, axe ohne Befund, ein Bildschirmfoto nach
 * `.tmp/screenshots/`. Der Server ist eine Nachbildung über abgefangene
 * Anfragen; Rechte prüft `pnpm test:db`, den Weg gegen den echten Stack
 * `authenticated/mitarbeiter-einrichten.spec.ts`. Alles ist synthetisch.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/einrichten.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const NEU = '55555555-5555-4555-8555-0000000000aa';
const BILDER = '.tmp/screenshots';

type Antwort = { status?: number; json: unknown };

function nachbildung({
  schluessel = 'gelingt',
  anmeldemail = 'gesendet',
}: {
  schluessel?: 'gelingt' | 'entnommen';
  anmeldemail?: 'gesendet' | 'kein_konto';
} = {}) {
  const aufrufe: Record<string, Record<string, unknown>[]> = {};
  const antworten: Record<string, (p: Record<string, unknown>) => Antwort> = {
    list_fleet: () => ({ json: testFlotte() }),
    create_staff_member: () => ({ json: NEU }),
    set_staff_member_schedulable: () => ({ json: null }),
    set_staff_working_hours: () => ({ json: 1 }),
    take_fleet_key: () =>
      schluessel === 'entnommen'
        ? { status: 400, json: { code: '55000', message: 'key already taken' } }
        : { json: 'schluessel-neu' },
    invite_staff_account: () => ({ json: 'einladung-neu' }),
  };

  async function beantworte(route: Route) {
    const name = new URL(route.request().url()).pathname.split('/rpc/')[1];
    if (!name) {
      await route.fulfill({ json: [] });
      return;
    }
    const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (aufrufe[name] ??= []).push(parameter);
    const antwort = antworten[name]?.(parameter) ?? { json: [] };
    await route.fulfill({ status: antwort.status ?? 200, json: antwort.json });
  }

  // Die Anmeldemail (`signInWithOtp`): ohne Konto beim Anmeldedienst weist er ab.
  async function anmeldedienst(route: Route) {
    if (anmeldemail === 'kein_konto') {
      await route.fulfill({
        status: 422,
        json: { code: 'otp_disabled', msg: 'Signups not allowed for otp' },
      });
      return;
    }
    await route.fulfill({ json: {} });
  }

  return { aufrufe, beantworte, anmeldedienst };
}

async function oeffne(page: Page, server: ReturnType<typeof nachbildung>, suche = '') {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  await page.route('**/auth/v1/**', (route) => server.anmeldedienst(route));
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto(`${PRUEFSEITE}${suche}`);
}

function zaehler() {
  let tipps = 0;
  return {
    /** Ein Tipp; Playwright wartet von selbst, bis die Tippsperre vorbei ist. */
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

/** Das Fenster des Ablaufs; sein Name ist die Frage der Seite. */
function fenster(page: Page, frage: string) {
  return page.getByRole('dialog', { name: frage });
}

/** Ob das Fenster ohne Scrollen auskommt: weder Fenster noch Fragefläche laufen über. */
async function scrolltNicht(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return false;
    const flaechen = [dialog, ...dialog.querySelectorAll<HTMLElement>('.overflow-y-auto')];
    return (
      flaechen.every((flaeche) => flaeche.scrollHeight <= flaeche.clientHeight + 1) &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
  });
}

/** Jedes Ziel im Fenster ist mindestens 44 px hoch - Knöpfe, Links, Felder, Kästchen. */
async function zieleMindestens44(page: Page) {
  const zuKlein = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return ['kein Fenster'];
    const ziele = [
      ...dialog.querySelectorAll<HTMLElement>('button, a[href], input:not([type="checkbox"])'),
      // Beim Kästchen ist die Beschriftung das Ziel.
      ...[...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (kaestchen) => kaestchen.closest('label') ?? kaestchen,
      ),
    ];
    return ziele
      .filter((ziel) => ziel.getBoundingClientRect().height < 44)
      .map((ziel) => `${ziel.tagName} „${(ziel.textContent ?? '').trim().slice(0, 30)}“`);
  });
  expect(zuKlein).toEqual([]);
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

/** Eine Seite vermessen und festhalten: kein Scrollen, 44 px, axe, Bildschirmfoto. */
async function pruefeSeite(page: Page, nummer: string, name: string) {
  // Erst nach der Tippsperre und dem Aufgehen der Seite messen.
  await page.waitForTimeout(800);
  expect(await scrolltNicht(page), `${name} ohne Scrollen`).toBe(true);
  await zieleMindestens44(page);
  expect(await axeVerstoesse(page), `${name}: axe`).toEqual([]);
  mkdirSync(BILDER, { recursive: true });
  await page.screenshot({ path: `${BILDER}/b6-team-${nummer}-${name}-375.png` });
}

/** Am Rechner: dasselbe Fenster groß in der Mitte. */
async function amRechner(page: Page, nummer: string, name: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${BILDER}/b6-team-${nummer}-${name}-1280.png` });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(300);
}

function wege(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wege: string[] }).__wege);
}

test('G5 Inhaberin: einrichten in sieben Tipps nach dem Einstieg, jede Seite ohne Scrollen', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const server = nachbildung();
  await oeffne(page, server);
  const z = zaehler();

  const person = fenster(page, 'Wer kommt ins Team?');
  await expect(person.getByText('Schritt 1 von 6', { exact: true })).toBeVisible();
  await pruefeSeite(page, '01', 'person');
  await amRechner(page, '01', 'person');
  await person.getByLabel('Vorname *').fill('Nina');
  await person.getByLabel('Nachname *').fill('Neu');
  await person.getByLabel('Dienstliche E-Mail').fill('nina.neu@praxis.invalid');
  await z.tippe(person.getByRole('button', { name: 'Weiter' }));

  const rolle = fenster(page, 'Welche Rolle?');
  await z.tippe(rolle.getByText('Therapeut:in', { exact: true }));
  await expect(
    rolle.getByText('Behandelt, dokumentiert, sieht alle Akten der Praxis.'),
  ).toBeVisible();
  await pruefeSeite(page, '02', 'rolle');
  await z.tippe(rolle.getByRole('button', { name: 'Weiter' }));

  const zeit = fenster(page, 'Wann arbeitet Nina?');
  await expect(zeit.getByRole('button', { name: /^Vollzeit/ })).toBeVisible();
  await pruefeSeite(page, '03', 'arbeitszeit');
  await z.tippe(zeit.getByRole('button', { name: /^Vollzeit/ }));

  const rad = fenster(page, 'Fährt Nina ein Lastenrad?');
  await expect(rad.getByRole('button', { name: /^Lastenrad 4/ })).toBeVisible();
  await expect(rad.getByRole('button', { name: /^Lastenrad 3/ })).toHaveCount(0);
  await pruefeSeite(page, '04', 'rad');
  await z.tippe(rad.getByRole('button', { name: /^Lastenrad 4/ }));

  const zugang = fenster(page, 'Zugang einladen?');
  await expect(zugang.getByLabel('E-Mail-Adresse für den Zugang')).toHaveValue(
    'nina.neu@praxis.invalid',
  );
  await pruefeSeite(page, '05', 'einladung');
  await z.tippe(zugang.getByRole('button', { name: 'Einladung senden' }));

  const abschluss = fenster(page, 'Alles richtig?');
  await expect(abschluss.getByText('Schlüssel von Lastenrad 4')).toBeVisible();
  // Im Abschluss steht der Hauptknopf fest im Bild, die Zusammenfassung darf rollen.
  await expect(abschluss.getByRole('button', { name: 'Nina einrichten' })).toBeInViewport({
    ratio: 1,
  });
  await page.waitForTimeout(800);
  // Die Frage bleibt oben stehen - der Fokus rollt sie nicht aus dem Bild.
  await expect(abschluss.getByRole('heading', { name: 'Alles richtig?' })).toBeInViewport({
    ratio: 1,
  });
  await zieleMindestens44(page);
  expect(await axeVerstoesse(page)).toEqual([]);
  await page.screenshot({ path: `${BILDER}/b6-team-06-abschluss-375.png` });
  await amRechner(page, '06', 'abschluss');
  await z.tippe(abschluss.getByRole('button', { name: 'Nina einrichten' }));

  await expect.poll(() => wege(page)).toContain(`/praxis/team/${NEU}`);
  expect(server.aufrufe.create_staff_member).toHaveLength(1);
  expect(server.aufrufe.set_staff_member_schedulable).toEqual([
    { p_staff_member_id: NEU, p_treatment: true, p_training: false },
  ]);
  expect(server.aufrufe.set_staff_working_hours!.map((p) => p.p_weekday)).toEqual([1, 2, 3, 4, 5]);
  expect(server.aufrufe.take_fleet_key).toEqual([{ p_bike_id: 'rad-4', p_holder_staff_id: NEU }]);
  expect(server.aufrufe.invite_staff_account).toEqual([
    { p_staff_member_id: NEU, p_email: 'nina.neu@praxis.invalid', p_role_keys: ['therapist'] },
  ]);
  test.info().annotations.push({
    type: 'G5',
    description: `${z.tipps} Tipps + 3 Felder ab der Anlage, mit „Mitarbeiter:in anlegen“ ${z.tipps + 1} (vorher über drei Seiten verteilt)`,
  });
  expect(z.tipps).toBe(7);
});

test('G5 Ergebnisseite: angelegt, je Schritt Stand und Weg, wenn der Schlüssel schon weg ist', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const server = nachbildung({ schluessel: 'entnommen', anmeldemail: 'kein_konto' });
  await oeffne(page, server);

  const person = fenster(page, 'Wer kommt ins Team?');
  await person.getByLabel('Vorname *').fill('Nina');
  await person.getByLabel('Nachname *').fill('Neu');
  await person.getByLabel('Dienstliche E-Mail').fill('nina.neu@praxis.invalid');
  await person.getByRole('button', { name: 'Weiter' }).click();
  await fenster(page, 'Welche Rolle?').getByText('Therapeut:in', { exact: true }).click();
  await fenster(page, 'Welche Rolle?').getByRole('button', { name: 'Weiter' }).click();
  await fenster(page, 'Wann arbeitet Nina?')
    .getByRole('button', { name: /^Vollzeit/ })
    .click();
  await fenster(page, 'Fährt Nina ein Lastenrad?')
    .getByRole('button', { name: /^Lastenrad 4/ })
    .click();
  await fenster(page, 'Zugang einladen?').getByRole('button', { name: 'Einladung senden' }).click();
  await fenster(page, 'Alles richtig?').getByRole('button', { name: 'Nina einrichten' }).click();

  const ergebnis = fenster(page, 'Nina Neu ist angelegt');
  const schritte = ergebnis.getByRole('list', { name: 'Schritte' });
  await expect(schritte.getByRole('listitem')).toHaveCount(4);
  await expect(schritte).toContainText('Der Schlüssel ist schon entnommen.');
  await expect(ergebnis.getByText(/gibt es beim Anmeldedienst noch kein Konto/)).toBeVisible();
  await expect(
    ergebnis.getByRole('link', { name: 'Lastenrad: Schlüssel eintragen' }),
  ).toHaveAttribute('href', '/betrieb/flotte/schluessel?rad=rad-4');
  await expect(ergebnis.getByRole('link', { name: 'Zur Mitarbeiterseite' })).toBeInViewport({
    ratio: 1,
  });
  await page.waitForTimeout(800);
  await expect(ergebnis.getByRole('heading', { name: 'Nina Neu ist angelegt' })).toBeInViewport({
    ratio: 1,
  });
  await zieleMindestens44(page);
  expect(await axeVerstoesse(page)).toEqual([]);
  mkdirSync(BILDER, { recursive: true });
  await page.screenshot({ path: `${BILDER}/b6-team-07-ergebnis-375.png` });
  await amRechner(page, '07', 'ergebnis');
  expect(await wege(page)).not.toContain(`/praxis/team/${NEU}`);
});

test('G5 Büro: Name, Rad, Abschluss - Rolle, Einladung und Wochenplan stehen als offen da', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const server = nachbildung();
  await oeffne(page, server, '?rolle=office');
  const z = zaehler();

  const person = fenster(page, 'Wer kommt ins Team?');
  await expect(person.getByText('Schritt 1 von 3', { exact: true })).toBeVisible();
  await person.getByLabel('Vorname *').fill('Nina');
  await person.getByLabel('Nachname *').fill('Neu');
  await z.tippe(person.getByRole('button', { name: 'Weiter' }));

  const rad = fenster(page, 'Fährt Nina ein Lastenrad?');
  await expect(rad.getByText('Schritt 2 von 3', { exact: true })).toBeVisible();
  await z.tippe(rad.getByRole('button', { name: 'Kein Rad' }));

  const abschluss = fenster(page, 'Alles richtig?');
  await expect(abschluss.getByText('Lädt die Inhaber:in ein')).toBeVisible();
  await expect(abschluss.getByRole('button', { name: 'Nina einrichten' })).toBeInViewport({
    ratio: 1,
  });
  await page.waitForTimeout(800);
  await zieleMindestens44(page);
  expect(await axeVerstoesse(page)).toEqual([]);
  mkdirSync(BILDER, { recursive: true });
  await page.screenshot({ path: `${BILDER}/b6-team-08-abschluss-buero-375.png` });
  await z.tippe(abschluss.getByRole('button', { name: 'Nina einrichten' }));

  await expect.poll(() => wege(page)).toContain(`/praxis/team/${NEU}`);
  expect(server.aufrufe.invite_staff_account).toBeUndefined();
  expect(server.aufrufe.set_staff_working_hours).toBeUndefined();
  test.info().annotations.push({ type: 'G5 Büro', description: `${z.tipps} Tipps + 2 Felder` });
  expect(z.tipps).toBe(3);
});
