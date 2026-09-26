import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, patients, organizationId, persons, trainingRelationships } = SEED;

const LAUF = 'select public.apply_retention() as anzahl';
const NACHZIEHEN = 'select public.reapply_deletion_journal() as anzahl';

/**
 * Loeschlauf und Loeschjournal (LOE-002a, ADR-008).
 *
 * Die Roadmap verlangt, dass `pnpm test:db` JEDE Datenklasse abdeckt. Der
 * Aufbau hier folgt deshalb dem Retention Schedule: je Klasse mit
 * deletion_mode = 'automatisch' ein faelliger und ein nicht faelliger Fall,
 * dazu die Sperren (Legal Hold, gesetzliche Aufbewahrung) und die
 * Wiederanwendung nach einem Restore.
 */
async function lauf(): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: number }>(LAUF);
  return Number(rows[0]?.anzahl ?? 0);
}

async function nachziehen(): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: number }>(NACHZIEHEN);
  return Number(rows[0]?.anzahl ?? 0);
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

/** Setzt den Abschluss der Versorgung auf „vor N Jahren". */
async function abgeschlossenVor(patientId: string, jahre: number) {
  await asPostgres(
    `update public.patients
        set care_started_on   = (current_date - ($2::int + 1) * interval '1 year')::date,
            care_concluded_on = (current_date - $2::int * interval '1 year')::date,
            care_concluded_at = now(),
            care_concluded_by = $3::uuid
      where id = $1`,
    [patientId, jahre, users.therapist],
  );
}

/**
 * Legt Dokumentation samt festgeschriebener Version an einem bestehenden
 * Termin der Akte an. Der Seed enthaelt bewusst keine - klinischer Freitext
 * gehoert nicht in Beispieldaten, die jede Session sieht.
 */
async function dokumentationAnlegen(patientId: string) {
  await asPostgres(
    `with eintrag as (
       insert into public.treatment_notes
         (organization_id, appointment_id, status, content, created_by, updated_by,
          finalisation_kind, finalized_at, finalized_by)
       select a.organization_id, a.id, 'final', 'Synthetischer Behandlungstext',
              $2::uuid, $2::uuid, 'manual', now(), $2::uuid
       from public.appointments a
       where a.patient_id = $1::uuid
       order by a.starts_at
       limit 1
       returning id, organization_id
     )
     insert into public.treatment_note_versions
       (organization_id, note_id, version_no, content, author_id)
     select e.organization_id, e.id, 1, 'Synthetischer Behandlungstext', $2::uuid
     from eintrag e`,
    [patientId, users.therapist],
  );
}

/**
 * Erfasst eine Leistung an einem bestehenden Termin der Akte (ABR-002).
 * Die Katalogposition kommt aus der synthetischen Preisliste des Seeds.
 */
async function leistungAnlegen(patientId: string) {
  await asPostgres(
    `insert into public.billable_services
       (organization_id, patient_id, appointment_id, catalog_item_id, performed_on, created_by)
     select a.organization_id, a.patient_id, a.id,
            'cccccccc-cccc-4ccc-8ccc-000000000001'::uuid,
            (a.starts_at at time zone 'Europe/Berlin')::date, $2::uuid
     from public.appointments a
     where a.patient_id = $1::uuid
     order by a.starts_at
     limit 1`,
    [patientId, users.office],
  );
}

describe('Loeschlauf: klinische Patientenakte', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('loescht eine Akte zehn Jahre nach Abschluss der Versorgung mit allem, was daran haengt', async () => {
    await abgeschlossenVor(patients.max, 11);

    const termineVorher = await anzahl(
      'select count(*) from public.appointments where patient_id = $1',
      [patients.max],
    );
    expect(termineVorher).toBeGreaterThan(0);

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      0,
    );
    expect(
      await anzahl('select count(*) from public.appointments where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) from public.treatment_bases where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) from public.patient_contact_details where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) from public.patient_care_details where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);
  });

  it('loescht die erfassten Leistungen mit der Akte und journalisiert sie als Abrechnungsdaten', async () => {
    // Eine Leistung zeigt mit RESTRICT auf Termin und Patientenzeile: Ohne
    // eigenen Loeschschritt scheiterte der ganze Lauf (ABR-002, ADR-008).
    await leistungAnlegen(patients.max);
    await abgeschlossenVor(patients.max, 11);

    expect(
      await anzahl('select count(*) from public.billable_services where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(1);

    await lauf();

    expect(
      await anzahl('select count(*) from public.billable_services where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'billable_services' and retention_class = 'abrechnungsdaten'`,
      ),
    ).toBe(1);
  });

  it('loescht die Dokumentation der Akte samt ihrer festgeschriebenen Versionen', async () => {
    await dokumentationAnlegen(patients.max);
    await abgeschlossenVor(patients.max, 11);

    const dokuVorher = await anzahl(
      `select count(*) from public.treatment_notes t
       join public.appointments a on a.id = t.appointment_id
       where a.patient_id = $1`,
      [patients.max],
    );
    expect(dokuVorher).toBeGreaterThan(0);

    await lauf();

    expect(
      await anzahl(
        `select count(*) from public.treatment_notes t
         join public.appointments a on a.id = t.appointment_id
         where a.patient_id = $1`,
        [patients.max],
      ),
    ).toBe(0);
    // Die Versionen haengen mit on delete cascade am Eintrag; ohne diesen Test
    // bliebe unbemerkt, wenn jemand die Kaskade entfernt.
    expect(
      await anzahl(
        `select count(*) from public.treatment_note_versions v
         where not exists (select 1 from public.treatment_notes t where t.id = v.note_id)`,
      ),
    ).toBe(0);
  });

  it('loescht die Person, wenn keine andere Rolle mehr auf sie zeigt', async () => {
    await abgeschlossenVor(patients.petra, 11);

    const { rows } = await asPostgres<{ person_id: string }>(
      'select person_id::text as person_id from public.patients where id = $1',
      [patients.petra],
    );
    const person = rows[0]!.person_id;

    await lauf();

    expect(await anzahl('select count(*) from public.persons where id = $1', [person])).toBe(0);
  });

  it('behaelt die Person, solange ein Konto oder ein Mitarbeiterdatensatz auf sie zeigt', async () => {
    // Max hat ein Patientenkonto (ADR-008 Punkt 9: Konto und Akte sind
    // getrennt). Die Akte faellt, die Person bleibt.
    await abgeschlossenVor(patients.max, 11);
    const { rows } = await asPostgres<{ person_id: string }>(
      'select person_id::text as person_id from public.patients where id = $1',
      [patients.max],
    );
    const person = rows[0]!.person_id;

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      0,
    );
    expect(await anzahl('select count(*) from public.persons where id = $1', [person])).toBe(1);
  });

  it('laesst eine Akte vor Fristablauf unberuehrt', async () => {
    await abgeschlossenVor(patients.max, 9);
    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      1,
    );
  });

  it('laesst eine laufende Versorgung ohne Abschluss fuer immer unberuehrt', async () => {
    // Der Seed fuehrt alle drei ohne Abschluss.
    await lauf();

    expect(await anzahl('select count(*) from public.patients')).toBe(3);
  });

  it('haelt eine Akte unter Loeschsperre zurueck und zaehlt sie im Auditeintrag', async () => {
    await abgeschlossenVor(patients.max, 11);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Laufender Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      1,
    );

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'retention.applied' order by occurred_at desc limit 1`,
    );
    expect(rows[0]?.context).toMatchObject({ legal_hold_gehalten: 1, patientenakte: 0 });
  });

  it('loescht die Akte, sobald die Sperre aufgehoben ist', async () => {
    await abgeschlossenVor(patients.max, 11);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );
    await lauf();

    await asPostgres(
      `update public.legal_holds set released_at = now(), released_by = $1::uuid
       where subject_id = $2::uuid`,
      [users.ownerTherapist, patients.max],
    );
    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      0,
    );
    // Die aufgehobene Sperre faellt mit der Akte - sie ist eine Angabe ueber
    // diese Person.
    expect(
      await anzahl('select count(*) from public.legal_holds where subject_id = $1', [patients.max]),
    ).toBe(0);
  });
});

describe('Loeschlauf: abgesagte Termine ohne Behandlungsnachweis', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  /** Legt einen abgesagten Termin an, dessen Absage `jahre` zurueckliegt. */
  async function abgesagterTermin(jahre: number): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at, cancelled_at, cancelled_by,
         visit_street, visit_house_number, visit_postal_code, visit_city
       )
       select $1::uuid, $2::uuid, sm.id, 'home_visit', 'cancelled',
              now() - ($3::int * interval '1 year'),
              now() - ($3::int * interval '1 year') + interval '1 hour',
              now() - ($3::int * interval '1 year'), $4::uuid,
              'Teststrasse', '1', '72070', 'Tuebingen'
       from public.staff_members sm limit 1
       returning id::text as id`,
      [organizationId, patients.max, jahre, users.ownerTherapist],
    );
    return rows[0]!.id;
  }

  it('loescht einen abgesagten Termin drei Jahre nach Ende des Kalenderjahres', async () => {
    const id = await abgesagterTermin(5);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(0);
  });

  it('laesst einen abgesagten Termin vor Fristablauf stehen', async () => {
    const id = await abgesagterTermin(1);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  it('laesst einen abgesagten Termin mit Dokumentation stehen (gesetzliche Aufbewahrung hat Vorrang)', async () => {
    const id = await abgesagterTermin(5);
    await asPostgres(
      `insert into public.treatment_notes (organization_id, appointment_id, status, content, created_by, updated_by)
       values ($1::uuid, $2::uuid, 'draft', 'Synthetischer Text', $3::uuid, $3::uuid)`,
      [organizationId, id, users.therapist],
    );

    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  it('laesst einen abgesagten Termin unter Loeschsperre der Akte stehen', async () => {
    const id = await abgesagterTermin(5);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Laufender Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );

    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  // CAL-008c, ANN-035: Der Zustand 'no_show' faellt unter dieselbe Klasse -
  // die Klasse nennt seit LOE-001a ausdruecklich "Abgesagte Termine und
  // No-shows ohne Rechnung". Ein Vorgang MIT Gebuehrenanlass ist die
  // Grundlage einer Forderung und bleibt stehen (seit CAL-014b gilt das fuer
  // Absage und Vermerk gleichermassen).
  /** Legt einen No-show an, dessen Vermerk `jahre` zurueckliegt. */
  async function nichtAngetroffen(jahre: number, honorar: boolean): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at, no_show_recorded_at, no_show_recorded_by, fee_basis,
         visit_street, visit_house_number, visit_postal_code, visit_city
       )
       select $1::uuid, $2::uuid, sm.id, 'home_visit', 'no_show',
              now() - ($3::int * interval '1 year'),
              now() - ($3::int * interval '1 year') + interval '1 hour',
              now() - ($3::int * interval '1 year'), $4::uuid,
              case when $5::boolean then 'no_show' else null end,
              'Teststrasse', '2', '72070', 'Tuebingen'
       from public.staff_members sm limit 1
       returning id::text as id`,
      [organizationId, patients.max, jahre, users.ownerTherapist, honorar],
    );
    return rows[0]!.id;
  }

  /**
   * Legt eine Absage an, deren Eintragung `jahre` zurueckliegt - wahlweise mit
   * dem Gebuehrenanlass "unter 24 Stunden".
   *
   * Der Eingang liegt eine Stunde vor dem Termin; das ist der Fall, den die
   * Regel meint, und die Constraint verlangt ihn zum Anlass dazu.
   */
  async function abgesagtMitGebuehr(jahre: number): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at, cancelled_at, cancelled_by, cancellation_reason,
         cancellation_received_at, fee_basis,
         visit_street, visit_house_number, visit_postal_code, visit_city
       )
       select $1::uuid, $2::uuid, sm.id, 'home_visit', 'cancelled',
              now() - ($3::int * interval '1 year'),
              now() - ($3::int * interval '1 year') + interval '1 hour',
              now() - ($3::int * interval '1 year'), $4::uuid, 'patient_request',
              now() - ($3::int * interval '1 year') - interval '1 hour', 'late_cancellation',
              'Teststrasse', '3', '72070', 'Tuebingen'
       from public.staff_members sm limit 1
       returning id::text as id`,
      [organizationId, patients.max, jahre, users.ownerTherapist],
    );
    return rows[0]!.id;
  }

  it('laesst eine Absage MIT Gebuehrenanlass stehen - sie ist Grundlage einer Forderung', async () => {
    const id = await abgesagtMitGebuehr(5);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  it('loescht einen No-show ohne Ausfallhonorar nach derselben Frist', async () => {
    const id = await nichtAngetroffen(5, false);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(0);
  });

  it('laesst einen No-show vor Fristablauf stehen', async () => {
    const id = await nichtAngetroffen(1, false);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  it('laesst einen No-show MIT Ausfallhonorar stehen - er ist Grundlage einer Forderung', async () => {
    const id = await nichtAngetroffen(5, true);
    await lauf();

    expect(await anzahl('select count(*) from public.appointments where id = $1', [id])).toBe(1);
  });

  it('journalisiert den geloeschten No-show unter derselben Klasse', async () => {
    const id = await nichtAngetroffen(5, false);
    await lauf();

    const { rows } = await asPostgres<{ retention_class: string }>(
      `select retention_class from public.deletion_journal
        where target_table = 'appointments' and target_id = $1::uuid`,
      [id],
    );
    expect(rows.map((r) => r.retention_class)).toEqual(['termin_ohne_nachweis']);
  });
});

describe('Loeschlauf: Auditlog', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function auditeintrag(jahre: number, patientId = patients.max): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.audit_log
         (organization_id, actor_user_id, action, subject_type, subject_id, occurred_at)
       values ($1::uuid, $2::uuid, 'patient_record.viewed', 'patient', $3::uuid,
               now() - ($4::int * interval '1 year'))
       returning id::text as id`,
      [organizationId, users.therapist, patientId, jahre],
    );
    return rows[0]!.id;
  }

  it('loescht Auditeintraege drei Jahre nach dem Ereignis', async () => {
    const alt = await auditeintrag(4);
    await lauf();

    expect(await anzahl('select count(*) from public.audit_log where id = $1', [alt])).toBe(0);
  });

  it('laesst juengere Auditeintraege stehen', async () => {
    const jung = await auditeintrag(2);
    await lauf();

    expect(await anzahl('select count(*) from public.audit_log where id = $1', [jung])).toBe(1);
  });

  it('loescht Auditeintraege nach eigener Frist, nicht mit der Akte (ANN-029)', async () => {
    // Ein Eintrag von gestern ueberlebt die Loeschung der Akte, auf die er
    // sich bezieht: seine eigene Frist laeuft noch.
    const jung = await auditeintrag(0);
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      0,
    );
    expect(await anzahl('select count(*) from public.audit_log where id = $1', [jung])).toBe(1);
  });

  it('laesst Auditeintraege zu einer Akte unter Loeschsperre stehen', async () => {
    const alt = await auditeintrag(4);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Laufender Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );

    await lauf();

    expect(await anzahl('select count(*) from public.audit_log where id = $1', [alt])).toBe(1);
  });
});

describe('Loeschlauf: Einladungen zu Zugaengen', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function einladung(status: string, monate: number): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_account_invitations
         (organization_id, staff_member_id, email, role_keys, status, expires_at, invited_by,
          accepted_at, revoked_at, revoked_by)
       select $1::uuid, sm.id, 'test' || floor(random() * 100000)::text || '@beispiel.invalid',
              array['therapist'], $2,
              case when $2 = 'pending' then now() - ($3::int * interval '1 month')
                   else now() + interval '7 days' end,
              $4::uuid,
              case when $2 = 'accepted' then now() - ($3::int * interval '1 month') end,
              case when $2 = 'revoked'  then now() - ($3::int * interval '1 month') end,
              case when $2 = 'revoked'  then $4::uuid end
       from public.staff_members sm limit 1
       returning id::text as id`,
      [organizationId, status, monate, users.ownerTherapist],
    );
    return rows[0]!.id;
  }

  it.each([
    ['angenommen', 'accepted'],
    ['zurueckgenommen', 'revoked'],
  ])('loescht eine %s Einladung zwoelf Monate nach Abschluss', async (_art, status) => {
    const id = await einladung(status, 13);
    await lauf();

    expect(
      await anzahl('select count(*) from public.staff_account_invitations where id = $1', [id]),
    ).toBe(0);
  });

  it('loescht eine abgelaufene Einladung zwoelf Monate nach dem Ablauf', async () => {
    const id = await einladung('pending', 13);
    await lauf();

    expect(
      await anzahl('select count(*) from public.staff_account_invitations where id = $1', [id]),
    ).toBe(0);
  });

  it('laesst eine offene, noch gueltige Einladung stehen', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_account_invitations
         (organization_id, staff_member_id, email, role_keys, status, expires_at, invited_by)
       select $1::uuid, sm.id, 'offen@beispiel.invalid', array['therapist'], 'pending',
              now() + interval '7 days', $2::uuid
       from public.staff_members sm limit 1
       returning id::text as id`,
      [organizationId, users.ownerTherapist],
    );

    await lauf();

    expect(
      await anzahl('select count(*) from public.staff_account_invitations where id = $1', [
        rows[0]!.id,
      ]),
    ).toBe(1);
  });

  it('laesst eine kuerzlich angenommene Einladung stehen', async () => {
    const id = await einladung('accepted', 3);
    await lauf();

    expect(
      await anzahl('select count(*) from public.staff_account_invitations where id = $1', [id]),
    ).toBe(1);
  });
});

describe('Loeschlauf: Klassen ohne automatische Loeschung', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('ruehrt keine Tabelle an, deren Zuordnung "keine" lautet', async () => {
    // Ohne diesen Test koennte eine kuenftige Regel still mehr loeschen, als
    // der Retention Schedule vorsieht.
    const vorher = await anzahl(`select count(*) from public.staff_members`);
    const bausteineVorher = await anzahl('select count(*) from public.treatment_text_snippets');
    const verordnerVorher = await anzahl('select count(*) from public.prescribers');

    await lauf();

    expect(await anzahl('select count(*) from public.staff_members')).toBe(vorher);
    expect(await anzahl('select count(*) from public.treatment_text_snippets')).toBe(
      bausteineVorher,
    );
    expect(await anzahl('select count(*) from public.prescribers')).toBe(verordnerVorher);
  });

  it('deckt jede Klasse mit deletion_mode "automatisch" durch eine Regel ab', async () => {
    // Die Gegenprobe zum Retention Schedule: Was dort als automatisch steht,
    // muss der Lauf auch anfassen. Neue Klassen ohne Regel fallen hier auf.
    const { rows } = await asPostgres<{ class_key: string }>(
      `select distinct class_key from public.retention_assignments
       where deletion_mode = 'automatisch' order by class_key`,
    );
    expect(rows.map((r) => r.class_key)).toEqual([
      'auditlog',
      'patientenakte',
      'patientenfoto',
      'termin_ohne_nachweis',
      'trainingsverhaeltnis',
      'zugangseinladung',
    ]);
  });
});

describe('Loeschlauf: Trainingsverhaeltnis', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  /** Setzt das Vertragsende auf „vor N Jahren" (LEI-001). */
  async function beendetVor(relationshipId: string, jahre: number) {
    await asPostgres(
      `update public.training_relationships
          set contract_started_on = (current_date - ($2::int + 1) * interval '1 year')::date,
              contract_ended_on   = (current_date - $2::int * interval '1 year')::date,
              status              = 'inactive'
        where id = $1`,
      [relationshipId, jahre],
    );
  }

  it('loescht ein Trainingsverhaeltnis drei Jahre nach Vertragsende', async () => {
    await beendetVor(trainingRelationships.tina, 4);

    await lauf();

    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.tina,
      ]),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'training_relationships'
            and retention_class = 'trainingsverhaeltnis'`,
      ),
    ).toBe(1);
    // Tina hat kein zweites Verhaeltnis - mit dem Vertrag faellt auch ihre
    // Identitaet (ADR-008 Punkt 9).
    expect(await anzahl('select count(*) from public.persons where id = $1', [persons.tina])).toBe(
      0,
    );
  });

  it('laesst ein laufendes und ein noch nicht faelliges Verhaeltnis stehen', async () => {
    // Ohne Vertragsende laeuft keine Frist - genau wie ohne Abschluss der
    // Versorgung in der Akte.
    await beendetVor(trainingRelationships.erika, 2);

    await lauf();

    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.tina,
      ]),
    ).toBe(1);
    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.erika,
      ]),
    ).toBe(1);
  });

  it('laesst die Person stehen, solange ihre Akte besteht', async () => {
    // Erika hat beide Verhaeltnisse. Das Ende des einen beendet das andere
    // nicht (ADR-021, Konsequenzen).
    await beendetVor(trainingRelationships.erika, 4);

    await lauf();

    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.erika,
      ]),
    ).toBe(0);
    expect(await anzahl('select count(*) from public.persons where id = $1', [persons.erika])).toBe(
      1,
    );
    expect(
      await anzahl('select count(*) from public.patients where id = $1', [patients.erika]),
    ).toBe(1);
  });

  it('haelt die Person, solange jemand trainiert - auch wenn die Akte faellig ist', async () => {
    // Die vierte Pruefung in app.delete_patient_record. Ohne sie braeche der
    // Lauf am Fremdschluessel ab oder naehme einer laufenden
    // Trainingsbetreuung ihre Stammdaten (ADR-021, Konsequenzen).
    await abgeschlossenVor(patients.erika, 11);

    await lauf();

    expect(
      await anzahl('select count(*) from public.patients where id = $1', [patients.erika]),
    ).toBe(0);
    expect(await anzahl('select count(*) from public.persons where id = $1', [persons.erika])).toBe(
      1,
    );
    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.erika,
      ]),
    ).toBe(1);
  });

  it('nennt die geloeschten Verhaeltnisse im Auditereignis, ohne Kennungen (ADR-010)', async () => {
    await beendetVor(trainingRelationships.tina, 4);

    await lauf();

    const { rows } = await asPostgres<{ anzahl: string; kontext: Record<string, unknown> }>(
      `select context ->> 'trainingsverhaeltnis' as anzahl, context as kontext
         from public.audit_log
        where action = 'retention.applied'
        order by occurred_at desc
        limit 1`,
    );
    // Gezaehlt werden Zeilen, nicht Verhaeltnisse - wie bei der Akte: das
    // Verhaeltnis und die Person, die mit ihm faellt.
    expect(rows[0]?.anzahl).toBe('2');
    // Welche Datensaetze es traf, steht im Journal und nicht im Auditlog
    // (ADR-010 Punkt 3).
    expect(JSON.stringify(rows[0]?.kontext)).not.toContain(trainingRelationships.tina);
  });

  it('loescht nach einer Wiederherstellung erneut', async () => {
    await beendetVor(trainingRelationships.tina, 4);
    await lauf();

    // Restore: Verhaeltnis und Person sind wieder da.
    await asPostgres(
      `insert into public.persons (id, organization_id, given_name, family_name)
       values ($1::uuid, $2::uuid, 'Tina', 'Trainingskundin')`,
      [persons.tina, organizationId],
    );
    await asPostgres(
      `insert into public.training_relationships
         (id, organization_id, person_id, status, contract_started_on, contract_ended_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'inactive',
               current_date - interval '5 years', current_date - interval '4 years')`,
      [trainingRelationships.tina, organizationId, persons.tina],
    );

    expect(await nachziehen()).toBeGreaterThan(0);

    expect(
      await anzahl('select count(*) from public.training_relationships where id = $1', [
        trainingRelationships.tina,
      ]),
    ).toBe(0);
    expect(await anzahl('select count(*) from public.persons where id = $1', [persons.tina])).toBe(
      0,
    );
  });
});

describe('Loeschjournal', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('haelt je geloeschtem Datensatz Tabelle, Klasse und Faelligkeit fest', async () => {
    await dokumentationAnlegen(patients.max);
    await abgeschlossenVor(patients.max, 11);
    await lauf();

    const { rows } = await asPostgres<{ target_table: string; retention_class: string }>(
      `select target_table, retention_class from public.deletion_journal
       where retention_class = 'patientenakte' order by target_table`,
    );
    const tabellen = [...new Set(rows.map((r) => r.target_table))];
    expect(tabellen).toContain('patients');
    expect(tabellen).toContain('appointments');
    expect(tabellen).toContain('treatment_notes');

    const { rows: faellig } = await asPostgres<{ count: string }>(
      `select count(*) from public.deletion_journal where due_at > now()`,
    );
    expect(Number(faellig[0]?.count)).toBe(0);
  });

  it('enthaelt keine Namen und keine Inhalte, nur Kennungen (ANN-031)', async () => {
    await abgeschlossenVor(patients.max, 11);
    await lauf();

    const { rows } = await asPostgres<{ spalte: string }>(
      `select column_name as spalte from information_schema.columns
       where table_schema = 'public' and table_name = 'deletion_journal'
       order by column_name`,
    );
    expect(rows.map((r) => r.spalte)).toEqual([
      'deleted_at',
      'due_at',
      'id',
      'organization_id',
      'reapplied_at',
      'retention_class',
      'run_id',
      'target_id',
      'target_table',
    ]);
  });

  it('buendelt einen Lauf unter einer Kennung', async () => {
    await abgeschlossenVor(patients.max, 11);
    await lauf();

    const { rows } = await asPostgres<{ count: string }>(
      'select count(distinct run_id) from public.deletion_journal',
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('ist fuer keine Anwendungsrolle lesbar; owner liest die Zusammenfassung', async () => {
    await abgeschlossenVor(patients.max, 11);
    await lauf();

    await expect(
      asUser(users.ownerTherapist, 'select id from public.deletion_journal'),
    ).rejects.toThrow(/permission denied/i);

    const { rows } = await asUser<{ target_table: string; record_count: string }>(
      users.ownerTherapist,
      'select * from public.list_deletion_runs(50)',
    );
    expect(rows.length).toBeGreaterThan(0);

    // OPS-004: null Zeilen statt Ausnahme, und der Versuch steht im Auditlog.
    const abgewiesen = await asUser(users.therapist, 'select * from public.list_deletion_runs(50)');
    expect(abgewiesen.rows).toEqual([]);

    await asUserCommitted(users.therapist, 'select * from public.list_deletion_runs(50)');
    const { rows: eintraege } = await asPostgres<{ actor_user_id: string; outcome: string }>(
      "select actor_user_id, outcome from public.audit_log where action = 'deletion_runs.read'",
    );
    expect(eintraege).toEqual([{ actor_user_id: users.therapist, outcome: 'denied' }]);
  });
});

describe('Wiederanwendung nach einer Wiederherstellung (ADR-008 Punkt 8)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  /** Spielt einen Restore nach: die geloeschte Akte ist wieder da. */
  async function akteZurueckspielen(patientId: string, personId: string) {
    await asPostgres(
      `insert into public.persons (id, organization_id, given_name, family_name)
       values ($1::uuid, $2::uuid, 'Wieder', 'Da')`,
      [personId, organizationId],
    );
    await asPostgres(
      `insert into public.patients (id, organization_id, person_id, status, care_started_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'active', current_date - interval '12 years')`,
      [patientId, organizationId, personId],
    );
  }

  it('loescht erneut, was nach dem Restore wieder da ist', async () => {
    const { rows } = await asPostgres<{ person_id: string }>(
      'select person_id::text as person_id from public.patients where id = $1',
      [patients.petra],
    );
    const person = rows[0]!.person_id;

    await abgeschlossenVor(patients.petra, 11);
    await lauf();
    expect(
      await anzahl('select count(*) from public.patients where id = $1', [patients.petra]),
    ).toBe(0);

    await akteZurueckspielen(patients.petra, person);
    expect(
      await anzahl('select count(*) from public.patients where id = $1', [patients.petra]),
    ).toBe(1);

    const nachgezogen = await nachziehen();
    expect(nachgezogen).toBeGreaterThan(0);
    expect(
      await anzahl('select count(*) from public.patients where id = $1', [patients.petra]),
    ).toBe(0);
    expect(await anzahl('select count(*) from public.persons where id = $1', [person])).toBe(0);
  });

  it('ist idempotent: ein zweiter Lauf loescht nichts', async () => {
    await abgeschlossenVor(patients.petra, 11);
    await lauf();

    expect(await nachziehen()).toBe(0);
    expect(await nachziehen()).toBe(0);
  });

  it('haelt im Journal fest, dass nachgezogen werden musste', async () => {
    const { rows } = await asPostgres<{ person_id: string }>(
      'select person_id::text as person_id from public.patients where id = $1',
      [patients.petra],
    );
    await abgeschlossenVor(patients.petra, 11);
    await lauf();
    await akteZurueckspielen(patients.petra, rows[0]!.person_id);
    await nachziehen();

    const { rows: nachgezogen } = await asPostgres<{ count: string }>(
      `select count(*) from public.deletion_journal
       where target_table = 'patients' and reapplied_at is not null`,
    );
    expect(Number(nachgezogen[0]?.count)).toBe(1);

    const { rows: ereignis } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'retention.reapplied'`,
    );
    expect(ereignis).toHaveLength(1);
  });

  it('verweigert den Dienst, wenn das Journal eine Tabelle ohne Loeschreihenfolge nennt', async () => {
    // Eine kuenftige Regel, die eine neue Tabelle journalisiert, ohne die
    // Reihenfolge zu ergaenzen, wuerde nach einem Restore still etwas
    // zurueckbleiben lassen. Lieber ein lauter Fehler.
    await asPostgres(
      `insert into public.deletion_journal
         (organization_id, run_id, target_table, target_id, retention_class, due_at)
       values ($1::uuid, extensions.gen_random_uuid(), 'prescribers', extensions.gen_random_uuid(),
               'verordnerkartei', now())`,
      [organizationId],
    );

    await expect(asPostgres(NACHZIEHEN)).rejects.toThrow(/without a reapply order/);
  });
});

describe('Loeschlauf: Ausfuehrungsrechte und Wiederholbarkeit', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('ist fuer keine Anwendungsrolle ausfuehrbar (ANN-007)', async () => {
    await expect(asUser(users.ownerTherapist, LAUF)).rejects.toThrow(/permission denied/i);
    await expect(asUser(users.ownerTherapist, NACHZIEHEN)).rejects.toThrow(/permission denied/i);
  });

  it('haelt auch die interne Loeschfunktion fuer Anwendungsrollen verschlossen', async () => {
    // PostgreSQL gibt EXECUTE auf neue Funktionen an PUBLIC, und
    // `authenticated` hat USAGE auf dem Schema app. Ohne ausdrueckliches
    // REVOKE koennte jedes angemeldete Konto eine beliebige Akte loeschen:
    // app.delete_patient_record ist SECURITY DEFINER und prueft weder Rolle
    // noch Legal Hold - das tut der Lauf.
    const { rows } = await asPostgres<{ erlaubt: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as erlaubt
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'delete_patient_record'`,
    );
    expect(rows[0]?.erlaubt).toBe(false);

    await expect(
      asUser(
        users.ownerTherapist,
        `select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())`,
        [patients.max],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('loescht beim zweiten Lauf nichts mehr und schreibt keinen zweiten Auditeintrag', async () => {
    await abgeschlossenVor(patients.max, 11);
    expect(await lauf()).toBeGreaterThan(0);

    expect(await lauf()).toBe(0);

    const { rows } = await asPostgres<{ count: string }>(
      `select count(*) from public.audit_log where action = 'retention.applied'`,
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('schreibt keinen Auditeintrag, wenn nichts zu loeschen war', async () => {
    expect(await lauf()).toBe(0);

    const { rows } = await asPostgres<{ count: string }>(
      `select count(*) from public.audit_log where action = 'retention.applied'`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('fuehrt den Auditeintrag mit Systemakteur und ohne Kennungen (ADR-010, ANN-009)', async () => {
    await abgeschlossenVor(patients.max, 11);
    await lauf();

    const { rows } = await asPostgres<{
      actor_kind: string;
      actor_user_id: string | null;
      context: Record<string, unknown>;
    }>(
      `select actor_kind, actor_user_id::text as actor_user_id, context
       from public.audit_log where action = 'retention.applied'`,
    );
    expect(rows[0]?.actor_kind).toBe('system');
    expect(rows[0]?.actor_user_id).toBeNull();
    expect(rows[0]?.context).toMatchObject({ surface: 'scheduler' });
    expect(JSON.stringify(rows[0]?.context)).not.toContain(patients.max);
  });
});
