import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TERMINFENSTER_MINUTEN } from '@/features/appointments/api';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Terminfenster von 60 Minuten (CAL-010a, PROJECT_PRINCIPLES.md 8.1).
 *
 * 8.1 verlangt die Durchsetzung ausdruecklich serverseitig: "eine Vorbelegung
 * im Formular allein erfuellt sie nicht". Diese Datei prueft genau das - beide
 * Schreibpfade und den Bestandstermin, der von der Regel ausgenommen bleibt.
 *
 * Mit Arbeitszeitbestaetigung: die Arbeitszeit hat eigene Tests
 * (scheduling-rules.test.ts) und waere hier nur Rauschen.
 */

const { users, patients } = SEED;

const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';

function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const TAG = tagInTagen(40);

function anlegen(von: string, bis: string, tag = TAG) {
  return asUser<{ id: string }>(users.therapist, ANLEGEN, [
    patients.max,
    STAFF_ANNA,
    'video',
    tag,
    von,
    bis,
    null,
  ]);
}

async function anlegenCommitted(von: string, bis: string, tag = TAG): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
    patients.max,
    STAFF_ANNA,
    'video',
    tag,
    von,
    bis,
    null,
  ]);
  return rows[0]!.id;
}

/**
 * Legt einen Termin mit abweichender Laenge direkt in der Tabelle an.
 *
 * Bewusst an der RPC vorbei: genau so sieht ein Bestandstermin aus, der vor
 * 8.1 entstanden ist. Ueber create_appointment liesse er sich nach dieser
 * Migration gar nicht mehr erzeugen - das ist der Punkt.
 */
async function bestandsterminAnlegen(von: string, bis: string, tag = TAG): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, appointment_type, status,
       starts_at, ends_at
     ) values (
       $1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
       ($4::date + $5::time) at time zone 'Europe/Berlin',
       ($4::date + $6::time) at time zone 'Europe/Berlin'
     ) returning id`,
    [SEED.organizationId, patients.max, STAFF_ANNA, tag, von, bis],
  );
  return rows[0]!.id;
}

/**
 * Aktueller Stand als Rohwert.
 *
 * Bewusst ueber `to_char` statt als Date: der Treiber verloere sonst die
 * Bruchteile von Sekunden, und update_appointment wiese jeden Aufruf als
 * "changed meanwhile" ab (dasselbe Muster wie in change-appointment.test.ts).
 */
async function standVon(appointmentId: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
       from public.appointments where id = $1::uuid`,
    [appointmentId],
  );
  return rows[0]!.updated_at;
}

async function fensterVon(appointmentId: string): Promise<string> {
  const { rows } = await asPostgres<{ fenster: string }>(
    `select to_char(
              (ends_at at time zone 'Europe/Berlin') - (starts_at at time zone 'Europe/Berlin'),
              'HH24:MI'
            ) as fenster
       from public.appointments where id = $1::uuid`,
    [appointmentId],
  );
  return rows[0]!.fenster;
}

describe('Terminfenster (CAL-010a)', () => {
  beforeAll(async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    await client.end();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('haelt die Zahl aus 8.1 an genau einer Stelle in der Datenbank', async () => {
    const { rows } = await asPostgres<{ minuten: number }>(
      'select app.appointment_window_minutes() as minuten',
    );
    expect(rows[0]!.minuten).toBe(60);
  });

  it('stimmt mit der Vorbelegung der Oberflaeche ueberein', async () => {
    const { rows } = await asPostgres<{ minuten: number }>(
      'select app.appointment_window_minutes() as minuten',
    );
    // Zwei Stellen, eine Zahl: laufen sie auseinander, zeigt das Formular ein
    // Ende an, das der Server abweist.
    expect(rows[0]!.minuten).toBe(TERMINFENSTER_MINUTEN);
  });

  it('ist fuer Aufrufer nicht ausfuehrbar', async () => {
    await expect(
      asUser(users.therapist, 'select app.appointment_window_minutes()'),
    ).rejects.toThrow(/permission denied/i);
  });

  describe('create_appointment', () => {
    it('legt ein Zeitfenster von 60 Minuten an', async () => {
      const id = await anlegenCommitted('09:05', '10:05');
      expect(await fensterVon(id)).toBe('01:00');
    });

    it('weist ein kuerzeres Zeitfenster ab', async () => {
      await expect(anlegen('09:00', '09:45')).rejects.toThrow(/appointment window must be 60/);
    });

    it('weist ein laengeres Zeitfenster ab', async () => {
      await expect(anlegen('09:00', '10:30')).rejects.toThrow(/appointment window must be 60/);
    });

    it('weist auch ein Zeitfenster ab, das nur um fuenf Minuten abweicht', async () => {
      await expect(anlegen('09:00', '10:05')).rejects.toThrow(/appointment window must be 60/);
    });

    it('laesst jeden Rasterpunkt als Beginn zu', async () => {
      // 8.1: die feste Laenge beschraenkt den Beginn NICHT auf volle Stunden.
      const id = await anlegenCommitted('11:15', '12:15');
      expect(await fensterVon(id)).toBe('01:00');
    });
  });

  describe('update_appointment', () => {
    it('laesst ein Verschieben unter Beibehaltung der Laenge zu', async () => {
      const id = await anlegenCommitted('09:00', '10:00');
      await asUserCommitted(users.therapist, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '13:00',
        '14:00',
        null,
      ]);
      expect(await fensterVon(id)).toBe('01:00');
    });

    it('weist eine geaenderte Laenge ab, die nicht 60 Minuten ergibt', async () => {
      const id = await anlegenCommitted('09:00', '10:00');
      const stand = await standVon(id);
      await expect(
        asUser(users.therapist, AENDERN, [
          id,
          stand,
          STAFF_ANNA,
          'video',
          TAG,
          '09:00',
          '09:30',
          null,
        ]),
      ).rejects.toThrow(/appointment window must be 60/);
    });
  });

  describe('Bestandstermin mit abweichender Laenge', () => {
    it('bleibt rein organisatorisch bearbeitbar', async () => {
      // 8.1: "eine rein organisatorische Aenderung an ihm DARF NICHT an der
      // Laenge scheitern".
      const id = await bestandsterminAnlegen('09:00', '09:45');
      await asUserCommitted(users.therapist, AENDERN, [
        id,
        await standVon(id),
        '55555555-5555-4555-8555-000000000001',
        'video',
        TAG,
        '09:00',
        '09:45',
        null,
      ]);

      const { rows } = await asPostgres<{ staff_member_id: string }>(
        'select staff_member_id from public.appointments where id = $1::uuid',
        [id],
      );
      expect(rows[0]!.staff_member_id).toBe('55555555-5555-4555-8555-000000000001');
      expect(await fensterVon(id)).toBe('00:45');
    });

    it('bleibt verschiebbar, solange seine Laenge unveraendert bleibt', async () => {
      // ANN-037: geprueft wird die Laenge, nicht der Zeitpunkt. Die Anwendung
      // darf einen Bestandstermin nicht selbsttaetig verlaengern (8.1).
      const id = await bestandsterminAnlegen('09:00', '09:45');
      await asUserCommitted(users.therapist, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '15:00',
        '15:45',
        null,
      ]);
      expect(await fensterVon(id)).toBe('00:45');
    });

    it('bekommt das Terminfenster, sobald jemand seine Laenge anfasst', async () => {
      const id = await bestandsterminAnlegen('09:00', '09:45');
      const stand = await standVon(id);
      await expect(
        asUser(users.therapist, AENDERN, [
          id,
          stand,
          STAFF_ANNA,
          'video',
          TAG,
          '09:00',
          '10:15',
          null,
        ]),
      ).rejects.toThrow(/appointment window must be 60/);

      await asUserCommitted(users.therapist, AENDERN, [
        id,
        stand,
        STAFF_ANNA,
        'video',
        TAG,
        '09:00',
        '10:00',
        null,
      ]);
      expect(await fensterVon(id)).toBe('01:00');
    });
  });
});
