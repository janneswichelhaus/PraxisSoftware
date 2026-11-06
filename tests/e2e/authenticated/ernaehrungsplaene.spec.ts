import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, PATIENTEN, TESTKENNWORT, anmelden } from './helpers';

/**
 * Pläne und Rezepte (ADR-027 Punkt 14, ANN-845) gegen den echten Stack, bei 375 px. Budget aus der
 * Roadmap: „Plan in ≤ 10 Minuten zugewiesen, Rezept mit einem Tipp ins Tagebuch“, gezählt in Tipps.
 * Seed: Erikas Plan, die Vorlage „Tagesvorschlag zum Ausprobieren“ und zwei Rezepte der Praxis.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 812 };
const ERNAEHRUNG = `/patienten/${PATIENTEN.erika}/ernaehrung`;
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

/** Beendet Erikas offenen Plan, damit neu zugewiesen werden kann - nicht im Budget. */
async function ohneOffenenPlan(page: Page) {
  await page.goto(`${ERNAEHRUNG}/plan`);
  const kopf = page.getByRole('heading', { level: 1, name: /^Plan (ändern|zuweisen)$/ });
  await expect(kopf).toBeVisible();
  if ((await kopf.textContent()) === 'Plan ändern') {
    await page.getByRole('button', { name: 'Plan beenden' }).click();
    await page.getByRole('button', { name: 'Plan beenden' }).last().click();
    await expect(page).toHaveURL((url) => url.pathname === ERNAEHRUNG);
  }
}

test('Plan aus einer Vorlage in höchstens fünf Tipps zugewiesen', async ({ page }) => {
  // Anmelden, den offenen Plan beenden und zuweisen sind drei Seiten hintereinander.
  test.setTimeout(90_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await ohneOffenenPlan(page);
  await page.goto(ERNAEHRUNG);

  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Zuweisen' }));
  await z.tippe(page.getByRole('button', { name: /^Tagesvorschlag zum Ausprobieren/ }));
  await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));

  await expect(page).toHaveURL((url) => url.pathname === ERNAEHRUNG);
  await expect(page.getByText('Tagesvorschlag zum Ausprobieren')).toBeVisible();
  test.info().annotations.push({ type: 'ERN-EPIC-005', description: `Vorlage: ${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Tagesvorschlag aus zwei Rezepten und einem Lebensmittel in höchstens 15 Tipps', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await ohneOffenenPlan(page);
  await page.goto(ERNAEHRUNG);

  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Zuweisen' }));
  await z.tippe(page.getByRole('button', { name: /^Leer beginnen/ }));
  for (const [mahlzeit, rezept] of [
    ['Frühstück', 'Haferbrei mit Beeren'],
    ['Mittagessen', 'Linsensalat mit Paprika'],
  ] as const) {
    await z.tippe(page.getByRole('button', { name: `${mahlzeit} hinzufügen` }));
    await z.tippe(page.getByRole('button', { name: rezept, exact: false }).first());
    await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Hinzufügen' }));
  }
  await z.tippe(page.getByRole('button', { name: 'Snacks hinzufügen' }));
  await z.tippe(page.getByLabel('Lebensmittel suchen'));
  await page.getByLabel('Lebensmittel suchen').fill('Apfel roh');
  await z.tippe(page.getByRole('button', { name: /^Apfel roh/ }).first());
  await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Hinzufügen' }));
  // Die Energie des Tags steht neben dem Ziel, ohne Wertung.
  await expect(page.getByText(/^Tag 1 · \d+\skcal · Ziel \d+\skcal$/)).toBeVisible();
  await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));

  await expect(page).toHaveURL((url) => url.pathname === ERNAEHRUNG);
  await expect(page.getByText(/^1 Tag · heute Tag 1$/)).toBeVisible();
  test
    .info()
    .annotations.push({ type: 'ERN-EPIC-005', description: `Neu: ${z.tipps} Tipps + Text` });
  expect(z.tipps).toBeLessThanOrEqual(15);
});

test('Plan wechseln, während einer läuft, in höchstens fünf Tipps', async ({ page }) => {
  // Läuft nach dem Tagesvorschlag: Der neue Plan beendet den laufenden am Tag davor (ANN-845).
  test.setTimeout(90_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto(ERNAEHRUNG);
  const plan = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan', exact: true }) });

  const z = zaehler();
  await z.tippe(plan.getByRole('link', { name: 'Ändern' }));
  await z.tippe(page.getByRole('link', { name: 'Neuer Plan' }));
  await z.tippe(page.getByRole('button', { name: /^Tagesvorschlag zum Ausprobieren/ }));
  await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));

  await expect(page).toHaveURL((url) => url.pathname === ERNAEHRUNG);
  await expect(plan.getByText('Tagesvorschlag zum Ausprobieren')).toBeVisible();
  test.info().annotations.push({ type: 'ERN-EPIC-005', description: `Wechsel: ${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(5);
});

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

test('Rezept aus dem Plan mit einem Tipp ins Tagebuch', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await plattformAnmelden(page, 'erika.plattform@patient.invalid');
  await page.goto(TAGEBUCH);
  await expect(page.getByRole('heading', { name: 'Tagebuch', level: 1 })).toBeVisible();

  const plan = page.getByRole('region', { name: 'Aus Ihrem Plan' });
  const z = zaehler();
  await z.tippe(plan.getByRole('button', { name: 'Haferbrei mit Beeren eintragen (1 Portion)' }));
  const mahlzeiten = page.getByRole('region', { name: 'Mahlzeiten' });
  await expect(mahlzeiten.getByRole('button', { name: /Haferbrei mit Beeren/ })).toBeVisible();
  test.info().annotations.push({ type: 'ERN-EPIC-005', description: `Rezept: ${z.tipps} Tipp` });
  expect(z.tipps).toBe(1);

  // Aufräumen: Der Seed-Tag bleibt für die anderen Ablauftests, wie er war.
  await mahlzeiten.getByRole('button', { name: /Haferbrei mit Beeren/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(mahlzeiten.getByRole('button', { name: /Haferbrei mit Beeren/ })).toHaveCount(0);
});

test('Büro sieht Rezepte und Pläne nicht, die Adressen zeigen nichts', async ({ page }) => {
  await anmelden(page, KONTEN.office);
  await page.goto('/praxis/rezepte');
  await expect(page.getByRole('heading', { name: 'Rezepte', level: 1 })).toHaveCount(0);
  await page.goto('/praxis/ernaehrungsplaene');
  await expect(page.getByRole('heading', { name: 'Ernährungspläne', level: 1 })).toHaveCount(0);
  await page.goto(`${ERNAEHRUNG}/plan`);
  await expect(page.getByRole('heading', { name: /^Plan (ändern|zuweisen)$/ })).toHaveCount(0);
});
