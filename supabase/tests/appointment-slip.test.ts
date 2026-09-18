import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Terminzettel (CAL-011, IDEA-PRX-006).
 *
 * Der Zettel verlaesst die Praxis. Geprueft wird deshalb vor allem, was NICHT
 * darauf steht - und dass der Blick darauf eine Spur im Auditlog hinterlaesst.
 */

const { users, patients } = SEED;

const ZETTEL = 'select * from public.list_patient_appointment_slip($1::uuid)';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

interface Zeile {
  id: string;
  starts_at: string;
  appointment_type: string;
  location_name: string | null;
  staff_given_name: string;
  staff_family_name: string;
  organization_time_zone: string;
}

async function anlegen(opts: {
  tag: string;
  von?: string;
  bis?: string;
  typ?: string;
  ort?: string | null;
  patient?: string;
}): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    opts.patient ?? patients.max,
    STAFF_ANNA,
    opts.typ ?? 'practice',
    opts.tag,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    opts.typ === 'practice' || opts.typ === undefined ? (opts.ort ?? LOCATION) : null,
  ]);
  return rows[0]!.id;
}

function lesen(userId: string | null, patientId = patients.max) {
  return asUser<Zeile>(userId, ZETTEL, [patientId]);
}

describe('CAL-011: Terminzettel', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  it('liefert die naechsten bestaetigten Termine mit Ort und behandelnder Person', async () => {
    const zweiter = await anlegen({ tag: tagInTagen(60) });
    const erster = await anlegen({ tag: tagInTagen(50) });

    const { rows } = await lesen(users.office);
    expect(rows.map((r) => r.id)).toEqual([erster, zweiter]);
    expect(rows[0]).toMatchObject({
      appointment_type: 'practice',
      location_name: 'Hauptstandort Tuebingen',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      organization_time_zone: 'Europe/Berlin',
    });
  });

  it('laesst einen Hausbesuch ohne Standortnamen und ohne Adresse', async () => {
    await anlegen({ tag: tagInTagen(50), typ: 'home_visit', ort: null });

    const { rows } = await lesen(users.office);
    expect(rows[0]?.location_name).toBeNull();
    // Die Adresse ist die eigene der Patient:in - auf ihrem Zettel waere sie
    // Fuellstoff, und geliefert wird sie deshalb gar nicht.
    expect(Object.keys(rows[0]!)).not.toContain('visit_street');
  });

  it('liefert weder Status noch Verordnung noch klinische Felder', async () => {
    await anlegen({ tag: tagInTagen(50) });
    const { rows } = await lesen(users.office);

    for (const verboten of ['status', 'treatment_basis_id', 'patient_id', 'visit_city', 'notes']) {
      expect(Object.keys(rows[0]!)).not.toContain(verboten);
    }
  });

  it('laesst abgesagte und vergangene Termine weg', async () => {
    const abgesagt = await anlegen({ tag: tagInTagen(50) });
    await asUserCommitted(
      users.office,
      `select public.cancel_appointment($1::uuid,
         (select updated_at from public.appointments where id = $1::uuid), 'moved', null::date, null::time)`,
      [abgesagt],
    );

    // Vergangener Termin: an der RPC vorbei, sie weist die Vergangenheit ab.
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
               now() - interval '3 days', now() - interval '3 days' + interval '1 hour')`,
      [SEED.organizationId, patients.max, STAFF_ANNA],
    );

    const kuenftig = await anlegen({ tag: tagInTagen(51) });

    const { rows } = await lesen(users.office);
    expect(rows.map((r) => r.id)).toEqual([kuenftig]);
  });

  it('laesst einen abgeschlossenen Termin weg', async () => {
    // Nur 'confirmed' gehoert auf den Zettel - alles andere ist Vergangenheit
    // oder ein Sonderfall (ADR-018).
    const id = await anlegen({ tag: tagInTagen(50) });
    await asUserCommitted(
      users.office,
      `select public.record_no_show($1::uuid,
         (select updated_at from public.appointments where id = $1::uuid))`,
      [id],
    );

    const { rows } = await lesen(users.office);
    expect(rows).toEqual([]);
  });

  it('protokolliert den Blick auf den Zettel (ADR-010)', async () => {
    await anlegen({ tag: tagInTagen(50) });
    await asUserCommitted(users.office, ZETTEL, [patients.max]);

    const { rows } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id, actor_user_id, context from public.audit_log
        where action = 'patient_record.viewed'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject_id: patients.max, actor_user_id: users.office });
    expect(rows[0]?.context).toMatchObject({ surface: 'web', view: 'appointment_slip' });
    // Metadaten, kein Inhalt (ADR-010 Punkt 3).
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Mustermann|Anna|Tuebingen/i);
  });

  it('protokolliert nichts fuer eine unbekannte oder fremde Patienten-ID', async () => {
    const { rows } = await asUserCommitted(users.office, ZETTEL, [
      '66666666-6666-4666-8666-0000000000ff',
    ]);
    expect(rows).toEqual([]);

    const { rows: audit } = await asPostgres(
      "select id from public.audit_log where action = 'patient_record.viewed'",
    );
    expect(audit).toEqual([]);
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s den Zettel', async (_rolle, userId) => {
    await anlegen({ tag: tagInTagen(50) });
    const { rows } = await lesen(userId);
    expect(rows).toHaveLength(1);
  });

  it('weist ein Patientenkonto ab', async () => {
    await expect(lesen(users.patientMax)).rejects.toThrow(/not allowed to read appointments/);
  });

  it('weist einen anonymen Zugriff ab', async () => {
    await expect(asAnon(ZETTEL, [patients.max])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });
});
