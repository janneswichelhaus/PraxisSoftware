import { expect, test, type Locator, type Page } from '@playwright/test';
import { TESTKENNWORT } from './helpers';

/**
 * ERN-EPIC-003 (ADR-027 Punkte 10 und 11): das Ernährungstagebuch auf der
 * Plattform gegen den echten Stack, bei 375 px und einhändig.
 *
 * Budget aus der Roadmap: aus „zuletzt“ ≤ 3 Tipps, per Suche ≤ 5 Tipps +
 * Text, Wasser 1 Tipp. Gezählt wird ab der Tagesansicht. Seed: Erikas
 * Tagebuch ist eingeschaltet, heute steht ein Frühstück.
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
  const vorher = await page
    .getByText(/kcal von/)
    .first()
    .textContent();

  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Mittagessen eintragen' }));
  await z.tippe(page.getByLabel('Lebensmittel suchen'));
  await page.getByLabel('Lebensmittel suchen').fill('Vollkornbrot');
  await z.tippe(page.getByRole('button', { name: /^Vollkornbrot/ }).first());
  // Vorbelegt: die erste Portion mal eins - die Energie steht vor dem Eintragen.
  await expect(page.getByRole('dialog').getByText('105 kcal')).toBeVisible();
  await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Eintragen' }));

  await expect(page.getByText('„Vollkornbrot“ eingetragen.')).toBeVisible();
  test.info().annotations.push({ type: 'Suche', description: `${z.tipps} Tipps + Text` });
  expect(z.tipps).toBeLessThanOrEqual(5);
  await expect(
    page.getByRole('button', { name: /Vollkornbrot.*1 Scheibe · 50 g.*105 kcal/ }),
  ).toBeVisible();
  await expect(page.getByText(/kcal von/).first()).not.toHaveText(vorher ?? '');
  // Der Suchbegriff steht nie in der Adresse (ADR-027 Punkt 8).
  expect(page.url()).not.toContain('Vollkornbrot');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Wasser mit einem Tipp, ein Glas zurück', async ({ page }) => {
  await zumTagebuch(page);
  const anzeige = page.getByText(/^\d[\d,.]* (ml|l) von /);
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
    page.getByRole('button', { name: /Vollkornbrot.*2 × 1 Scheibe · 100 g.*210 kcal/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Vollkornbrot/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(page.getByRole('button', { name: /Vollkornbrot/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Vortag' }).click();
  await expect(page.getByText('Gestern', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vollkornnudeln gekocht/ })).toBeVisible();
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
  await z.tippe(page.getByRole('button', { name: /^Banane roh eintragen \(1 Stück/ }));
  await expect(page.getByText('„Banane roh“ eingetragen.')).toBeVisible();
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
  await expect(page.getByRole('button', { name: /Vollkornnudeln gekocht/ })).toBeVisible();

  await page.getByText('Einstellungen', { exact: true }).click();
  await page.getByLabel('Zahlen ausblenden').check();
  await expect(page.getByText('Noch übrig')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /kcal/ })).toHaveCount(0);
  await page.getByLabel('Zahlen ausblenden').uncheck();
  await expect(page.getByText(/kcal von/)).toBeVisible();
});
