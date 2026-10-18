import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, anmelden } from './helpers';

/**
 * Teamchat (TEAM-001 bis TEAM-003) gegen den echten Stack - mehrere Konten,
 * bei 375 px mit gezählten Tipps, dazu der Rechner bei 1280 px.
 *
 * Gezählt werden Tipps ohne getippten Text, gegen die Budgets der Spec
 * (Referenzabgleich Slack: Senden 2, Antworten 2, Erwähnen +2, Direktnachricht
 * 3, Treffer öffnen 2, Reagieren 2, Foto oder PDF senden 4 und die Auswahl im
 * Dateiwähler). Ausgangslage ist jeweils der Teamchat
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

/**
 * Synthetische Anhänge (TEAM-003): ein PDF mit einer Zeile Text, das Foto
 * malt der Browser (`testfoto`). Der lange Name prüft das Kürzen bei 375 px.
 */
const PLAN = {
  name: `Dienstplan KW 43 mit einem recht langen Dateinamen ${LAUF}.pdf`,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
      '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
      '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Contents 4 0 R',
      '/Resources <</Font <</F1 5 0 R>>>>>> endobj',
      '4 0 obj <</Length 52>> stream',
      'BT /F1 16 Tf 24 56 Td (Dienstplan KW 43, Test) Tj ET',
      'endstream endobj',
      '5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj',
      'trailer <</Root 1 0 R>>',
      '%%EOF',
      '',
    ].join('\n'),
  ),
};

/** Ein Foto ohne Kamera: Farbflächen aus dem Canvas des Browsers, als PNG. */
async function testfoto(page: Page, name: string) {
  const daten = await page.evaluate(() => {
    const leinwand = document.createElement('canvas');
    leinwand.width = 320;
    leinwand.height = 200;
    const stift = leinwand.getContext('2d')!;
    stift.fillStyle = '#2f6f68';
    stift.fillRect(0, 0, 320, 200);
    stift.fillStyle = '#f2c14e';
    stift.fillRect(40, 60, 240, 80);
    return leinwand.toDataURL('image/png').split(',')[1]!;
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(daten, 'base64') };
}

/**
 * Ob das Gerät eine Kamera meldet - die Büroklammer bietet dann Foto und
 * Datei zur Wahl, sonst gleich den Dateiwähler. Ohne das hinge es am
 * Prüfbrowser.
 */
async function kameraMelden(page: Page, vorhanden: boolean): Promise<void> {
  await page.addInitScript((mitKamera) => {
    navigator.mediaDevices.enumerateDevices = () =>
      Promise.resolve(
        mitKamera
          ? [{ kind: 'videoinput', deviceId: '', groupId: '', label: '' } as MediaDeviceInfo]
          : [],
      );
  }, vorhanden);
}

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    /** Ein Tipp außerhalb der Seite - die Auswahl im Dateiwähler. */
    zaehle() {
      tipps += 1;
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
  await expect(
    page.getByText('Kein Netz – wird gesendet, sobald Empfang da ist und die App läuft.'),
  ).toBeVisible();
  await expect(feld).toHaveValue('');
  await context.setOffline(false);
  await expect(
    page.getByText('Kein Netz – wird gesendet, sobald Empfang da ist und die App läuft.'),
  ).toHaveCount(0, {
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

test('hängt ein Foto und ein PDF an und sendet sie in vier Tipps und der Auswahl (TEAM-003)', async ({
  page,
}) => {
  // Am Telefon gibt es eine Kamera: Die Büroklammer fragt dann, Foto oder Datei.
  await kameraMelden(page, true);
  await zumTeamchat(page, KONTEN.therapist);
  const foto = await testfoto(page, `Kette Rad 2 ${LAUF}.png`);
  const z = zaehler();
  await z.tippe(gespraeche(page).getByRole('link', { name: `# ${KANAL}` }));
  await z.tippe(page.getByRole('button', { name: 'Anhängen', exact: true }));
  const waehler = page.waitForEvent('filechooser');
  await z.tippe(
    page
      .getByRole('group', { name: 'Anhängen', exact: true })
      .getByRole('button', { name: 'Foto oder PDF wählen' }),
  );
  z.zaehle();
  await (await waehler).setFiles([foto, PLAN]);

  // Beide laden hoch, während geschrieben wird; gesendet wird erst danach.
  const entwurf = page.getByRole('list', { name: 'Anhänge', exact: true });
  await expect(entwurf.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('textbox', { name: `Nachricht an # ${KANAL}` }).fill(`Neuer Plan ${LAUF}`);
  await expect(entwurf.getByText('Lädt', { exact: true })).toHaveCount(0, { timeout: 20_000 });
  await expect(entwurf.getByRole('alert')).toHaveCount(0);
  await ohneQuerrollen(page);
  await z.tippe(page.getByRole('button', { name: 'Senden', exact: true }));

  const nachricht = page.locator('[data-nachricht]').filter({ hasText: `Neuer Plan ${LAUF}` });
  const anhaenge = nachricht.getByRole('group', { name: 'Anhänge', exact: true });
  await expect(anhaenge.getByRole('button')).toHaveCount(2);
  await expect(anhaenge.getByRole('button', { name: /Dienstplan KW 43.*PDF/ })).toBeVisible();
  await expect(anhaenge.getByRole('button', { name: /Kette Rad 2.*Foto/ })).toBeVisible();
  await expect(entwurf).toHaveCount(0);
  expect(z.tipps).toBeLessThanOrEqual(5);
  // Kein Vorschaubild in der Zeile (ADR-017 Punkt 77), kein Querrollen.
  await expect(nachricht.locator('img')).toHaveCount(0);
  await ohneQuerrollen(page);
  for (const knopf of await anhaenge.getByRole('button').all()) {
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('öffnet einen Anhang im eigenen Rahmen und findet ihn unter Dateien (ADR-017 Punkte 77, 80)', async ({
  page,
}) => {
  await zumTeamchat(page, KONTEN.office, RECHNER);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  const nachricht = page.locator('[data-nachricht]').filter({ hasText: `Neuer Plan ${LAUF}` });
  await nachricht.getByRole('button', { name: /Kette Rad 2.*Foto/ }).click();
  await expect(
    nachricht.getByRole('region', { name: `Ansicht: Kette Rad 2 ${LAUF}.png` }).getByRole('img'),
  ).toBeVisible();
  await nachricht.getByRole('button', { name: 'Schließen' }).click();
  await nachricht.getByRole('button', { name: /Dienstplan KW 43.*PDF/ }).click();
  const rahmen = nachricht.locator(`iframe[title="${PLAN.name}"]`);
  await expect(rahmen).toBeVisible();
  // Ohne die Leiste des Betrachters mit Herunterladen und Drucken.
  await expect(rahmen).toHaveAttribute('src', /#toolbar=0$/);
  // Herunterladen gibt es nicht - nur Schließen.
  await expect(nachricht.getByRole('button', { name: /Herunterladen/ })).toHaveCount(0);
  await expect(nachricht.getByRole('link', { name: /Herunterladen/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const details = page.getByRole('dialog', { name: `# ${KANAL}` });
  await expect(details.getByRole('heading', { name: /^Dateien/ })).toBeVisible();
  await expect(details.getByText(PLAN.name)).toBeVisible();
  await expect(details.getByText(`Kette Rad 2 ${LAUF}.png`)).toBeVisible();
  await expect(details.getByText(/^PDF · .* · Anna Beispiel/)).toBeVisible();
  await ohneQuerrollen(page);
});

test('antwortet im Thread nur mit einer Datei; die Liste sagt „Anhang“ (ANN-653)', async ({
  page,
  browser,
}) => {
  await zumTeamchat(page, KONTEN.office);
  await gespraeche(page)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await page
    .getByRole('textbox', { name: `Nachricht an # ${KANAL}` })
    .fill(`Schloss Rad 3 klemmt ${LAUF}`);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(`Schloss Rad 3 klemmt ${LAUF}`)).toBeVisible();

  const therapie = await browser.newPage();
  // Ohne Kamera öffnet die Büroklammer gleich den Dateiwähler.
  await kameraMelden(therapie, false);
  await zumTeamchat(therapie, KONTEN.therapist);
  await gespraeche(therapie)
    .getByRole('link', { name: `# ${KANAL}` })
    .click();
  await therapie
    .locator('[data-nachricht]')
    .filter({ hasText: `Schloss Rad 3 klemmt ${LAUF}` })
    .getByRole('link', { name: 'Antworten' })
    .click();
  await expect(therapie.getByRole('heading', { level: 1, name: 'Thread' })).toBeVisible();
  const senden = therapie.getByRole('button', { name: 'Senden', exact: true });
  await expect(senden).toBeDisabled();
  const waehler = therapie.waitForEvent('filechooser');
  await therapie.getByRole('button', { name: 'Anhängen', exact: true }).click();
  const foto = await testfoto(therapie, `Schloss ${LAUF}.png`);
  const ueberzaehlig = { ...PLAN, name: `Falsche Datei ${LAUF}.pdf` };
  await (await waehler).setFiles([foto, ueberzaehlig]);
  // Vor dem Senden lässt sich ein Anhang wieder entfernen - auch am Server.
  await therapie
    .getByRole('button', { name: `Anhang entfernen: Falsche Datei ${LAUF}.pdf` })
    .click();
  const entwurf = therapie.getByRole('list', { name: 'Anhänge', exact: true });
  await expect(entwurf.getByRole('listitem')).toHaveCount(1);
  await expect(senden).toBeEnabled({ timeout: 20_000 });
  await senden.click();
  const antwort = therapie.locator('[data-nachricht]').filter({
    has: therapie.getByRole('button', { name: `Schloss ${LAUF}.png` }),
  });
  await expect(antwort).toHaveCount(1);
  await expect(therapie.getByText(`Falsche Datei ${LAUF}.pdf`)).toHaveCount(0);
  await therapie.close();

  // Die Antwort ohne Text erscheint unter „Für dich“ als „Anhang“.
  await page.goto('/fuer-dich');
  await expect(
    page
      .getByRole('link')
      .filter({ hasText: 'Anhang' })
      .filter({ hasText: 'Anna Beispiel' })
      .first(),
  ).toBeVisible();
});
