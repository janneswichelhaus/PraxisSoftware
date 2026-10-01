import { expect, test, type Page } from '@playwright/test';

/**
 * Die Patientenakte nach dem Design-Handoff vom 2026-10-01 (Abschnitt 7) in
 * einem echten Browser: Kacheln im Kopf, Kontextspalte ab 900 px
 * Inhaltsbreite, Kacheln im Terminbereich und Stammdaten ohne Silbenspalten.
 * Was jsdom nicht misst - Breiten, Lage, Überlauf -, steht hier.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/akte.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

for (const abfrage of ['', '?bereich=stammdaten', '?rolle=office', '?leer=1']) {
  test(`läuft bei 375 px nicht waagerecht über (${abfrage || 'Termine'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(PRUEFSEITE + abfrage);
    await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

test('am Telefon stehen die Kacheln im Kopf zu zweit nebeneinander', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const liege = (await page.getByText('Liege', { exact: true }).boundingBox())!;
  const zugang = (await page.getByText('Zugangshinweis', { exact: true }).boundingBox())!;
  expect(Math.abs(liege.y - zugang.y)).toBeLessThan(2);
  expect(zugang.x).toBeGreaterThan(liege.x);
});

test('am Rechner steht die Kontextspalte rechts neben dem Bereich', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PRUEFSEITE);
  const spalte = page.getByRole('complementary', { name: 'Zur Person' });
  await expect(spalte.getByText('1 von 6 verbraucht · 3 geplant · 2 frei')).toBeVisible();
  const rechts = (await spalte.boundingBox())!;
  const links = (await page.getByText('Nächster Termin').boundingBox())!;
  expect(rechts.x).toBeGreaterThan(links.x + links.width);
});

test('am Telefon steht die Kontextspalte unter dem Bereich', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const spalte = (await page.getByRole('complementary', { name: 'Zur Person' }).boundingBox())!;
  const vergangene = (await page
    .getByRole('heading', { name: 'Vergangene Termine' })
    .boundingBox())!;
  expect(spalte.y).toBeGreaterThan(vergangene.y);
});

test('die Stammdaten bleiben neben der Kontextspalte einspaltig lesbar (PAT-B01)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${PRUEFSEITE}?bereich=stammdaten`);
  const person = (await page.getByRole('heading', { name: 'Person' }).boundingBox())!;
  const kontakt = (await page.getByRole('heading', { name: 'Kontakt' }).boundingBox())!;
  // Untereinander, nicht nebeneinander: Die Hauptspalte ist schmaler als 1024 px.
  expect(kontakt.y).toBeGreaterThan(person.y);
  expect(Math.abs(kontakt.x - person.x)).toBeLessThan(2);
  // Die Anschrift steht in einer Zeile und nicht Silbe für Silbe.
  const adresse = (await page.getByText('Beispielstrasse 12, 72070 Tuebingen').boundingBox())!;
  expect(adresse.height).toBeLessThan(30);
});

test('ohne Hinweise, Grundlage und Kontakt gibt es weder Kachelreihe noch Spalte', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${PRUEFSEITE}?leer=1`);
  await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
  await expect(page.getByText('Zugangshinweis', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Zur Person' })).toHaveCount(0);
});
