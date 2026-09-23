import { expect, test } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  anmelden,
  rpcAufrufen,
  zugriffstoken,
  erwarteProtokollierteAbweisung,
} from './helpers';

/**
 * Verordnung und Dateien fuer office (ROL-002, E15).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Seit ADR-004 Fassung 2 liest office Diagnose und Verordnungsscan
 * wie die therapeutischen Rollen; schreiben darf es beides nicht. Gelesen wird
 * ausschliesslich der synthetische Seed (PROJECT_PRINCIPLES.md 3.1), und
 * jeder Schreibversuch hier muss scheitern.
 */

/** Laufende Folgeverordnung von Max Mustermann aus supabase/seed.sql. */
const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000002';
const DIAGNOSE_MAX = 'Synthetisch: Fortbestehende Bewegungseinschraenkung rechte Schulter.';

test.describe('ROL-002: Verordnung und Dateien fuer office', () => {
  test('zeigt office die Diagnose und den Scan-Bereich, aber keine Ablage', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.max}/verordnungen`);

    await expect(page.getByText(DIAGNOSE_MAX)).toBeVisible();
    await expect(page.getByText('Scan des Rezepts').first()).toBeVisible();
    // Lesen ja, ablegen und bearbeiten nein (ADR-017 Punkt 13, ANN-011).
    await expect(page.getByRole('button', { name: 'Datei hinzufügen' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  });

  test('liefert office Liste und Detail und weist jedes Schreiben ab', async ({ request }) => {
    const token = await zugriffstoken(request, KONTEN.office);

    const liste = await rpcAufrufen(request, token, 'list_patient_treatment_bases_clinical', {
      p_patient_id: PATIENTEN.max,
    });
    expect(liste.status(), 'office liest die klinische Sicht (E15)').toBe(200);
    expect(await liste.text()).toContain('Bewegungseinschraenkung');

    const detail = await rpcAufrufen(request, token, 'get_treatment_basis', {
      p_treatment_basis_id: VERORDNUNG_MAX,
    });
    expect(detail.status(), 'office liest das Verordnungsdetail (E15)').toBe(200);
    expect(await detail.text()).toContain('Bewegungseinschraenkung');

    // Ausgeblendete Elemente sind keine Zugriffskontrolle - verbindlich ist
    // der Server (ADR-004).
    const loeschen = await rpcAufrufen(request, token, 'delete_treatment_basis', {
      p_treatment_basis_id: VERORDNUNG_MAX,
    });
    expect(loeschen.status(), 'office loescht keine Verordnung (ANN-011)').toBe(403);

    const befund = await rpcAufrufen(request, token, 'prepare_patient_file_upload', {
      p_patient_id: PATIENTEN.max,
      p_treatment_basis_id: null,
      p_document_type: 'befund',
      p_display_name: 'Befund.pdf',
      p_mime_type: 'application/pdf',
      p_byte_size: 1000,
      p_checksum_sha256: 'a'.repeat(64),
    });
    expect(befund.status(), 'office legt keine klinische Datei ab (ADR-017 Punkt 13)').toBe(403);
  });

  test('weist das Patientenkonto an der klinischen Sicht weiterhin ab', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    await erwarteProtokollierteAbweisung(
      request,
      'treatment_basis.viewed',
      () =>
        rpcAufrufen(request, token, 'list_patient_treatment_bases_clinical', {
          p_patient_id: PATIENTEN.max,
        }),
      'Bewegungseinschraenkung',
    );
  });
});
