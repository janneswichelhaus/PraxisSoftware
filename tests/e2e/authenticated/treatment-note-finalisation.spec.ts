import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  rpcAufrufen,
  supabaseKonfiguration,
  tagImFenster,
  zugriffstoken,
} from './helpers';

/**
 * Finalisierung, Versionierung und Nachtrag (DOK-002, ADR-016 Punkte 4 bis 6).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Der Inhalt ist erkennbar synthetisch und stammt aus keinem realen
 * Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 *
 * Wie in den uebrigen Spezifikationen belegt jeder Lauf einen eigenen
 * Zeitraum: ein angelegter Termin laesst sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag im eigenen Tagesfenster dieser Spezifikation (siehe helpers.ts). */
function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.treatmentNoteFinalisation, LAUF, versatz);
}

function zeit(minutenAbAcht: number): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const gesamt = 8 * 60 + (LAUF % 12) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

const ENTWURF = 'Synthetisch: Belastung in drei Stufen gesteigert.';
const KORRIGIERT = 'Synthetisch: Belastung in vier Stufen gesteigert.';
const BEGRUENDUNG = 'Zahlendreher bei der Stufenzahl.';
const NACHTRAG = 'Synthetisch: Heimprogramm auf zwei Einheiten taeglich gesetzt.';

async function terminAnlegen(page: Page, tag: string): Promise<string> {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('practice');
  await page.getByLabel('Datum *').fill(tag);
  await page.getByLabel('Beginn *').fill(zeit(0));
  await page.getByLabel('Ende *').fill(zeit(45));
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

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

test.describe('DOK-002: Finalisieren', () => {
  test('finalisiert erst nach Rueckfrage und verschliesst danach den Entwurfsweg', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag());

    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Finalisieren' }).click();
    await expect(page.getByRole('group', { name: 'Dokumentation finalisieren' })).toBeVisible();
    // Ein Klick allein finalisiert nichts.
    await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ja, jetzt finalisieren' }).click();

    await expect(page.getByText('Finalisiert', { exact: true })).toBeVisible();
    await expect(page.getByText(/Finalisiert am .* von Anna Beispiel/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dokumentation bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finalisieren' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Korrigieren' })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Finalisiert', { exact: true })).toBeVisible();
  });

  test('schreibt den Entwurfsstand als Version 1 fest', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(1));

    await page.getByRole('link', { name: 'Änderungsverlauf' }).click();
    await expect(page).toHaveURL(/\/dokumentation\/[0-9a-f-]{36}\/verlauf$/);

    const version1 = page.getByLabel('Version 1');
    await expect(version1).toBeVisible();
    await expect(version1.getByText(ENTWURF)).toBeVisible();
    await expect(
      version1.getByText('Bei der Finalisierung festgeschriebener Stand.'),
    ).toBeVisible();
  });
});

test.describe('DOK-002: Korrigieren', () => {
  test('verlangt eine Begruendung und laesst den alten Wortlaut abrufbar', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag(2));

    await page.getByRole('link', { name: 'Korrigieren' }).click();
    await expect(page.getByLabel('Korrigierter Eintrag')).toHaveValue(ENTWURF);
    // Ohne Aenderung gibt es nichts zu speichern.
    await expect(page.getByRole('button', { name: 'Korrektur speichern' })).toBeDisabled();

    await page.getByLabel('Korrigierter Eintrag').fill(KORRIGIERT);
    await page.getByRole('button', { name: 'Korrektur speichern' }).click();
    await expect(page.getByText('Bitte kurz begründen, was korrigiert wird.')).toBeVisible();

    await page.getByLabel('Begründung der Korrektur').fill(BEGRUENDUNG);
    await page.getByRole('button', { name: 'Korrektur speichern' }).click();

    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText(KORRIGIERT)).toBeVisible();
    await expect(page.getByText(/2 Versionen/)).toBeVisible();

    await page.getByRole('link', { name: 'Änderungsverlauf' }).click();

    // Das ist der Kern von 630f Abs. 1 S. 2 BGB: der urspruengliche Inhalt
    // bleibt neben der Aenderung erkennbar.
    await expect(page.getByLabel('Version 1').getByText(ENTWURF)).toBeVisible();
    await expect(page.getByLabel('Version 2').getByText(KORRIGIERT)).toBeVisible();
    await expect(page.getByLabel('Version 2').getByText(BEGRUENDUNG)).toBeVisible();
  });
});

test.describe('DOK-002: Nachtragen', () => {
  test('fuehrt den Nachtrag als eigenen Eintrag und laesst den Ursprung unberuehrt', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag(3));

    await page.getByRole('link', { name: 'Nachtrag hinzufügen' }).click();
    // Der Ursprungseintrag steht zur Orientierung darueber.
    await expect(page.getByText(ENTWURF)).toBeVisible();

    await page.getByLabel('Nachtrag').fill(NACHTRAG);
    await page.getByRole('button', { name: 'Nachtrag als Entwurf speichern' }).click();

    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText(NACHTRAG)).toBeVisible();
    await expect(page.getByText('Nachtrag', { exact: true })).toBeVisible();
    // Der Ursprungseintrag bleibt unveraendert finalisiert.
    await expect(page.getByText(ENTWURF)).toBeVisible();
    await expect(page.getByText('Finalisiert', { exact: true })).toBeVisible();
    await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText(NACHTRAG)).toBeVisible();
  });

  test('laesst den Nachtragsentwurf noch bearbeiten und dann eigenstaendig finalisieren', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag(7));

    await page.getByRole('link', { name: 'Nachtrag hinzufügen' }).click();
    await page.getByLabel('Nachtrag').fill(NACHTRAG);
    await page.getByRole('button', { name: 'Nachtrag als Entwurf speichern' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}`);

    await page.getByRole('link', { name: 'Nachtrag bearbeiten' }).click();
    await expect(page.getByLabel('Nachtrag')).toHaveValue(NACHTRAG);
    await page.getByLabel('Nachtrag').fill(`${NACHTRAG} Ergaenzt.`);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();

    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText(`${NACHTRAG} Ergaenzt.`)).toBeVisible();

    // Der Nachtrag wird gesondert finalisiert; der Ursprung bleibt unberuehrt.
    await page.getByRole('button', { name: 'Finalisieren' }).click();
    await page.getByRole('button', { name: 'Ja, jetzt finalisieren' }).click();
    await expect(page.getByRole('button', { name: 'Finalisieren' })).toHaveCount(0);
    await expect(page.getByText(ENTWURF)).toBeVisible();
  });
});

test.describe('DOK-002: Serverseitige Grenzen', () => {
  test('weist office an Finalisierung, Korrektur und Nachtrag ab', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag(4));

    const therapeutToken = await zugriffstoken(request, KONTEN.therapist);
    const eintraege = await rpcAufrufen(request, therapeutToken, 'get_treatment_note', {
      p_appointment_id: terminId,
    });
    const [eintrag] = (await eintraege.json()) as { id: string; updated_at: string }[];
    expect(eintrag).toBeDefined();

    // Ausgeblendete Elemente sind keine Zugriffskontrolle - verbindlich ist
    // der Server (ADR-004).
    const officeToken = await zugriffstoken(request, KONTEN.office);

    const finalisieren = await rpcAufrufen(request, officeToken, 'finalize_treatment_note', {
      p_note_id: eintrag!.id,
      p_expected_updated_at: eintrag!.updated_at,
    });
    expect(finalisieren.status()).toBe(403);

    const korrigieren = await rpcAufrufen(request, officeToken, 'revise_treatment_note', {
      p_note_id: eintrag!.id,
      p_expected_updated_at: eintrag!.updated_at,
      p_content: 'Synthetisch: unzulaessige Korrektur.',
      p_reason: 'Unzulaessig.',
    });
    expect(korrigieren.status()).toBe(403);

    const nachtragen = await rpcAufrufen(request, officeToken, 'create_treatment_note_addendum', {
      p_parent_note_id: eintrag!.id,
      p_content: 'Synthetisch: unzulaessiger Nachtrag.',
    });
    expect(nachtragen.status()).toBe(403);
  });

  test('haelt office und Patientenkonto vom Versionsverlauf fern', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await finalisierterEintrag(page, laufTag(5));

    const therapeutToken = await zugriffstoken(request, KONTEN.therapist);
    const eintraege = await rpcAufrufen(request, therapeutToken, 'get_treatment_note', {
      p_appointment_id: terminId,
    });
    const [eintrag] = (await eintraege.json()) as { id: string }[];

    for (const konto of [KONTEN.office, 'max.mustermann@patient.invalid']) {
      const token = await zugriffstoken(request, konto);
      const antwort = await rpcAufrufen(request, token, 'get_treatment_note_versions', {
        p_note_id: eintrag!.id,
      });
      expect(antwort.status(), `${konto} darf den Verlauf nicht lesen`).toBe(403);
      expect(await antwort.text()).not.toContain('Belastung in drei Stufen');
    }
  });

  test('laesst die Versionstabelle selbst nicht direkt lesen', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    await finalisierterEintrag(page, laufTag(6));

    // Gaebe es einen direkten Tabellenzugriff, liesse sich der gesamte
    // Versionsverlauf am Auditeintrag vorbei abziehen (ADR-010).
    const token = await zugriffstoken(request, KONTEN.therapist);
    const { url, anonKey } = supabaseKonfiguration();
    const antwort = await request.get(`${url}/rest/v1/treatment_note_versions?select=content`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    expect(antwort.status()).toBeGreaterThanOrEqual(400);
    expect(await antwort.text()).not.toContain('Belastung in drei Stufen');
  });
});
