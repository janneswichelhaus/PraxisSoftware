import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, patients } = SEED;

const SETZEN = 'select public.place_legal_hold($1::uuid, $2) as id';
const AUFHEBEN = 'select public.release_legal_hold($1::uuid)';
const AUFLISTEN = 'select * from public.list_legal_holds()';

/**
 * Legal Hold (LOE-001c, ADR-008 Punkt 7).
 *
 * Eine Loeschsperre ist ein expliziter Zustand mit Beginn, Grund,
 * verantwortlicher Person und Ende. Sie setzt die automatische Loeschung aus -
 * und sonst nichts: Die Akte bleibt lesbar und bearbeitbar (ADR-004 bleibt
 * unberuehrt). Beides steht hier als Test.
 */
async function setzen(userId: string, patientId: string, grund: string) {
  const { rows } = await asUserCommitted<{ id: string }>(userId, SETZEN, [patientId, grund]);
  return rows[0]!.id;
}

describe('place_legal_hold', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('setzt eine Sperre mit Grund, Zeitpunkt und verantwortlicher Person', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Honorarstreit, Az. 4 C 12/26');

    const { rows } = await asPostgres<{
      subject_type: string;
      subject_id: string;
      reason: string;
      placed_by: string;
      released_at: string | null;
    }>(
      `select subject_type, subject_id, reason, placed_by::text as placed_by, released_at::text as released_at
       from public.legal_holds where id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      subject_type: 'patient',
      subject_id: patients.max,
      reason: 'Honorarstreit, Az. 4 C 12/26',
      placed_by: users.ownerTherapist,
      released_at: null,
    });
  });

  it('protokolliert legal_hold.placed an der Akte, ohne den Grund ins Auditlog zu schreiben', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Behandlungsfehlervorwurf');

    const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      `select subject_id::text as subject_id, context from public.audit_log
       where action = 'legal_hold.placed'`,
    );
    expect(rows[0]?.subject_id).toBe(patients.max);
    expect(rows[0]?.context).toMatchObject({ hold_id: id });
    expect(JSON.stringify(rows[0]?.context)).not.toContain('Behandlungsfehler');
  });

  it('laesst keine zweite laufende Sperre auf derselben Akte zu', async () => {
    await setzen(users.ownerTherapist, patients.max, 'Erster Grund');

    await expect(
      asUser(users.ownerTherapist, SETZEN, [patients.max, 'Zweiter Grund']),
    ).rejects.toThrow(/already under legal hold/);
  });

  it('verlangt einen Grund', async () => {
    await expect(asUser(users.ownerTherapist, SETZEN, [patients.max, '  '])).rejects.toThrow(
      /needs a reason/,
    );
  });

  it('erlaubt nach dem Aufheben eine neue Sperre', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Erster Vorgang');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    const zweite = await setzen(users.ownerTherapist, patients.max, 'Zweiter Vorgang');
    expect(zweite).not.toBe(id);
  });
});

describe('release_legal_hold', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('haelt das Ende fest, statt die Zeile zu loeschen', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Vorgang abgeschlossen');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    const { rows } = await asPostgres<{ released_by: string | null; vorhanden: boolean }>(
      `select released_by::text as released_by, released_at is not null as vorhanden
       from public.legal_holds where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ released_by: users.ownerTherapist, vorhanden: true });
  });

  it('protokolliert legal_hold.released an der Akte', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Vorgang abgeschlossen');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    const { rows } = await asPostgres<{ subject_id: string }>(
      `select subject_id::text as subject_id from public.audit_log where action = 'legal_hold.released'`,
    );
    expect(rows[0]?.subject_id).toBe(patients.max);
  });

  it('hebt eine bereits aufgehobene Sperre nicht ein zweites Mal auf', async () => {
    const id = await setzen(users.ownerTherapist, patients.max, 'Vorgang abgeschlossen');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    await expect(asUser(users.ownerTherapist, AUFHEBEN, [id])).rejects.toThrow(
      /legal hold not found/,
    );
  });
});

describe('Legal Hold: Berechtigungen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['patient', users.patientMax],
  ])('verweigert %s das Setzen einer Sperre', async (_rolle, userId) => {
    await expect(asUser(userId, SETZEN, [patients.max, 'Irgendein Grund'])).rejects.toThrow(
      /not allowed to manage legal holds/,
    );
  });

  it.each([
    ['therapist', users.therapist],
    ['office', users.office],
  ])('verweigert %s den Blick auf die Sperrliste', async (_rolle, userId) => {
    await expect(asUser(userId, AUFLISTEN)).rejects.toThrow(/not allowed to manage legal holds/);
  });

  it('verweigert den Aufruf ohne Anmeldung', async () => {
    await expect(asAnon(SETZEN, [patients.max, 'Irgendein Grund'])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('haelt legal_holds ueber den Anwendungspfad unerreichbar (ADR-004)', async () => {
    // Der Grund einer Sperre nennt einen laufenden Rechtsstreit. Gaebe es hier
    // eine Policy oder ein Tabellenrecht, waere er an list_legal_holds vorbei
    // lesbar.
    const { rows: policies } = await asPostgres(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'legal_holds'`,
    );
    expect(policies).toEqual([]);

    const { rows: grants } = await asPostgres(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'legal_holds'
         and grantee in ('anon', 'authenticated')`,
    );
    expect(grants).toEqual([]);
  });

  it('unterscheidet eine fremde Akte nicht von einer unbekannten', async () => {
    await expect(
      asUser(users.ownerTherapist, SETZEN, ['66666666-6666-4666-8666-0000000000ff', 'Grund']),
    ).rejects.toThrow(/patient not found/);
  });
});

describe('Legal Hold: Wirkung', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('meldet die laufende Sperre an app.under_legal_hold', async () => {
    const { rows: vorher } = await asPostgres<{ gesperrt: boolean }>(
      `select app.under_legal_hold($1::uuid, 'patient', $2::uuid) as gesperrt`,
      [SEED.organizationId, patients.max],
    );
    expect(vorher[0]?.gesperrt).toBe(false);

    const id = await setzen(users.ownerTherapist, patients.max, 'Laufender Vorgang');

    const { rows: waehrend } = await asPostgres<{ gesperrt: boolean }>(
      `select app.under_legal_hold($1::uuid, 'patient', $2::uuid) as gesperrt`,
      [SEED.organizationId, patients.max],
    );
    expect(waehrend[0]?.gesperrt).toBe(true);

    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    const { rows: danach } = await asPostgres<{ gesperrt: boolean }>(
      `select app.under_legal_hold($1::uuid, 'patient', $2::uuid) as gesperrt`,
      [SEED.organizationId, patients.max],
    );
    expect(danach[0]?.gesperrt).toBe(false);
  });

  it('laesst die Akte waehrend der Sperre unveraendert benutzbar (ADR-004 bleibt unberuehrt)', async () => {
    await setzen(users.ownerTherapist, patients.max, 'Laufender Vorgang');

    const { rows } = await asUser<{ id: string }>(
      users.therapist,
      `select id from public.patient_directory where id = $1`,
      [patients.max],
    );
    expect(rows).toHaveLength(1);

    // Auch schreiben bleibt moeglich: eine Sperre haelt die Loeschung auf,
    // nicht die Behandlung.
    await asUserCommitted(users.therapist, 'select public.conclude_patient_care($1::uuid, null)', [
      patients.max,
    ]);
  });

  it('listet laufende Sperren mit Person und Grund, aufgehobene nicht', async () => {
    const ersteSperre = await setzen(users.ownerTherapist, patients.max, 'Laufender Vorgang');
    const zweiteSperre = await setzen(users.ownerTherapist, patients.erika, 'Erledigter Vorgang');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [zweiteSperre]);

    const { rows } = await asUser<{ id: string; subject_name: string; reason: string }>(
      users.ownerTherapist,
      AUFLISTEN,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ersteSperre);
    expect(rows[0]?.subject_name).toBe('Max Mustermann');
    expect(rows[0]?.reason).toBe('Laufender Vorgang');
  });
});
