import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, PATIENTEN, TESTKENNWORT, anmelden } from './helpers';

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
  await z.tippe(page.getByRole('link', { name: 'Ernährung', exact: true }));
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
  await page.getByLabel('Gewicht heute (kg)').fill('73,1');
  await page.getByRole('button', { name: 'Eintragen' }).click();
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
