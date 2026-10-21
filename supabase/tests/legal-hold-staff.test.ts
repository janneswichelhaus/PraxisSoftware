import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import {
  erwarteAbgewiesenenLeseversuch,
  erwarteAbgewiesenenSchreibversuch,
} from './helpers/abgewiesen';

/**
 * Löschsperre für Beschäftigtendaten (BEF-178, ANN-674, ADR-008 Punkt 7).
 *
 * Seit den Überholungen 7 bis 10 löscht der Lauf Urlaub, Arbeitszeitänderungen,
 * Zeitkonto und Erstattungen. Eine Sperre an der Person hält alles davon an,
 * solange sie läuft - auch Abgelehntes und Zurückgezogenes. Gesetzt und
 * aufgehoben wird wie bei der Akte nur von owner (ANN-033); nachgewiesen an
 * der Sperre selbst, ohne Auditeintrag (ADR-010 Punkt 15). Die Negativfälle
 * folgen ADR-013 Punkt 9 Nr. 1: Rolle ohne Recht, Patientenkonto, andere
 * Organisation, ohne Sitzung.
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const SETZEN = 'select public.place_staff_legal_hold($1::uuid, $2) as id';
const AUFHEBEN = 'select public.release_legal_hold($1::uuid)';
const AUFLISTEN = 'select * from public.list_legal_holds()';

async function setzen(userId: string, staffMemberId: string, grund: string) {
  const { rows } = await asUserCommitted<{ id: string }>(userId, SETZEN, [staffMemberId, grund]);
  return rows[0]!.id;
}

async function gesperrt(staffMemberId: string): Promise<boolean> {
  const { rows } = await asPostgres<{ gesperrt: boolean }>(
    `select app.under_legal_hold($1::uuid, 'staff_member', $2::uuid) as gesperrt`,
    [organizationId, staffMemberId],
  );
  return rows[0]!.gesperrt;
}

/**
 * Je Bereich ein fälliger Datensatz der langen und einer der kurzen Frist:
 * neun Zeilen, die ein Lauf ohne Sperre alle löscht.
 */
async function faelligeDaten(staffMemberId: string): Promise<void> {
  await asPostgres(
    `insert into public.staff_leave_requests
       (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
        requested_at, decided_by, decided_at, withdrawn_at)
     values
       ($1, $2, '2019-06-03', '2019-06-03', 1, 'approved', $3, '2019-05-01', $3, '2019-05-02', null),
       ($1, $2, '2019-07-01', '2019-07-01', 1, 'withdrawn', $3, now() - interval '400 days', null, null,
        now() - interval '399 days')`,
    [organizationId, staffMemberId, users.ownerTherapist],
  );
  await asPostgres(
    `insert into public.staff_leave_entitlements (organization_id, staff_member_id, year, days, updated_by)
     values ($1, $2, 2019, 30, $3)`,
    [organizationId, staffMemberId, users.ownerTherapist],
  );
  await asPostgres(
    `insert into public.staff_working_time_requests
       (organization_id, staff_member_id, kind, on_date, blocks, previous_blocks,
        previous_minutes, new_minutes, status, requested_by, requested_at, decided_by,
        decided_at, decision_note)
     values
       ($1, $2, 'once', '2019-06-04', '[]', '[]', 0, 0, 'approved', $3, '2019-05-01', $3,
        '2019-05-02', null),
       ($1, $2, 'once', '2019-06-05', '[]', '[]', 0, 0, 'rejected', $3, now() - interval '400 days',
        $3, now() - interval '399 days', 'Nein')`,
    [organizationId, staffMemberId, users.ownerTherapist],
  );
  await asPostgres(
    `insert into public.staff_time_account_entries
       (organization_id, staff_member_id, kind, on_date, starts_at, ends_at, minutes, status,
        entered_by, entered_at, rejected_by, rejected_at, rejection_note)
     values
       ($1, $2, 'overtime', '2019-06-04', '18:00', '19:00', 60, 'valid', $3, '2019-06-04',
        null, null, null),
       ($1, $2, 'overtime', '2019-06-05', '18:00', '19:00', 60, 'rejected', $3, '2019-06-05',
        $3, now() - interval '400 days', 'Nein')`,
    [organizationId, staffMemberId, users.ownerTherapist],
  );
  await asPostgres(
    `insert into public.staff_reimbursements
       (organization_id, staff_member_id, kind, amount_cents, status, requested_by, requested_at,
        decided_by, decided_at, paid_by, paid_at, withdrawn_at)
     values
       ($1, $2, 'purchase', 1290, 'paid', $3, now() - interval '9 years', $3,
        now() - interval '9 years', $3, now() - interval '9 years', null),
       ($1, $2, 'purchase', 990, 'withdrawn', $3, now() - interval '14 months', null, null, null,
        null, now() - interval '13 months')`,
    [organizationId, staffMemberId, users.ownerTherapist],
  );
}

/** Wie viele der fälligen Zeilen einer Person noch stehen, je Tabelle. */
async function bestand(staffMemberId: string): Promise<Record<string, number>> {
  const { rows } = await asPostgres<{ tabelle: string; n: number }>(
    `select 'staff_leave_requests' as tabelle, count(*)::int as n
       from public.staff_leave_requests where staff_member_id = $1
     union all
     select 'staff_leave_entitlements', count(*)::int
       from public.staff_leave_entitlements where staff_member_id = $1 and year = 2019
     union all
     select 'staff_working_time_requests', count(*)::int
       from public.staff_working_time_requests where staff_member_id = $1
     union all
     select 'staff_time_account_entries', count(*)::int
       from public.staff_time_account_entries where staff_member_id = $1 and kind <> 'carryover'
     union all
     select 'staff_reimbursements', count(*)::int
       from public.staff_reimbursements where staff_member_id = $1`,
    [staffMemberId],
  );
  return Object.fromEntries(rows.map((r) => [r.tabelle, r.n]));
}

const ALLES_DA = {
  staff_leave_requests: 2,
  staff_leave_entitlements: 1,
  staff_working_time_requests: 2,
  staff_time_account_entries: 2,
  staff_reimbursements: 2,
};

const NICHTS_DA = {
  staff_leave_requests: 0,
  staff_leave_entitlements: 0,
  staff_working_time_requests: 0,
  staff_time_account_entries: 0,
  staff_reimbursements: 0,
};

describe('place_staff_legal_hold', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('setzt eine Sperre mit Grund, Zeitpunkt und verantwortlicher Person - ohne Auditeintrag', async () => {
    const id = await setzen(users.ownerTherapist, STAFF.anna, 'Klage auf Urlaubsabgeltung');

    const { rows } = await asPostgres<{
      subject_type: string;
      subject_id: string;
      reason: string;
      placed_by: string;
      placed_at: string | null;
      released_at: string | null;
    }>(
      `select subject_type, subject_id::text as subject_id, reason, placed_by::text as placed_by,
              placed_at::text as placed_at, released_at::text as released_at
       from public.legal_holds where id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      subject_type: 'staff_member',
      subject_id: STAFF.anna,
      reason: 'Klage auf Urlaubsabgeltung',
      placed_by: users.ownerTherapist,
      released_at: null,
    });
    expect(rows[0]?.placed_at).not.toBeNull();
    expect(await gesperrt(STAFF.anna)).toBe(true);

    // Der Nachweis steht an der Sperre (ADR-010 Punkt 15); der Grund nie im Log.
    const { rows: audit } = await asPostgres('select action from public.audit_log');
    expect(audit).toEqual([]);
  });

  it('verlangt einen Grund', async () => {
    await expect(asUser(users.ownerTherapist, SETZEN, [STAFF.anna, '  '])).rejects.toThrow(
      /needs a reason/,
    );
  });

  it('unterscheidet eine Person einer anderen Praxis nicht von einer unbekannten', async () => {
    const fremd = await fremdeOrganisation();
    for (const kennung of [
      fremd.staffMember,
      '55555555-5555-4555-8555-0000000000ff',
      // Eine Akte ist keine Person des Teams.
      patients.max,
    ]) {
      await expect(asUser(users.ownerTherapist, SETZEN, [kennung, 'Grund'])).rejects.toThrow(
        /staff member not found/,
      );
    }
    const { rows } = await asPostgres('select 1 from public.legal_holds');
    expect(rows).toEqual([]);
  });

  it('lässt eine zweite Sperre mit eigenem Grund zu; jede bleibt wirksam', async () => {
    const erste = await setzen(users.ownerTherapist, STAFF.anna, 'Erster Vorgang');
    const zweite = await setzen(users.ownerTherapist, STAFF.anna, 'Zweiter Vorgang');
    expect(zweite).not.toBe(erste);

    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [erste]);
    expect(await gesperrt(STAFF.anna)).toBe(true);
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [zweite]);
    expect(await gesperrt(STAFF.anna)).toBe(false);
  });

  it('hebt mit release_legal_hold auf und hält das Ende fest, statt die Zeile zu löschen', async () => {
    const id = await setzen(users.ownerTherapist, STAFF.anna, 'Vergleich geschlossen');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);

    const { rows } = await asPostgres<{ released_by: string | null; vorhanden: boolean }>(
      `select released_by::text as released_by, released_at is not null as vorhanden
       from public.legal_holds where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ released_by: users.ownerTherapist, vorhanden: true });
    const { rows: audit } = await asPostgres('select action from public.audit_log');
    expect(audit).toEqual([]);
  });
});

describe('Löschsperre an Beschäftigtendaten: Berechtigungen', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['patient', users.patientMax],
  ])('verweigert %s das Setzen', async (_rolle, userId) => {
    // G6c: bestätigt abgewiesen und protokolliert; eine Sperre entsteht nicht.
    await erwarteAbgewiesenenSchreibversuch(
      userId,
      SETZEN,
      [STAFF.anna, 'Irgendein Grund'],
      'legal_hold.placed',
    );
    const { rows } = await asPostgres('select 1 from public.legal_holds where subject_id = $1', [
      STAFF.anna,
    ]);
    expect(rows).toEqual([]);
  });

  it('verweigert den Aufruf ohne Anmeldung', async () => {
    await expect(asAnon(SETZEN, [STAFF.anna, 'Irgendein Grund'])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('lässt owner einer anderen Praxis keine Person dieser Praxis sperren', async () => {
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, SETZEN, [STAFF.anna, 'Grund'])).rejects.toThrow(
      /staff member not found/,
    );
  });

  it('verweigert therapist und owner einer anderen Praxis das Aufheben', async () => {
    const id = await setzen(users.ownerTherapist, STAFF.tim, 'Anfrage des Arbeitsgerichts');
    await erwarteAbgewiesenenSchreibversuch(users.therapist, AUFHEBEN, [id], 'legal_hold.released');

    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, AUFHEBEN, [id])).rejects.toThrow(/legal hold not found/);

    expect(await gesperrt(STAFF.tim)).toBe(true);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['patient', users.patientMax],
  ])('verweigert %s den Blick auf die Sperrliste', async (_rolle, userId) => {
    await erwarteAbgewiesenenLeseversuch(userId, AUFLISTEN, [], 'legal_holds.read');
  });

  it('trennt die Sperrlisten zweier Praxen in beide Richtungen', async () => {
    const fremd = await fremdeOrganisation();
    await setzen(users.ownerTherapist, STAFF.tim, 'Verfahren dieser Praxis');
    await setzen(fremd.owner, fremd.staffMember, 'Verfahren der anderen Praxis');

    const { rows: dort } = await asUser<{ subject_name: string; reason: string }>(
      fremd.owner,
      AUFLISTEN,
    );
    expect(dort.map((r) => [r.subject_name, r.reason])).toEqual([
      ['Frida Fremd', 'Verfahren der anderen Praxis'],
    ]);

    const { rows: hier } = await asUser<{ subject_name: string; reason: string }>(
      users.ownerTherapist,
      AUFLISTEN,
    );
    expect(hier.map((r) => r.subject_name)).not.toContain('Frida Fremd');
    expect(hier.map((r) => r.reason)).toContain('Verfahren dieser Praxis');
  });
});

describe('Löschsperre an Beschäftigtendaten: Sperrliste', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nennt Person, Gegenstand und Grund neben den Sperren an Akten', async () => {
    await setzen(users.ownerTherapist, STAFF.anna, 'Klage auf Urlaubsabgeltung');
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.max,
      'Honorarstreit',
    ]);
    const aufgehoben = await setzen(users.ownerTherapist, STAFF.tim, 'Erledigt');
    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [aufgehoben]);

    const { rows } = await asUser<{ subject_type: string; subject_name: string; reason: string }>(
      users.ownerTherapist,
      AUFLISTEN,
    );
    expect(
      rows
        .map((r) => ({
          subject_type: r.subject_type,
          subject_name: r.subject_name,
          reason: r.reason,
        }))
        .sort((a, b) => a.subject_type.localeCompare(b.subject_type)),
    ).toEqual([
      { subject_type: 'patient', subject_name: 'Max Mustermann', reason: 'Honorarstreit' },
      {
        subject_type: 'staff_member',
        subject_name: 'Anna Beispiel',
        reason: 'Klage auf Urlaubsabgeltung',
      },
    ]);
  });
});

describe('Löschsperre an Beschäftigtendaten: Wirkung im Löschlauf (ADR-008 Punkt 7)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('hält Urlaub, Arbeitszeit, Zeitkonto und Erstattungen der gesperrten Person, die übrigen fallen', async () => {
    await faelligeDaten(STAFF.anna);
    await faelligeDaten(STAFF.tim);
    await setzen(users.ownerTherapist, STAFF.anna, 'Klage auf Urlaubsabgeltung');

    await asPostgres('select public.apply_retention()');

    expect(await bestand(STAFF.anna)).toEqual(ALLES_DA);
    expect(await bestand(STAFF.tim)).toEqual(NICHTS_DA);

    // Im Journal steht nur, was gefallen ist - die neun Zeilen der anderen Person.
    const { rows: journal } = await asPostgres<{ retention_class: string; n: number }>(
      `select retention_class, count(*)::int as n from public.deletion_journal
        where target_table like 'staff_%' group by retention_class order by retention_class`,
    );
    expect(journal).toEqual([
      { retention_class: 'arbeitszeit', n: 1 },
      { retention_class: 'arbeitszeit_kurz', n: 1 },
      { retention_class: 'erstattung', n: 1 },
      { retention_class: 'erstattung_kurz', n: 1 },
      { retention_class: 'urlaub', n: 2 },
      { retention_class: 'urlaub_kurz', n: 1 },
      { retention_class: 'zeitkonto', n: 1 },
      { retention_class: 'zeitkonto_kurz', n: 1 },
    ]);
  });

  it('löscht im nächsten Lauf, sobald die Sperre aufgehoben ist', async () => {
    await faelligeDaten(STAFF.anna);
    const id = await setzen(users.ownerTherapist, STAFF.anna, 'Klage auf Urlaubsabgeltung');
    await asPostgres('select public.apply_retention()');
    expect(await bestand(STAFF.anna)).toEqual(ALLES_DA);

    await asUserCommitted(users.ownerTherapist, AUFHEBEN, [id]);
    await asPostgres('select public.apply_retention()');
    expect(await bestand(STAFF.anna)).toEqual(NICHTS_DA);

    // Der Saldo des gelöschten gültigen Eintrags bleibt als Übertrag (ANN-597).
    const { rows } = await asPostgres<{ minutes: number }>(
      `select minutes from public.staff_time_account_entries
        where staff_member_id = $1 and kind = 'carryover'`,
      [STAFF.anna],
    );
    expect(rows).toEqual([{ minutes: 60 }]);
  });

  it('hält mit einer Sperre an einer Akte keine Beschäftigtendaten', async () => {
    await faelligeDaten(STAFF.anna);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.max,
      'Honorarstreit',
    ]);

    await asPostgres('select public.apply_retention()');

    expect(await bestand(STAFF.anna)).toEqual(NICHTS_DA);
  });
});
