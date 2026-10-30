import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, PATIENTEN, TESTKENNWORT, anmelden } from './helpers';

/**
 * Das Tagebuch (ADR-027 Punkte 10 und 11) gegen den echten Stack, bei 375 px. Budget: aus „zuletzt“
 * ≤ 3 Tipps, per Suche ≤ 5 Tipps + Text, Wasser 1 Tipp, gezählt ab der Tagesansicht und zurück.
 * Seed: Erikas Tagebuch ist eingeschaltet, heute steht ein Frühstück.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 812 };
const TAGEBUCH = '/p/ernaehrung/tagebuch?bereich=treatment';

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

async function plattformAnmelden(page: Page, email: string) {
  // Das Startbild läuft einmal je Tab (ANN-243); hier gilt es als gezeigt.
  await page.addInitScript(() => window.sessionStorage.setItem('startbild-gezeigt', '1'));
  await page.goto('/');
  await page.getByText('Testkonten', { exact: true }).click();
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Kennwort', { exact: true }).fill(TESTKENNWORT);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/p(\?|$|\/)/);
}

async function zumTagebuch(page: Page) {
  await page.setViewportSize(TELEFON);
  await plattformAnmelden(page, 'erika.plattform@patient.invalid');
  await page.goto(TAGEBUCH);
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
}

test('per Suche in höchstens fünf Tipps plus Text; der Tag rechnet mit', async ({ page }) => {
  await zumTagebuch(page);
  // „297 von 1466 kcal“ statt „noch übrig“ (Handoff 2026-10-29, Frage 4).
  const energie = page.getByRole('region', { name: 'Energie und Nährstoffe' });
  await expect(energie).toContainText(/\d+ von \d+\skcal/);
  const vorher = await energie.textContent();

  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Mittagessen eintragen' }));
  await z.tippe(page.getByLabel('Lebensmittel suchen'));
  await page.getByLabel('Lebensmittel suchen').fill('Vollkornbrot');
  await z.tippe(page.getByRole('button', { name: /^Vollkornbrot/ }).first());
  // Vorbelegt: die erste Portion mal eins - die Energie steht vor dem Eintragen.
  await expect(page.getByRole('dialog').getByText('105 kcal')).toBeVisible();
  await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Eintragen' }));
  // Die Seite bleibt für das Nächste (Frage 4 zu #333); vorgelesen wird der Satz, zu sehen ist
  // der Haken an der Zeile (ANN-813). Zurück zum Tag zählt mit.
  await expect(page.getByText('„Vollkornbrot“ eingetragen.')).toHaveClass(/sr-only/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await z.tippe(page.getByRole('link', { name: '← Tagebuch' }));
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
  test.info().annotations.push({ type: 'Suche', description: `${z.tipps} Tipps + Text` });
  expect(z.tipps).toBeLessThanOrEqual(5);
  await expect(
    page.getByRole('button', { name: /Vollkornbrot.*1\sScheibe · 50\sg.*105\skcal/ }),
  ).toBeVisible();
  await expect(energie).not.toHaveText(vorher ?? '');
  // Der Suchbegriff steht nie in der Adresse (ADR-027 Punkt 8).
  expect(page.url()).not.toContain('Vollkornbrot');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Wasser mit einem Tipp in Litern, ein Glas zurück', async ({ page }) => {
  await zumTagebuch(page);
  const anzeige = page.getByRole('region', { name: 'Wasser' }).getByRole('status');
  await expect(anzeige).toHaveText(/^[\d,]+ von [\d,]+\sl$/);
  const vorher = await anzeige.textContent();
  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: /\+ 1 Glas/ }));
  await expect(anzeige).not.toHaveText(vorher ?? '');
  expect(z.tipps).toBe(1);
  await page.getByRole('button', { name: 'Ein Glas weniger' }).click();
  await expect(anzeige).toHaveText(vorher ?? '');
});

test('Eintrag ändern und löschen; der Vortag ist einen Tipp entfernt', async ({ page }) => {
  await zumTagebuch(page);
  await page.getByRole('button', { name: /Vollkornbrot/ }).click();
  const fenster = page.getByRole('dialog');
  await fenster.getByLabel(/Anzahl/).fill('2');
  await fenster.getByText('Abendessen', { exact: true }).click();
  await fenster.getByRole('button', { name: 'Speichern' }).click();
  await expect(
    page.getByRole('button', { name: /Vollkornbrot.*2\s×\s1\sScheibe · 100\sg.*210\skcal/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Vollkornbrot/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(page.getByRole('button', { name: /Vollkornbrot/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Vortag' }).click();
  await expect(page.getByText('Gestern', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vollkornnudeln gekocht/ }).first()).toBeVisible();
});

test('Der Rückweg folgt der Herkunft, auch über das Eintragen', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await plattformAnmelden(page, 'erika.plattform@patient.invalid');
  // So verlinkt die Karte „Ernährungstagebuch“ der Übersicht (`Uebersicht.test.tsx`).
  await page.goto(`${TAGEBUCH}&zurueck=${encodeURIComponent('/p?bereich=treatment')}`);
  await expect(page.getByRole('link', { name: '← Übersicht' })).toBeVisible();
  await page.getByRole('link', { name: 'Abendessen eintragen' }).click();
  await expect(page.getByRole('heading', { name: 'Abendessen eintragen', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: '← Tagebuch' }).click();
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Übersicht' })).toBeVisible();

  await page.goto('/p/ernaehrung?bereich=treatment');
  await page.getByRole('link', { name: 'Heute eintragen' }).click();
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Ernährung' })).toBeVisible();
});

test('Die Begleitung kommt nicht ins Tagebuch', async ({ page }) => {
  await plattformAnmelden(page, 'paula.begleitung@patient.invalid');
  await page.goto('/p/ernaehrung/tagebuch');
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /\+ 1 Glas/ })).toHaveCount(0);
});

test('aus „zuletzt“ in höchstens drei Tipps, mit der Menge vom letzten Mal', async ({ page }) => {
  await zumTagebuch(page);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Snacks eintragen' }));
  // „+“ an der Zeile trägt die Menge vom letzten Mal ein (Seed: 1 Banane).
  const plus = page.getByRole('button', { name: /^Banane roh eintragen \(1 Stück/ });
  await z.tippe(plus);
  // Der Haken am „+“, der Fokus bleibt dort; vorgelesen wird der Satz (ANN-813).
  await expect(page.getByText('„Banane roh“ eingetragen.')).toHaveClass(/sr-only/);
  await expect(plus.locator('svg')).toBeVisible();
  await expect(plus).toBeFocused();
  // Zurück zum Tag zählt mit; dort steht die Banane unter „Snacks“.
  await z.tippe(page.getByRole('link', { name: '← Tagebuch' }));
  await expect(page.getByRole('button', { name: /^Banane roh/ }).first()).toBeVisible();
  test.info().annotations.push({ type: 'Zuletzt', description: `${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(3);
});

test('Favorit markieren, Tag kopieren, Zahlen ausblenden', async ({ page }) => {
  await zumTagebuch(page);
  await page.getByRole('link', { name: 'Abendessen eintragen' }).click();
  await page
    .getByRole('button', { name: /^Haferflocken/ })
    .first()
    .click();
  await page.getByRole('dialog').getByLabel('Favorit').check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Favoriten' })).toBeVisible();

  await page.goto(TAGEBUCH);
  await page.getByText('Von einem anderen Tag kopieren').click();
  await page.getByText('Mittagessen', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Hierher kopieren' }).click();
  await expect(page.getByText('2 Einträge kopiert.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Vollkornnudeln gekocht/ }).first()).toBeVisible();

  await page.getByText('Einstellungen', { exact: true }).click();
  await page.getByLabel('Zahlen ausblenden').check();
  await expect(page.getByRole('region', { name: 'Energie und Nährstoffe' })).toHaveCount(0);
  await expect(page.getByText(/kcal/)).toHaveCount(0);
  await page.getByLabel('Zahlen ausblenden').uncheck();
  await expect(page.getByRole('region', { name: 'Energie und Nährstoffe' })).toBeVisible();
});

test('Erinnerungen: von Anfang an aus, je Mahlzeit eine Uhrzeit, wieder aus', async ({ page }) => {
  await zumTagebuch(page);
  await page.getByText(/^Erinnerungen/).click();
  await expect(page.getByText('Erinnerungen · aus')).toBeVisible();
  const wahl = page.getByRole('form', { name: 'Erinnerungen wählen' });
  await wahl.getByLabel('Mittagessen', { exact: true }).check();
  await wahl.getByLabel('Uhrzeit Mittagessen').selectOption('12:15');
  await expect(wahl.getByLabel('Per Mail')).toBeChecked();
  await wahl.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  await expect(page.getByText('Erinnerungen · an')).toBeVisible();

  await wahl.getByLabel('Mittagessen', { exact: true }).uncheck();
  await wahl.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Erinnerungen · aus')).toBeVisible();
});

test('Die Beratung liest mit: sieben Tage, ein Tag im Fenster', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto(`/patienten/${PATIENTEN.erika}/ernaehrung`);
  await expect(page.getByRole('heading', { name: 'Tagebuch' })).toBeVisible();
  await page
    .getByRole('button', { name: /\d+ Einträge?/ })
    .first()
    .click();
  const fenster = page.getByRole('dialog');
  await expect(fenster.getByText('Haferflocken')).toBeVisible();
  await expect(fenster.getByText('Frühstück', { exact: true })).toBeVisible();
  // Die Beratung schreibt nicht ins Tagebuch.
  await expect(fenster.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
});
