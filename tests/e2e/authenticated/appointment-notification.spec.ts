import { expect, test, type Page } from '@playwright/test';
import { KONTEN, PATIENTEN, anmelden, arbeitszeitBestaetigen, nahtag } from './helpers';

/**
 * Mitteilungsvermerk am Termin im echten Ablauf (CAL-012, CAL-013).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Die Zusage, auf die es ankommt, lässt sich nur hier prüfen: dass
 * der Vermerk verfällt, sobald der Termin verschoben wird — dazwischen liegen
 * ein Schreibpfad, `updated_at` und zwei Lesepfade.
 *
 * Für CAL-013 gilt dasselbe in die andere Richtung: Der Vermerk entsteht aus
 * der Übergabe ans Mailprogramm, ohne dass jemand ihn setzt. Das `mailto:`
 * selbst bleibt im Testbrowser folgenlos — geprüft wird, was in der Datenbank
 * ankommt.
 *
 * **Diese Datei rechnet im Nahfenster** (`nahtag` in `helpers.ts`), nicht in
 * einem Tagesfenster. Die Akte zeigt nur die nächsten fünf Termine, und Max
 * Mustermann sammelt über fünfzehn Spezifikationen hinweg weit mehr; ein
 * Termin aus einem Tagesfenster ab Tag 60 stünde nie in der Liste, und ohne
 * Eintrag ließe sich das Zeichen dahinter nicht prüfen. Im Nahfenster zählt
 * der Versatz **rückwärts**: höhere Zahl, früherer Tag — jeder neu angelegte
 * Termin steht damit vor den zuvor angelegten. Jeder Test nimmt die nächste
 * freie Stufe.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function zeit(minutenAbAcht = 0): string {
  const gesamt = 8 * 60 + (LAUF % 10) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

async function terminAnlegen(page: Page, tag: string, von: string): Promise<string> {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('video');
  await page.getByLabel('Datum *').fill(tag);
  await page.getByLabel('Beginn *').fill(von);
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** Der Eintrag dieses Termins in der Terminliste der Akte. */
function akteneintrag(page: Page, terminId: string) {
  return page.locator(`a[href="/termine/${terminId}"]`).first();
}

test.describe('CAL-012: Mitteilungsvermerk', () => {
  test('vermerkt einen Weg und zeigt ihn in der Terminliste der Akte', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, nahtag(), zeit());

    // Ohne Vermerk steht kein Zeichen am Eintrag.
    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('Telefon');

    await page.goto(`/termine/${terminId}`);
    await page.getByLabel('Telefonisch mitgeteilt').check();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk gespeichert.')).toBeVisible();

    // Der Vermerk überlebt das Neuladen - er kommt aus der Datenbank.
    await page.reload();
    await expect(page.getByLabel('Telefonisch mitgeteilt')).toBeChecked();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).toContainText('Telefon');
  });

  test('lässt den Vermerk verfallen, sobald der Termin verschoben wird', async ({ page }) => {
    const tag = nahtag(1);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, tag, zeit());

    await page.getByLabel('Persönlich gesagt').check();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk gespeichert.')).toBeVisible();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).toContainText('Persönlich');

    // Verschieben - damit ist die neue Zeit noch nicht mitgeteilt.
    await page.goto(`/termine/${terminId}/bearbeiten`);
    await page.getByLabel('Beginn *').fill(zeit(120));
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('Persönlich');

    await page.goto(`/termine/${terminId}`);
    await expect(page.getByLabel('Persönlich gesagt')).not.toBeChecked();
  });

  test('nimmt einen Vermerk zurück', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, nahtag(2), zeit());

    await page.getByLabel('Telefonisch mitgeteilt').check();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk gespeichert.')).toBeVisible();

    await page.getByLabel('Telefonisch mitgeteilt').uncheck();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk zurückgenommen.')).toBeVisible();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('Telefon');
  });

  // Seit UX-012 (ANN-039 Fassung 2) sind Drucken und Mitteilen zwei Schritte:
  // Der Druckdialog wird laufend abgebrochen, und ein Vermerk, der eine
  // Aushändigung behauptet, die nicht stattfand, ist als Nachweis wertlos.
  test('vermerkt den Terminzettel erst auf die Bestätigung nach dem Druck', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const ersterTermin = await terminAnlegen(page, nahtag(3), zeit());
    const zweiterTermin = await terminAnlegen(page, nahtag(4), zeit());

    // Der Druckdialog blockiert den Browser - window.print wird deshalb
    // stillgelegt. Geprüft wird der Vermerk, nicht der Dialog.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    await page.goto(`/patienten/${PATIENTEN.max}/terminzettel`);
    await page.getByRole('button', { name: 'Terminzettel drucken' }).click();
    await expect(page.getByText(/Wurde der Zettel ausgehändigt\?/)).toBeVisible();

    await page.getByRole('button', { name: 'Ja, als mitgeteilt vermerken' }).click();
    await expect(page.getByText(/als „Terminzettel ausgehändigt" vermerkt/)).toBeVisible();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    for (const id of [ersterTermin, zweiterTermin]) {
      await expect(akteneintrag(page, id)).toContainText('Zettel');
    }
  });

  test('vermerkt nichts, wenn der Zettel doch nicht ausgehändigt wurde', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, nahtag(9), zeit());

    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    await page.goto(`/patienten/${PATIENTEN.max}/terminzettel`);
    await page.getByRole('button', { name: 'Terminzettel drucken' }).click();
    await page.getByRole('button', { name: 'Nein, nichts vermerken' }).click();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('Zettel');
  });

  test('bietet einem Therapiezugang dieselbe Auswahl', async ({ page }) => {
    // Ohne Kontowechsel mitten im Ablauf: Der Therapiezugang darf Termine
    // selbst anlegen (CAL-001), und genau darum geht es hier.
    await anmelden(page, KONTEN.therapist);
    await terminAnlegen(page, nahtag(5), zeit());

    await expect(page.getByRole('button', { name: 'Vermerk speichern' })).toBeVisible();
    await expect(page.getByText(/Nachtragen und zurücknehmen von Hand/)).toBeVisible();
  });
});

test.describe('CAL-013: Termine per E-Mail', () => {
  test('vermerkt die Übergabe ans Mailprogramm für alle Termine der E-Mail', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const ersterTermin = await terminAnlegen(page, nahtag(6), zeit());
    const zweiterTermin = await terminAnlegen(page, nahtag(7), zeit(120));

    await page.goto(`/patienten/${PATIENTEN.max}/terminzettel`);
    await page.getByRole('button', { name: 'Termine per E-Mail senden' }).click();

    // Der Text steht vor der Übergabe auf dem Bildschirm - wer eine Nachricht
    // mit Gesundheitsbezug auslöst, soll vorher lesen, was darin steht. Die
    // beiden Uhrzeiten belegen zugleich, dass keiner der Termine wegen der
    // Längengrenze weggefallen ist - sonst stimmte auch der Vermerk nicht.
    const entwurf = page.getByText(/Guten Tag Max Mustermann/);
    await expect(entwurf).toBeVisible();
    await expect(entwurf).toContainText(`${zeit()}–`);
    await expect(entwurf).toContainText(`${zeit(120)}–`);
    await expect(page.getByText('max.mustermann@patient.invalid')).toBeVisible();
    await expect(page.getByText(/nicht verschlüsselt/)).toBeVisible();

    // Ein mailto ohne Handler bleibt im Browser folgenlos; geprüft wird der
    // Vermerk, nicht das Mailprogramm. Übergeben und mitgeteilt sind seit
    // UX-012 zwei Schritte (ANN-041 Fassung 2).
    await page.getByRole('button', { name: 'E-Mail öffnen' }).click();
    await expect(page.getByText(/Wurde sie gesendet\?/)).toBeVisible();
    await page.getByRole('button', { name: 'Ja, als mitgeteilt vermerken' }).click();
    await expect(page.getByText(/als „Per E-Mail mitgeteilt" vermerkt/)).toBeVisible();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    for (const id of [ersterTermin, zweiterTermin]) {
      await expect(akteneintrag(page, id)).toContainText('E-Mail');
    }
  });

  test('lässt den Entwurf abbrechen, ohne etwas zu vermerken', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, nahtag(8), zeit());

    await page.goto(`/patienten/${PATIENTEN.max}/terminzettel`);
    await page.getByRole('button', { name: 'Termine per E-Mail senden' }).click();
    await page.getByRole('button', { name: 'Abbrechen' }).click();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('E-Mail');
  });
});
