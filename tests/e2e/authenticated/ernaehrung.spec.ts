import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, PATIENTEN, TESTKENNWORT, anmelden, reiterAntippen } from './helpers';

/**
 * ERN-EPIC-001 (ADR-027): Ernährungsprofil gegen den echten Stack, bei 375 px.
 *
 * Budget aus der Roadmap: „Profil in ≤ 4 Tipps + Felder angelegt“. Gezählt
 * wird von der Akte aus: Reiter, Anlegen, Speichern - die Angaben selbst sind
 * Felder. Danach wird die Beratung wieder beendet, damit der nächste Lauf
 * neu anlegen kann (ein laufendes Profil je Person, ADR-027 Punkt 1).
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 812 };

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    /** Ein Reiter: liegt er bei 375 px außer Sicht, zählt „›“ mit (BEF-183). */
    async reiter(leiste: Locator, name: string) {
      tipps += await reiterAntippen(leiste, name);
    },
    get tipps() {
      return tipps;
    },
  };
}

test('Profil an der Akte in höchstens vier Tipps plus Felder, Zielwerte mit Rechenweg', async ({
  page,
}) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto(`/patienten/${PATIENTEN.max}/termine`);

  const z = zaehler();
  await z.reiter(page.getByRole('navigation', { name: 'Bereiche der Akte' }), 'Ernährung');
  // Nach einem früheren Lauf steht dort „Neue Beratung anlegen“ - gleicher Weg.
  await z.tippe(page.getByRole('link', { name: /^(Profil|Neue Beratung) anlegen$/ }));
  // Felder: Einwilligung vom Papier, Größe, Gewicht, Geschlecht, Aktivität, Ziel.
  await page.getByLabel('Die Person hat in die Ernährungsberatung').check();
  await page.getByLabel('Größe (cm)').fill('178');
  await page.getByLabel('Gewicht heute (kg)').fill('86,4');
  await page.getByText('Männlich', { exact: true }).click();
  await page.getByText('1,6 · Sitzend mit Bewegung', { exact: true }).click();
  await page.getByText('Abnehmen', { exact: true }).click();
  await z.tippe(page.getByRole('button', { name: 'Profil anlegen' }));

  await expect(page).toHaveURL((url) => url.pathname === `/patienten/${PATIENTEN.max}/ernaehrung`);
  await expect(page.getByRole('heading', { name: 'Zielwerte' })).toBeVisible();
  test.info().annotations.push({ type: 'ERN-EPIC-001', description: `${z.tipps} Tipps + Felder` });
  expect(z.tipps).toBeLessThanOrEqual(4);

  // Der Rechenweg steht neben dem Ergebnis (ADR-006 Punkt 14 b). Max ist
  // 1957 geboren; die Konstante + 5 gehört zur Formel für Männer.
  await page.getByText('Rechenweg').click();
  await expect(
    page.getByText(/^10 × 86,4 kg \+ 6,25 × 178 cm − 5 × \d+ Jahre \+ 5 = \d+ kcal$/),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Aufräumen: Beratung beenden - leise am Ende, mit Rückfrage.
  await page.getByRole('button', { name: 'Beratung beenden' }).click();
  await page.getByRole('button', { name: 'Beratung beenden' }).last().click();
  await expect(page.getByText(/Beratung beendet am/)).toBeVisible();
});

for (const [rolle, konto] of [
  ['Büro', KONTEN.office],
  ['Therapie', KONTEN.therapist],
] as const) {
  test(`${rolle} sieht den Reiter nicht, die Adresse zeigt nichts`, async ({ page }) => {
    await anmelden(page, konto);
    await page.goto(`/patienten/${PATIENTEN.erika}/termine`);
    await expect(page.getByRole('navigation', { name: 'Bereiche der Akte' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ernährung', exact: true })).toHaveCount(0);
    await page.goto(`/patienten/${PATIENTEN.erika}/ernaehrung`);
    await expect(page.getByRole('heading', { name: 'Zielwerte' })).toHaveCount(0);
  });
}

async function plattformAnmelden(page: Page, email: string) {
  await page.goto('/');
  await page.getByText('Testkonten', { exact: true }).click();
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Kennwort', { exact: true }).fill(TESTKENNWORT);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/p(\?|$|\/)/);
}

test('Erika trägt auf der Plattform ihr Gewicht ein und sieht keine Notizen', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await plattformAnmelden(page, 'erika.plattform@patient.invalid');
  await page.goto('/p/ich');
  await page.getByRole('link', { name: /Ernährung/ }).click();
  await expect(page.getByRole('heading', { name: 'Ernährung', level: 1 })).toBeVisible();
  // Die Einheit steht im Feld; steht heute schon ein Gewicht, heißt der Knopf „Ersetzen“.
  await page.getByLabel('Gewicht heute', { exact: true }).fill('73,1');
  await page.getByRole('button', { name: /^(Eintragen|Ersetzen)$/ }).click();
  await expect(page.getByText('Eingetragen.')).toBeVisible();
  await expect(page.getByText('73,1 kg').first()).toBeVisible();
  // Keine Notizen der Beratung auf der Plattform (ADR-023 Punkt 22).
  await expect(page.getByText('Frühstück fällt oft aus')).toHaveCount(0);
});

test('Die Begleitung sieht keine Ernährung', async ({ page }) => {
  await plattformAnmelden(page, 'paula.begleitung@patient.invalid');
  await page.goto('/p/ich');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ernährung/ })).toHaveCount(0);
});

/**
 * ERN-EPIC-002: Lebensmittel in der Bibliothek, bei 375 px gegen den Seed.
 * Budget aus der Roadmap: Stichwörter treffen unter den ersten drei, die Suche
 * antwortet in weniger als 300 ms (am Server gemessen in
 * supabase/tests/food-catalog.test.ts; hier die Antwort im Browser).
 */
const STICHWOERTER: [string, string][] = [
  ['Apfel', 'Apfel roh'],
  ['Haferflocken', 'Haferflocken'],
  ['Vollkornbrot', 'Vollkornbrot'],
  ['Hafeflocken', 'Haferflocken'],
];

test('Lebensmittel: Stichwörter unter den ersten drei, Nährwerte und Portionen im Fenster', async ({
  page,
}) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto('/praxis/lebensmittel');
  const treffer = page
    .getByRole('list')
    .filter({ has: page.getByRole('button') })
    .last();
  for (const [begriff, erwartet] of STICHWOERTER) {
    const antwort = page.waitForResponse((r) => r.url().includes('/rpc/search_foods'));
    const start = Date.now();
    await page.getByLabel('Lebensmittel suchen').fill(begriff);
    await antwort;
    test
      .info()
      .annotations.push({ type: 'Suche', description: `${begriff}: ${Date.now() - start} ms` });
    // Die Liste zeigt bis zur neuen Antwort die alte; darum gepollt. Der
    // Name endet, wo die Nebenzeile beginnt (kein Kleinbuchstabe danach).
    const trifft = (text: string) =>
      text.startsWith(erwartet) && !/^[a-zäöüß]/.test(text.slice(erwartet.length));
    await expect
      .poll(
        async () => (await treffer.getByRole('button').allInnerTexts()).slice(0, 3).some(trifft),
        { message: begriff },
      )
      .toBe(true);
  }
  await page
    .getByRole('button', { name: /^Haferflocken\b/ })
    .first()
    .click();
  const fenster = page.getByRole('dialog', { name: 'Haferflocken' });
  await expect(fenster.getByText('Je 100 g')).toBeVisible();
  await expect(fenster.getByText(/^1 Esslöffel · 10 g$/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Lebensmittel der Praxis: anlegen, in der Suche finden, ablegen', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto('/praxis/lebensmittel/neu');
  const name = `Testriegel ${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Energie (kcal)').fill('410');
  await page.getByLabel('Eiweiß (g)').fill('20');
  await page.getByLabel('Fett (g)').fill('15');
  await page.getByLabel('Kohlenhydrate (g)').fill('45');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/praxis/lebensmittel');
  await page.getByLabel('Lebensmittel suchen').fill(name);
  await page.getByRole('button', { name }).click();
  await page.getByRole('link', { name: 'Bearbeiten' }).click();
  await page.getByRole('button', { name: 'Ablegen' }).click();
  await page.getByRole('button', { name: 'Ablegen' }).last().click();
  await expect(page).toHaveURL((url) => url.pathname === '/praxis/lebensmittel');
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('Büro sieht die Lebensmittel nicht, die Adresse zeigt nichts', async ({ page }) => {
  await anmelden(page, KONTEN.office);
  await page.goto('/praxis/lebensmittel');
  await expect(page.getByRole('heading', { name: 'Lebensmittel', level: 1 })).toHaveCount(0);
});
