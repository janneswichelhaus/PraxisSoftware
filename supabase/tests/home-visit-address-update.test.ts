import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

/**
 * Hausbesuche mit alter Adresse (ABN-004, BEF-092).
 *
 * Zwei Zusagen: Die Akte findet die kuenftigen Hausbesuche, deren kopierte
 * Anschrift von den Stammdaten abweicht - und sie aendert keinen davon ohne
 * ausdruecklichen Auftrag. Vergangene Termine bleiben, wie sie waren.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const TAG = tagInTagen(40);

const LISTE = 'select * from public.list_home_visits_with_outdated_address($1::uuid)';
const AKTUALISIEREN = 'select public.update_home_visit_addresses($1::uuid[]) as anzahl';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

async function hausbesuch(patient: string, von = '09:00', bis = '10:00'): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    patient,
    STAFF_ANNA,
    'home_visit',
    TAG,
    von,
    bis,
    null,
  ]);
  return rows[0]!.id;
}

async function adresse(id: string): Promise<Record<string, string | null>> {
  const { rows } = await asPostgres<Record<string, string | null>>(
    'select visit_street, visit_house_number, visit_postal_code, visit_city from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function umziehen(patient: string, strasse: string, nummer: string): Promise<void> {
  await asPostgres(
    'update public.patient_contact_details set street = $2, house_number = $3 where patient_id = $1',
    [patient, strasse, nummer],
  );
}

async function liste(konto: string, patient: string): Promise<string[]> {
  const { rows } = await asUser<{ id: string }>(konto, LISTE, [patient]);
  return rows.map((z) => z.id);
}

describe('Hausbesuche mit alter Adresse (ABN-004)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointment_notifications');
    await asPostgres('delete from public.appointments');
    await asPostgres(
      "delete from public.audit_log where action in ('appointment.updated', 'appointments.read')",
    );
    await umziehen(patients.max, 'Beispielstrasse', '12');
  });

  it('nennt nichts, solange die Adresse stimmt', async () => {
    await hausbesuch(patients.max);
    expect(await liste(users.office, patients.max)).toEqual([]);
  });

  it('nennt den kuenftigen Hausbesuch nach einem Umzug und aktualisiert ihn auf Auftrag', async () => {
    const id = await hausbesuch(patients.max);
    await umziehen(patients.max, 'Neue Strasse', '3');

    expect(await liste(users.office, patients.max)).toEqual([id]);
    // Noch hat sich am Termin nichts geaendert.
    expect((await adresse(id)).visit_street).toBe('Beispielstrasse');

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, AKTUALISIEREN, [[id]]);
    expect(Number(rows[0]!.anzahl)).toBe(1);
    expect(await adresse(id)).toEqual({
      visit_street: 'Neue Strasse',
      visit_house_number: '3',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
    });
    expect(await liste(users.office, patients.max)).toEqual([]);

    const protokoll = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      "select subject_id, context from public.audit_log where action = 'appointment.updated'",
    );
    expect(protokoll.rows).toHaveLength(1);
    expect(protokoll.rows[0]!.subject_id).toBe(id);
    expect(protokoll.rows[0]!.context.changed_fields).toEqual(['visit_address']);
    expect(protokoll.rows[0]!.context.reason).toBe('patient_address_changed');
    expect(JSON.stringify(protokoll.rows[0]!.context)).not.toMatch(/Strasse|72070/);
  });

  it('laesst vergangene, abgesagte und Praxistermine unberuehrt', async () => {
    const kuenftig = await hausbesuch(patients.max, '09:00', '10:00');
    const vergangen = await hausbesuch(patients.max, '11:00', '12:00');
    await asPostgres(
      "update public.appointments set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '1 hour' where id = $1",
      [vergangen],
    );
    const abgesagt = await hausbesuch(patients.max, '13:00', '14:00');
    await asPostgres(
      "update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancellation_reason = 'practice_request' where id = $1",
      [abgesagt, users.office],
    );
    await umziehen(patients.max, 'Neue Strasse', '3');

    expect(await liste(users.office, patients.max)).toEqual([kuenftig]);

    await expect(
      asUserCommitted(users.office, AKTUALISIEREN, [[kuenftig, vergangen]]),
    ).rejects.toThrow(/not updatable/);
    expect((await adresse(vergangen)).visit_street).toBe('Beispielstrasse');
    expect((await adresse(kuenftig)).visit_street).toBe('Beispielstrasse');
  });

  it('weist ab, wenn die Stammdaten keine vollstaendige Anschrift tragen', async () => {
    const id = await hausbesuch(patients.max);
    await asPostgres(
      'update public.patient_contact_details set street = null where patient_id = $1',
      [patients.max],
    );
    expect(await liste(users.office, patients.max)).toEqual([]);
    await expect(asUserCommitted(users.office, AKTUALISIEREN, [[id]])).rejects.toThrow(
      /complete patient address/,
    );
  });

  it('laesst den Mitteilungsvermerk mit der Adresse verfallen (ABN-003)', async () => {
    const id = await hausbesuch(patients.max);
    await asUserCommitted(
      users.office,
      'select public.set_appointment_notification($1::uuid, $2::text[])',
      [id, ['phone']],
    );
    await umziehen(patients.max, 'Neue Strasse', '3');
    await asUserCommitted(users.office, AKTUALISIEREN, [[id]]);

    const { rows } = await asUser<{ notification_channels: string[] }>(
      users.office,
      'select notification_channels from public.appointment_directory where id = $1::uuid',
      [id],
    );
    expect(rows[0]!.notification_channels).toEqual([]);
  });

  it('weist anon, Patientenkonto, Trainingsbetreuung und fremde Organisation ab', async () => {
    const id = await hausbesuch(patients.max);
    await umziehen(patients.max, 'Neue Strasse', '3');

    await expect(asAnon(LISTE, [patients.max])).rejects.toThrow(/permission denied/);
    // Bestaetigt, damit der denied-Eintrag stehen bleibt (G6b).
    for (const konto of [users.patientMax, users.trainer]) {
      const { rows } = await asUserCommitted<{ id: string }>(konto, LISTE, [patients.max]);
      expect(rows).toEqual([]);
    }
    await expect(asUser(users.patientMax, AKTUALISIEREN, [[id]])).rejects.toThrow(
      /not allowed to update appointments/,
    );
    await expect(asUser(users.trainer, AKTUALISIEREN, [[id]])).rejects.toThrow(
      /not allowed to update appointments/,
    );

    const abgewiesen = await asPostgres<{ anzahl: string }>(
      "select count(*) as anzahl from public.audit_log where action = 'access.denied' and context ->> 'operation' = 'appointments.read' and outcome = 'denied'",
    );
    expect(Number(abgewiesen.rows[0]!.anzahl)).toBeGreaterThanOrEqual(2);
    expect(organizationId).toBeTruthy();
  });
});
