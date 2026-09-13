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
 * Behandlungsdokumentation zum Termin (DOK-001).
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
  return tagImFenster(TAGESFENSTER.treatmentNotes, LAUF, versatz);
}

function zeit(minutenAbAcht: number): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const gesamt = 8 * 60 + (LAUF % 12) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

const ENTWURF = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';
const ERGAENZT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert. Naechstes Mal Ausdauer.';

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

test.describe('DOK-001: Entwurf anlegen und bearbeiten', () => {
  test('legt einen Entwurf an, zeigt ihn am Termin und haelt ihn ueber das Neuladen', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag());

    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}/dokumentation`);

    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();

    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText(ENTWURF)).toBeVisible();
    await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();
    await expect(page.getByText(/Verfasst von Anna Beispiel/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(ENTWURF)).toBeVisible();
  });

  test('bearbeitet einen vorhandenen Entwurf', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(1));

    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}`);

    await page.getByRole('link', { name: 'Dokumentation bearbeiten' }).click();
    await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue(ENTWURF);

    await page.getByLabel('Eintrag zur Behandlung').fill(ERGAENZT);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();

    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText(ERGAENZT)).toBeVisible();

    await page.reload();
    await expect(page.getByText(ERGAENZT)).toBeVisible();
  });

  /**
   * Seit FIX-011 stellt den Rückfragen der **Navigationsschutz** - und zwar
   * für „Abbrechen" wie für jeden anderen Weg aus dieser Seite heraus. Deshalb
   * ist „Abbrechen" ein gewöhnlicher Verweis und kein Knopf mit eigenem Dialog
   * mehr; die Rückfrage hat drei Antworten statt zwei.
   */
  test('fragt vor dem Verwerfen ungespeicherter Eingaben nach', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(2));

    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill('Synthetisch: noch nicht gespeichert.');
    await page.getByRole('link', { name: 'Abbrechen' }).click();

    const rueckfrage = page.getByRole('group', { name: 'Ungespeicherte Dokumentation' });
    await expect(rueckfrage).toContainText('noch nicht gespeichert');
    await expect(page).toHaveURL(`/termine/${terminId}/dokumentation`);

    // „Hier bleiben" lässt Seite und Text stehen.
    await rueckfrage.getByRole('button', { name: 'Hier bleiben' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}/dokumentation`);
    await expect(page.getByLabel('Eintrag zur Behandlung')).toHaveValue(
      'Synthetisch: noch nicht gespeichert.',
    );

    await page.getByRole('link', { name: 'Abbrechen' }).click();
    await rueckfrage.getByRole('button', { name: 'Verwerfen und weitergehen' }).click();
    await expect(page).toHaveURL(`/termine/${terminId}`);
    await expect(page.getByText('Synthetisch: noch nicht gespeichert.')).toHaveCount(0);
  });

  test('dokumentiert auch zu einem bereits abgeschlossenen Termin', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    await terminAnlegen(page, laufTag(3));

    // Fuer eine therapeutische Rolle heisst der Knopf seit UX-012e
    // „Ohne Dokumentation abschließen" - daneben steht „Dokumentieren und
    // abschließen". Hier ist ausdruecklich der Abschluss ohne Eintrag
    // gemeint; dokumentiert wird gleich danach nachtraeglich.
    await page.getByRole('button', { name: 'Ohne Dokumentation abschließen' }).click();
    await expect(
      page.getByText('Dieser Termin ist abgeschlossen.', { exact: false }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();

    await expect(page.getByText(ENTWURF)).toBeVisible();
  });
});

test.describe('DOK-001: Office sieht keinen klinischen Freitext', () => {
  test('zeigt dem Office am selben Termin keine Dokumentation', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(4));
    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    await expect(page.getByText(ENTWURF)).toBeVisible();

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await anmelden(page, KONTEN.office);
    await page.goto(`/termine/${terminId}`);

    // Der Termin selbst ist organisatorisch und bleibt sichtbar.
    await expect(page.getByRole('heading', { name: /Termin – Max Mustermann/ })).toBeVisible();
    // Der klinische Inhalt nicht (PROJECT_PRINCIPLES.md 4.3).
    await expect(page.getByText(ENTWURF)).toHaveCount(0);
    await expect(page.getByText('Behandlungsdokumentation')).toHaveCount(0);
  });
});

test.describe('DOK-001: Serverseitige Grenzen', () => {
  test('weist office und Patientenkonto am Lesepfad ab', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(5));
    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    await expect(page.getByText(ENTWURF)).toBeVisible();

    // Ausgeblendete Elemente sind keine Zugriffskontrolle - verbindlich ist
    // der Server (ADR-004).
    for (const konto of [KONTEN.office, 'max.mustermann@patient.invalid']) {
      const token = await zugriffstoken(request, konto);
      const antwort = await rpcAufrufen(request, token, 'get_treatment_note', {
        p_appointment_id: terminId,
      });
      expect(antwort.status(), `${konto} darf nicht lesen`).toBe(403);
      expect(await antwort.text()).not.toContain('Uebungen angeleitet');
    }
  });

  test('weist office am Schreibpfad ab', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(6));

    const token = await zugriffstoken(request, KONTEN.office);
    const antwort = await rpcAufrufen(request, token, 'create_treatment_note', {
      p_appointment_id: terminId,
      p_content: 'Synthetisch: unzulaessiger Schreibversuch.',
    });
    expect(antwort.status()).toBe(403);
  });

  test('laesst die Tabelle selbst nicht direkt lesen', async ({ page, request }) => {
    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, laufTag(7));
    await page.getByRole('link', { name: 'Dokumentation anlegen' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill(ENTWURF);
    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    await expect(page.getByText(ENTWURF)).toBeVisible();

    // Gaebe es einen direkten Tabellenzugriff, liesse sich klinischer Freitext
    // am Auditeintrag vorbei lesen (ADR-010).
    const token = await zugriffstoken(request, KONTEN.therapist);
    const { url, anonKey } = supabaseKonfiguration();
    const antwort = await request.get(
      `${url}/rest/v1/treatment_notes?select=content&appointment_id=eq.${terminId}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    expect(antwort.status()).toBeGreaterThanOrEqual(400);
    expect(await antwort.text()).not.toContain('Uebungen angeleitet');
  });
});
