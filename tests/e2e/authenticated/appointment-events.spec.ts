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

    // Was es sehr wohl ist: ein Eintrag, den man absagen kann - und zwar
    // getrennt nach Teilnahme und ganzem Ereignis (CAL-017).
    await expect(page.getByRole('button', { name: 'Nur diese Teilnahme absagen' })).toBeVisible();
  });

  /**
   * Ein Teamereignis ist EIN Vorgang (CAL-017).
   *
   * Bis dahin wussten die Zeilen nichts voneinander: Verschieben hiess, die
   * Besprechung in jedem Kalender einzeln zu verschieben. Geprueft wird der
   * Weg, den Jannes geht - Besprechung mit zwei Beteiligten eintragen,
   * umbenennen und verschieben, und danach steht sie in beiden Kalendern
   * gleich.
   */
  test('aendert Bezeichnung und Zeit fuer alle Beteiligten zugleich', async ({ page }) => {
    const tag = laufTag(2);
    const von = zeit(120);
    const bis = zeit(145);
    const neuVon = zeit(180);
    const neuBis = zeit(205);
    const bezeichnung = `Gruppenbesprechung ${LAUF % 1000}`;

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await page.getByRole('link', { name: 'Ereignis eintragen' }).click();

    await page.getByLabel('Bezeichnung *').fill(bezeichnung);
    await page.getByLabel('Anna Beispiel').check();
    await page.getByLabel('Tim Teamleitung').check();
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByLabel('Ende *').fill(bis);
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Ereignis eintragen' }).click();
    await arbeitszeitBestaetigen(page, 'Trotzdem eintragen', /\/kalender/);

    // Beide Kalender tragen die Besprechung.
    const kacheln = page.getByRole('link', { name: bezeichnung });
    await expect(kacheln).toHaveCount(2);

    await kacheln.first().click();
    await expect(detailWert(page, 'Beteiligte')).toContainText('Anna Beispiel');
    await expect(detailWert(page, 'Beteiligte')).toContainText('Tim Teamleitung');

    // Das ganze Ereignis bearbeiten - Bezeichnung und Zeit.
    await page.getByRole('link', { name: 'Ereignis bearbeiten' }).click();
    await expect(page.getByRole('heading', { name: 'Ereignis bearbeiten' })).toBeVisible();
    await page.getByLabel('Bezeichnung *').fill(`${bezeichnung} neu`);
    await page.getByLabel('Beginn *').fill(neuVon);
    await page.getByLabel('Ende *').fill(neuBis);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Trotzdem ändern', /\/termine\/[0-9a-f-]{36}$/);

    await expect(detailWert(page, 'Ereignis')).toContainText(`${bezeichnung} neu`);
    await expect(detailWert(page, 'Zeit')).toContainText(neuVon);

    // Und im Kalender stehen beide Zeilen an der neuen Stelle, mit dem neuen
    // Namen - nicht eine von beiden.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const neueKacheln = page.getByRole('link', { name: `${bezeichnung} neu` });
    await expect(neueKacheln).toHaveCount(2);
    await expect(page.getByRole('link', { name: bezeichnung, exact: true })).toHaveCount(0);
  });

  test('sagt das ganze Ereignis in beiden Kalendern ab', async ({ page }) => {
    const tag = laufTag(3);
    const von = zeit(240);
    const bis = zeit(265);
    const bezeichnung = `Absagebesprechung ${LAUF % 1000}`;

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await page.getByRole('link', { name: 'Ereignis eintragen' }).click();

    await page.getByLabel('Bezeichnung *').fill(bezeichnung);
    await page.getByLabel('Anna Beispiel').check();
    await page.getByLabel('Tim Teamleitung').check();
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByLabel('Ende *').fill(bis);
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Ereignis eintragen' }).click();
    await arbeitszeitBestaetigen(page, 'Trotzdem eintragen', /\/kalender/);

    await page.getByRole('link', { name: bezeichnung }).first().click();
    await page.getByRole('button', { name: 'Ereignis absagen' }).click();
    // „Patient:in hat abgesagt" steht hier nicht zur Wahl (CAL-016).
    await page.getByLabel('Absagegrund').selectOption('practice_request');
    await page.getByRole('button', { name: 'Ja, für alle absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    // Keine Gebuehrenzeile - ein Ereignis loest keine Ausfallgebuehr aus.
    await expect(page.getByText('Gebühr vorgemerkt')).toHaveCount(0);

    // Beide Zeilen sind abgesagt: Im Standardfilter des Kalenders steht keine
    // mehr, mit dem Filter „alle" beide.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('link', { name: bezeichnung })).toHaveCount(0);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}&status=all`);
    await expect(page.getByRole('link', { name: bezeichnung })).toHaveCount(2);
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
