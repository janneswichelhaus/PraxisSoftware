import { expect, test } from '@playwright/test';
import { KONTEN, PATIENTEN, anmelden } from './helpers';

/**
 * Eine Person auf einen Blick (ANN-847, ANN-848) gegen den echten Stack, bei 375 px: aus der Akte
 * ein Tipp zur Sitzungsvorbereitung und einer zum Zeitstrahl, ohne Querrollen.
 */
const TELEFON = { width: 375, height: 812 };
const AKTE = `/patienten/${PATIENTEN.erika}/termine`;

test('Sitzung aus der Akte in einem Tipp vorbereitet: zu tun, seit dem letzten Mal, Ziele', async ({
  page,
}) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto(AKTE);
  // Seed: Erikas offene Beschwerde steht schon in der Akte unter „Zu tun“.
  await expect(
    page.getByRole('link', { name: /Rückfrage beantworten: Beschwerden/ }),
  ).toBeVisible();

  let tipps = 0;
  tipps += 1;
  await page.getByRole('link', { name: 'Sitzung vorbereiten' }).click();
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/vorbereiten'));
  await expect(page.getByRole('heading', { level: 1, name: 'Sitzung vorbereiten' })).toBeVisible();
  for (const abschnitt of [/^Zu tun/, 'Seit dem letzten Mal', 'Ziele'])
    await expect(page.getByRole('heading', { name: abschnitt })).toBeVisible();
  await expect(page.getByText('Übungsplan endet bald')).toBeVisible();

  test.info().annotations.push({ type: 'ORG-EPIC-001', description: `Vorbereiten: ${tipps} Tipp` });
  expect(tipps).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Zeitstrahl aus der Akte: neueste zuerst, Therapie ohne Rechnungen', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto(AKTE);
  await page.getByRole('link', { name: 'Zeitstrahl', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zeitstrahl' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rückfrage: Beschwerden/ })).toBeVisible();
  await expect(page.getByText(/^Rechnung /)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
