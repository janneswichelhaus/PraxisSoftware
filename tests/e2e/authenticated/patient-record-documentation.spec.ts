import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  rpcAufrufen,
  tagImFenster,
  zugriffstoken,
} from './helpers';

/**
 * Dokumentation in der Akte, rollenabhaengig projiziert (DOK-003).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Der Inhalt ist erkennbar synthetisch und stammt aus keinem realen
 * Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 *
 * Wie in den uebrigen Spezifikationen belegt jeder Lauf einen eigenen
 * Zeitraum: ein angelegter Termin laesst sich fachlich nicht entfernen. Der
 * Bereich liegt bewusst hinter allen anderen Spezifikationen, damit die hier
 * angelegten Termine in der Akte (neueste zuerst) auf der ersten Seite stehen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag im eigenen Tagesfenster dieser Spezifikation (siehe helpers.ts). */
function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.patientRecord, LAUF, versatz);
}

function zeit(minutenAbAcht: number): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const gesamt = 8 * 60 + (LAUF % 12) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

const ENTWURF = 'Synthetisch: Akteneintrag - Uebungen angeleitet, Belastung gesteigert.';

async function terminAnlegen(page: Page, tag: string): Promise<string> {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('practice');
  await page.getByLabel('Datum *').fill(tag);
  await page.getByLabel('Beginn *').fill(zeit(0));
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** Termin mit finalisierter Dokumentation - der Fall, den der Nachweis belegt. */
async function finalisierterEintrag(page: Page, tag: string): Promise<string> {
  const terminId = await terminAnlegen(page, tag);

  await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
  await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
  await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await expect(page).toHaveURL(`/termine/${terminId}`);

  await page.getByRole('button', { name: 'Finalisieren' }).click();
  await page.getByRole('button', { name: 'Ja, jetzt finalisieren' }).click();
  await expect(page.getByText('Finalisiert', { exact: true })).toBeVisible();

  return terminId;
}

test.describe('DOK-003: Dokumentation in der Akte', () => {
  test('zeigt der Therapeutin den Eintrag in der Akte und dem Office nur den Nachweis', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag());

    await page.goto(`/patienten/${PATIENTEN.max}`);
    const akte = page.getByRole('region', { name: 'Behandlungsdokumentation' });
    await expect(akte).toBeVisible();

    // Die Zeile genau dieses Termins - andere Laeufe hinterlassen weitere.
    const zeile = akte
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/termine/${terminId}"]`) });
    await expect(zeile.getByText(ENTWURF)).toBeVisible();
    await expect(zeile.getByText('Finalisiert', { exact: true })).toBeVisible();
    await expect(zeile.getByText(/Finalisiert am .* von Anna Beispiel/)).toBeVisible();
    await expect(zeile.getByRole('link', { name: 'Änderungsverlauf' })).toBeVisible();
    // Gelesen wird in der Akte, geschrieben am Termin.
    await expect(akte.getByRole('link', { name: 'Korrigieren' })).toHaveCount(0);
    await expect(akte.getByRole('button', { name: 'Finalisieren' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.max}`);

    const nachweis = page.getByRole('region', { name: 'Behandlungsnachweis' });
    await expect(nachweis).toBeVisible();
    const nachweisZeile = nachweis
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/termine/${terminId}"]`) });
    await expect(nachweisZeile.getByText(/Dokumentation finalisiert am/)).toBeVisible();

    // Kein klinischer Inhalt, keine klinische Sicht (PROJECT_PRINCIPLES.md 4.3).
    await expect(page.getByText(ENTWURF)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Behandlungsdokumentation' })).toHaveCount(0);
  });
});

test.describe('DOK-003: Serverseitige Grenzen', () => {
  test('weist office und Patientenkonto an der klinischen Sicht ab', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(1));

    // Ausgeblendete Elemente sind keine Zugriffskontrolle - verbindlich ist
    // der Server (ADR-004).
    for (const konto of [KONTEN.office, 'max.mustermann@patient.invalid']) {
      const token = await zugriffstoken(request, konto);
      const antwort = await rpcAufrufen(request, token, 'list_patient_treatment_notes', {
        p_patient_id: PATIENTEN.max,
      });
      expect(antwort.status(), `${konto} darf die klinische Sicht nicht lesen`).toBe(403);
      expect(await antwort.text()).not.toContain('Uebungen angeleitet');
    }
  });

  test('liefert office den Nachweis ohne Inhalt und dem Patientenkonto gar nichts', async ({
    page,
    request,
  }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(2));

    const officeToken = await zugriffstoken(request, KONTEN.office);
    const nachweis = await rpcAufrufen(request, officeToken, 'list_patient_treatment_evidence', {
      p_patient_id: PATIENTEN.max,
    });
    expect(nachweis.status()).toBe(200);
    const text = await nachweis.text();
    expect(text).toContain('documentation_status');
    expect(text).not.toContain('Uebungen angeleitet');
    expect(text).not.toContain('content');

    const patientToken = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const abgewiesen = await rpcAufrufen(request, patientToken, 'list_patient_treatment_evidence', {
      p_patient_id: PATIENTEN.max,
    });
    expect(abgewiesen.status()).toBe(403);
  });
});
