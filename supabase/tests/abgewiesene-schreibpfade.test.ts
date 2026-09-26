import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommittedMitStatus,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenSchreibversuch } from './helpers/abgewiesen';

/**
 * G6c: abgewiesene Schreibversuche auf Rollen und Konten, Legal Hold und
 * Löschaufträge sind nachweisbar (ADR-010, ROADMAP G6c, ANN-115).
 *
 * Die Einzelfälle mit Blick auf die unveränderten Daten stehen bei ihrem
 * Gegenstand (`staff-accounts`, `legal-hold`, `patient-file-access`,
 * `patient-file-reconciliation`). Hier stehen die Liste der Pfade, der Ausgang
 * für ein Patientenkonto und die Grenzen: ohne Sitzung und ohne Organisation
 * bleibt es bei der Ausnahme, und der erfolgreiche Weg setzt keinen Status.
 */

const { users, patients } = SEED;
const IRGENDEINE = '66666666-6666-4666-8666-0000000000ff';
const ANNA = '55555555-5555-4555-8555-000000000002';

type Fall = [pfad: string, sql: string, params: unknown[], aktion: string];

const FAELLE: Fall[] = [
  [
    'invite_staff_account',
    'select public.invite_staff_account($1::uuid, $2, $3::text[]) as id',
    [ANNA, 'irgendwer@example.invalid', ['therapist']],
    'staff_account.invited',
  ],
  [
    'revoke_staff_invitation',
    'select public.revoke_staff_invitation($1::uuid)',
    [IRGENDEINE],
    'staff_account.invitation_revoked',
  ],
  [
    'set_staff_account_roles',
    'select public.set_staff_account_roles($1::uuid, $2::text[])',
    [ANNA, ['owner']],
    'staff_account.roles_changed',
  ],
  [
    'set_staff_account_active',
    'select public.set_staff_account_active($1::uuid, $2)',
    [ANNA, true],
    'staff_account.unlocked',
  ],
  [
    'request_staff_password_reset',
    'select public.request_staff_password_reset($1::uuid) as email',
    [ANNA],
    'staff_account.password_reset_requested',
  ],
  [
    'place_legal_hold',
    'select public.place_legal_hold($1::uuid, $2) as id',
    [patients.max, 'Grund'],
    'legal_hold.placed',
  ],
  [
    'release_legal_hold',
    'select public.release_legal_hold($1::uuid)',
    [IRGENDEINE],
    'legal_hold.released',
  ],
  [
    'order_orphaned_object_deletion',
    'select public.order_orphaned_object_deletion() as n',
    [],
    'storage_deletion.ordered',
  ],
  [
    'claim_storage_deletion_order',
    'select * from public.claim_storage_deletion_order($1::uuid)',
    [IRGENDEINE],
    'storage_deletion.claimed',
  ],
  [
    'receipt_storage_deletion_order',
    'select public.receipt_storage_deletion_order($1::uuid)',
    [IRGENDEINE],
    'storage_deletion.receipted',
  ],
];

describe('Abgewiesene Schreibpfade (G6c)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('kennt genau die Pfade, die eine Abweisung beim Schreiben ueberleben lassen', async () => {
    // Die Liste ist Jannes' Wahl vom 2026-09-26: Rollen und Konten, Legal Hold
    // und Loeschauftraege. Ein neuer Pfad ist Absicht, ein fehlender ein
    // Rueckschritt - beides soll ein Review sehen.
    const { rows } = await asPostgres<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app')
        and p.prosrc ~ 'app\\.record_denied_write\\('
        and p.proname <> 'record_denied_write'
      order by p.proname
    `);
    expect(rows.map((r) => r.proname)).toEqual(FAELLE.map(([pfad]) => pfad).sort());
  });

  it('laesst keinen Schreibpfad der drei Bereiche mit einer Rollenausnahme stehen', async () => {
    // Wer einen neuen Pfad fuer Konten, Legal Hold oder Loeschauftraege baut,
    // soll hier merken, dass er dazugehoert.
    const { rows } = await asPostgres<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.provolatile = 'v'
        and p.prosrc ~ 'can_manage_staff_accounts|can_manage_legal_hold|can_execute_storage_deletion'
        and p.prosrc !~ 'app\\.record_denied_(write|read)\\('
      order by p.proname
    `);
    expect(rows).toEqual([]);
  });

  it('laesst den Schreibhelfer fuer keine Anwendungsrolle ausfuehren', async () => {
    const { rows } = await asPostgres(`
      select r.rolname
      from pg_roles r
      where r.rolname in ('anon', 'authenticated', 'service_role')
        and has_function_privilege(r.oid, 'app.record_denied_write(uuid, text, text)', 'execute')
    `);
    expect(rows).toEqual([]);
  });

  it.each(FAELLE)(
    '%s: therapist wird bestaetigt abgewiesen',
    async (_pfad, sql, params, aktion) => {
      await erwarteAbgewiesenenSchreibversuch(users.therapist, sql, params, aktion);
    },
  );

  it('gibt sich bei einem abgewiesenen Rollenwechsel nicht selbst owner', async () => {
    const rollen = () =>
      asPostgres<{ role_key: string }>(
        'select role_key from public.user_roles where user_id = $1 order by role_key',
        [users.therapist],
      );
    const vorher = (await rollen()).rows;
    await erwarteAbgewiesenenSchreibversuch(
      users.therapist,
      'select public.set_staff_account_roles($1::uuid, $2::text[])',
      [ANNA, ['owner']],
      'staff_account.roles_changed',
    );
    const nachher = (await rollen()).rows;
    expect(nachher).toEqual(vorher);
    expect(nachher.map((r) => r.role_key)).not.toContain('owner');
  });

  it.each(FAELLE)('%s: ein Patientenkonto ebenso', async (_pfad, sql, params, aktion) => {
    await erwarteAbgewiesenenSchreibversuch(users.patientMax, sql, params, aktion);
  });

  it.each(FAELLE)('%s: ohne Sitzung bleibt es bei der Ausnahme', async (_pfad, sql, params) => {
    await expect(asUser(null, sql, params)).rejects.toThrow(/not authenticated/);
  });

  it.each(FAELLE)('%s: fuer anon nicht ausfuehrbar', async (_pfad, sql, params) => {
    await expect(asAnon(sql, params)).rejects.toThrow(/permission denied/i);
  });

  it('bricht ohne Organisation weiter ab, statt zu protokollieren', async () => {
    const ohnePraxis = '11111111-1111-4111-8111-0000000000d2';
    await asPostgres(
      `insert into auth.users (id, email, aud, role)
       values ($1, 'ohne-praxis-g6c@example.invalid', 'authenticated', 'authenticated')`,
      [ohnePraxis],
    );
    try {
      for (const [, sql, params] of FAELLE) {
        await expect(asUser(ohnePraxis, sql, params)).rejects.toThrow(/not allowed/);
      }
      const { rows } = await asPostgres('select 1 from public.audit_log where actor_user_id = $1', [
        ohnePraxis,
      ]);
      expect(rows).toEqual([]);
    } finally {
      await asPostgres('delete from auth.users where id = $1', [ohnePraxis]);
    }
  });

  it('setzt beim erlaubten Schreiben keinen Status und schreibt success', async () => {
    const { rows, status } = await asUserCommittedMitStatus<{ id: string }>(
      users.ownerTherapist,
      'select public.place_legal_hold($1::uuid, $2) as id',
      [patients.erika, 'Anfrage der Aufsicht'],
    );
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(status).toBeNull();
    const eintrag = await asPostgres<{ outcome: string }>(
      `select outcome from public.audit_log
        where action = 'legal_hold.placed' and actor_user_id = $1`,
      [users.ownerTherapist],
    );
    expect(eintrag.rows.map((r) => r.outcome)).toEqual(['success']);
  });
});
