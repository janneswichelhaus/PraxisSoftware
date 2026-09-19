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

    // Behandlungsgrundlagen: der Bereich liest denselben rollenabhaengigen Lesepfad
    // wie vorher der Abschnitt der langen Seite (VER-002).
    await navigation.getByRole('link', { name: 'Behandlungsgrundlagen' }).click();
    await expect(page).toHaveURL(`${AKTE}/verordnungen`);
    await expect(
      page.getByRole('heading', { name: 'Aktuelle Behandlungsgrundlagen' }),
    ).toBeVisible();
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

    // Die Zahlen stehen getrennt da und zählen seit VER-EPIC-002 durchgehend
    // Termine: mögliche aus der Grundlage, verplante von den Terminen, planbare
    // als Differenz (ANN-038, ANN-064). Die Leistungsmenge je Heilmittel steht
    // getrennt darunter.
    // `exact`, damit nicht der Abschnittshinweis („deren mögliche Termine …")
    // die Zusicherung erfüllt — geprüft ist die Zeile an der Karte.
    await expect(page.getByText('Mögliche Termine', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Heilmittel', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Noch planbar').first()).toBeVisible();

    const zuDenTerminen = page.getByRole('link', { name: 'Termine dieser Verordnung' }).first();
    if ((await zuDenTerminen.count()) > 0) {
      await zuDenTerminen.click();
      await expect(page).toHaveURL(/\/termine\?verordnung=[0-9a-f-]{36}$/);
      await expect(page.getByText('Nur die Termine einer Behandlungsgrundlage.')).toBeVisible();

      await page.getByRole('link', { name: 'Zur Grundlage' }).click();
      await expect(page).toHaveURL(/\/verordnungen#verordnung-[0-9a-f-]{36}$/);
    }
  });
});

/**
 * GRD-001, ADR-020 Punkt 7: Die Oberfläche nennt die Bauart.
 *
 * Erika hat im Seed beide: eine Verordnung und einen Selbstzahler. Sie stehen
 * unter einer gemeinsamen Überschrift, aber jede unter ihrem eigenen Namen.
 */
test.describe('GRD-001: beide Bauarten in der Akte', () => {
  test('nennt Verordnung und Selbstzahler bei ihrem Namen', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    await page.goto(`/patienten/${PATIENTEN.erika}/verordnungen`);

    await expect(
      page.getByRole('heading', { name: 'Aktuelle Behandlungsgrundlagen' }),
    ).toBeVisible();
    await expect(page.getByText('Selbstzahler seit 03.09.2026')).toBeVisible();
    await expect(page.getByText('Folgeverordnung vom 08.09.2026')).toBeVisible();
  });

  test('fragt im Formular zuerst nach der Bauart und laesst die Verordner:in fallen', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    await page.goto(`/patienten/${PATIENTEN.erika}/verordnungen/neu`);

    await expect(page.getByLabel('Verordner:in *')).toBeVisible();
    await page.getByLabel('Art *').selectOption('self_pay');

    await expect(page.getByLabel('Verordner:in *')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Klinische Angaben' })).toHaveCount(0);
    await expect(page.getByLabel('Vereinbart am *')).toBeVisible();
    // Die Terminzahl gilt für beide Bauarten (ADR-020 Punkt 5), „Anmerkungen"
    // ebenso (ANN-065).
    await expect(page.getByLabel('Anzahl möglicher Termine *')).toBeVisible();
    await expect(page.getByLabel('Anmerkungen')).toBeVisible();
  });

  /**
   * VER-EPIC-002: Die Heilmittelauswahl im angemeldeten Formular.
   *
   * Lesend — der Seed bleibt unberührt, damit die Zahlen der anderen Prüfungen
   * stimmen. Geprüft wird, was die Feldvorgabe nennt: fünf Kästchen, kein
   * Dropdown, keine Mengeneingabe, keine zweite Positionsliste.
   */
  test('bietet die Heilmittel als Kaestchen an, ohne Mengen und ohne Positionsliste', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    await page.goto(`/patienten/${PATIENTEN.erika}/verordnungen/neu`);

    for (const beschriftung of [
      'Krankengymnastik (KG)',
      'KG als Doppelbehandlung',
      'Manuelle Therapie (MT)',
      'MT als Doppelbehandlung',
      'Hausbesuch',
    ]) {
      await expect(page.getByRole('checkbox', { name: beschriftung })).toBeVisible();
    }

    // Die Wunschkombination schließt sich nicht gegenseitig aus.
    await page.getByRole('checkbox', { name: 'KG als Doppelbehandlung' }).check();
    await page.getByRole('checkbox', { name: 'MT als Doppelbehandlung' }).check();
    await page.getByRole('checkbox', { name: 'Hausbesuch' }).check();
    await expect(page.getByRole('checkbox', { name: 'KG als Doppelbehandlung' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'MT als Doppelbehandlung' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Hausbesuch' })).toBeChecked();

    await expect(page.getByRole('button', { name: 'Position hinzufügen' })).toHaveCount(0);
    await expect(page.getByLabel('Genutzt')).toHaveCount(0);
    await expect(page.getByLabel('Verordnet *')).toHaveCount(0);
    await expect(page.getByLabel('Therapieziel')).toHaveCount(0);
  });
});

/**
 * CAL-022 und AKTE-006 hinter der Anmeldung.
 *
 * Geprueft wird, was unabhaengig von der Reihenfolge der Spezifikationen gilt:
 * Die Termine des Seeds haengen an keiner Behandlungsgrundlage, und genau das
 * verschluckt AKTE-006 nicht - sie bekommen einen eigenen, benannten
 * Abschnitt. Die Uebertragungsseite wird ueber ihr Geruest geprueft (Ziele aus
 * den Grundlagen dieser Patient:in); WIE VIELE Termine sie anbietet, haengt
 * davon ab, was andere Spezifikationen vorher geplant haben.
 *
 * Bewusst lesend: Ein angelegter Termin laesst sich fachlich nicht entfernen,
 * und die Zahlen der uebrigen Spezifikationen sollen stehen bleiben.
 */
test.describe('CAL-022 / AKTE-006: Gruppierung und Uebertragung', () => {
  test('gruppiert die Termine der Akte und benennt die ohne Grundlage', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.erika}/termine`);

    await expect(page.getByRole('heading', { name: 'Kommende Termine' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ohne Behandlungsgrundlage' }).first(),
    ).toBeVisible();
  });

  test('bietet die Uebertragung mit den Grundlagen dieser Patient:in als Ziel an', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.erika}/termine-uebertragen`);

    await expect(page.getByRole('heading', { name: 'Termine übertragen' })).toBeVisible();

    // Die Ziele sind die Grundlagen dieser Patient:in - Erika hat im Seed
    // beide Bauarten (GRD-001).
    const ziel = page.getByLabel('Auf welche Behandlungsgrundlage? *');
    await expect(ziel).toBeVisible();
    await expect(ziel.getByRole('option', { name: /Selbstzahler seit 03.09.2026/ })).toHaveCount(1);
    await expect(ziel.getByRole('option', { name: /Folgeverordnung vom 08.09.2026/ })).toHaveCount(
      1,
    );
  });
});
