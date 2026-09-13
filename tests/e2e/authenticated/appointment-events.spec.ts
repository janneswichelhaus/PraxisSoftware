import { expect, test } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  detailWert,
  tagImFenster,
} from './helpers';

/**
 * Ereignisse des Praxisbetriebs (CAL-015b, CAL-015c).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird der Weg, den Jannes geht: aus dem Kalender heraus
 * eine Besprechung eintragen, sie im Gitter wiederfinden und am Termin sehen,
 * dass sie keine Behandlung ist.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentEvents, LAUF, versatz);
}

/** Eine Uhrzeit in der Seed-Arbeitszeit, je Lauf leicht verschoben. */
function zeit(minutenAbAcht: number): string {
  const gesamt = 8 * 60 + (LAUF % 10) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

test.describe('CAL-015: Ereignis eintragen', () => {
  test('traegt eine Besprechung ein und fuehrt sie ohne Patient:in', async ({ page }) => {
    const tag = laufTag(0);
    const von = zeit(0);
    const bis = zeit(25);

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);

    await page.getByRole('link', { name: 'Ereignis eintragen' }).click();
    await expect(page.getByRole('heading', { name: 'Ereignis eintragen' })).toBeVisible();

    // Weder Patient:in noch Verordnung noch eine Dauerwahl - ein Ereignis hat
    // nichts davon (PROJECT_PRINCIPLES.md 8.1).
    await expect(page.getByLabel('Dauer')).toHaveCount(0);

    const bezeichnung = `Teambesprechung ${LAUF % 1000}`;
    await page.getByLabel('Bezeichnung *').fill(bezeichnung);
    await page.getByLabel('Anna Beispiel').check();
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    // 25 Minuten: eine Laenge, die ein Behandlungstermin nicht haben duerfte.
    await page.getByLabel('Ende *').fill(bis);
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Ereignis eintragen' }).click();
    // Faellt der Tag des Laufs auf ein Wochenende, hat niemand hinterlegte
    // Arbeitszeit - dann kommt dieselbe Rueckfrage wie beim Termin (CAL-005).
    await arbeitszeitBestaetigen(page, 'Trotzdem eintragen', /\/kalender/);

    // Zurueck im Kalender, und die Besprechung steht im Gitter.
    await expect(page).toHaveURL(/\/kalender/);
    // getByRole mit Zeichenkette trifft Teiltexte - kein selbst gebauter
    // regulaerer Ausdruck aus veraenderlichem Text noetig.
    const kachel = page.getByRole('link', { name: bezeichnung });
    await expect(kachel.first()).toBeVisible();

    await kachel.first().click();

    await expect(page.getByRole('heading', { name: /Ereignis –/ })).toBeVisible();
    await expect(detailWert(page, 'Ereignis')).toContainText('Teambesprechung');
    await expect(detailWert(page, 'Zeit')).toContainText(von);

    // Was ein Ereignis nicht ist: keine Behandlung, keine Dokumentation,
    // kein Abschluss - und damit kein Weg in eine Leistung (19).
    await expect(page.getByRole('button', { name: /abschließen/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nicht angetroffen' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Folgetermin anlegen' })).toHaveCount(0);
    await expect(page.getByText('Behandlungsdokumentation')).toHaveCount(0);

    // Was es sehr wohl ist: ein Termin, den man absagen kann.
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toBeVisible();
  });

  test('belegt den Zeitraum und weist einen ueberschneidenden Termin ab', async ({ page }) => {
    const tag = laufTag(1);
    const von = zeit(60);
    const bis = zeit(85);

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await page.getByRole('link', { name: 'Ereignis eintragen' }).click();

    await page.getByLabel('Bezeichnung *').fill(`Belegt ${LAUF % 1000}`);
    await page.getByLabel('Anna Beispiel').check();
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByLabel('Ende *').fill(bis);
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Ereignis eintragen' }).click();
    await arbeitszeitBestaetigen(page, 'Trotzdem eintragen', /\/kalender/);
    await expect(page).toHaveURL(/\/kalender/);

    // Ein Behandlungstermin zur selben Zeit bei derselben Person geht nicht
    // mehr - die Belegung gilt fuer beide Arten gleich.
    await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page.getByText(/bereits einen Termin/)).toBeVisible();
  });
});
