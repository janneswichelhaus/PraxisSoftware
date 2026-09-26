import { expect, test } from '@playwright/test';
import {
  KONTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  detailWert,
  tagImFenster,
  zeitImLauf,
  kalenderOptionenOeffnen,
} from './helpers';

/**
 * Anlegen-Menü und Dauerfehlzeit (CAL-019, CAL-021).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird der Weg, den Jannes geht: aus dem Kalender heraus
 * über das Menü in die Fehlzeit, eine Dauerfehlzeit über mehrere Wochen
 * eintragen und sie anschließend als ganze Serie absagen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.eventSeries, LAUF, versatz);
}

const zeit = (minutenAbAcht: number) => zeitImLauf(LAUF, minutenAbAcht, 10);

test.describe('CAL-019: Anlegen-Menü im Kalender', () => {
  test('oeffnet auf freier Flaeche das Menue und fuehrt in die Fehlzeit', async ({ page }) => {
    const tag = laufTag(0);

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);

    const spalte = page.getByRole('gridcell', { name: 'Anna Beispiel' });
    await expect(spalte).toBeVisible();
    await spalte.click({ position: { x: 40, y: 120 } });

    // Vier Einträge, und noch ist nichts geschrieben.
    const menue = page.getByRole('group', { name: 'Was soll hier entstehen?' });
    await expect(menue).toBeVisible();
    await expect(menue.getByRole('button', { name: /^Neuer Termin/ })).toBeVisible();
    // Seit BEF-042 auch ohne Patient:in: Die Folgeseite fragt nach ihr.
    await expect(menue.getByRole('button', { name: /^Dauertermin/ })).toBeEnabled();
    await expect(menue.getByRole('button', { name: /^Dauerfehlzeit/ })).toBeVisible();

    await menue.getByRole('button', { name: /^Fehlzeit/ }).click();

    await expect(
      page.getByRole('heading', { name: 'Fehlzeit eintragen', exact: true }),
    ).toBeVisible();
    // Tag und Person kommen aus der Auswahl; die Länge nicht - ein Ereignis
    // hat keine (CAL-019).
    await expect(page.getByLabel('Datum *')).toHaveValue(tag);
    await expect(page.getByLabel('Anna Beispiel')).toBeChecked();
    await expect(page.getByLabel('Beginn *')).toHaveValue(/\d{2}:\d{2}/);
  });
});

test.describe('CAL-021: Dauerfehlzeit', () => {
  test('traegt eine Serie ein und sagt sie als Ganzes ab', async ({ page }) => {
    const tag = laufTag(1);
    const von = zeit(0);
    const bis = zeit(90);
    const bezeichnung = `Teammeeting ${LAUF % 1000}`;

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);

    // Der Weg ohne Zeigegerät: die Schaltfläche über dem Gitter (CAL-019).
    await kalenderOptionenOeffnen(page);
    await page.getByRole('link', { name: 'Dauerfehlzeit eintragen' }).click();
    await expect(page.getByRole('heading', { name: 'Dauerfehlzeit eintragen' })).toBeVisible();

    await page.getByLabel('Bezeichnung *').fill(bezeichnung);
    await page.getByLabel('Anna Beispiel').check();
    await page.getByLabel('Erste Fehlzeit am *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByLabel('Ende *').fill(bis);
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
    await page.getByLabel('Anzahl Fehlzeiten *').fill('3');

    // Die Tage stehen vor dem Eintragen da.
    await expect(page.getByText(`3 Fehlzeiten, jeweils ${von}–${bis} Uhr`)).toBeVisible();

    await page.getByRole('button', { name: '3 Fehlzeiten eintragen' }).click();
    // Fällt der Tag des Laufs auf ein Wochenende, hat niemand hinterlegte
    // Arbeitszeit - dann kommt dieselbe Rückfrage wie beim Termin (CAL-005).
    await arbeitszeitBestaetigen(page, 'Trotzdem eintragen', /\/kalender/);

    await expect(page).toHaveURL(/\/kalender/);
    const kachel = page.getByRole('link', { name: bezeichnung });
    await expect(kachel.first()).toBeVisible();
    await kachel.first().click();

    // Das Vorkommen sagt, dass es eines von dreien ist (CAL-021).
    await expect(page.getByRole('heading', { name: /Fehlzeit –/ })).toBeVisible();
    await expect(detailWert(page, 'Dauerfehlzeit')).toContainText('Vorkommen 1 von 3');

    // Eine Fehlzeit ist keine Behandlung: kein Abschluss, keine Leistung (§19).
    await expect(page.getByRole('button', { name: /abschließen/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Ganze Serie absagen' }).click();
    await page.getByLabel('Absagegrund').selectOption('practice_request');
    await page.getByRole('button', { name: 'Ja, ganze Serie absagen' }).click();

    await expect(page.getByText(/Dieser Termin ist abgesagt/)).toBeVisible();
    // Abgesagt heißt abgesagt: Die Serienabsage steht danach nicht mehr da.
    await expect(page.getByRole('button', { name: 'Ganze Serie absagen' })).toHaveCount(0);
  });
});
