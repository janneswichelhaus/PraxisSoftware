import { expect, test } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  tagImFenster,
} from './helpers';

/**
 * Terminserie aus einer Verordnung im echten Ablauf (CAL-007) und das
 * Terminfenster aus §8.1 (CAL-010a).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird, was die Komponententests nicht können: dass die
 * serverseitige Konfliktprüfung an der laufenden Anwendung greift, dass die
 * Serie tatsächlich alles oder nichts ist und dass das abgeleitete Ende am
 * angelegten Termin ankommt.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Verordnung mit vollem Kontingent aus `supabase/seed.sql` (Erika Beispiel). */
const VERORDNUNG_ERIKA = '88888888-8888-4888-8888-000000000004';
const SERIE = `/patienten/${PATIENTEN.erika}/verordnungen/${VERORDNUNG_ERIKA}/serie`;

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentSeries, LAUF, versatz);
}

/** Beginn auf dem Praxisraster (im Seed 5 Minuten), je Lauf verschieden. */
function zeit(minutenAbAcht = 0): string {
  const gesamt = 8 * 60 + (LAUF % 10) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

test.describe('CAL-010a: Terminfenster', () => {
  test('leitet das Ende aus dem Beginn ab und legt 60 Minuten an', async ({ page }) => {
    const tag = laufTag();

    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Datum *').fill(tag);

    // Kein Eingabefeld fürs Ende - §8.1 legt die Länge fest.
    await expect(page.getByLabel('Ende *')).toHaveCount(0);
    await page.getByLabel('Beginn *').fill(zeit(5));
    await expect(page.getByText(`${zeit(65)} Uhr`)).toBeVisible();

    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page.getByText(`${zeit(5)}–${zeit(65)} Uhr`)).toBeVisible();
  });
});

test.describe('CAL-007: Terminserie', () => {
  test('zeigt das Kontingent der Verordnung und schlägt es als Anzahl vor', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(SERIE);

    await expect(page.getByRole('heading', { name: 'Terminserie anlegen' })).toBeVisible();
    // Verordnet steht fest im Seed; offen haengt davon ab, was frühere Laeufe
    // gegen dieselbe Datenbank schon verplant haben.
    await expect(page.getByText('10 Behandlungen')).toBeVisible();
    await expect(page.getByLabel('Anzahl Termine *')).not.toHaveValue('');
  });

  test('ist aus der Akte an der Verordnung erreichbar', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.erika}`);

    await page.getByRole('link', { name: 'Terminserie anlegen' }).first().click();
    await expect(page).toHaveURL(/\/verordnungen\/[0-9a-f-]{36}\/serie$/);
  });

  test('legt eine geprüfte Serie in einem Vorgang an', async ({ page }) => {
    const start = laufTag(1);

    await anmelden(page, KONTEN.office);
    await page.goto(SERIE);

    // Der Vorschlag haengt vom Kontingent ab, das frühere Laeufe gegen dieselbe
    // Datenbank schon verplant haben - gemessen wird deshalb die Differenz.
    const offenVorher = Number(await page.getByLabel('Anzahl Termine *').inputValue());

    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Erster Termin am *').fill(start);
    await page.getByLabel('Beginn *').fill(zeit());
    await page.getByLabel('Rhythmus *').selectOption('woechentlich');
    await page.getByLabel('Anzahl Termine *').fill('3');
    await page.getByRole('button', { name: 'Termine vorschlagen' }).click();

    await expect(page.getByRole('heading', { name: 'Vorgeschlagene Termine (3)' })).toBeVisible();
    await expect(page.getByLabel('Datum 1')).toHaveValue(start);
    await expect(page.getByLabel('Datum 3')).toHaveValue(laufTag(15));

    await page.getByRole('button', { name: '3 Termine anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Serie trotzdem anlegen', /\/patienten\/[0-9a-f-]{36}$/);

    // Zurück in der Akte, und die drei Termine stehen unter „Nächste Termine".
    await expect(page).toHaveURL(`/patienten/${PATIENTEN.erika}`);

    // Das verplante Kontingent ist auf der Serienseite nachgeführt: drei
    // Termine weniger offen als vorher (CAL-007, ANN-038).
    await page.goto(SERIE);
    await expect(page.getByText('Bereits verplant')).toBeVisible();
    await expect(page.getByLabel('Anzahl Termine *')).toHaveValue(
      String(Math.max(offenVorher - 3, 0)),
    );
  });

  test('meldet eine Überschneidung je Zeile und legt keinen einzigen Termin an', async ({
    page,
  }) => {
    const start = laufTag(2);

    await anmelden(page, KONTEN.office);

    // Ein einzelner Termin belegt genau die zweite Zeile der geplanten Serie.
    await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Datum *').fill(laufTag(9));
    await page.getByLabel('Beginn *').fill(zeit());
    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await page.goto(SERIE);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Erster Termin am *').fill(start);
    await page.getByLabel('Beginn *').fill(zeit());
    await page.getByLabel('Anzahl Termine *').fill('2');
    await page.getByRole('button', { name: 'Termine vorschlagen' }).click();

    await expect(page.getByText('Zeitraum ist bereits belegt')).toBeVisible();
    await expect(page.getByText(/1 von 2 Terminen sind so nicht planbar/)).toBeVisible();
    await expect(page.getByRole('button', { name: '2 Termine anlegen' })).toBeDisabled();

    // Einzelabweichung: die belegte Zeile auf einen freien Tag ziehen.
    await page.getByLabel('Datum 2').fill(laufTag(10));
    await expect(
      page.getByText('Die Liste wurde geändert und ist noch nicht geprüft.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Erneut prüfen' }).click();
    await expect(page.getByText('Alle 2 Termine sind planbar.')).toBeVisible();
    await expect(page.getByRole('button', { name: '2 Termine anlegen' })).toBeEnabled();
  });
});
