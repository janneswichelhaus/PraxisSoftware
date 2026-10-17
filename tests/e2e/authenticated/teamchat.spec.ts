import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, anmelden } from './helpers';

/**
 * Teamchat (TEAM-001) gegen den echten Stack, bei 375 px.
 *
 * Gezählt werden Tipps ohne getippten Text, gegen die Budgets der Spec
 * (Referenzabgleich: Slack und Teams brauchen je drei bis vier). Ausgangslage
 * ist jeweils der Teamchat (`/team`). Direktnachrichten liest nur, wer
 * beteiligt ist; das prüft `supabase/tests/teamchat.test.ts` am Server, hier
 * der Weg in der Oberfläche.
 */
// Zwei Anmeldungen je Ablauf brauchen mehr als die üblichen 30 Sekunden.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

const LAUF = Date.now();
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

async function zumTeamchat(page: Page, konto: string): Promise<void> {
  await anmelden(page, konto);
  await page.setViewportSize(TELEFON);
  await page.goto('/team');
  await expect(page.getByRole('heading', { level: 1, name: 'Teamchat' })).toBeVisible();
}

test('schreibt in einen Kanal in zwei Tipps und antwortet im Thread in zwei', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: /# Flotte/ }));
  await page.getByRole('textbox', { name: 'Nachricht an # Flotte' }).fill(`Kette Rad 2 ${LAUF}`);
  await z.tippe(page.getByRole('button', { name: 'Senden' }));
  await expect(page.getByText(`Kette Rad 2 ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(2);

  const antwort = zaehler();
  const nachricht = page.getByRole('listitem').filter({ hasText: `Kette Rad 2 ${LAUF}` });
  await antwort.tippe(nachricht.getByRole('link', { name: 'Antworten' }));
  await page.getByRole('textbox', { name: 'Antwort' }).fill(`Nimm Rad 1 ${LAUF}`);
  await antwort.tippe(page.getByRole('button', { name: 'Senden' }));
  await expect(page.getByText(`Nimm Rad 1 ${LAUF}`)).toBeVisible();
  expect(antwort.tipps).toBeLessThanOrEqual(2);

  // Kein Querrollen bei 375 px, Ziele mindestens 44 px.
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
  for (const knopf of [
    page.getByRole('button', { name: 'Senden' }),
    page.getByRole('button', { name: 'Jemanden erwähnen' }),
  ]) {
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('erwähnt mit @ und einem Tipp; die Erwähnte sieht „für dich“', async ({ page, browser }) => {
  await zumTeamchat(page, KONTEN.therapist);
  await page.getByRole('link', { name: /# Allgemein/ }).click();
  await page.getByRole('textbox', { name: 'Nachricht an # Allgemein' }).fill('Bitte melden ');
  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Jemanden erwähnen' }));
  await z.tippe(page.getByRole('button', { name: 'Olivia Office' }));
  expect(z.tipps).toBe(2);
  await page
    .getByRole('textbox', { name: 'Nachricht an # Allgemein' })
    .pressSequentially(`${LAUF}`);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(`@Olivia Office ${LAUF}`)).toBeVisible();

  const andere = await browser.newPage();
  await zumTeamchat(andere, KONTEN.office);
  await expect(andere.getByRole('link', { name: /# Allgemein.*für dich/ })).toBeVisible();
  await andere.getByRole('link', { name: /# Allgemein/ }).click();
  await expect(andere.getByText('Für dich')).toBeVisible();
  await andere.close();
});

test('beginnt eine Direktnachricht in drei Tipps, die Dritte nicht sehen', async ({
  page,
  browser,
}) => {
  await zumTeamchat(page, KONTEN.therapist);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Neu', exact: true }));
  await z.tippe(page.getByRole('button', { name: 'Olivia Office' }));
  await page.getByRole('textbox', { name: 'Nachricht an Olivia Office' }).fill(`Privat ${LAUF}`);
  await z.tippe(page.getByRole('button', { name: 'Senden' }));
  await expect(page.getByText(`Privat ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(3);

  // Die Praxisleitung findet die Nachricht weder in der Liste noch in der Suche.
  const leitung = await browser.newPage();
  await zumTeamchat(leitung, KONTEN.owner);
  await expect(leitung.getByRole('link', { name: /Olivia Office/ })).toHaveCount(0);
  await leitung.getByRole('searchbox', { name: 'In Nachrichten suchen' }).fill(`Privat ${LAUF}`);
  await expect(leitung.getByText('Nichts gefunden')).toBeVisible();
  await leitung.close();
});

test('findet ein Wort und öffnet den Treffer in zwei Tipps', async ({ page }) => {
  await zumTeamchat(page, KONTEN.office);
  const z = zaehler();
  await z.tippe(page.getByRole('searchbox', { name: 'In Nachrichten suchen' }));
  await page.getByRole('searchbox', { name: 'In Nachrichten suchen' }).fill(`Rad 1 ${LAUF}`);
  await z.tippe(page.getByRole('link', { name: `Nimm Rad 1 ${LAUF}` }));
  await expect(page.getByRole('heading', { level: 1, name: 'Antworten' })).toBeVisible();
  await expect(page.getByText(`Kette Rad 2 ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(2);
});
