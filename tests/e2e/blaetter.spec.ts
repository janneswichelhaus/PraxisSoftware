import { expect, test, type Page } from '@playwright/test';

/**
 * Blätter an Patient:innen im Browser (UX-009a, BEF-052, ANN-323): Absender
 * auf Aufnahmeblatt und Terminzettel, am Bildschirm wie im Druckbild.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/blaetter.html';

async function ohneUeberlauf(page: Page) {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

for (const breite of [375, 1280]) {
  test(`Terminzettel trägt Absender und Standortanschrift (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('heading', { name: 'Ihre nächsten Termine' })).toBeVisible();
    await expect(page.getByText('Musterallee 1, 72070 Tuebingen')).toBeVisible();
    await expect(
      page.getByText(/Hauptstandort Tuebingen, Praxisplatz 1, 72072 Tuebingen/),
    ).toBeVisible();
    await ohneUeberlauf(page);
  });

  test(`Aufnahmeblatt nennt den Verantwortlichen mit Kontakt (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(`${PRUEFSEITE}?blatt=aufnahme`);
    await expect(
      page.getByText(/Verantwortlich ist Test Praxis Tuebingen, Musterallee 1/),
    ).toBeVisible();
    await ohneUeberlauf(page);
  });
}

test('das Druckbild des Terminzettels trägt den Absender und keine Bedienelemente', async ({
  page,
}) => {
  await page.goto(PRUEFSEITE);
  await expect(page.getByRole('button', { name: 'Terminzettel drucken' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Terminzettel drucken' })).toBeHidden();
  await expect(page.getByText('Zurück zur Akte')).toBeHidden();
  await expect(page.getByText('Test Praxis Tuebingen', { exact: true })).toBeVisible();
  await expect(page.getByText('Musterallee 1, 72070 Tuebingen')).toBeVisible();
  await expect(
    page.getByText(
      /rechtzeitig ab, wenn Sie ihn nicht wahrnehmen können – Telefon \+49 7071 0000000/,
    ),
  ).toBeVisible();
});

test('das Druckbild des Aufnahmeblatts trägt den Absender auf beiden Blättern', async ({
  page,
}) => {
  await page.goto(`${PRUEFSEITE}?blatt=aufnahme`);
  await expect(page.getByRole('button', { name: 'Blätter drucken' })).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  // Im Druck ist keiner der beiden Knöpfe mehr im Baum der sichtbaren Rollen.
  await expect(page.getByRole('button', { name: 'Blätter drucken' })).toHaveCount(0);
  const absender = page.getByText('Musterallee 1, 72070 Tuebingen', { exact: true });
  await expect(absender).toHaveCount(2);
  for (const zeile of await absender.all()) await expect(zeile).toBeVisible();
});

test('ohne Stammdaten sagt die Seite es am Bildschirm, nicht auf dem Papier', async ({ page }) => {
  await page.goto(`${PRUEFSEITE}?absender=ohne`);
  const hinweis = page.getByText(/fehlen Anschrift oder Telefon der Praxis/);
  await expect(hinweis).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(hinweis).toBeHidden();
});
