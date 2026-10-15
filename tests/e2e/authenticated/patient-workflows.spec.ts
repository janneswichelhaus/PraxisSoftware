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

test.describe('B1: Versorgungsstatus entfällt (BEF-151, ANN-510)', () => {
  test('bietet in der Akte keinen Wechsel und kein Etikett mehr an', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.max}/stammdaten`);
    await expect(page.getByRole('heading', { name: 'Max Mustermann' })).toBeVisible();
    await expect(page.getByText(/^!?Nicht in Versorgung$/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /in Versorgung führen/ })).toHaveCount(0);
  });
});

test.describe('B1: Autorisierung auf RPC-Ebene', () => {
  test('kennt den Statuswechsel nicht mehr und lässt die Tabelle weiter nicht direkt schreiben', async ({
    request,
  }) => {
    // Kein UI-Nachweis: geprüft wird der Server selbst, mit einem echten
    // GoTrue-Token. Eine ausgeblendete Schaltfläche ist keine
    // Zugriffskontrolle (ADR-004).
    const token = await zugriffstoken(request, KONTEN.therapist);

    // Positivkontrolle: das Token trägt, und die Akte ist für diese Rolle
    // lesbar.
    expect(await statusUeberApi(request, token, PATIENTEN.max)).toBe('active');

    // Die Serverfunktion gibt es nicht mehr - für keine Rolle.
    const entfallen = await rpcAufrufen(request, token, 'set_patient_status', {
      p_patient_id: PATIENTEN.max,
      p_status: 'inactive',
    });
    expect(entfallen.status()).toBe(404);

    // Auch der Weg an der Fachfunktion vorbei bleibt versperrt: authenticated
    // hat kein UPDATE-Recht auf der Tabelle.
    const direkt = await direktesUpdateVersuchen(request, token, PATIENTEN.max, 'inactive');
    expect(direkt.status()).toBeGreaterThanOrEqual(400);

    expect(await statusUeberApi(request, token, PATIENTEN.max)).toBe('active');
  });
});
