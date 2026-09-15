import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  tagImFenster,
  terminLinkWahl,
  terminUeberOberflaeche,
  zeitImLauf,
} from './helpers';

/**
 * Die Patientenakte als Arbeitsplatz (AKTE-000 bis AKTE-005).
 *
 * Geprueft wird der Weg durch die Akte hinter der Anmeldung: Browser → GoTrue
 * → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts gestubbt. Die
 * Aufteilung selbst hat Komponententests; hier zaehlt, dass die Bereiche
 * hinter ihren Adressen echte Daten zeigen und die Wege zwischen ihnen
 * tragen.
 *
 * Wie in den uebrigen Spezifikationen belegt jeder Lauf einen eigenen
 * Zeitraum: ein angelegter Termin laesst sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag im eigenen Tagesfenster dieser Spezifikation (siehe helpers.ts). */
function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.patientRecordWorkspace, LAUF, versatz);
}

const zeit = (minutenAbAcht = 0) => zeitImLauf(LAUF, minutenAbAcht);

const AKTE = `/patienten/${PATIENTEN.max}`;

const terminAnlegen = (page: Page, tag: string) =>
  terminUeberOberflaeche(page, { tag, von: zeit() });

test.describe('AKTE-000: Rahmen und Bereiche', () => {
  test('haelt den Kopf stehen und wechselt den Bereich', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(AKTE);

    const kopf = page.getByRole('heading', { name: 'Max Mustermann' });
    await expect(kopf).toBeVisible();
    await expect(page.getByText('In Versorgung')).toBeVisible();

    const navigation = page.getByRole('navigation', { name: 'Bereiche der Akte' });
    await expect(navigation).toBeVisible();

    // Stammdaten: die Anschrift steht nicht mehr auf der Uebersicht.
    await navigation.getByRole('link', { name: 'Stammdaten' }).click();
    await expect(page).toHaveURL(`${AKTE}/stammdaten`);
    await expect(page.getByText('Kontakt', { exact: true })).toBeVisible();
    await expect(kopf).toBeVisible();

    // Verordnungen: der Bereich liest denselben rollenabhaengigen Lesepfad
    // wie vorher der Abschnitt der langen Seite (VER-002).
    await navigation.getByRole('link', { name: 'Verordnungen' }).click();
    await expect(page).toHaveURL(`${AKTE}/verordnungen`);
    await expect(page.getByRole('heading', { name: 'Aktuelle Verordnungen' })).toBeVisible();
    await expect(kopf).toBeVisible();

    // UI-002a: Es gibt keinen Bereich "Uebersicht" mehr, und die Adresse der
    // Akte fuehrt in die Termine - dorthin, wo gearbeitet wird.
    await expect(navigation.getByRole('link', { name: 'Übersicht' })).toHaveCount(0);
    await page.goto(AKTE);
    await expect(page).toHaveURL(`${AKTE}/termine`);
    await expect(page.getByRole('heading', { name: 'Kommende Termine' })).toBeVisible();
    await expect(kopf).toBeVisible();
  });
});

test.describe('AKTE-003: Termine mit Historie', () => {
  test('zeigt einen angelegten Termin unter den kommenden Terminen', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, laufTag());

    await page.goto(`${AKTE}/termine`);
    await expect(page.getByRole('heading', { name: 'Kommende Termine' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vergangene Termine' })).toBeVisible();

    // Genau dieser Termin. Max Mustermann kommt in vielen Spezifikationen vor,
    // und dieses Tagesfenster liegt am weitesten in der Zukunft - der Termin
    // steht also am Ende der Liste und kann auf einer spaeteren Seite liegen.
    // Deshalb wird geblaettert, bis er da ist (oder nichts mehr nachkommt).
    const eintrag = page.locator(terminLinkWahl(terminId));
    const weitere = page.getByRole('button', { name: 'Weitere Termine anzeigen' });
    const alleTermine = page.locator('a[href^="/termine/"]');
    for (let versuch = 0; versuch < 5; versuch += 1) {
      if ((await eintrag.count()) > 0) break;
      if ((await weitere.count()) === 0) break;

      // Nachgeladen ist, wenn mehr Zeilen dastehen - oder wenn der Knopf
      // verschwunden ist, weil nichts mehr nachkommt (`hasNextPage`). Auf
      // „wieder bedienbar" zu warten ging nicht: Nach der letzten Seite wird
      // der Knopf ausgehaengt, und eine Zusicherung auf ein entferntes
      // Element scheitert.
      const vorher = await alleTermine.count();
      await weitere.click();
      await expect
        .poll(async () => (await alleTermine.count()) > vorher || (await weitere.count()) === 0)
        .toBe(true);
    }
    await expect(eintrag.first()).toBeVisible();
  });

  test('uebergibt den Patientenfilter an den Kalender', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, laufTag(1));

    await page.goto(`${AKTE}/termine`);
    await page.getByRole('link', { name: 'Im Kalender zeigen' }).click();

    await expect(page).toHaveURL(/\/kalender\?/);
    expect(page.url()).toContain(`patient=${PATIENTEN.max}`);
    await expect(page.getByText(/Nur die Termine von/)).toBeVisible();

    // Der Filter laesst sich aufheben, ohne die Ansicht zu verlassen.
    await page.getByRole('button', { name: 'Filter aufheben' }).click();
    await expect(page.getByText(/Nur die Termine von/)).toHaveCount(0);
  });
});

test.describe('AKTE-002: Verordnung und Termine finden einander', () => {
  test('fuehrt von der Verordnung zu ihren Terminen und zurueck', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.erika}/verordnungen`);

    // Die Zahlen stehen getrennt da: Einheiten aus den Positionen, Termine
    // von den Terminen (ANN-038).
    await expect(page.getByText('Leistungseinheiten').first()).toBeVisible();
    await expect(page.getByText('Noch planbar').first()).toBeVisible();

    const zuDenTerminen = page.getByRole('link', { name: 'Termine dieser Verordnung' }).first();
    if ((await zuDenTerminen.count()) > 0) {
      await zuDenTerminen.click();
      await expect(page).toHaveURL(/\/termine\?verordnung=[0-9a-f-]{36}$/);
      await expect(page.getByText('Nur die Termine einer Verordnung.')).toBeVisible();

      await page.getByRole('link', { name: 'Zur Verordnung' }).click();
      await expect(page).toHaveURL(/\/verordnungen#verordnung-[0-9a-f-]{36}$/);
    }
  });
});
