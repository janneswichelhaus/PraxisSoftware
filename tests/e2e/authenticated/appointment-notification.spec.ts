import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  tagImFenster,
} from './helpers';

/**
 * Mitteilungsvermerk am Termin im echten Ablauf (CAL-012).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Die Zusage, auf die es ankommt, lässt sich nur hier prüfen: dass
 * der Vermerk verfällt, sobald der Termin verschoben wird — dazwischen liegen
 * ein Schreibpfad, `updated_at` und zwei Lesepfade.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentNotification, LAUF, versatz);
}

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
    const terminId = await terminAnlegen(page, laufTag(), zeit());

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
    const tag = laufTag(1);

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
    const terminId = await terminAnlegen(page, laufTag(2), zeit());

    await page.getByLabel('Telefonisch mitgeteilt').check();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk gespeichert.')).toBeVisible();

    await page.getByLabel('Telefonisch mitgeteilt').uncheck();
    await page.getByRole('button', { name: 'Vermerk speichern' }).click();
    await expect(page.getByText('Vermerk zurückgenommen.')).toBeVisible();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(akteneintrag(page, terminId)).not.toContainText('Telefon');
  });

  test('vermerkt den Terminzettel beim Drucken für alle aufgeführten Termine', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const ersterTermin = await terminAnlegen(page, laufTag(3), zeit());
    const zweiterTermin = await terminAnlegen(page, laufTag(4), zeit());

    // Der Druckdialog blockiert den Browser - window.print wird deshalb
    // stillgelegt. Geprüft wird der Vermerk, nicht der Dialog.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    await page.goto(`/patienten/${PATIENTEN.max}/terminzettel`);
    await page.getByRole('button', { name: 'Terminzettel drucken' }).click();

    await page.goto(`/patienten/${PATIENTEN.max}`);
    for (const id of [ersterTermin, zweiterTermin]) {
      await expect(akteneintrag(page, id)).toContainText('Zettel');
    }
  });

  test('bietet einem Therapiezugang dieselbe Auswahl', async ({ page }) => {
    // Ohne Kontowechsel mitten im Ablauf: Der Therapiezugang darf Termine
    // selbst anlegen (CAL-001), und genau darum geht es hier.
    await anmelden(page, KONTEN.therapist);
    await terminAnlegen(page, laufTag(5), zeit());

    await expect(page.getByRole('button', { name: 'Vermerk speichern' })).toBeVisible();
    await expect(page.getByText('Die Anwendung verschickt nichts.')).toBeVisible();
  });
});
