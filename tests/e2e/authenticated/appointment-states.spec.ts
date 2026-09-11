import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  detailWert,
  tagImFenster,
} from './helpers';

/**
 * Terminzustände im echten Ablauf (CAL-EPIC-003a, ADR-018).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird genau das, was die Komponententests nicht können: ob
 * die Pflichtangaben in der laufenden Anwendung tatsächlich greifen, ob der
 * Zustand das Neuladen überlebt und ob „Tag umplanen" am Ende die Anrufliste
 * zeigt.
 *
 * Wie in den übrigen Spezifikationen belegt jeder Lauf einen eigenen Zeitraum:
 * ein angelegter Termin lässt sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentStates, LAUF, versatz);
}

function zeit(minutenAbAcht: number): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const gesamt = 8 * 60 + (LAUF % 12) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

async function terminAnlegen(
  page: Page,
  opts: { tag: string; von: string; bis: string; patient?: string },
): Promise<string> {
  await page.goto(`/patienten/${opts.patient ?? PATIENTEN.max}/termine/neu`);
  await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('practice');
  await page.getByLabel('Datum *').fill(opts.tag);
  await page.getByLabel('Beginn *').fill(opts.von);
  await page.getByLabel('Ende *').fill(opts.bis);
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

test.describe('CAL-008a: Der Zustand heisst bestaetigt', () => {
  test('legt einen Termin als bestaetigt an und filtert im Kalender danach', async ({ page }) => {
    const tag = laufTag();

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&status=confirmed`);
    await expect(page.getByLabel('Status')).toHaveValue('confirmed');
  });
});

test.describe('CAL-008b: Absage nur mit Grund', () => {
  test('weist die Absage ohne Grund ab und haelt den Grund danach fest', async ({ page }) => {
    const tag = laufTag(1);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });

    await page.getByRole('button', { name: 'Termin absagen' }).click();
    const rueckfrage = page.getByRole('group', { name: 'Termin absagen' });
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();
    await expect(rueckfrage).toContainText('Bitte einen Absagegrund auswählen.');
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');

    await page.getByLabel('Absagegrund').selectOption('moved');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Absagegrund')).toContainText('Termin verlegt');

    await page.reload();
    await expect(detailWert(page, 'Absagegrund')).toContainText('Termin verlegt');
  });
});

test.describe('CAL-008c: Nicht angetroffen', () => {
  test('verlangt die Entscheidung zum Ausfallhonorar und laesst sich wieder oeffnen', async ({
    page,
  }) => {
    const tag = laufTag(2);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });

    await page.getByRole('button', { name: 'Nicht angetroffen' }).click();
    const rueckfrage = page.getByRole('group', { name: 'Nicht angetroffen' });
    await page.getByRole('button', { name: 'Ja, niemand angetroffen' }).click();
    await expect(rueckfrage).toContainText('Bitte entscheiden, ob ein Ausfallhonorar');
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');

    await page.getByLabel('Ausfallhonorar berechnen?').selectOption('ja');
    await page.getByRole('button', { name: 'Ja, niemand angetroffen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Nicht angetroffen');
    await expect(detailWert(page, 'Ausfallhonorar')).toContainText('Wird berechnet');

    // Kein zweites Vermerken, kein Absagen - erst wieder oeffnen.
    await expect(page.getByRole('button', { name: 'Nicht angetroffen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Termin wieder öffnen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');
    await expect(page.getByText('Ausfallhonorar')).toHaveCount(0);
  });
});

test.describe('CAL-008d: Dokumentiert kommt aus der Finalisierung', () => {
  test('hebt den Termin mit "Behandlung abschliessen" auf dokumentiert', async ({ page }) => {
    const tag = laufTag(3);

    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });

    await page.getByRole('link', { name: 'Behandlung abschließen' }).click();
    await page
      .getByLabel(/Behandlung/)
      .first()
      .fill('Synthetischer Behandlungstext, E2E.');
    await page
      .getByRole('button', { name: /abschließen/ })
      .last()
      .click();

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Status')).toContainText('Dokumentiert');

    // Ohne Rueckweg: weder aendern noch absagen noch wieder oeffnen.
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin wieder öffnen' })).toHaveCount(0);
  });
});

test.describe('CAL-009: Tag umplanen', () => {
  test('sagt den ganzen Tag ab und zeigt die Anrufliste', async ({ page }) => {
    const tag = laufTag(4);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });
    await terminAnlegen(page, { tag, von: zeit(60), bis: zeit(105), patient: PATIENTEN.erika });

    // Der Einstieg steht nur dort, wo Person UND Tag feststehen.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('link', { name: 'Tag umplanen' })).toHaveCount(0);

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}`);
    await page.getByRole('link', { name: 'Tag umplanen' }).click();

    await expect(page.getByRole('heading', { name: 'Tag umplanen' })).toBeVisible();
    await expect(page.getByText(/Diese Termine werden abgesagt \(2\)/)).toBeVisible();

    await page.getByLabel('Absagegrund').selectOption('practice_request');
    await page.getByRole('button', { name: '2 Termine absagen' }).click();
    await page.getByRole('button', { name: 'Ja, alle absagen' }).click();

    await expect(page.getByText('2 Termine sind abgesagt. Jetzt anrufen.')).toBeVisible();
    await expect(page.getByText(/nicht gespeichert/)).toBeVisible();

    // Und im Kalender sind beide Termine tatsaechlich abgesagt.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}&status=all`);
    await expect(page.getByText('Abgesagt').first()).toBeVisible();
  });
});
