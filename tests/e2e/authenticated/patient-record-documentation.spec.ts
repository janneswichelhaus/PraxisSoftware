import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  rpcAufrufen,
  tagImFenster,
  terminLinkWahl,
  terminUeberOberflaeche,
  zeitImLauf,
  zugriffstoken,
} from './helpers';

/**
 * Dokumentation in der Akte (DOK-003, ROL-001).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Seit E15 liest office dieselbe Dokumentation wie die
 * therapeutischen Rollen, schreibt aber keine (PROJECT_PRINCIPLES.md 4.3,
 * ADR-004 Fassung 2). Der Inhalt ist erkennbar synthetisch und stammt aus
 * keinem realen Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
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

const zeit = (minutenAbAcht: number) => zeitImLauf(LAUF, minutenAbAcht);

const ENTWURF = 'Synthetisch: Akteneintrag - Uebungen angeleitet, Belastung gesteigert.';

const terminAnlegen = (page: Page, tag: string) =>
  terminUeberOberflaeche(page, { tag, von: zeit(0) });

/** Termin mit finalisierter Dokumentation. */
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

test.describe('DOK-003, ROL-001: Dokumentation in der Akte', () => {
  test('zeigt Therapeutin und Office denselben Eintrag, dem Office ohne Schreibweg', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag());

    await page.goto(`/patienten/${PATIENTEN.max}/verlauf`);
    const akte = page.getByRole('region', { name: 'Behandlungsdokumentation' });
    await expect(akte).toBeVisible();

    // Die Zeile genau dieses Termins - andere Laeufe hinterlassen weitere.
    const zeile = akte
      .getByRole('listitem')
      .filter({ has: page.locator(terminLinkWahl(terminId)) });
    await expect(zeile.getByText(ENTWURF)).toBeVisible();
    await expect(zeile.getByText('Finalisiert', { exact: true })).toBeVisible();
    await expect(zeile.getByText(/Finalisiert am .* von Anna Beispiel/)).toBeVisible();
    await expect(zeile.getByRole('link', { name: 'Änderungsverlauf' })).toBeVisible();
    // Gelesen wird in der Akte, geschrieben am Termin.
    await expect(akte.getByRole('link', { name: 'Korrigieren' })).toHaveCount(0);
    await expect(akte.getByRole('button', { name: 'Finalisieren' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.max}/verlauf`);

    // E15: office liest denselben Eintrag (ADR-004 Fassung 2 Punkt 3) - und
    // bekommt keinen zweiten, datensparsamen Nachweis daneben.
    const officeAkte = page.getByRole('region', { name: 'Behandlungsdokumentation' });
    await expect(officeAkte).toBeVisible();
    const officeZeile = officeAkte
      .getByRole('listitem')
      .filter({ has: page.locator(terminLinkWahl(terminId)) });
    await expect(officeZeile.getByText(ENTWURF)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Behandlungsnachweis' })).toHaveCount(0);

    // Der Aenderungsverlauf ist ein Lesepfad und steht office offen.
    await officeZeile.getByRole('link', { name: 'Änderungsverlauf' }).click();
    await expect(page.getByLabel('Version 1')).toBeVisible();

    // Am Termin: lesen ja, schreiben nein (PROJECT_PRINCIPLES.md 4.3).
    await page.goto(`/termine/${terminId}`);
    await expect(page.getByText(ENTWURF)).toBeVisible();
    await expect(page.getByRole('link', { name: /Nachtrag/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Korrig/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finalisieren' })).toHaveCount(0);
  });
});

test.describe('DOK-003, ROL-001: Serverseitige Grenzen', () => {
  test('liefert office die klinische Sicht und weist das Patientenkonto ab', async ({
    page,
    request,
  }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(1));

    const officeToken = await zugriffstoken(request, KONTEN.office);
    const gelesen = await rpcAufrufen(request, officeToken, 'list_patient_treatment_notes', {
      p_patient_id: PATIENTEN.max,
    });
    expect(gelesen.status(), 'office darf die klinische Sicht lesen (E15)').toBe(200);
    expect(await gelesen.text()).toContain('Uebungen angeleitet');

    // Ausgeblendete Elemente sind keine Zugriffskontrolle - verbindlich ist
    // der Server (ADR-004).
    const patientToken = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const abgewiesen = await rpcAufrufen(request, patientToken, 'list_patient_treatment_notes', {
      p_patient_id: PATIENTEN.max,
    });
    expect(abgewiesen.status(), 'ein Patientenkonto darf die klinische Sicht nicht lesen').toBe(
      403,
    );
    expect(await abgewiesen.text()).not.toContain('Uebungen angeleitet');
  });

  test('laesst office keine Dokumentation anlegen', async ({ page, request }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, laufTag(3));

    const token = await zugriffstoken(request, KONTEN.office);
    const antwort = await rpcAufrufen(request, token, 'create_treatment_note', {
      p_appointment_id: terminId,
      p_content: 'Synthetisch: Versuch aus der Verwaltung.',
    });
    expect(antwort.status(), 'office schreibt keine klinische Dokumentation (4.3)').toBe(403);
  });

  test('liefert den Nachweis weiter als Rechnungssicht ohne Inhalt', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(2));

    // ADR-004 Fassung 2 Punkt 4: keine Zugriffsgrenze mehr, aber die Sicht,
    // die ausserhalb der Praxis gezeigt werden kann.
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
