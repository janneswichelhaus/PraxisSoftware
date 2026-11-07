import { expect, test } from '@playwright/test';
import { KONTEN, PATIENTEN, anmelden } from './helpers';

/**
 * Verlauf für die Beratung (ADR-027, ANN-846) gegen den echten Stack, bei 375 px. Budget aus der
 * Roadmap: „Sitzung aus einer Ansicht vorbereitet“ - aus der Akte zwei Tipps, ohne Wechsel danach.
 */
const TELEFON = { width: 375, height: 812 };
const AKTE = `/patienten/${PATIENTEN.erika}/termine`;
const VORBEREITEN = `/patienten/${PATIENTEN.erika}/ernaehrung/vorbereiten`;

test('Sitzung aus der Akte in zwei Tipps vorbereitet, alles in einer Ansicht', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.owner);
  await page.goto(AKTE);

  let tipps = 0;
  tipps += 1;
  await page
    .getByRole('navigation', { name: 'Bereiche der Akte' })
    .getByRole('link', { name: 'Ernährung', exact: true })
    .click();
  tipps += 1;
  await page.getByRole('link', { name: 'Sitzung vorbereiten' }).click();

  await expect(page).toHaveURL((url) => url.pathname === VORBEREITEN);
  await expect(page.getByRole('heading', { level: 1, name: 'Sitzung vorbereiten' })).toBeVisible();
  for (const abschnitt of ['Wochenmittel', 'Gewicht', 'Check-ins und Training', 'Plan und Notizen'])
    await expect(page.getByRole('heading', { name: abschnitt })).toBeVisible();
  // Seed: Einträge heute und gestern, Wasser an beiden Tagen, Gewicht dreimal, Erikas Plan.
  // Seit Beginn vor 21 Tagen; an einem Montag stehen heute und gestern in zwei Wochen.
  await expect(page.getByText('von 22 Tagen')).toBeVisible();
  await expect(page.getByText(/^an [12] von \d Tagen?/).first()).toBeVisible();
  await expect(page.getByText('Zielgewicht 68,0 kg')).toBeVisible();
  await expect(page.getByText(/Termine? seit Beginn$/)).toBeVisible();
  await expect(page.getByText('Zwei Tage zum Ausprobieren').first()).toBeVisible();

  test
    .info()
    .annotations.push({ type: 'ERN-EPIC-006', description: `Vorbereiten: ${tipps} Tipps` });
  expect(tipps).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

for (const [rolle, konto] of [
  ['Büro', KONTEN.office],
  ['Therapie', KONTEN.therapist],
] as const) {
  test(`${rolle}: die Adresse der Vorbereitung zeigt nichts`, async ({ page }) => {
    await anmelden(page, konto);
    await page.goto(VORBEREITEN);
    await expect(page.getByRole('heading', { name: 'Wochenmittel' })).toHaveCount(0);
    await expect(page.getByText('Zielgewicht 68,0 kg')).toHaveCount(0);
  });
}
