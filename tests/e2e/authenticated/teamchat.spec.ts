import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, anmelden } from './helpers';

/**
 * Teamchat (TEAM-001, TEAM-002) gegen den echten Stack - mehrere Konten, bei
 * 375 px mit gezählten Tipps, dazu der Rechner bei 1280 px.
 *
 * Gezählt werden Tipps ohne getippten Text, gegen die Budgets der Spec
 * (Referenzabgleich Slack: Senden 2, Antworten 2, Erwähnen +2, Direktnachricht
 * 3, Treffer öffnen 2, Reagieren 2). Ausgangslage ist jeweils der Teamchat
 * (`/team`). Wer was liest, prüfen `supabase/tests/teamchat*.test.ts` am
 * Server; hier der Weg in der Oberfläche, Zustellung im Funkloch und die
 * Entwürfe beim Kontowechsel.
 */
// Zwei Anmeldungen je Ablauf brauchen mehr als die üblichen 30 Sekunden.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const LAUF = Date.now();
const TELEFON = { width: 375, height: 812 };
const RECHNER = { width: 1280, height: 800 };
/** Kanäle legt die Praxis selbst an (ANN-611) - dieser Lauf seine eigenen. */
const KANAL = `Absprachen ${LAUF}`;
const PRIVAT = `Leitungsrunde ${LAUF}`;

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

async function zumTeamchat(page: Page, konto: string, groesse = TELEFON): Promise<void> {
  await anmelden(page, konto);
  await page.setViewportSize(groesse);
  await page.goto('/team');
  await expect(page.getByRole('navigation', { name: 'Gespräche' })).toBeVisible();
}

function gespraeche(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Gespräche' });
}

async function ohneQuerrollen(page: Page): Promise<void> {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

test('legt als Praxisleitung einen offenen und einen privaten Kanal an', async ({ page }) => {
  await zumTeamchat(page, KONTEN.owner);
  await page.getByRole('link', { name: 'Neu', exact: true }).click();
  await page.getByRole('button', { name: 'Kanal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(KANAL);
  await page.getByRole('button', { name: 'Kanal anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `# ${KANAL}` })).toBeVisible();

  await page.goto('/team/neu');
  await page.getByRole('button', { name: 'Kanal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(PRIVAT);
  await page.getByRole('checkbox', { name: 'Privat – nur Mitglieder lesen' }).check();
  await page.getByRole('checkbox', { name: 'Olivia Office' }).check();
  await page.getByRole('button', { name: 'Kanal anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: PRIVAT })).toBeVisible();
  await page.getByRole('textbox', { name: `Nachricht an # ${PRIVAT}` }).fill(`Dienstplan ${LAUF}`);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(`Dienstplan ${LAUF}`)).toBeVisible();
});

test('schreibt in einen Kanal in zwei Tipps und antwortet im Thread in zwei', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist);
  const z = zaehler();
  await z.tippe(gespraeche(page).getByRole('link', { name: `# ${KANAL}` }));
  await page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` }).fill(`Kette Rad 2 ${LAUF}`);
  await z.tippe(page.getByRole('button', { name: 'Senden', exact: true }));
  await expect(page.getByText(`Kette Rad 2 ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(2);

  const antwort = zaehler();
  const nachricht = page.getByRole('listitem').filter({ hasText: `Kette Rad 2 ${LAUF}` });
  await antwort.tippe(nachricht.getByRole('link', { name: 'Antworten' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Thread' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Antwort' }).fill(`Nimm Rad 1 ${LAUF}`);
  await antwort.tippe(page.getByRole('button', { name: 'Senden', exact: true }));
  await expect(page.getByText(`Nimm Rad 1 ${LAUF}`)).toBeVisible();
  expect(antwort.tipps).toBeLessThanOrEqual(2);

  // Kein Querrollen bei 375 px, Ziele mindestens 44 px.
  await ohneQuerrollen(page);
  for (const knopf of [
    page.getByRole('button', { name: 'Senden', exact: true }),
    page.getByRole('button', { name: 'Jemanden erwähnen' }),
    page.getByRole('link', { name: `Zurück zu # ${KANAL}` }),
  ]) {
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('reagiert in zwei Tipps und merkt sich eine Nachricht für später', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const nachricht = page.getByRole('listitem').filter({ hasText: `Kette Rad 2 ${LAUF}` });
  const z = zaehler();
  await z.tippe(nachricht.getByRole('button', { name: /^Handlungen zur Nachricht/ }));
  await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Daumen hoch' }));
  await expect(
    nachricht
      .getByRole('group', { name: 'Reaktionen' })
      .getByRole('button', { name: /Daumen hoch/ }),
  ).toBeVisible();
  expect(z.tipps).toBe(2);

  await nachricht.getByRole('button', { name: /^Handlungen zur Nachricht/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Für später merken' }).click();
  await expect(nachricht.getByText('Für später')).toBeVisible();
  await page.goto('/team/gemerkt');
  await expect(page.getByRole('link', { name: `Kette Rad 2 ${LAUF}` })).toBeVisible();
});

test('erwähnt mit @ und einem Tipp; die Erwähnte sieht „für dich“', async ({ page, browser }) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` }).fill('Bitte melden ');
  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Jemanden erwähnen' }));
  await z.tippe(page.getByRole('button', { name: 'Olivia Office' }));
  expect(z.tipps).toBe(2);
  await page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` }).pressSequentially(`${LAUF}`);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(`@Olivia Office ${LAUF}`)).toBeVisible();

  const andere = await browser.newPage();
  await zumTeamchat(andere, KONTEN.office);
  await expect(gespraeche(andere).getByRole('link', { name: `# ${KANAL}` })).toContainText(
    'für dich',
  );
  await gespraeche(andere)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await expect(
    andere.getByRole('list', { name: 'Nachrichten' }).getByText('Für dich'),
  ).toBeVisible();
  // Wie die Aktivität bei Slack (ANN-614): die Erwähnung auch unter „Für dich“.
  await andere.goto('/fuer-dich');
  await expect(andere.getByRole('link').filter({ hasText: `Olivia Office ${LAUF}` })).toBeVisible();
  await andere.close();
});

test('beginnt eine Direktnachricht in drei Tipps, die Dritte weder sehen noch finden', async ({
  page,
  browser,
}) => {
  await zumTeamchat(page, KONTEN.therapist);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Neu', exact: true }));
  await z.tippe(page.getByRole('button', { name: 'Olivia Office' }));
  await page.getByRole('textbox', { name: 'Nachricht an Olivia Office' }).fill(`Privat ${LAUF}`);
  await z.tippe(page.getByRole('button', { name: 'Senden', exact: true }));
  await expect(page.getByText(`Privat ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(3);

  // Die Praxisleitung findet die Nachricht weder in der Liste noch in der Suche.
  const leitung = await browser.newPage();
  await zumTeamchat(leitung, KONTEN.owner);
  await expect(gespraeche(leitung).getByRole('link', { name: /Olivia Office/ })).toHaveCount(0);
  await leitung.getByRole('searchbox', { name: 'In Nachrichten suchen' }).fill(`Privat ${LAUF}`);
  await leitung.getByRole('searchbox', { name: 'In Nachrichten suchen' }).press('Enter');
  await expect(leitung.getByText('Nichts gefunden')).toBeVisible();
  await leitung.close();
});

test('zeigt den privaten Kanal nur seinen Mitgliedern (ANN-642)', async ({ page, browser }) => {
  await zumTeamchat(page, KONTEN.office);
  await expect(gespraeche(page).getByRole('link', { name: PRIVAT })).toBeVisible();

  const andere = await browser.newPage();
  await zumTeamchat(andere, KONTEN.therapist);
  await expect(gespraeche(andere).getByRole('link', { name: PRIVAT })).toHaveCount(0);
  await andere.getByRole('searchbox', { name: 'In Nachrichten suchen' }).fill(`Dienstplan ${LAUF}`);
  await andere.getByRole('searchbox', { name: 'In Nachrichten suchen' }).press('Enter');
  await expect(andere.getByText('Nichts gefunden')).toBeVisible();
  await andere.close();
});

test('findet ein Wort und öffnet den Treffer in zwei Tipps', async ({ page }) => {
  await zumTeamchat(page, KONTEN.office);
  const z = zaehler();
  const feld = page.getByRole('searchbox', { name: 'In Nachrichten suchen' });
  await z.tippe(feld);
  await feld.fill(`Rad 1 ${LAUF}`);
  await feld.press('Enter');
  await z.tippe(page.getByRole('link', { name: `Nimm Rad 1 ${LAUF}` }));
  await expect(page.getByRole('heading', { level: 1, name: 'Thread' })).toBeVisible();
  await expect(page.getByText(`Kette Rad 2 ${LAUF}`)).toBeVisible();
  expect(z.tipps).toBeLessThanOrEqual(2);
  // Der Suchbegriff steht nicht in der Adresse (ADR-011).
  expect(page.url()).not.toContain('Rad');
  // Ein Tipp zurück in die Treffer - der nächste ist dann einen Tipp entfernt.
  await page.getByRole('link', { name: 'Zurück zur Suche' }).click();
  await expect(page.getByRole('link', { name: `Nimm Rad 1 ${LAUF}` })).toBeVisible();
});

test('sendet im Funkloch, sobald wieder Netz da ist - genau einmal (ANN-641)', async ({
  page,
  context,
}) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const feld = page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` });
  await expect(feld).toBeVisible();
  await context.setOffline(true);
  await feld.fill(`Im Funkloch ${LAUF}`);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText('Kein Netz – wird gesendet, sobald Empfang da ist.')).toBeVisible();
  await expect(feld).toHaveValue('');
  await context.setOffline(false);
  await expect(page.getByText('Kein Netz – wird gesendet, sobald Empfang da ist.')).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByText(`Im Funkloch ${LAUF}`)).toHaveCount(1);
});

test('nimmt beim Kontowechsel keinen Entwurf mit', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` }).fill(`Halb fertig ${LAUF}`);
  // Zurück und wieder hinein: Der Entwurf steht noch da.
  await page.getByRole('link', { name: 'Zurück zu den Gesprächen' }).click();
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await expect(page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` })).toHaveValue(
    `Halb fertig ${LAUF}`,
  );

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await zumTeamchat(page, KONTEN.office);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await expect(page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` })).toHaveValue('');
  await page.goto('/team/entwuerfe');
  await expect(page.getByText(`Halb fertig ${LAUF}`)).toHaveCount(0);
});

test('steht beim Zurückkommen dort, wo man war - auch nach einem Thread (ANN-648)', async ({
  page,
}) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const feld = page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` });
  // Genug Verlauf zum Rollen; Strg+Enter sendet auch am Telefon.
  for (let i = 1; i <= 12; i += 1) {
    await feld.fill(`Zeile ${i} ${LAUF}`);
    await feld.press('Control+Enter');
    await expect(page.getByText(`Zeile ${i} ${LAUF}`)).toBeVisible();
  }
  const zeile = page.locator('[data-nachricht]').filter({ hasText: `Zeile 4 ${LAUF}` });
  // Nach dem Senden rollt der Verlauf sanft ans Ende; erst wenn das steht,
  // „Zeile 4“ an den oberen Rand holen.
  let oben = 0;
  await expect(async () => {
    await zeile.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const erst = (await zeile.boundingBox())!.y;
    await page.waitForTimeout(300);
    oben = (await zeile.boundingBox())!.y;
    expect(oben).toBe(erst);
  }).toPass();

  async function stehtWieVorher() {
    await expect(async () => {
      expect(Math.abs((await zeile.boundingBox())!.y - oben)).toBeLessThanOrEqual(4);
    }).toPass();
  }

  // Zur Liste und zurück.
  await page.getByRole('link', { name: 'Zurück zu den Gesprächen' }).click();
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await stehtWieVorher();

  // In einen Thread und zurück - am Telefon ersetzt er das Gespräch.
  await zeile.getByRole('link', { name: 'Antworten' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Thread' })).toBeVisible();
  await page.getByRole('link', { name: `Zurück zu # ${KANAL}` }).click();
  await stehtWieVorher();
});

test('hält die Eingabe über der Tastatur erreichbar', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const feld = page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` });
  await feld.click();
  // Die Tastatur verkleinert den sichtbaren Ausschnitt - nachgestellt über die
  // Höhe des Fensters (am Gerät sichten: Sichtungspunkt im PR).
  await page.setViewportSize({ width: 375, height: 420 });
  await expect(async () => {
    const senden = (await page.getByRole('button', { name: 'Senden', exact: true }).boundingBox())!;
    expect(senden.y + senden.height).toBeLessThanOrEqual(420);
    expect((await feld.boundingBox())!.y).toBeGreaterThan(0);
  }).toPass();
  await ohneQuerrollen(page);
});

test('zeigt am Rechner Gespräch und Thread nebeneinander', async ({ page }) => {
  await zumTeamchat(page, KONTEN.therapist, RECHNER);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const nachricht = page.getByRole('listitem').filter({ hasText: `Kette Rad 2 ${LAUF}` });
  await nachricht.getByRole('link', { name: /^1 Antwort/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: `# ${KANAL}` })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Thread' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Thread' }).getByText(`Nimm Rad 1 ${LAUF}`),
  ).toBeVisible();
  // Die Gespräche bleiben links stehen, das offene ist markiert.
  await expect(gespraeche(page).getByRole('link', { name: `# ${KANAL}` })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: 'Thread schließen' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Thread' })).toHaveCount(0);
  await expect(page.getByText(`Kette Rad 2 ${LAUF}`)).toBeVisible();
  await ohneQuerrollen(page);
});

test('bespricht Räder in der Radflotte, nicht im Teamchat (ANN-613)', async ({ page }) => {
  await anmelden(page, KONTEN.therapist);
  await page.setViewportSize(TELEFON);
  await page.goto('/betrieb/flotte');
  await page
    .getByRole('navigation', { name: 'Ansichten' })
    .getByRole('link', { name: 'Nachrichten' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nachrichten der Radflotte' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Nachricht an Nachrichten der Radflotte' })
    .fill(`Schlüssel Depot Nord ${LAUF}`);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(`Schlüssel Depot Nord ${LAUF}`)).toBeVisible();

  await page.goto('/team');
  await expect(page.getByRole('heading', { level: 1, name: 'Teamchat' })).toBeVisible();
  await expect(page.getByText('Nachrichten der Radflotte')).toHaveCount(0);
});
