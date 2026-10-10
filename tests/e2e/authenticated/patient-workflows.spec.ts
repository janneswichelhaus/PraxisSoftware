import { expect, test } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  anmelden,
  detailWert,
  direktesUpdateVersuchen,
  rpcAufrufen,
  statusUeberApi,
  zugriffstoken,
} from './helpers';

/**
 * Echte Kernflüsse hinter der Anmeldung (PAT-002, PAT-003).
 *
 * Die Tests verändern echte Zeilen im lokalen Stack und stellen den
 * Seed-Zustand am Ende wieder her. Sie laufen deshalb nacheinander und sind
 * bewusst so geschrieben, dass ein wiederholter Lauf denselben Ausgangspunkt
 * vorfindet.
 */
test.describe.configure({ mode: 'serial' });

/** Ort von Erika Beispiel im Seed. Zielzustand nach jedem Lauf. */
const SEED_ORT = 'Tuebingen';

test.describe('PAT-002: Stammdaten bearbeiten', () => {
  test('speichert einen geänderten Ort dauerhaft', async ({ page }) => {
    const neuerOrt = `Teststadt-${Date.now()}`;

    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.erika}/stammdaten`);
    await expect(page.getByRole('heading', { name: 'Erika Beispiel' })).toBeVisible();

    // Seit 2026-10-03 fuehrt jede Karte ins Formular.
    await page.getByRole('link', { name: 'Person bearbeiten' }).click();
    await expect(page.getByRole('heading', { name: 'Stammdaten bearbeiten' })).toBeVisible();

    await page.getByLabel('Ort', { exact: true }).fill(neuerOrt);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();

    // Zurück in der Akte: der neue Wert steht in den Stammdaten.
    await expect(page.getByRole('heading', { name: 'Erika Beispiel' })).toBeVisible();
    await expect(detailWert(page, 'Adresse')).toContainText(neuerOrt);

    // Und er überlebt das Neuladen - er kommt also aus der Datenbank und
    // nicht aus dem Zustand der Anwendung.
    await page.reload();
    await expect(detailWert(page, 'Adresse')).toContainText(neuerOrt);

    // Ausgangszustand wiederherstellen, damit der Lauf wiederholbar bleibt.
    await page.getByRole('link', { name: 'Person bearbeiten' }).click();
    await page.getByLabel('Ort', { exact: true }).fill(SEED_ORT);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(detailWert(page, 'Adresse')).toContainText(SEED_ORT);
    await expect(detailWert(page, 'Adresse')).not.toContainText(neuerOrt);
  });
});

test.describe('PAT-003: Versorgungsstatus wechseln', () => {
  test('setzt den Status dauerhaft auf inaktiv und wieder zurück', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.max}/stammdaten`);
    await expect(page.getByRole('heading', { name: 'Max Mustermann' })).toBeVisible();
    // UX-005e: Der Status steht nur noch im Kopf der Akte - und dort nur als
    // Ausnahme. Eine laufende Versorgung trägt weder Zeile noch Etikett.
    const etikett = page.getByText('!Nicht in Versorgung', { exact: true });
    await expect(etikett).toHaveCount(0);

    // Der Wechsel verlangt eine Rückfrage; erst der zweite Klick schreibt.
    await page.getByRole('button', { name: 'Nicht mehr in Versorgung führen' }).click();
    await page.getByRole('button', { name: 'Nicht mehr in Versorgung führen' }).last().click();

    // Das Etikett trägt seit UIK-18 das Zeichen „!“ (für Vorlesesoftware
    // ausgeblendet); exact grenzt es gegen den Hinweis „Keine neuen
    // Termine …“ ab.
    await expect(etikett).toBeVisible();

    await page.reload();
    await expect(etikett).toBeVisible();

    // Zurück auf den Seed-Zustand.
    await page.getByRole('button', { name: 'Wieder in Versorgung führen' }).click();
    await page.getByRole('button', { name: 'Wieder in Versorgung führen' }).last().click();
    await expect(etikett).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Nicht mehr in Versorgung führen' }),
    ).toBeVisible();
  });
});

test.describe('PAT-003: Autorisierung auf RPC-Ebene', () => {
  test('weist therapist den Statuswechsel ab, obwohl die Akte lesbar ist', async ({ request }) => {
    // Kein UI-Nachweis: geprüft wird die Serverfunktion selbst, mit einem
    // echten GoTrue-Token. Eine ausgeblendete Schaltfläche ist keine
    // Zugriffskontrolle (ADR-004).
    const token = await zugriffstoken(request, KONTEN.therapist);

    // Positivkontrolle: das Token trägt, und die Akte ist für diese Rolle
    // lesbar. Die Abweisung unten ist damit eine Berechtigungsentscheidung
    // und kein allgemeiner Zugriffsfehler.
    const vorher = await statusUeberApi(request, token, PATIENTEN.max);

    const abgewiesen = await rpcAufrufen(request, token, 'set_patient_status', {
      p_patient_id: PATIENTEN.max,
      p_status: vorher === 'active' ? 'inactive' : 'active',
    });
    expect(abgewiesen.status()).toBe(403);
    expect((await abgewiesen.json()) as { message?: string }).toMatchObject({
      message: 'not allowed to change patient status',
    });

    // Auch der Weg an der Fachfunktion vorbei ist versperrt: authenticated hat
    // kein UPDATE-Recht auf der Tabelle.
    const direkt = await direktesUpdateVersuchen(request, token, PATIENTEN.max, 'inactive');
    expect(direkt.status()).toBeGreaterThanOrEqual(400);

    expect(await statusUeberApi(request, token, PATIENTEN.max)).toBe(vorher);
  });
});
