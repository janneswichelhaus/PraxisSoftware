import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Befundangaben getrennt vom Entwurf (ABN-015, BEF-103 Punkt 1, ANN-120).
 *
 * Ein Vorschlag aus den Bausteinen kommt nur durch Übernehmen in den
 * Dokumentationsentwurf. Die Häkchen bleiben bis dahin hier - nie im Text,
 * nie festgeschrieben, und fort, sobald die Dokumentation festgeschrieben ist.
 */

const { users } = SEED;
const SICHERN = 'select public.save_treatment_draft_findings($1::uuid, $2::jsonb)';
const LESEN = 'select findings from public.get_treatment_draft_findings($1::uuid)';
const BEFUND = {
  auswahl: { 'knie_lachmann_test.rechts': { ergebnis: 'positiv' } },
  seitenwahl: { knie: 'rechts' },
};

async function behandlungstermin(): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `select a.id from public.appointments a
      where a.kind = 'therapy' and a.patient_id is not null
        and not exists (select 1 from public.treatment_notes t where t.appointment_id = a.id)
      order by a.starts_at limit 1`,
  );
  return rows[0]!.id;
}

async function fehler(userId: string, sql: string, params: unknown[]) {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

describe('Befundangaben getrennt vom Entwurf', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('sichert die Auswahl ohne Text und liefert sie zurück, protokolliert ohne Inhalt', async () => {
    const termin = await behandlungstermin();
    await asUserCommitted(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]);
    const { rows } = await asUserCommitted(users.therapist, LESEN, [termin]);
    expect(rows).toEqual([{ findings: BEFUND }]);

    // Kein Dokumentationseintrag entsteht.
    const notiz = await asPostgres(
      'select 1 from public.treatment_notes where appointment_id = $1',
      [termin],
    );
    expect(notiz.rows).toEqual([]);

    const audit = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_log
        where action like 'treatment_draft_findings.%' order by occurred_at`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'treatment_draft_findings.saved',
      'treatment_draft_findings.viewed',
    ]);
    for (const zeile of audit.rows)
      expect(Object.keys(zeile.context).sort()).toEqual(['patient_id', 'surface']);
  });

  it('verwirft mit einer leeren Auswahl', async () => {
    const termin = await behandlungstermin();
    await asUserCommitted(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]);
    await asUserCommitted(users.therapist, SICHERN, [
      termin,
      JSON.stringify({ auswahl: {}, seitenwahl: {} }),
    ]);
    expect((await asUser(users.therapist, LESEN, [termin])).rows).toEqual([]);
  });

  it('fällt beim Festschreiben weg und nimmt danach nichts mehr an', async () => {
    const termin = await behandlungstermin();
    await asUserCommitted(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]);
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_treatment_note($1::uuid, $2) as id',
      [termin, 'Befund übernommen.'],
    );
    const { rows: stand } = await asPostgres<{ updated_at: string }>(
      'select updated_at::text from public.treatment_notes where id = $1',
      [rows[0]!.id],
    );
    // Noch Entwurf: die Angaben bleiben.
    expect((await asUser(users.therapist, LESEN, [termin])).rows).toHaveLength(1);
    await asUserCommitted(
      users.therapist,
      'select public.finalize_treatment_note($1::uuid, $2::timestamptz)',
      [rows[0]!.id, stand[0]!.updated_at],
    );
    expect((await asPostgres('select 1 from public.treatment_draft_findings')).rows).toEqual([]);
    expect(
      (await fehler(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]))?.message,
    ).toMatch(/already finalized/);
  });

  it('lässt nur die dokumentierenden Rollen schreiben und lesen, mit denied-Eintrag', async () => {
    const termin = await behandlungstermin();
    await asUserCommitted(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]);
    for (const nutzer of [users.office, users.trainer, users.patientMax]) {
      expect((await fehler(nutzer, SICHERN, [termin, JSON.stringify(BEFUND)]))?.code).toBe('42501');
    }
    await erwarteAbgewiesenenLeseversuch(
      users.office,
      LESEN,
      [termin],
      'treatment_draft_findings.viewed',
    );
  });

  it('hält die Mandantengrenze und gehört zur Auskunft', async () => {
    const termin = await behandlungstermin();
    await asUserCommitted(users.therapist, SICHERN, [termin, JSON.stringify(BEFUND)]);
    const f = await fremdeOrganisation();
    // Die fremde Praxis bekommt die Rolle therapist dazu: Abgewiesen wird
    // dann allein an der Mandantengrenze.
    await asPostgres(
      `insert into public.user_roles (user_id, organization_id, role_key) values ($1, $2, 'therapist')`,
      [f.owner, f.organizationId],
    );
    expect((await asUser(f.owner, LESEN, [termin])).rows).toEqual([]);
    expect((await fehler(f.owner, SICHERN, [termin, JSON.stringify(BEFUND)]))?.code).toBe('P0002');

    const { rows: patient } = await asPostgres<{ patient_id: string }>(
      'select patient_id from public.appointments where id = $1',
      [termin],
    );
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patient[0]!.patient_id],
    );
    expect(rows[0]!.daten.tabellen['treatment_draft_findings']).toHaveLength(1);
  });
});
