import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Warteliste mit Zeitfenstern (PRX-001, ANN-132, ANN-133, ANN-134).
 *
 * Geprüft werden die Rollen der Terminverwaltung (ADR-013 Punkt 9 Nr. 1), die
 * Mandantengrenze, die organisatorische Dringlichkeit, die Form der
 * Wunschfenster, die Stand-Prüfung, das Auditlog ohne Notiz, die Auskunft nach
 * Art. 15 und die Frist im Löschlauf.
 */

const { users, patients, organizationId } = SEED;

/** Folgeverordnung von Max (Seed). */
const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000002';
/** Erstverordnung von Erika (Seed). */
const VERORDNUNG_ERIKA = '88888888-8888-4888-8888-000000000003';
const ANNA = '55555555-5555-4555-8555-000000000002';
const OLIVIA = '55555555-5555-4555-8555-000000000003';

const FENSTER = [
  { weekday: 1, from: '08:00', to: '12:00' },
  { weekday: 3, from: '14:00', to: '18:00' },
];

const ANLEGEN = `select public.create_waitlist_entry(
  $1::uuid, $2::uuid, $3::uuid, $4, $5::int, $6::jsonb, $7::date, $8::date, $9, $10) as id`;
const AENDERN = `select public.update_waitlist_entry(
  $1::uuid, $2::timestamptz, $3::uuid, $4::uuid, $5, $6::int, $7::jsonb, $8::date, $9::date, $10, $11) as stand`;
const SCHLIESSEN = 'select public.close_waitlist_entry($1::uuid, $2::timestamptz, $3, $4::uuid)';
const LISTE = `select id, patient_id, patient_family_name, phone, postal_code, treatment_basis_kind,
                      preferred_staff_name, time_windows, needed_by::text as needed_by, status,
                      to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
                 from public.list_waitlist_entries($1, $2::uuid)`;

interface Zeile {
  id: string;
  patient_id: string;
  patient_family_name: string;
  phone: string | null;
  postal_code: string | null;
  treatment_basis_kind: string | null;
  preferred_staff_name: string | null;
  time_windows: unknown;
  needed_by: string | null;
  status: string;
  updated_at: string;
}

function parameter(
  over: Partial<{
    patient: string;
    basis: string | null;
    staff: string | null;
    typ: string;
    dauer: number;
    fenster: unknown;
    ab: string | null;
    bis: string | null;
    grund: string;
    notiz: string | null;
  }> = {},
): unknown[] {
  const p = {
    patient: patients.max,
    basis: VERORDNUNG_MAX,
    staff: ANNA,
    typ: 'home_visit',
    dauer: 60,
    fenster: FENSTER,
    ab: null,
    bis: null,
    grund: 'patient_wish',
    notiz: 'Synthetisch: morgens besser erreichbar',
    ...over,
  };
  return [
    p.patient,
    p.basis,
    p.staff,
    p.typ,
    p.dauer,
    JSON.stringify(p.fenster),
    p.ab,
    p.bis,
    p.grund,
    p.notiz,
  ];
}

async function anlegen(
  userId: string = users.office,
  over: Parameters<typeof parameter>[0] = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, parameter(over));
  return rows[0]!.id;
}

async function liste(userId: string = users.office, status: string | null = 'open') {
  const { rows } = await asUser<Zeile>(userId, LISTE, [status, null]);
  return rows;
}

async function fehler(userId: string | null, sql: string, params: unknown[]) {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

describe('Warteliste (PRX-001)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst die vier Rollen der Terminverwaltung anlegen und lesen', async () => {
    for (const konto of [users.office, users.therapist, users.teamLead, users.ownerTherapist]) {
      const f = await fehler(konto, ANLEGEN, parameter());
      expect(f, `Konto ${konto}`).toBeNull();
    }

    const id = await anlegen();
    for (const konto of [users.office, users.therapist, users.teamLead, users.ownerTherapist]) {
      const zeilen = await liste(konto);
      expect(zeilen.map((z) => z.id)).toEqual([id]);
    }
  });

  it('weist Patientenkonto und Trainingsbetreuung beim Schreiben ab', async () => {
    for (const konto of [users.patientMax, users.trainer]) {
      const f = await fehler(konto, ANLEGEN, parameter());
      expect(f?.code, `Konto ${konto}`).toBe('42501');
    }
    expect((await fehler(null, ANLEGEN, parameter()))?.code).toBe('42501');
  });

  it('gibt Patientenkonto und Trainingsbetreuung keine Zeile', async () => {
    await anlegen();
    expect(await liste(users.patientMax)).toEqual([]);
    expect(await liste(users.trainer)).toEqual([]);
  });

  it('erlaubt keinen direkten Zugriff auf die Tabelle', async () => {
    await anlegen();
    const f = await fehler(users.office, 'select * from public.waitlist_entries', []);
    expect(f?.message).toMatch(/permission denied/);
    const g = await fehler(
      users.office,
      `update public.waitlist_entries set status = 'withdrawn'`,
      [],
    );
    expect(g?.message).toMatch(/permission denied/);
  });

  it('liefert Name, Telefon, Postleitzahl, Grundlage und Wunsch-Therapeut:in', async () => {
    await anlegen();
    const [zeile] = await liste();
    expect(zeile).toMatchObject({
      patient_id: patients.max,
      patient_family_name: 'Mustermann',
      phone: '+49 7071 0000005',
      postal_code: '72070',
      treatment_basis_kind: 'follow_up',
      preferred_staff_name: 'Anna Beispiel',
      time_windows: FENSTER,
      status: 'open',
    });
  });

  it('ordnet nach "bis spaetestens", ohne Datum zuletzt, dann nach Wartezeit', async () => {
    const ohne = await anlegen(users.office, { patient: patients.petra, basis: null });
    const spaet = await anlegen(users.office, {
      patient: patients.erika,
      basis: VERORDNUNG_ERIKA,
      bis: '2099-06-01',
      grund: 'prescription_ending',
    });
    const frueh = await anlegen(users.office, { bis: '2099-05-01', grund: 'practice_priority' });

    expect((await liste()).map((z) => z.id)).toEqual([frueh, spaet, ohne]);
  });

  it('haelt die Mandantengrenze: fremde Praxis sieht nichts und schreibt nicht in fremde Akten', async () => {
    const id = await anlegen();
    const fremd = await fremdeOrganisation();

    expect(await liste(fremd.owner)).toEqual([]);
    const f = await fehler(fremd.owner, ANLEGEN, parameter({ basis: null, staff: null }));
    expect(f?.code).toBe('P0002');

    const zeile = (await liste())[0]!;
    const g = await fehler(fremd.owner, SCHLIESSEN, [id, zeile.updated_at, 'withdrawn', null]);
    expect(g?.code).toBe('P0002');
  });

  it('nimmt keine Grundlage einer anderen Person und keine nicht zuordenbare Therapeut:in', async () => {
    expect(
      (await fehler(users.office, ANLEGEN, parameter({ basis: VERORDNUNG_ERIKA })))?.code,
    ).toBe('P0002');
    // Olivia ist Office und damit nicht als Behandelnde zuordenbar (E11).
    expect((await fehler(users.office, ANLEGEN, parameter({ staff: OLIVIA })))?.code).toBe('P0002');
    expect(
      (await fehler(users.office, ANLEGEN, parameter({ staff: FREMDE_ORGANISATION.staffMember })))
        ?.code,
    ).toBe('P0002');
  });

  it('kennt nur organisatorische Gruende als Dringlichkeit (ANN-132)', async () => {
    for (const grund of ['patient_wish', 'prescription_ending', 'practice_priority']) {
      await resetDatabase();
      expect(await fehler(users.office, ANLEGEN, parameter({ grund }))).toBeNull();
    }
    for (const grund of ['red_flag', 'akut', '', 'high']) {
      expect((await fehler(users.office, ANLEGEN, parameter({ grund })))?.code, grund).toBe(
        '22023',
      );
    }
  });

  it('prueft die Form der Wunschfenster', async () => {
    const falsch: unknown[] = [
      { weekday: 1, from: '08:00' },
      [{ weekday: 0, from: '08:00', to: '09:00' }],
      [{ weekday: 8, from: '08:00', to: '09:00' }],
      [{ weekday: 1.5, from: '08:00', to: '09:00' }],
      [{ weekday: 1, from: '09:00', to: '08:00' }],
      [{ weekday: 1, from: '9:00', to: '10:00' }],
      [{ weekday: 1, from: '08:00', to: '09:00', extra: true }],
      Array.from({ length: 15 }, () => ({ weekday: 1, from: '08:00', to: '09:00' })),
    ];
    for (const fenster of falsch) {
      expect((await fehler(users.office, ANLEGEN, parameter({ fenster })))?.code).toBe('22023');
    }
    // Leer heisst jederzeit.
    expect(await fehler(users.office, ANLEGEN, parameter({ fenster: [] }))).toBeNull();

    // Auch am Schreibweg vorbei haelt die Constraint.
    const id = await anlegen();
    await expect(
      asPostgres(
        `update public.waitlist_entries set time_windows = '[{"weekday": 9}]'::jsonb where id = $1`,
        [id],
      ),
    ).rejects.toThrow(/waitlist_entries_time_windows_check/);
  });

  it('weist "bis spaetestens" vor "ab" und unpassende Dauern ab', async () => {
    expect(
      (await fehler(users.office, ANLEGEN, parameter({ ab: '2099-05-02', bis: '2099-05-01' })))
        ?.code,
    ).toBe('22023');
    for (const dauer of [0, 4, 241]) {
      expect((await fehler(users.office, ANLEGEN, parameter({ dauer })))?.code).toBe('22023');
    }
  });

  it('haelt einen offenen Eintrag je Person und Grundlage, ein geschlossener gibt den Platz frei', async () => {
    const id = await anlegen();
    expect((await fehler(users.office, ANLEGEN, parameter()))?.code).toBe('23505');
    // Eine andere Grundlage derselben Person ist ein anderer Wunsch.
    expect(await fehler(users.office, ANLEGEN, parameter({ basis: null }))).toBeNull();

    const zeile = (await liste()).find((z) => z.id === id)!;
    await asUserCommitted(users.office, SCHLIESSEN, [id, zeile.updated_at, 'withdrawn', null]);
    expect(await fehler(users.office, ANLEGEN, parameter())).toBeNull();
  });

  it('aendert mit Stand-Pruefung und nur solange der Eintrag offen ist', async () => {
    const id = await anlegen();
    const vorher = (await liste())[0]!;

    const { rows } = await asUserCommitted<{ stand: string }>(users.therapist, AENDERN, [
      id,
      vorher.updated_at,
      VERORDNUNG_MAX,
      null,
      'practice',
      45,
      JSON.stringify([{ weekday: 5, from: '10:00', to: '12:00' }]),
      null,
      '2099-01-31',
      'prescription_ending',
      null,
    ]);
    expect(rows[0]!.stand).toBeTruthy();

    const nachher = (await liste())[0]!;
    expect(nachher).toMatchObject({ preferred_staff_name: null, needed_by: '2099-01-31' });

    // Der alte Stand ist ueberholt.
    const f = await fehler(users.office, AENDERN, [
      id,
      vorher.updated_at,
      null,
      null,
      'practice',
      45,
      '[]',
      null,
      null,
      'patient_wish',
      null,
    ]);
    expect(f?.code).toBe('40001');

    await asUserCommitted(users.office, SCHLIESSEN, [id, nachher.updated_at, 'withdrawn', null]);
    const geschlossen = (await liste(users.office, 'closed'))[0]!;
    const g = await fehler(users.office, AENDERN, [
      id,
      geschlossen.updated_at,
      null,
      null,
      'practice',
      45,
      '[]',
      null,
      null,
      'patient_wish',
      null,
    ]);
    expect(g?.code).toBe('22023');
  });

  it('schliesst als eingeplant nur mit einem Termin derselben Person, der nicht abgesagt ist', async () => {
    const id = await anlegen();
    const zeile = (await liste())[0]!;

    const { rows: termine } = await asPostgres<{ id: string; patient_id: string }>(
      `select id, patient_id from public.appointments
        where organization_id = $1 and kind = 'therapy' and status <> 'cancelled'
        order by starts_at`,
      [organizationId],
    );
    const fremderTermin = termine.find((t) => t.patient_id !== patients.max)!;
    const eigenerTermin = termine.find((t) => t.patient_id === patients.max)!;

    expect(
      (await fehler(users.office, SCHLIESSEN, [id, zeile.updated_at, 'placed', fremderTermin.id]))
        ?.code,
    ).toBe('P0002');
    expect(
      (await fehler(users.office, SCHLIESSEN, [id, zeile.updated_at, 'placed', null]))?.code,
    ).toBe('P0002');
    expect(
      (
        await fehler(users.office, SCHLIESSEN, [
          id,
          zeile.updated_at,
          'withdrawn',
          eigenerTermin.id,
        ])
      )?.code,
    ).toBe('22023');
    expect(
      (await fehler(users.office, SCHLIESSEN, [id, zeile.updated_at, 'erledigt', null]))?.code,
    ).toBe('22023');

    await asUserCommitted(users.office, SCHLIESSEN, [
      id,
      zeile.updated_at,
      'placed',
      eigenerTermin.id,
    ]);
    expect(await liste()).toEqual([]);
    const [geschlossen] = await liste(users.office, 'closed');
    expect(geschlossen).toMatchObject({ id, status: 'placed' });

    // Zweimal schliessen geht nicht.
    expect(
      (await fehler(users.office, SCHLIESSEN, [id, geschlossen!.updated_at, 'withdrawn', null]))
        ?.code,
    ).toBe('22023');
  });

  it('aendert nicht aus einer fremden Praxis und nicht als Trainingsbetreuung', async () => {
    const id = await anlegen();
    const stand = (await liste())[0]!.updated_at;
    const fremd = await fremdeOrganisation();
    const params = [id, stand, null, null, 'practice', 45, '[]', null, null, 'patient_wish', null];
    expect((await fehler(fremd.owner, AENDERN, params))?.code).toBe('P0002');
    expect((await fehler(users.trainer, AENDERN, params))?.code).toBe('42501');
    expect((await fehler(users.patientMax, AENDERN, params))?.code).toBe('42501');
  });

  it('laesst eine falsch erfasste Grundlage loeschen, auch neben einem Eintrag ohne Grundlage (Zweitreview 2)', async () => {
    // Eine eigene, leere Grundlage fuer Max - ohne Termine und Bericht.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.treatment_bases
         (organization_id, patient_id, treatment_basis_kind, issued_on, appointment_count)
       values ($1::uuid, $2::uuid, 'self_pay', current_date, 5)
       returning id`,
      [organizationId, patients.max],
    );
    const basis = rows[0]!.id;
    const mitGrundlage = await anlegen(users.office, { basis });
    const ohne = await anlegen(users.office, { basis: null });

    await asUserCommitted(users.therapist, 'select public.delete_treatment_basis($1::uuid)', [
      basis,
    ]);

    const { rows: stand } = await asPostgres<{ id: string; status: string }>(
      'select id, status from public.waitlist_entries order by created_at',
    );
    expect(stand).toEqual([
      { id: mitGrundlage, status: 'withdrawn' },
      { id: ohne, status: 'open' },
    ]);
    // Wer und wann des Schliessens stehen am Eintrag (LOG-EPIC-001).
    const { rows: geschlossen } = await asPostgres<{
      closed_by: string;
      closed_at: Date | null;
      treatment_basis_id: string | null;
    }>(
      'select closed_by, closed_at, treatment_basis_id from public.waitlist_entries where id = $1',
      [mitGrundlage],
    );
    expect(geschlossen[0]).toMatchObject({ closed_by: users.therapist, treatment_basis_id: null });
    expect(geschlossen[0]!.closed_at).not.toBeNull();
    const { rows: audit } = await asPostgres(
      'select 1 from public.audit_log where subject_id = $1',
      [mitGrundlage],
    );
    expect(audit).toEqual([]);
  });

  it('behaelt den Wunsch, wenn die Grundlage faellt und kein zweiter Eintrag besteht', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.treatment_bases
         (organization_id, patient_id, treatment_basis_kind, issued_on, appointment_count)
       values ($1::uuid, $2::uuid, 'self_pay', current_date, 5)
       returning id`,
      [organizationId, patients.max],
    );
    const id = await anlegen(users.office, { basis: rows[0]!.id });
    await asUserCommitted(users.therapist, 'select public.delete_treatment_basis($1::uuid)', [
      rows[0]!.id,
    ]);
    const [zeile] = await liste();
    expect(zeile).toMatchObject({ id, status: 'open', treatment_basis_kind: null });
  });

  it('haelt wer/wann von Anlegen und Schliessen am Eintrag fest, ohne Auditeintrag (LOG-EPIC-001)', async () => {
    const id = await anlegen();
    const zeile = (await liste())[0]!;
    await asUserCommitted(users.office, SCHLIESSEN, [id, zeile.updated_at, 'withdrawn', null]);

    const { rows: eintrag } = await asPostgres<{
      status: string;
      created_by: string;
      closed_by: string;
      closed_at: Date | null;
      updated_by: string;
    }>(
      `select status, created_by, closed_by, closed_at, updated_by
         from public.waitlist_entries where id = $1`,
      [id],
    );
    expect(eintrag[0]).toMatchObject({
      status: 'withdrawn',
      created_by: users.office,
      closed_by: users.office,
      updated_by: users.office,
    });
    expect(eintrag[0]!.closed_at).not.toBeNull();

    // Die Notiz gelangt in keinen Auditeintrag (ADR-010).
    const { rows } = await asPostgres(
      `select 1 from public.audit_log
        where subject_id = $1 or context::text like '%erreichbar%'`,
      [id],
    );
    expect(rows).toEqual([]);
  });

  it('gehoert zur Auskunft nach Art. 15', async () => {
    await anlegen();
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    expect(rows[0]!.daten.tabellen['waitlist_entries']).toEqual([
      expect.objectContaining({ priority_reason: 'patient_wish', status: 'open' }),
    ]);
  });
});

describe('Warteliste im Loeschlauf (ANN-133)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function geschlossenVor(monate: number, patient: string = patients.max): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.waitlist_entries
         (organization_id, patient_id, appointment_type, priority_reason, status, closed_at, updated_at)
       values ($1::uuid, $2::uuid, 'practice', 'patient_wish', 'withdrawn',
               now() - make_interval(months => $3::int), now())
       returning id`,
      [organizationId, patient, monate],
    );
    return rows[0]!.id;
  }

  async function vorhanden(id: string): Promise<boolean> {
    const { rows } = await asPostgres('select 1 from public.waitlist_entries where id = $1', [id]);
    return rows.length === 1;
  }

  it('loescht einen geschlossenen Eintrag zwoelf Monate nach dem Schliessen und journalisiert ihn', async () => {
    const alt = await geschlossenVor(13);
    const jung = await geschlossenVor(11, patients.erika);

    await asPostgres('select public.apply_retention()');

    expect(await vorhanden(alt)).toBe(false);
    expect(await vorhanden(jung)).toBe(true);
    const { rows } = await asPostgres<{ retention_class: string }>(
      `select retention_class from public.deletion_journal where target_id = $1`,
      [alt],
    );
    expect(rows).toEqual([{ retention_class: 'warteliste' }]);
  });

  it('laesst offene Eintraege stehen, egal wie alt', async () => {
    const id = await anlegen();
    await asPostgres(
      `update public.waitlist_entries set created_at = now() - interval '5 years' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await vorhanden(id)).toBe(true);
  });

  it('haelt einen faelligen Eintrag unter Loeschsperre der Akte', async () => {
    const alt = await geschlossenVor(13);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Laufender Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    expect(await vorhanden(alt)).toBe(true);
  });

  it('loescht nach einer Wiederherstellung erneut', async () => {
    const alt = await geschlossenVor(13);
    await asPostgres('select public.apply_retention()');
    // Restore: die Zeile ist wieder da.
    await asPostgres(
      `insert into public.waitlist_entries
         (id, organization_id, patient_id, appointment_type, priority_reason, status, closed_at)
       values ($1::uuid, $2::uuid, $3::uuid, 'practice', 'patient_wish', 'withdrawn', now())`,
      [alt, organizationId, patients.max],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await vorhanden(alt)).toBe(false);
  });

  it('faellt mit der Akte', async () => {
    const id = await anlegen();
    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    expect(await vorhanden(id)).toBe(false);
  });
});

describe('Warteliste pruefen (ABN-018, BEF-108)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  const PRUEFEN = `select id, review_due,
                      to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
                     from public.list_waitlist_entries('open', null)`;
  const BESTAETIGEN = 'select public.confirm_waitlist_entry($1::uuid, $2::timestamptz)';

  it('meldet einen Eintrag nach acht Wochen ohne Aenderung als zu pruefen; "noch aktuell" setzt neu', async () => {
    const id = await anlegen();
    expect((await asUser<{ review_due: boolean }>(users.office, PRUEFEN)).rows[0]!.review_due).toBe(
      false,
    );
    await asPostgres(
      `update public.waitlist_entries set updated_at = now() - interval '57 days' where id = $1`,
      [id],
    );
    const { rows } = await asUser<{ id: string; review_due: boolean; updated_at: string }>(
      users.office,
      PRUEFEN,
    );
    expect(rows[0]!.review_due).toBe(true);

    await asUserCommitted(users.office, BESTAETIGEN, [id, rows[0]!.updated_at]);
    expect((await asUser<{ review_due: boolean }>(users.office, PRUEFEN)).rows[0]!.review_due).toBe(
      false,
    );
    // "Noch aktuell" steht am Eintrag (updated_by/updated_at), nicht im
    // Auditlog (LOG-EPIC-001).
    const bestaetigt = await asPostgres<{ updated_by: string }>(
      'select updated_by from public.waitlist_entries where id = $1',
      [id],
    );
    expect(bestaetigt.rows[0]!.updated_by).toBe(users.office);
    const audit = await asPostgres('select 1 from public.audit_log where subject_id = $1', [id]);
    expect(audit.rows).toEqual([]);

    // Ein veralteter Stand wird abgewiesen.
    expect((await fehler(users.office, BESTAETIGEN, [id, rows[0]!.updated_at]))?.code).toBe(
      '40001',
    );
  });

  it('laesst nur die Terminverwaltung bestaetigen und haelt die Mandantengrenze', async () => {
    const id = await anlegen();
    const { rows } = await asUser<{ updated_at: string }>(users.office, PRUEFEN);
    expect((await fehler(users.trainer, BESTAETIGEN, [id, rows[0]!.updated_at]))?.code).toBe(
      '42501',
    );
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, BESTAETIGEN, [id, rows[0]!.updated_at]))?.code).toBe('P0002');
  });
});
