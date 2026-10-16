import { expect, test, type Locator } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  fensterSchliessen,
  tagImFenster,
  terminKachel,
  terminUeberOberflaeche,
  zeitImLauf,
} from './helpers';

/**
 * Restbefunde der Praxis-Prüfung (Kernabläufe in `docs/product/kernablaeufe.md`)
 * gegen den echten Stack, bei 375 px.
 *
 * Gezählt wird, was die Software verlangt: Tipps (Berührungen, ohne getippten
 * Text). K3 und K6 zählt die Prüfseite in `tests/e2e/besuch.spec.ts`; hier
 * stehen die Abläufe, die über Kalender und Bibliothek gehen.
 *
 * Wie in den übrigen Spezifikationen belegt jeder Lauf einen eigenen Tag: Ein
 * abgesagter Termin lässt sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();
const TELEFON = { width: 375, height: 812 };

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    /** Ein Tipp, den der Test anders auslöst - etwa der Dateiwähler. */
    zaehle() {
      tipps += 1;
    },
    get tipps() {
      return tipps;
    },
  };
}

test('K9: Absage am Telefon in höchstens vier Tipps, Grund ohne Vorbelegung', async ({ page }) => {
  const tag = tagImFenster(TAGESFENSTER.kernablaeufe, LAUF);
  await anmelden(page, KONTEN.office);
  const id = await terminUeberOberflaeche(page, {
    tag,
    von: zeitImLauf(LAUF),
    standortAbwarten: true,
  });
  await fensterSchliessen(page);
  await page.setViewportSize(TELEFON);
  await page.getByRole('button', { name: 'Terminpanel schließen' }).click();

  // Ausgangslage: der Kalendertag mit dem Termin, das Telefon klingelt.
  const z = zaehler();
  await z.tippe(terminKachel(page, id));
  const panel = page.locator('section[aria-labelledby="terminpanel-titel"]');
  await z.tippe(panel.getByRole('button', { name: 'Termin absagen' }));
  const gruende = panel.getByRole('group', { name: 'Absagegrund' });
  for (const chip of await gruende.getByRole('button').all()) {
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  }
  await z.tippe(gruende.getByRole('button', { name: 'Patient:in hat abgesagt' }));
  await z.tippe(panel.getByRole('button', { name: 'Ja, Termin absagen' }));
  // Der abgesagte Termin fällt aus dem Standardfilter; die Bestätigung trägt die Seite.
  await expect(page.getByRole('status').filter({ hasText: 'Termin abgesagt' })).toBeVisible();

  test.info().annotations.push({ type: 'K9', description: `${z.tipps} Tipps (vorher 7)` });
  expect(z.tipps).toBeLessThanOrEqual(4);

  // Kein waagerechtes Scrollen am Telefon.
  const ueberbreit = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(ueberbreit).toBe(false);
});

test('Übung aus der Bibliothek in den Plan: zwei Tipps bis zum Plan, vier bis zugewiesen', async ({
  page,
}) => {
  await anmelden(page, KONTEN.therapist);
  await page.setViewportSize(TELEFON);
  await page.goto('/uebungen');
  // Ausgangslage: die Übung ist gefunden und offen.
  // Die erste Übung der Liste - nicht „Vorlagen“ oder „Durchsicht“ im Kopf.
  await page.locator('main li a[href^="/uebungen/"]').first().click();
  const titel = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(titel).not.toBe('');

  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Zu einem Plan' }));
  const fenster = page.getByRole('dialog', { name: 'Zu einem Übungsplan' });
  await fenster.getByLabel('Für wen?').fill('Mustermann');
  await z.tippe(fenster.getByRole('option', { name: /Max Mustermann/ }));

  await expect(page).toHaveURL((url) =>
    url.pathname.startsWith(`/patienten/${PATIENTEN.max}/plaene/`),
  );
  expect(z.tipps).toBeLessThanOrEqual(2);

  await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));
  await z.tippe(
    page.getByRole('dialog', { name: 'Plan zuweisen' }).getByRole('button', {
      name: 'Zuweisen',
    }),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  test.info().annotations.push({
    type: 'Bibliothek',
    description: `${z.tipps} Tipps bis zugewiesen (vorher ≈ 9 + Suche)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(4);
});

/**
 * Erstaufnahme geführt (K10, K11): Die Neuaufnahme am Telefon legt eine neue
 * Person an, die Erstaufnahme führt sie danach durch Verordnung,
 * Anmeldebogen, eine Einwilligung und die Liege bis zur Doku. Eine eigene
 * Person je Lauf: Die Fotos erledigen die Checkliste, und eine Seed-Person
 * bliebe danach für andere Spezifikationen erledigt.
 */
let neuePerson = '';

/** Ein Nachname je Lauf aus Buchstaben - der Dublettenhinweis bleibt still. */
function lauftitel(): string {
  const buchstaben = LAUF.toString(36).replace(/[0-9]/g, (z) => 'abcdefghij'.charAt(Number(z)));
  return `Aufnahme${buchstaben}`;
}

/** Ein kleines, gültiges JPEG statt eines Fotos - synthetisch, ohne Inhalt. */
const BLATT = {
  name: 'blatt.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1miiipAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z',
    'base64',
  ),
};

test('K11: Neuaufnahme am Telefon in höchstens acht Tipps, die Felder über „Weiter“', async ({
  page,
}) => {
  await anmelden(page, KONTEN.office);
  await page.setViewportSize(TELEFON);
  await page.goto('/');

  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Patienten', exact: true }));
  await z.tippe(page.getByRole('link', { name: 'Patient:in anlegen' }));
  // Der Name beginnt ohne Tipp ins Feld; „Weiter“ der Tastatur führt durch
  // die Felder bis zum Zugangshinweis (Text zählt nicht als Tipp).
  await expect(page.getByLabel('Vorname *')).toBeFocused();
  await page.keyboard.type('Kim');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nachname *')).toBeFocused();
  await page.keyboard.type(lauftitel());
  await page.keyboard.press('Enter');
  await page.getByLabel('Geburtsdatum *').fill('1958-04-12');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Mobil')).toBeFocused();
  await page.keyboard.type('0151 0000000');
  for (const [feld, text] of [
    ['Straße', 'Musterweg'],
    ['Hausnummer', '7'],
    ['PLZ', '72070'],
    ['Ort', 'Tübingen'],
  ] as const) {
    await page.keyboard.press('Enter');
    await expect(page.getByLabel(feld)).toBeFocused();
    await page.keyboard.type(text);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Zugangshinweis')).toBeFocused();
  await page.keyboard.type('2. OG, Klingel Aufnahme');
  // Das Seltene ist eingeklappt und hält niemanden auf.
  await expect(page.getByLabel('E-Mail')).toBeHidden();
  await z.tippe(page.getByRole('button', { name: 'Patient:in anlegen' }));

  await expect(page).toHaveURL(/\/patienten\/[0-9a-f-]{36}(\/|$)/);
  neuePerson = /\/patienten\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  expect(neuePerson).not.toBe('');

  test.info().annotations.push({ type: 'K11', description: `${z.tipps} Tipps (vorher ≈ 12)` });
  expect(z.tipps).toBeLessThanOrEqual(8);
});

test('K10: Erstaufnahme geführt vom Termin bis zur Doku, nichts vergessen', async ({ page }) => {
  test.skip(neuePerson === '', 'K11 hat keine Person angelegt.');
  const tag = tagImFenster(TAGESFENSTER.kernablaeufe, LAUF, 1);
  await anmelden(page, KONTEN.owner);
  const id = await terminUeberOberflaeche(page, {
    tag,
    von: zeitImLauf(LAUF, 60),
    patient: neuePerson,
    standortAbwarten: true,
  });
  await fensterSchliessen(page);
  await page.setViewportSize(TELEFON);
  await page.getByRole('button', { name: 'Terminpanel schließen' }).click();

  // Ausgangslage: der Termin im Kalender, die Person steht vor der Tür.
  const z = zaehler();
  await z.tippe(terminKachel(page, id));
  const panel = page.locator('section[aria-labelledby="terminpanel-titel"]');
  await expect(panel.getByText('Fehlt: Verordnungsfoto · Anmeldebogen · Liege')).toBeVisible();
  await z.tippe(panel.getByRole('link', { name: 'Erstaufnahme' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Erstaufnahme' })).toBeVisible();
  await expect(page.getByText(/noch 4 offen/)).toBeVisible();

  // Verordnung: ohne Kamera (Prüfbrowser) über den Dateiwähler, ein Tipp
  // wie „Foto verwenden“ im Kameradialog - das Foto geht sofort ans Büro.
  z.zaehle();
  await page.getByLabel('Verordnung als Datei').setInputFiles(BLATT);
  const verordnung = page.locator('section', {
    has: page.getByRole('heading', { name: 'Verordnung' }),
  });
  await expect(verordnung.getByText('Erledigt')).toBeVisible();

  // Anmeldebogen: das Foto geht sofort in die Akte.
  z.zaehle();
  await page.getByLabel('Anmeldebogen als Datei').setInputFiles(BLATT);
  const bogen = page.locator('section', {
    has: page.getByRole('heading', { name: 'Anmeldebogen' }),
  });
  await expect(bogen.getByText('Erledigt')).toBeVisible();

  // Eine Einwilligung: nichts vorbelegt, mit Rückfrage (PAT-04).
  await z.tippe(page.getByRole('button', { name: /Kontakt per E-Mail/ }));
  const fenster = page.getByRole('dialog', { name: 'Kontakt per E-Mail' });
  await z.tippe(fenster.getByRole('radio', { name: 'Einwilligung erteilt' }));
  await z.tippe(fenster.getByRole('button', { name: 'Speichern' }));
  await z.tippe(page.getByRole('button', { name: 'Speichern' }).last());
  await expect(page.getByText(/Vermerkt: /)).toBeVisible();

  // Liege: einmal entscheiden.
  await z.tippe(page.getByRole('button', { name: 'Liege nicht nötig' }));
  // Offen bleibt der Anamnesebogen - mit Rückweg hierher.
  await expect(page.getByText(/noch 1 offen/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bogen erheben' })).toHaveAttribute(
    'href',
    /\/befund\/erheben\?instrument=anamnese.*zurueck=%2Fpatienten%2F.*%2Ferstaufnahme/,
  );

  await z.tippe(page.getByRole('link', { name: 'Weiter zu Befund und Doku' }));
  await expect(page).toHaveURL((url) => url.pathname === `/termine/${id}/abschluss`);

  // Ohne Anamnesebogen (vorab über die Plattform oder 2 Tipps + Felder)
  // und ohne Kameradialog (ein Tipp mehr je Foto); Budget 15.
  test.info().annotations.push({
    type: 'K10',
    description: `${z.tipps} Tipps bis zur Doku (vorher ≥ 25, ≥ 10 Wechsel)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(10);
});

test('Durchsicht des Katalogs: ein Tipp je Übung (UEB-015, ANN-561)', async ({ page }) => {
  await anmelden(page, KONTEN.owner);
  await page.setViewportSize(TELEFON);
  await page.goto('/uebungen');
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Durchsicht' }));
  await expect(page).toHaveURL((url) => url.pathname === '/uebungen/durchsicht');
  const kicker = page.getByText(/^Durchsicht · noch \d+$/);
  const vorher = Number((await kicker.textContent())?.match(/\d+/)?.[0]);
  const erste = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(vorher).toBeGreaterThan(1);

  const vorTipps = z.tipps;
  await z.tippe(page.getByRole('button', { name: 'Durchgesehen' }));
  await expect(page.getByText(`„${erste}“ als durchgesehen vermerkt.`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(erste);
  await expect(kicker).toHaveText(`Durchsicht · noch ${vorher - 1}`);
  expect(z.tipps - vorTipps).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  // Der Vermerk steht am Server: Die Übungsseite nennt ihn.
  await page.goto('/uebungen');
  await page.getByRole('searchbox').fill(erste);
  await page.locator('main li a').filter({ hasText: erste }).first().click();
  await expect(page.getByText(/Durchgesehen am/)).toBeVisible();
  test.info().annotations.push({
    type: 'Durchsicht',
    description: '1 Tipp je Übung (vorher: Übung suchen, öffnen, vermerken, zurück)',
  });
});

test('Als Vorlage speichern und in der Liste der Vorlagen finden (UEB-014, ANN-560)', async ({
  page,
}) => {
  await anmelden(page, KONTEN.therapist);
  await page.setViewportSize(TELEFON);
  await page.goto(`/patienten/${PATIENTEN.erika}/plaene/aeaeaeae-aeae-4eae-8eae-000000000001`);
  const name = `Knie, Lauf ${LAUF}`;
  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Als Vorlage speichern' }));
  const fenster = page.getByRole('dialog', { name: 'Als Vorlage speichern' });
  await fenster.getByRole('textbox', { name: /^Name/ }).fill(name);
  z.zaehle();
  await z.tippe(fenster.getByRole('button', { name: 'Speichern' }));
  await expect(
    page.getByText(`Als Vorlage „${name}“ gespeichert.`, { exact: false }),
  ).toBeVisible();
  expect(z.tipps).toBe(3);

  await page.goto('/uebungen/vorlagen');
  await page.getByRole('button').filter({ hasText: name }).click();
  const vorlage = page.getByRole('dialog', { name });
  // Die drei Übungen des Plans, ohne seine Hinweise.
  await expect(vorlage.getByRole('listitem')).toHaveCount(3);
  await expect(vorlage.getByText('Langsam runter, zügig hoch.')).toHaveCount(0);
  await vorlage.getByRole('button', { name: 'Vorlage löschen' }).click();
  await page.getByRole('button', { name: 'Ja, löschen' }).click();
  await expect(page.getByText(`Vorlage „${name}“ gelöscht.`)).toBeVisible();
});
