import { expect, test, type Locator, type Page } from '@playwright/test';
import { KONTEN, anmelden, rpcAufrufen, zugriffstoken } from './helpers';

/**
 * G10 und G10b gegen den echten Stack bei 375 × 667, nichts gestubbt; Ladestrom und Einkauf mit
 * Beleg als Datei, weil der Prüfbrowser keine Kamera hat. Die volle IBAN sieht nur owner beim
 * Auszahlen, dem Büro verweigert sie der Server. Ausschließlich synthetische Seed-Konten.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 667 };
const LAUF = Date.now();
const IBAN = 'DE89 3704 0044 0532 0130 00';
const MASKIERT = 'DE89 •••• 3000';
const ZWECK = `Massageöl (Lauf ${LAUF})`;

/** Ein kleines, gültiges JPEG - synthetisch, wie in den Kernabläufen. */
const BELEG = {
  name: 'beleg.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1miiipAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z',
    'base64',
  ),
};

/** Bildschirmfoto im ruhenden Stand: nach dem Startbild und der Tippsperre (wie Überholung 8). */
async function bild(seite: Page, name: string): Promise<void> {
  await seite
    .locator('[data-startbild]')
    .waitFor({ state: 'detached', timeout: 6_000 })
    .catch(() => undefined);
  await seite.waitForTimeout(800);
  await seite.screenshot({ path: `.tmp/screenshots/${name}.png` });
}

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    /** Ein Tipp ohne Klick, etwa die Wahl im Dateiwähler. */
    zaehle() {
      tipps += 1;
    },
    get tipps() {
      return tipps;
    },
  };
}

test('Anna hinterlegt ihre IBAN; danach steht sie maskiert da (ANN-601)', async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/erstattungen');
  await expect(page.getByRole('heading', { level: 1, name: 'Erstattungen' })).toBeVisible();
  await bild(page, 'b10-g10-00-erstattungen-375');

  await page.getByRole('link', { name: /^(Hinterlegen|Ändern): IBAN$/ }).click();
  const konto = page.getByRole('dialog', { name: 'Auf welches Konto?' });
  const speichern = konto.getByRole('button', { name: 'IBAN speichern' });
  // Eine falsche Prüfziffer geht nicht durch.
  await konto.getByLabel('IBAN').fill('DE89 3704 0044 0532 0130 01');
  await expect(speichern).toBeDisabled();
  await konto.getByLabel('IBAN').fill(IBAN);
  await bild(page, 'b10-g10-01-iban-375');
  await speichern.click();
  await expect(page.getByText(`IBAN gespeichert: ${MASKIERT}.`)).toBeVisible();
  await expect(page.getByText(`Auf ${MASKIERT}`)).toBeVisible();
  await expect(page.getByText(IBAN)).toHaveCount(0);
});

/** Der vorbelegte Zweck: der jüngste abgeschlossene Monat (ANN-749). */
const LADESTROM = /^Ladestrom \S+ \d{4}$/;

test('G10: Anna beantragt Ladestrom wie einen Einkauf mit Beleg - fünf Tipps und der Betrag', async ({
  page,
}) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/erstattungen');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Erstattung beantragen' }).first());
  const art = page.getByRole('dialog', { name: 'Was erstatten?' });
  await expect(art.getByText('Es entscheidet: Praxisinhaber.')).toBeVisible();
  await bild(page, 'b10-g10-02-art-375');
  await t.tippe(art.getByRole('button', { name: 'Ladestrom für das Lastenrad' }));

  // Derselbe Belegweg wie beim Einkauf; die Wahl im Dateiwähler ist ein Tipp.
  const beleg = page.getByRole('dialog', { name: 'Beleg?' });
  await expect(beleg).toBeVisible();
  t.zaehle();
  await beleg.getByLabel(/^Beleg (wählen|als Datei)$/).setInputFiles(BELEG);

  const posten = page.getByRole('dialog', { name: 'Wie viel und wofür?' });
  await expect(posten.getByLabel('Wofür?')).toHaveValue(LADESTROM);
  await posten.getByLabel('Betrag in €').fill('18,50');
  await bild(page, 'b10-g10-03-ladestrom-betrag-375');
  await t.tippe(posten.getByRole('button', { name: 'Weiter' }));

  const abschluss = page.getByRole('dialog', { name: 'Ladestrom beantragen?' });
  await expect(abschluss.getByText(LADESTROM)).toBeVisible();
  await expect(abschluss.getByText(`Auszahlung auf ${MASKIERT}`)).toBeVisible();
  const absenden = abschluss.getByRole('button', { name: 'Ladestrom beantragen' });
  await expect(absenden).toBeInViewport();
  await bild(page, 'b10-g10-05-zusammenfassung-375');
  await t.tippe(absenden);

  await expect(
    page.getByText('Ladestrom beantragt: 18,50\u00a0€. Es entscheidet: Praxisinhaber.'),
  ).toBeVisible();
  await bild(page, 'b10-g10-06-beantragt-375');
  test.info().annotations.push({ type: 'G10 Strom', description: `${t.tipps} Tipps` });
  expect(t.tipps).toBeLessThanOrEqual(5);

  // Zurückziehen, damit der Lauf Jannes nichts zu entscheiden hinterlässt; der neueste steht oben.
  const zeile = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Meine Erstattungen/ }) })
    .getByRole('listitem')
    .filter({ hasText: /Ladestrom \S+ \d{4}/ })
    .first();
  await expect(zeile).toContainText('18,50');
  await expect(zeile).toContainText('Beantragt');
  await zeile.getByRole('button', { name: 'Zurückziehen' }).click();
  await page.getByRole('button', { name: 'Ja, zurückziehen' }).click();
  await expect(zeile).toContainText('Zurückgezogen');
});

test('G10 Einkauf und G10b: Anna reicht einen Beleg ein, Jannes genehmigt und zahlt aus (ERS-001)', async ({
  page,
  browser,
}) => {
  // Drei Personen nacheinander: Antrag, Entscheidung und Auszahlung, Büro.
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/erstattungen');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Erstattung beantragen' }).first());
  await t.tippe(
    page
      .getByRole('dialog', { name: 'Was erstatten?' })
      .getByRole('button', { name: 'Einkauf mit Beleg' }),
  );
  const beleg = page.getByRole('dialog', { name: 'Beleg?' });
  await expect(beleg).toBeVisible();
  await bild(page, 'b10-g10-07-beleg-375');
  // Ohne Kamera im Prüfbrowser über den Dateiwähler - ein Tipp wie
  // „Foto verwenden“ im Kameradialog.
  t.zaehle();
  await beleg.getByLabel(/^Beleg (wählen|als Datei)$/).setInputFiles(BELEG);

  const posten = page.getByRole('dialog', { name: 'Wie viel und wofür?' });
  await expect(posten.getByRole('img', { name: 'Der fotografierte Beleg' })).toBeVisible();
  await posten.getByLabel('Betrag in €').fill('12,90');
  await posten.getByLabel('Wofür?').fill(ZWECK);
  const weiter = posten.getByRole('button', { name: 'Weiter' });
  await expect(weiter).toBeEnabled();
  await bild(page, 'b10-g10-08-betrag-375');
  await t.tippe(weiter);

  const abschluss = page.getByRole('dialog', { name: 'Einkauf beantragen?' });
  // Genau die Zeile: „Entfernen“ trägt den Zweck für Vorlesesoftware mit.
  await expect(abschluss.getByText(ZWECK, { exact: true })).toBeVisible();
  await expect(abschluss.getByText(`Auszahlung auf ${MASKIERT}`)).toBeVisible();
  const absenden = abschluss.getByRole('button', { name: 'Einkauf beantragen' });
  await expect(absenden).toBeInViewport();
  await bild(page, 'b10-g10-09-zusammenfassung-einkauf-375');
  await t.tippe(absenden);
  // Bleibt der Abschluss offen oder fehlt die Bestätigung, nennt der Fehler,
  // was dort stand - etwa die Meldung des Servers im Fuß.
  const text = async (bereich: Locator) =>
    ((await bereich.innerText().catch(() => '')) || '–').replace(/\s+/g, ' ').slice(0, 500);
  await abschluss.waitFor({ state: 'hidden', timeout: 15_000 }).catch(async () => {
    throw new Error(`Der Abschluss blieb offen: ${await text(abschluss)}`);
  });
  await page
    .getByText('Einkauf beantragt: 12,90\u00a0€. Es entscheidet: Praxisinhaber.')
    .waitFor({ timeout: 10_000 })
    .catch(async () => {
      throw new Error(`Keine Bestätigung auf ${page.url()}: ${await text(page.locator('main'))}`);
    });
  test.info().annotations.push({ type: 'G10 Einkauf', description: `${t.tipps} Tipps` });
  expect(t.tipps).toBeLessThanOrEqual(7);

  // G10b: Jannes in Offene Punkte.
  const inhaber = await browser.newPage({ viewport: TELEFON });
  await anmelden(inhaber, KONTEN.owner);
  await inhaber.goto('/offen');
  const e = zaehler();
  const offen = inhaber
    .locator('section')
    .filter({ has: inhaber.getByRole('heading', { name: /^Erstattungen/ }) });
  await expect(offen).toBeVisible();
  await bild(inhaber, 'b10-g10b-00-offen-375');
  await e.tippe(offen.getByRole('link', { name: ZWECK }));
  const entscheiden = inhaber.getByRole('dialog', { name: 'Erstattung genehmigen?' });
  // Den Beleg ansehen - über eine einmalige Freigabe, nicht gezählt.
  await entscheiden.getByRole('button', { name: `${ZWECK}, 12,90\u00a0€: Beleg ansehen` }).click();
  await expect(entscheiden.getByRole('img', { name: /^Beleg: Massageöl/ })).toBeVisible();
  await bild(inhaber, 'b10-g10b-01-entscheiden-375');
  await e.tippe(entscheiden.getByRole('button', { name: 'Genehmigen' }));
  const genehmigt = inhaber.getByRole('dialog', { name: 'Genehmigt' });
  await expect(
    genehmigt.getByText(
      'Erstattung für Anna Beispiel genehmigt: 12,90\u00a0€. Noch nicht ausgezahlt.',
    ),
  ).toBeVisible();
  await bild(inhaber, 'b10-g10b-02-genehmigt-375');
  test.info().annotations.push({ type: 'G10b Genehmigen', description: `${e.tipps} Tipps` });
  expect(e.tipps).toBeLessThanOrEqual(2);
  await genehmigt.getByRole('button', { name: 'Fertig' }).click();

  // Danach unter „Auszuzahlen“: volle IBAN und Betrag, dann „Ausgezahlt“.
  const z = zaehler();
  const auszahlen = inhaber
    .locator('section')
    .filter({ has: inhaber.getByRole('heading', { name: /^Auszuzahlen/ }) });
  await z.tippe(auszahlen.getByRole('link', { name: ZWECK }));
  const zahlen = inhaber.getByRole('dialog', { name: 'Ausgezahlt?' });
  await expect(zahlen.getByText(IBAN)).toBeVisible();
  await expect(zahlen.getByText('12,90\u00a0€')).toBeVisible();
  await bild(inhaber, 'b10-g10b-03-auszahlen-375');
  await z.tippe(zahlen.getByRole('button', { name: 'Ausgezahlt' }));
  const vermerkt = inhaber.getByRole('dialog', { name: 'Vermerkt' });
  await expect(
    vermerkt.getByText('Auszahlung an Anna Beispiel vermerkt: 12,90\u00a0€.'),
  ).toBeVisible();
  await bild(inhaber, 'b10-g10b-04-vermerkt-375');
  test.info().annotations.push({ type: 'G10b Auszahlen', description: `${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(2);
  await inhaber.close();

  // Anna sieht „Ausgezahlt“.
  await page.reload();
  const eigene = page.getByRole('listitem').filter({ hasText: ZWECK }).first();
  await expect(eigene).toContainText('Ausgezahlt');
  await bild(page, 'b10-g10-10-ausgezahlt-375');

  // Olivia (Büro) sieht ihn bei Anna, die IBAN nur maskiert, ohne Entscheiden.
  const buero = await browser.newPage({ viewport: TELEFON });
  await anmelden(buero, KONTEN.office);
  await buero.goto('/betrieb/erstattungen');
  await buero
    .locator('section')
    .filter({ has: buero.getByRole('heading', { name: /^Personen/ }) })
    .getByRole('link', { name: /Anna Beispiel/ })
    .click();
  await expect(
    buero.getByRole('heading', { level: 1, name: 'Erstattungen von Anna Beispiel' }),
  ).toBeVisible();
  await expect(buero.getByRole('listitem').filter({ hasText: ZWECK }).first()).toContainText(
    'Ausgezahlt',
  );
  await expect(buero.getByText(`Auf ${MASKIERT}`)).toBeVisible();
  await expect(buero.getByText(IBAN)).toHaveCount(0);
  await expect(buero.getByRole('button', { name: 'Genehmigen' })).toHaveCount(0);
  await bild(buero, 'b10-g10b-05-buero-anna-375');

  // Die volle IBAN verweigert der Server dem Büro - nicht nur die Oberfläche.
  const token = await zugriffstoken(buero.request, KONTEN.office);
  const antwort = await rpcAufrufen(buero.request, token, 'list_reimbursements', {
    p_staff_member_id: null,
  });
  expect(antwort.ok()).toBe(true);
  const stand = (await antwort.json()) as { people: { staff_member_id: string; name: string }[] };
  const anna = stand.people.find((p) => p.name === 'Anna Beispiel')!;
  const liste = await rpcAufrufen(buero.request, token, 'list_reimbursements', {
    p_staff_member_id: anna.staff_member_id,
  });
  const annas = (await liste.json()) as {
    person: { reimbursements: { id: string; receipts: { purpose: string }[] }[] };
  };
  const erstattung = annas.person.reimbursements.find((r) =>
    r.receipts.some((b) => b.purpose === ZWECK),
  )!;
  const details = await rpcAufrufen(buero.request, token, 'reimbursement_payout_details', {
    p_reimbursement_id: erstattung.id,
  });
  expect(details.ok()).toBe(false);
  expect(await details.text()).not.toContain('DE89370400440532013000');
  await buero.close();
});
